import { test, expect, type Page } from '@playwright/test';

/**
 * E2E de pays-at-house (specs/pays-at-house): el estado "Paga en la casa"
 * sustituye visualmente a Pendiente para el caminante que avisó que pagará al
 * llegar el viernes a la casa de retiro.
 *
 * Cubre lo que los unit tests con mocks no pueden: que las tres superficies
 * (Saldos, Palancas, Recepción) rendericen el badge/toggle con los datos
 * reales del GET del listado, y que el toggle dispare el PUT correcto contra
 * el API real con CSRF y el contextRetreatId del retiro activo.
 *
 * Reglas de `.claude/rules/e2e-tests.md` que este archivo sigue:
 *  - NADA se persiste: los PUT a /api/participants/** se abortan y se
 *    registran para asertar el payload (patrón blockParticipantWrites del
 *    participant-health spec). Los estados "marcado" que solo se muestran se
 *    inyectan con un overlay de page.route sobre el GET — cambia solo lo que
 *    este navegador ve.
 *  - Los skips se deciden leyendo la respuesta del API (ausencia real de
 *    datos), no con timeouts de espera de filas.
 *  - Login por UI para probar el guard del router de verdad; el motivo del
 *    rechazo sale de la respuesta del API (429 = limitador de login).
 *
 * Usuario por defecto: el superadmin local de dev (participant:update). Con
 * E2E_PAYS_AT_HOUSE_EMAIL/PASSWORD se puede apuntar a otro perfil (p.ej. uno
 * de comunicaciones) sin tocar el spec.
 */

test.use({ locale: 'es-MX' });

const RETREAT_ID = process.env.E2E_RETREAT_ID || 'e9b3c568-050a-4d66-a99d-305f287a59df';

const USER = {
	email: process.env.E2E_PAYS_AT_HOUSE_EMAIL || 'leonardo.bolanos@gmail.com',
	password: process.env.E2E_PAYS_AT_HOUSE_PASSWORD || '123456',
};

interface RecordedWrite {
	method: string;
	url: string;
	body: unknown;
}

/**
 * Login por UI (no por API) para que el guard real del router y el contexto
 * de retiro del localStorage participen. `selectedRetreatId` se inyecta antes
 * de que la app cargue (mismo patrón que participant-health-permission-guard).
 */
async function loginViaUi(
	page: Page,
	creds: { email: string; password: string },
	retreatId: string,
): Promise<string | null> {
	await page.addInitScript((rid) => {
		localStorage.setItem('preferred-locale', 'es');
		localStorage.setItem('selectedRetreatId', rid);
	}, retreatId);
	await page.goto('/login');
	await page.locator('input[type="email"]').fill(creds.email);
	await page.locator('input[type="password"]').fill(creds.password);
	// Decide from the API's answer, not from a navigation timeout: a slow dev
	// stack used to time out here and skip the test as "fixture missing" with
	// a valid user.
	const loginResponse = page.waitForResponse(
		(r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
		{ timeout: 30000 },
	);
	await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
	const response = await loginResponse;
	if (!response.ok()) {
		const body = await response.json().catch(() => ({}));
		return loginSkipReason(creds.email, response.status(), body?.message);
	}
	await page.waitForURL(/\/app/, { timeout: 30000 });
	return null;
}

function loginSkipReason(email: string, status: number, apiMessage?: string): string {
	if (status === 429) {
		return (
			`Login de ${email} bloqueado por el limitador de login (429): esperar 15 min o levantar ` +
			'el API con NODE_ENV=development SKIP_RATE_LIMIT=true.'
		);
	}
	return (
		`Login de ${email} rechazado (${status}${apiMessage ? `: ${apiMessage}` : ''}) — si es ` +
		'credencial inválida, el usuario no existe o la contraseña no coincide en esta DB.'
	);
}

/**
 * Aborta y registra los writes a /api/participants/** (PUT/PATCH/POST). Los
 * GETs siguen su curso. Nada de lo que haga el navegador llega a la base.
 */
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

/** Waiting hook for the retreat's participants list (GET /api/participants?...). */
function participantsListResponse(page: Page) {
	return page.waitForResponse(
		(r) => /\/api\/participants\?/.test(r.url()) && r.request().method() === 'GET',
		{ timeout: 30000 },
	);
}

/** A row the UI would show the pays-at-house badge for (marked or not). */
function owesMoney(p: Record<string, unknown>): boolean {
	const balance = Number((p as any).chargeBreakdown?.balance ?? 0);
	return balance > 0 && !(p as any).isScholarship && !(p as any).isCancelled;
}

/**
 * A row the un-marked toggle applies to (owes AND not marked yet). Only valid
 * against a response WITHOUT the overlay — the overlay sets paysAtHouse on
 * every owing row, so post-overlay lists have none of these left.
 */
function isOwingCandidate(p: Record<string, unknown>): boolean {
	return owesMoney(p) && !(p as any).paysAtHouse;
}

/**
 * Overlay: marks every owing row of the participants list as paysAtHouse for
 * THIS browser only (the API response is rewritten in flight; no DB write).
 */
async function overlayPaysAtHouseOnOwing(page: Page) {
	await page.route(/\/api\/participants\?/, async (route) => {
		const response = await route.fetch();
		const body = await response.json().catch(() => null);
		if (Array.isArray(body)) {
			for (const p of body) {
				if (isOwingCandidate(p)) (p as any).paysAtHouse = true;
			}
		}
		await route.fulfill({ response, json: body ?? [] });
	});
}

test.describe('Saldos (vista Pagos)', () => {
	test('marcado con saldo: badge «Paga en la casa», sin recordatorio de WhatsApp (D5), toggle para quitar', async (
		{ page },
		testInfo,
	) => {
		await overlayPaysAtHouseOnOwing(page);
		const writes = await captureParticipantWrites(page);
		const loginError = await loginViaUi(page, USER, RETREAT_ID);
		if (loginError) testInfo.skip(true, loginError);

		const listResponse = participantsListResponse(page);
		await page.goto('/app/payments');
		const participants = await (await listResponse).json().catch(() => null);
		// NOTE: this response is the OVERLAID one — every owing row already
		// carries paysAtHouse=true, so the skip predicate must not require
		// "not marked" here.
		if (!Array.isArray(participants) || !participants.some((p: any) => owesMoney(p))) {
			testInfo.skip(
				true,
				`El retiro ${RETREAT_ID} no tiene participantes con saldo que marcar en esta DB.`,
			);
			return;
		}

		// Positive wait first: the badge must be there for the marked rows.
		const badge = page.locator('.bg-sky-100').getByText('Paga en la casa', { exact: true });
		await expect(badge.first()).toBeVisible({ timeout: 20000 });

		// D5: a marked participant gets no payment reminder button, even with a
		// phone on file (overlay marked EVERY owing row).
		await expect(page.locator('button[title="Recordatorio"]')).toHaveCount(0);

		// The toggle now offers to remove the mark.
		await expect(page.locator('button[title="Quitar «paga en la casa»"]').first()).toBeVisible();

		// Display only: nothing was written.
		expect(writes).toEqual([]);
	});

	test('marcar desde Saldos envía PUT paysAtHouse=true con el contextRetreatId activo', async (
		{ page },
		testInfo,
	) => {
		const writes = await captureParticipantWrites(page);
		const loginError = await loginViaUi(page, USER, RETREAT_ID);
		if (loginError) testInfo.skip(true, loginError);

		const listResponse = participantsListResponse(page);
		await page.goto('/app/payments');
		const participants = await (await listResponse).json().catch(() => null);
		if (!Array.isArray(participants) || !participants.some((p: any) => isOwingCandidate(p))) {
			testInfo.skip(
				true,
				`El retiro ${RETREAT_ID} no tiene participantes con saldo que marcar en esta DB.`,
			);
			return;
		}

		const toggle = page.locator('button[title="Marcar que paga en la casa"]').first();
		await expect(toggle).toBeVisible({ timeout: 20000 });

		// The toggle is confirm-gated; accept before clicking.
		page.once('dialog', (dialog) => dialog.accept());
		await toggle.click();

		await expect
			.poll(() => writes.length, { timeout: 15000, message: 'PUT del toggle capturado' })
			.toBe(1);
		expect(writes[0].method).toBe('PUT');
		expect(writes[0].url).toMatch(/\/api\/participants\/[^/?]+/);
		expect(writes[0].body).toEqual({ paysAtHouse: true, contextRetreatId: RETREAT_ID });
	});
});

test.describe('Palancas (acción rápida del palanquero)', () => {
	test('el toggle inline por fila envía el mismo PUT del retiro activo', async ({ page }, testInfo) => {
		const writes = await captureParticipantWrites(page);
		const loginError = await loginViaUi(page, USER, RETREAT_ID);
		if (loginError) testInfo.skip(true, loginError);

		const listResponse = participantsListResponse(page);
		await page.goto('/app/palancas');
		const participants = await (await listResponse).json().catch(() => null);
		const owingWalker = Array.isArray(participants)
			? participants.some((p: any) => p.type === 'walker' && isOwingCandidate(p))
			: false;
		if (!owingWalker) {
			testInfo.skip(
				true,
				`El retiro ${RETREAT_ID} no tiene caminantes con saldo que marcar en esta DB.`,
			);
			return;
		}

		const toggle = page.locator('button[title="Marcar que paga en la casa"]').first();
		await expect(toggle).toBeVisible({ timeout: 20000 });

		page.once('dialog', (dialog) => dialog.accept());
		await toggle.click();

		await expect
			.poll(() => writes.length, { timeout: 15000, message: 'PUT del toggle capturado' })
			.toBe(1);
		expect(writes[0].method).toBe('PUT');
		expect(writes[0].url).toMatch(/\/api\/participants\/[^/?]+/);
		expect(writes[0].body).toEqual({ paysAtHouse: true, contextRetreatId: RETREAT_ID });
	});
});

test.describe('Recepción (badge informativo, D7)', () => {
	/**
	 * Navigates to the reception view with a reception overlay applied. The
	 * picker decides which pendingList entries get paysAtHouse=true in THIS
	 * browser only; it returns the marked full names so tests can target rows.
	 */
	async function gotoReceptionWithOverlay(
		page: Page,
		pick: (p: Record<string, unknown>) => boolean,
	): Promise<string[] | null> {
		let markedNames: string[] | null = null;
		await page.route(/\/api\/participants\/reception\//, async (route) => {
			const response = await route.fetch();
			const body = await response.json().catch(() => null);
			if (body && Array.isArray(body.pendingList)) {
				markedNames = [];
				for (const p of body.pendingList) {
					if (pick(p)) {
						(p as any).paysAtHouse = true;
						markedNames.push(`${(p as any).firstName} ${(p as any).lastName}`);
					}
				}
			}
			await route.fulfill({ response, json: body ?? {} });
		});

		const loginError = await loginViaUi(page, USER, RETREAT_ID);
		if (loginError) return null;

		const statsResponse = page.waitForResponse(
			(r) => /\/api\/participants\/reception\//.test(r.url()) && r.request().method() === 'GET',
			{ timeout: 30000 },
		);
		await page.goto(`/app/retreats/${RETREAT_ID}/reception`);
		await statsResponse;
		await page.waitForLoadState('networkidle');
		return markedNames;
	}

	test('badge «Paga en la casa» convive con el botón Cobrar', async ({ page }, testInfo) => {
		const names = await gotoReceptionWithOverlay(
			page,
			(p) => !(p as any).isScholarship && Number((p as any).totalPaid ?? 0) === 0,
		);
		if (names === null) {
			testInfo.skip(true, `Login rechazado o recepción inaccesible para ${USER.email}.`);
			return;
		}
		if (names.length === 0) {
			testInfo.skip(
				true,
				`El retiro ${RETREAT_ID} no tiene participantes pendientes sin pago en esta DB.`,
			);
			return;
		}

		const li = page.locator('li').filter({ hasText: names[0] }).first();
		await expect(li).toBeVisible({ timeout: 20000 });
		await expect(li.getByText('Paga en la casa', { exact: true })).toBeVisible();
		// D7: the badge informs, it does not replace charging at the door.
		await expect(li.locator('button[title="Cobrar"]')).toBeVisible();
	});

	test('con un pago registrado el badge desaparece (mismo umbral que Cobrar)', async (
		{ page },
		testInfo,
	) => {
		const names = await gotoReceptionWithOverlay(
			page,
			(p) => Number((p as any).totalPaid ?? 0) > 0,
		);
		if (names === null) {
			testInfo.skip(true, `Login rechazado o recepción inaccesible para ${USER.email}.`);
			return;
		}
		if (names.length === 0) {
			testInfo.skip(
				true,
				`El retiro ${RETREAT_ID} no tiene pendientes con pago parcial registrado en esta DB.`,
			);
			return;
		}

		const li = page.locator('li').filter({ hasText: names[0] }).first();
		await expect(li).toBeVisible({ timeout: 20000 });
		// Partial payment on record: the mark persists in data, but the badge
		// hides (the operator already started collecting at the door).
		await expect(li.getByText('Paga en la casa', { exact: true })).toHaveCount(0);
		await expect(li.locator('button[title="Cobrar"]')).toHaveCount(0);
	});
});
