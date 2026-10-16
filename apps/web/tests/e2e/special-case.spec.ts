import { test, expect, type Page } from '@playwright/test';

/**
 * E2E of the special case (specs/special-case): the palanquero flags a walker
 * from Palancas, the coordinator sees it in the dashboard card and the inbox,
 * and removes the flag once attended.
 *
 * Covers what the mocked unit tests cannot: that the real list GET drives the
 * badge, the card count, the sidebar item and the inbox, that the dialog opens
 * from a table row, and that mark/unmark send the right PUT against the real
 * API with CSRF and the active contextRetreatId.
 *
 * `.claude/rules/e2e-tests.md`:
 *  - NOTHING is persisted: PUTs to /api/participants/** are aborted and
 *    recorded to assert the payload. The "marked" state is injected with a
 *    page.route overlay on the list GET (exactly ONE walker marked, every other
 *    row unmarked), so counts don't depend on the database.
 *  - Skips are decided from the API's answer (login status, list contents).
 *  - Login through the UI so the real router guard runs. The missing
 *    participant:health permission is simulated in the browser
 *    (simulateMissingHealthPermission); what the API does for that caller is
 *    pinned by apps/api/src/tests/routes/participantHealthWriteGate.simple.test.ts
 *    and controllers/healthDataExposureGuards.test.ts.
 *
 * Default user: the local dev superadmin (participant:update + health); override
 * with E2E_SPECIAL_CASE_EMAIL/PASSWORD. The real no-health test logs in as
 * E2E_REGULAR_SERVER_EMAIL/PASSWORD (role regular_server in
 * E2E_HEALTH_RETREAT_ID, default E2E_RETREAT_ID) and skips without it.
 */

test.use({ locale: 'es-MX' });

const RETREAT_ID = process.env.E2E_RETREAT_ID || 'e9b3c568-050a-4d66-a99d-305f287a59df';

const USER = {
	email: process.env.E2E_SPECIAL_CASE_EMAIL || 'leonardo.bolanos@gmail.com',
	password: process.env.E2E_SPECIAL_CASE_PASSWORD || '123456',
};

const OVERLAY_NOTE = 'Nota e2e: viaja con su mamá';

interface RecordedWrite {
	method: string;
	url: string;
	body: unknown;
}

interface MarkedWalker {
	id: string;
	firstName: string;
	lastName: string;
}

async function loginViaUi(
	page: Page,
	creds: { email: string; password: string } = USER,
	retreatId: string = RETREAT_ID,
): Promise<string | null> {
	await page.addInitScript((rid) => {
		localStorage.setItem('preferred-locale', 'es');
		localStorage.setItem('selectedRetreatId', rid);
	}, retreatId);
	await page.goto('/login');
	await page.locator('input[type="email"]').fill(creds.email);
	await page.locator('input[type="password"]').fill(creds.password);
	const loginResponse = page.waitForResponse(
		(r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
		{ timeout: 30000 },
	);
	await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
	const response = await loginResponse;
	if (!response.ok()) {
		const body = await response.json().catch(() => ({}));
		if (response.status() === 429) {
			return `Login de ${creds.email} bloqueado por el limitador (429): esperar 15 min o levantar el API con NODE_ENV=development SKIP_RATE_LIMIT=true.`;
		}
		return `Login de ${creds.email} rechazado (${response.status()}${body?.message ? `: ${body.message}` : ''}) — si es credencial inválida, el usuario no existe en esta DB.`;
	}
	await page.waitForURL(/\/app/, { timeout: 30000 });
	return null;
}

/** Aborts and records participant writes; GETs go through. */
async function captureParticipantWrites(page: Page): Promise<RecordedWrite[]> {
	const writes: RecordedWrite[] = [];
	await page.route('**/api/participants/**', async (route) => {
		const method = route.request().method();
		if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
			let body: unknown = null;
			try {
				body = route.request().postDataJSON();
			} catch {
				body = null;
			}
			writes.push({ method, url: route.request().url(), body });
			return route.abort();
		}
		return route.continue();
	});
	return writes;
}

const isActiveWalker = (p: any) => p?.type === 'walker' && !p?.isCancelled;

/**
 * Overlay on the list GET: marks exactly one active walker (category 'room',
 * a note) and clears the flag on every other row, for THIS browser only.
 * Returns a getter for the marked walker (null until the first list arrives,
 * or when the retreat has no active walker).
 */
async function overlayOneSpecialCase(page: Page): Promise<() => MarkedWalker | null> {
	let marked: MarkedWalker | null = null;
	await page.route(/\/api\/participants\?/, async (route) => {
		const response = await route.fetch();
		const body = await response.json().catch(() => null);
		if (Array.isArray(body)) {
			const target = marked
				? body.find((p: any) => p.id === marked!.id)
				: body.find(isActiveWalker);
			for (const p of body) {
				p.specialCase = false;
				delete p.specialCaseCategory;
				delete p.specialCaseNotes;
			}
			if (target) {
				target.specialCase = true;
				target.specialCaseCategory = 'room';
				target.specialCaseNotes = OVERLAY_NOTE;
				marked ??= {
					id: target.id,
					firstName: String(target.firstName ?? '').trim(),
					lastName: String(target.lastName ?? '').trim(),
				};
			}
		}
		await route.fulfill({ response, json: body ?? [] });
	});
	return () => marked;
}

/** Removes participant:health from what the frontend believes (browser only). */
async function simulateMissingHealthPermission(page: Page) {
	const isHealth = (p: any) => p?.resource === 'participant' && p?.operation === 'health';
	const stripHealth = (node: any): any => {
		if (Array.isArray(node)) return node.filter((item) => !isHealth(item)).map(stripHealth);
		if (node && typeof node === 'object') {
			return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, stripHealth(v)]));
		}
		return node;
	};
	for (const pattern of ['**/api/auth/status', '**/api/auth/login']) {
		await page.route(pattern, async (route) => {
			const response = await route.fetch();
			const body = await response.json().catch(() => null);
			if (!body) return route.fulfill({ response });
			await route.fulfill({ response, json: stripHealth(body) });
		});
	}
}

function listResponse(page: Page) {
	return page.waitForResponse(
		(r) => /\/api\/participants\?/.test(r.url()) && r.request().method() === 'GET',
		{ timeout: 30000 },
	);
}

/** The Palancas row of a walker (the badge sits between first and last name). */
function walkerRow(page: Page, w: MarkedWalker) {
	return page.locator('tr').filter({ hasText: w.firstName }).filter({ hasText: w.lastName }).first();
}

test.describe('Palancas: badge y marca del palanquero', () => {
	test('el caminante marcado muestra el badge ámbar con su categoría y el botón para quitar', async (
		{ page },
		testInfo,
	) => {
		const getMarked = await overlayOneSpecialCase(page);
		const writes = await captureParticipantWrites(page);
		const loginError = await loginViaUi(page);
		if (loginError) testInfo.skip(true, loginError);

		const list = listResponse(page);
		await page.goto('/app/palancas');
		await list;
		const marked = getMarked();
		if (!marked) {
			testInfo.skip(true, `El retiro ${RETREAT_ID} no tiene caminantes activos en esta DB.`);
			return;
		}

		const row = walkerRow(page, marked);
		await expect(row.getByTestId('special-case-badge')).toHaveText('Habitación aparte', {
			timeout: 20000,
		});
		await expect(row.getByRole('button', { name: 'Quitar marca' })).toBeVisible();
		// Exactly one badge: the overlay marked one walker.
		await expect(page.getByTestId('special-case-badge')).toHaveCount(1);
		expect(writes).toEqual([]);
	});

	test('marcar abre el diálogo desde la fila, exige categoría y envía el PUT del retiro activo', async (
		{ page },
		testInfo,
	) => {
		const writes = await captureParticipantWrites(page);
		const loginError = await loginViaUi(page);
		if (loginError) testInfo.skip(true, loginError);

		const list = listResponse(page);
		await page.goto('/app/palancas');
		const participants = await (await list).json().catch(() => null);
		const candidate = Array.isArray(participants)
			? participants.find((p: any) => isActiveWalker(p) && p.specialCase !== true)
			: null;
		if (!candidate) {
			testInfo.skip(true, `El retiro ${RETREAT_ID} no tiene caminantes sin marcar en esta DB.`);
			return;
		}

		const row = walkerRow(page, {
			id: candidate.id,
			firstName: String(candidate.firstName).trim(),
			lastName: String(candidate.lastName).trim(),
		});
		await row.getByRole('button', { name: 'Marcar caso especial' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByRole('heading', { name: 'Caso especial' })).toBeVisible();
		const submit = dialog.locator('button[type="submit"]');
		// D4: the category is mandatory.
		await expect(submit).toBeDisabled();
		await dialog.getByRole('radio', { name: 'Salud' }).check();
		await dialog.getByRole('textbox', { name: 'Nota (opcional)' }).fill('Usa silla de ruedas');
		await submit.click();

		await expect
			.poll(() => writes.length, { timeout: 15000, message: 'PUT del diálogo capturado' })
			.toBe(1);
		expect(writes[0].method).toBe('PUT');
		expect(writes[0].url).toContain(`/api/participants/${candidate.id}`);
		expect(writes[0].body).toEqual({
			specialCase: true,
			specialCaseCategory: 'health',
			specialCaseNotes: 'Usa silla de ruedas',
			contextRetreatId: RETREAT_ID,
		});
	});
});

test.describe('Coordinador: tarjeta del dashboard y bandeja', () => {
	test('la tarjeta cuenta 1 y lleva a la bandeja, que lista al marcado con categoría y nota', async (
		{ page },
		testInfo,
	) => {
		const getMarked = await overlayOneSpecialCase(page);
		const writes = await captureParticipantWrites(page);
		const loginError = await loginViaUi(page);
		if (loginError) testInfo.skip(true, loginError);

		const list = listResponse(page);
		await page.goto(`/app/retreats/${RETREAT_ID}/dashboard`);
		await list;
		const marked = getMarked();
		if (!marked) {
			testInfo.skip(true, `El retiro ${RETREAT_ID} no tiene caminantes activos en esta DB.`);
			return;
		}

		const card = page.locator('#ds-section-specialCases');
		await expect(card).toBeVisible({ timeout: 20000 });
		await expect(card).toContainText('Por atender', { ignoreCase: true });
		await expect(page.getByTestId('special-cases-card-content')).toContainText('1');
		await expect(
			page.locator('a[href$="/special-cases"]').filter({ hasText: 'Casos especiales' }),
		).toBeVisible();

		await page.getByTestId('special-cases-card-content').click();
		await page.waitForURL(/\/app\/special-cases$/, { timeout: 20000 });

		const rows = page.getByTestId('special-case-row');
		await expect(rows).toHaveCount(1, { timeout: 20000 });
		await expect(rows.first()).toContainText(marked.lastName);
		await expect(rows.first()).toContainText('Habitación aparte');
		await expect(rows.first()).toContainText(OVERLAY_NOTE);
		expect(writes).toEqual([]);
	});

	test('quitar la marca desde la bandeja envía specialCase=false del retiro activo', async (
		{ page },
		testInfo,
	) => {
		const getMarked = await overlayOneSpecialCase(page);
		const writes = await captureParticipantWrites(page);
		const loginError = await loginViaUi(page);
		if (loginError) testInfo.skip(true, loginError);

		const list = listResponse(page);
		await page.goto('/app/special-cases');
		await list;
		const marked = getMarked();
		if (!marked) {
			testInfo.skip(true, `El retiro ${RETREAT_ID} no tiene caminantes activos en esta DB.`);
			return;
		}

		const row = page.getByTestId('special-case-row').first();
		await expect(row).toContainText(marked.lastName, { timeout: 20000 });
		page.once('dialog', (dialog) => dialog.accept());
		await row.getByRole('button', { name: 'Quitar marca' }).click();

		await expect
			.poll(() => writes.length, { timeout: 15000, message: 'PUT de quitar capturado' })
			.toBe(1);
		expect(writes[0].url).toContain(`/api/participants/${marked.id}`);
		expect(writes[0].body).toEqual({ specialCase: false, contextRetreatId: RETREAT_ID });
	});
});

test.describe('Sin participant:health', () => {
	test('simulado: sin tarjeta, sin badge y sin botón, aunque el dato llegara', async (
		{ page },
		testInfo,
	) => {
		// The sidebar and the router guard let a superadmin through by design
		// ("superadmin siempre ve todos los menús"), so with the default user
		// they are covered by the real regular_server test below.
		await simulateMissingHealthPermission(page);
		const getMarked = await overlayOneSpecialCase(page);
		const writes = await captureParticipantWrites(page);
		const loginError = await loginViaUi(page);
		if (loginError) testInfo.skip(true, loginError);

		const dashboardList = listResponse(page);
		await page.goto(`/app/retreats/${RETREAT_ID}/dashboard`);
		await dashboardList;
		if (!getMarked()) {
			testInfo.skip(true, `El retiro ${RETREAT_ID} no tiene caminantes activos en esta DB.`);
			return;
		}
		// Positive anchor first: a negative count on an unloaded page is a false green.
		await expect(page.locator('#ds-section-palancas')).toBeVisible({ timeout: 20000 });
		await expect(page.locator('#ds-section-specialCases')).toHaveCount(0);

		const palancasList = listResponse(page);
		await page.goto('/app/palancas');
		await palancasList;
		await expect(walkerRow(page, getMarked()!)).toBeVisible({ timeout: 20000 });
		await expect(page.getByTestId('special-case-badge')).toHaveCount(0);
		await expect(page.getByTestId('special-case-toggle')).toHaveCount(0);
		expect(writes).toEqual([]);
	});

	/**
	 * Real regular_server (same fixture variables as
	 * participant-health-permission-guard.spec.ts): user with role
	 * `regular_server` in E2E_HEALTH_RETREAT_ID. Skips when the user does not
	 * exist in this database.
	 */
	test('regular_server real: sin ítem en el sidebar y sin acceso por URL directa', async (
		{ page },
		testInfo,
	) => {
		const retreatId = process.env.E2E_HEALTH_RETREAT_ID || RETREAT_ID;
		const regular = {
			email: process.env.E2E_REGULAR_SERVER_EMAIL || 'e2e-regular-server@test.local',
			password: process.env.E2E_REGULAR_SERVER_PASSWORD || 'Test1234!',
		};
		const loginError = await loginViaUi(page, regular, retreatId);
		if (loginError) testInfo.skip(true, loginError);

		// Anchor: an item regular_server does see (participant:read).
		await expect(page.getByRole('link', { name: 'Caminantes', exact: true })).toBeVisible({
			timeout: 20000,
		});
		await expect(page.locator('a[href$="/special-cases"]')).toHaveCount(0);

		await page.goto('/app/special-cases');
		await expect(page).not.toHaveURL(/\/app\/special-cases$/, { timeout: 20000 });
		await expect(page.getByTestId('special-case-row')).toHaveCount(0);
	});
});
