/**
 * E2E del enlace personal de guardia del Santísimo (santisimo-guardia-links).
 *
 * Corre contra el dev del worktree (skill worktree-testing):
 *
 *   E2E_BASE_URL=http://localhost:5174 \
 *   E2E_API_URL=http://localhost:3002/api \
 *   npx playwright test tests/e2e/santisimo-guardia-invite.spec.ts --project=chromium
 *
 * El API debe arrancar con NODE_ENV=development SKIP_RATE_LIMIT=true: el spec
 * hace 4 mutaciones públicas por corrida (signup + cambio + quitar + teardown)
 * y el publicParticipantLimiter (10/hora por IP) vuelve falsa la 3ª corrida con
 * un 429 que la UI muestra como error genérico de guardado.
 *
 * Escribe en la base: activa `santisimoEnabled` del retiro, genera slots propios
 * (minuto :10/:40 para no chocar con slots en punto preexistentes) y crea/quita
 * signups del invite. El afterAll restaura por el dato (mustOk ruidoso), patrón
 * captureFlyerState/restoreFlyerState.
 *
 * El retiro fixture debe ser FUTURO (los slots pasados se ocultan server-side):
 * cuando venza, el spec se salta con motivo legible en vez de ponerse rojo.
 *
 * Ojo: el `request` fixture NO comparta cookies entre beforeAll y cada test —
 * las verificaciones por API hacen login propio (los logins exitosos no gastan
 * el limitador, que cuenta fallos).
 */
import { test, expect, devices, type APIRequestContext, type Page } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:3002/api';
// Buen Despacho (2026-10-16 → 10-18): retiro futuro al escribir el spec.
const RETREAT_ID = process.env.E2E_RETREAT_ID ?? 'e9b3c568-050a-4d66-a99d-305f287a59df';
const TEMPLATE_NAME = 'Guardias Santísimo — elección de horario';

interface SlotRow {
	id: string;
	startTime: string;
	endTime: string;
	capacity: number;
	signedUpCount?: number;
	mealWindow?: boolean;
}

interface Fixture {
	retreat: { id: string; parish: string; startDate: string; endDate: string; santisimoEnabled: boolean };
	prevSantisimoEnabled: boolean;
	newSlots: SlotRow[];
	inviteA: {
		token: string;
		url: string;
		participantId: string;
		firstName: string;
		fullName: string;
		phone: string;
	};
	participantB: { id: string; name: string; token: string; phone: string };
	mealSlotId: string | null;
}

let fixture: Fixture | null = null;
let setupProblem: string | null = null;

async function getJson<T>(request: APIRequestContext, path: string): Promise<T> {
	const res = await request.get(`${API}${path}`);
	if (!res.ok()) throw new Error(`GET ${path} → ${res.status()}`);
	return (await res.json()) as T;
}

/** CSRF token del propio contexto (double-submit: cookie + header del mismo jar). */
async function csrf(request: APIRequestContext): Promise<string> {
	const data = await getJson<{ csrfToken: string }>(request, '/csrf-token');
	return data.csrfToken;
}

async function send<T = unknown>(
	request: APIRequestContext,
	method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
	path: string,
	body?: unknown,
): Promise<{ status: number; data: T }> {
	const res = await request.fetch(`${API}${path}`, {
		method,
		headers: {
			'X-CSRF-Token': await csrf(request),
			// Playwright no añade Content-Type cuando `data` es string, y el
			// middleware json de Express ignora el body sin él (login 400).
			'Content-Type': 'application/json',
		},
		data: body === undefined ? undefined : JSON.stringify(body),
	});
	return { status: res.status(), data: (await res.json().catch(() => ({}))) as T };
}

/** Login admin contra el API del dev; devuelve null si ok, motivo si no. */
async function apiLogin(request: APIRequestContext): Promise<string | null> {
	const login = await send(request, 'POST', '/auth/login', {
		email: 'leonardo.bolanos@gmail.com',
		password: '123456',
	});
	return login.status === 200
		? null
		: `login del fixture dev rechazado (${login.status}): ${JSON.stringify(login.data)}`;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
	setupProblem = await apiLogin(request);
	if (setupProblem) return;

	let retreat: Fixture['retreat'];
	try {
		retreat = await getJson<Fixture['retreat']>(request, `/retreats/${RETREAT_ID}`);
	} catch {
		setupProblem = `retiro ${RETREAT_ID} no existe en esta base (E2E_RETREAT_ID para señalar otro)`;
		return;
	}
	const endsInTheFuture = new Date(retreat.endDate).getTime() > Date.now() + 3 * 60 * 60_000;
	if (!endsInTheFuture) {
		setupProblem = `retiro ${retreat.parish} ya venció (${retreat.endDate}): sin ventana futura para slots`;
		return;
	}

	// --- capture (para el restore verificado del afterAll) ---
	const prevSantisimoEnabled = Boolean(retreat.santisimoEnabled);
	const prevSlots = await getJson<SlotRow[]>(request, `/santisimo/retreats/${RETREAT_ID}/slots`);
	const prevSlotIds = new Set(prevSlots.map((s) => s.id));

	// --- mutate: habilitar santisimo + slots propios en ventana futura ---
	const enable = await send(request, 'PUT', `/retreats/${RETREAT_ID}`, { santisimoEnabled: true });
	if (enable.status !== 200) {
		setupProblem = `no se pudo activar santisimoEnabled (${enable.status})`;
		return;
	}
	const startMs = Math.max(new Date(retreat.startDate).getTime(), Date.now()) + 40 * 60_000;
	const endMs = startMs + 4 * 30 * 60_000;
	const generated = await send<SlotRow[]>(request, 'POST', `/santisimo/retreats/${RETREAT_ID}/slots/generate`, {
		startDateTime: new Date(startMs).toISOString(),
		endDateTime: new Date(endMs).toISOString(),
		slotMinutes: 30,
		capacity: 2,
	});
	if (generated.status !== 201) {
		setupProblem = `generate de slots falló (${generated.status}): ${JSON.stringify(generated.data)}`;
		return;
	}
	const newSlots = (Array.isArray(generated.data) ? generated.data : []).filter(
		(s) => !prevSlotIds.has(s.id),
	);
	if (newSlots.length < 2) {
		setupProblem = `generate creó ${newSlots.length} slots nuevos (¿colisión de startTime?)`;
		return;
	}

	// --- enlaces personales: 2 servidores con teléfono (para la cola admin) ---
	const linksData = await getJson<{ links: Record<string, string> }>(
		request,
		`/santisimo/retreats/${RETREAT_ID}/guardia-links`,
	);
	const links = linksData.links || {};
	const participants = await getJson<any[]>(request, `/participants?retreatId=${RETREAT_ID}`);
	const byId = new Map((Array.isArray(participants) ? participants : []).map((p: any) => [p.id, p]));
	const candidates = Object.keys(links)
		.map((pid) => ({ pid, p: byId.get(pid) }))
		.filter(({ p }) => p && String(p.cellPhone || '').replace(/\D/g, '').length >= 10);
	if (candidates.length < 2) {
		setupProblem = `se necesitan 2 servidores con teléfono y enlace; hay ${candidates.length}`;
		return;
	}

	// --- invite público del primero (contrato real por API, sin UI) ---
	const tokenOf = (url: string) => url.substring(url.lastIndexOf('/') + 1);
	const urlA = links[candidates[0].pid];
	const inviteTokenA = tokenOf(urlA);
	const inviteA = await request.get(`${API}/santisimo/public/invite/${inviteTokenA}`);
	if (!inviteA.ok()) {
		setupProblem = `GET invite del primer servidor → ${inviteA.status()}`;
		return;
	}
	const inviteBody = await inviteA.json();
	const mealSlot = (inviteBody.slots || []).find((s: any) => s.mealWindow && s.selectable);

	fixture = {
		retreat,
		prevSantisimoEnabled,
		newSlots,
		inviteA: {
			token: inviteTokenA,
			url: urlA,
			participantId: candidates[0].pid,
			firstName: inviteBody.participant?.firstName || candidates[0].p.firstName,
			fullName:
				inviteBody.participant?.fullName ||
				`${candidates[0].p.firstName} ${candidates[0].p.lastName}`.trim(),
			// La fila de la cola se empareja por teléfono: el nombre puede repetirse.
			phone: String(candidates[0].p.cellPhone || ''),
		},
		participantB: {
			id: candidates[1].pid,
			name: `${candidates[1].p.firstName} ${candidates[1].p.lastName}`.trim(),
			token: tokenOf(links[candidates[1].pid]),
			phone: String(candidates[1].p.cellPhone || ''),
		},
		mealSlotId: mealSlot?.id ?? null,
	};
});

/** Restore verificado: cada paso estalla si no aterriza (regla del helper de flyer). */
async function mustOk(label: string, status: number) {
	if (status < 200 || status >= 300) throw new Error(`teardown ${label} → ${status}`);
}

test.afterAll(async ({ request }) => {
	if (!fixture) return;
	const f = fixture;
	// El signup de las pruebas muere con sus slots (CASCADE); si quedó sobre un
	// slot preexistente (mealSlot), se quita por el enlace público (CSRF-exento).
	if (f.mealSlotId) {
		await request.delete(`${API}/santisimo/public/invite/${f.inviteA.token}/signup`);
	}
	const problem = await apiLogin(request);
	if (problem) throw new Error(`teardown: ${problem}`);
	for (const slot of f.newSlots) {
		const res = await request.fetch(`${API}/santisimo/slots/${slot.id}`, {
			method: 'DELETE',
			headers: { 'X-CSRF-Token': await csrf(request) },
		});
		await mustOk(`DELETE slot ${slot.id}`, res.status());
	}
	const restore = await send(request, 'PUT', `/retreats/${f.retreat.id}`, {
		santisimoEnabled: f.prevSantisimoEnabled,
	});
	await mustOk('PUT santisimoEnabled de vuelta', restore.status);

	// Verificación por el dato, no por el status.
	const slotsNow = await getJson<SlotRow[]>(request, `/santisimo/retreats/${f.retreat.id}/slots`);
	const leftover = slotsNow.filter((s) => f.newSlots.some((n) => n.id === s.id));
	if (leftover.length > 0) throw new Error(`teardown: quedaron ${leftover.length} slots del spec`);
	const retreatNow = await getJson<Fixture['retreat']>(request, `/retreats/${f.retreat.id}`);
	if (Boolean(retreatNow.santisimoEnabled) !== f.prevSantisimoEnabled) {
		throw new Error('teardown: santisimoEnabled no volvió a su valor original');
	}
});

/** Primera línea de cada test: si el beforeAll no armo fixture, skip con motivo. */
function skipIfNoFixture() {
	if (setupProblem || !fixture) {
		test.skip(true, setupProblem ?? 'fixture no disponible');
	}
}

test.describe('vista pública del enlace personal (móvil)', () => {
	// Sin defaultBrowserType (no se puede fijar dentro de un describe): corre en
	// el project con la emulación de viewport/touch/UA del iPhone.
	const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 13'];
	test.use({ ...iphone, locale: 'es-MX' });

	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
	});

	test('el servidor elige, cambia y quita su guardia desde el enlace', async ({ page, request }) => {
		skipIfNoFixture();
		const f = fixture!;
		await page.goto(`/santisimo/servidor/${f.inviteA.token}`);

		// Saludo personal + nota de enlace personal.
		await expect(page.getByText(`Hola, ${f.inviteA.firstName}`)).toBeVisible();
		await expect(page.getByText('Este enlace es personal')).toBeVisible();

		const radioOf = (slotId: string) =>
			page.locator(`input[type="radio"][name="santisimo-guardia-slot"][value="${slotId}"]`);

		// Mis slots están visibles y seleccionables; los pasados no están.
		for (const slot of f.newSlots) {
			await expect(radioOf(slot.id)).toBeVisible();
			await expect(radioOf(slot.id)).toBeEnabled();
		}

		// CA4: slot mealWindow visible, con badge 🍽 y seleccionable.
		let firstChoice = f.newSlots[0].id;
		if (f.mealSlotId) {
			await radioOf(f.mealSlotId).scrollIntoViewIfNeeded();
			await expect(page.getByText('Coincide con la hora de comida')).toBeVisible();
			await radioOf(f.mealSlotId).check();
			firstChoice = f.mealSlotId;
		} else {
			test.info().annotations.push({ type: 'note', description: 'sin slot mealWindow futuro: badge no verificado' });
			await radioOf(firstChoice).check();
		}

		await page.getByRole('button', { name: 'Guardar mi horario' }).click();
		await expect(page.getByText('¡Listo! Tu horario quedó guardado')).toBeVisible();
		await expect(page.getByText('Tu guardia actual')).toBeVisible();

		// Persistido (visto desde el admin/API, con sesión propia).
		expect(await signedUpCountOf(request, firstChoice)).toBe(1);

		// CA6: cambiar de horario reemplaza (un solo slot por servidor).
		const secondChoice = f.newSlots[1].id;
		await radioOf(secondChoice).check();
		await page.getByRole('button', { name: 'Guardar mi horario' }).click();
		await expect(page.getByText('¡Listo! Tu horario quedó guardado')).toBeVisible();
		expect(await signedUpCountOf(request, firstChoice)).toBe(0);
		expect(await signedUpCountOf(request, secondChoice)).toBe(1);

		// CA7: quitar la guardia libera el cupo.
		await page.getByRole('button', { name: 'Quitar mi guardia' }).click();
		await expect(page.getByText('Quitaste tu guardia')).toBeVisible();
		expect(await signedUpCountOf(request, secondChoice)).toBe(0);
	});

	test('un token editado muestra el mensaje amigable de enlace inválido', async ({ page }) => {
		skipIfNoFixture();
		const f = fixture!;
		await page.goto(`/santisimo/servidor/${f.inviteA.token.slice(0, -3)}xyz`);
		await expect(page.getByText('Enlace no válido')).toBeVisible();
		await expect(page.getByText('Este enlace no es válido o ya expiró')).toBeVisible();
	});
});

test.describe('cola de WhatsApp del admin (CA10)', () => {
	/**
	 * Login por UI con skip decidido por la respuesta del login (patrón
	 * participant-health-permission-guard.spec.ts).
	 */
	async function loginViaUi(page: Page): Promise<string | null> {
		await page.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
		await page.goto('/login');
		await page.locator('input[type="email"]').fill('leonardo.bolanos@gmail.com');
		await page.locator('input[type="password"]').fill('123456');
		const loginResponse = page.waitForResponse(
			(r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
			{ timeout: 30000 },
		);
		await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
		const response = await loginResponse;
		if (!response.ok()) {
			return `login rechazado (${response.status()}): no se puede probar la cola del admin`;
		}
		await page.waitForURL(/\/app/, { timeout: 30000 });
		return null;
	}

	test('cada servidor recibe SU enlace en el mensaje de WhatsApp', async ({ page, request }) => {
		skipIfNoFixture();
		const f = fixture!;
		const problem = await loginViaUi(page);
		test.skip(Boolean(problem), problem ?? '');
		await page.goto(`/app/retreats/${f.retreat.id}/santisimo`);
		await expect(page.getByTestId('santisimo-actions-button')).toBeVisible();

		// El registro del envío no se persiste en esta corrida (stub de la API).
		await page.route(/participant-communications/, (route) =>
			route.fulfill({ status: 201, contentType: 'application/json', body: '{"id":"e2e-stub"}' }),
		);

		await page.getByTestId('santisimo-actions-button').click();
		await page.getByTestId('santisimo-guardia-links-button').click();

		// La cola abre con la plantilla sembrada seleccionable.
		const templateSelect = page
			.locator('select')
			.filter({ has: page.locator('option', { hasText: 'Guardias Santísimo' }) })
			.first();
		await expect(templateSelect).toBeVisible();
		await templateSelect.selectOption({ label: TEMPLATE_NAME });
		const messageArea = page.locator('textarea.font-mono');
		await expect(messageArea).toHaveValue(/\{participant\.santisimoGuardiaLink\}/, { timeout: 10000 });

		// Abrir WhatsApp para cada participante: el popup lleva SU enlace. La fila
		// se localiza por teléfono (el nombre puede repetirse entre fichas).
		//
		// El token no se compara contra el del beforeAll: cada GET del mapa
		// guardia-links regenera el token (IV aleatorio) para el MISMO
		// participante, así que la cola admin abre con otro token válido. Lo que
		// CA10 afirma — y esto verifica — es que el enlace del popup resuelve al
		// participante correcto.
		const linkOf = async (phone: string, fullName: string) => {
			const row = page.locator('div.border > div', { hasText: phone }).first();
			await expect(row).toBeVisible();
			const popupPromise = page.waitForEvent('popup', { timeout: 10000 });
			await row.getByRole('button').click();
			const popup = await popupPromise;
			const url = decodeURIComponent(popup.url());
			await popup.close();
			// wa.me/<phone>?text=<mensaje con el enlace personal>
			const link = url.match(/santisimo\/servidor\/([A-Za-z0-9_-]+)/);
			expect(link, `el popup no lleva enlace personal: ${url}`).toBeTruthy();
			const invite = await request.get(`${API}/santisimo/public/invite/${link![1]}`);
			expect(invite.status(), `GET invite del token del popup → ${invite.status()}`).toBe(200);
			const body = await invite.json();
			expect(body.participant?.fullName).toBe(fullName);
		};
		await linkOf(f.inviteA.phone, f.inviteA.fullName);
		await linkOf(f.participantB.phone, f.participantB.name);
	});
});

/** Verificación admin: cupo ocupado de un slot (login propio del contexto del test). */
async function signedUpCountOf(request: APIRequestContext, slotId: string): Promise<number> {
	const f = fixture!;
	const problem = await apiLogin(request);
	if (problem) throw new Error(problem);
	const slots = await getJson<SlotRow[]>(request, `/santisimo/retreats/${f.retreat.id}/slots`);
	const slot = slots.find((s) => s.id === slotId);
	return slot?.signedUpCount ?? -1;
}
