import { test, expect, type Page } from '@playwright/test';

/**
 * E2E de la Fase 1 del plan de protección de datos de salud: el permiso
 * `participant:health` separa la ficha médica (medicación, dieta,
 * discapacidad, contactos de emergencia) del `participant:read` general,
 * que hoy tiene hasta `regular_server`.
 *
 * Cubre lo que un test unitario con mocks no puede: que el guard real del
 * router y el filtro del Sidebar funcionan juntos en el navegador — no solo
 * que la función que los implementa devuelve el valor correcto.
 *
 * Requiere dos usuarios sembrados a mano en la DB del worktree (NO existen
 * en la seed estándar — no son parte de `20260516200000_SeedE2ETestUsers`):
 *   - E2E_REGULAR_SERVER_EMAIL/PASSWORD: rol `regular_server` en el retiro
 *     de E2E_HEALTH_RETREAT_ID. Sin participant:health.
 *   - E2E_ADMIN_HEALTH_EMAIL/PASSWORD: rol `admin` en el mismo retiro. Con
 *     participant:health.
 * Receta de siembra (ejecutada para esta corrida, se pierde si se relanza
 * `start-worktree-dev.sh` — ese script re-copia la DB en cada arranque):
 * ver el mensaje del asistente que agregó este spec, o insertar a mano en
 * `users` (password bcrypt, emailVerified=1) y `user_retreats`
 * (roleId de `regular_server`/`admin`, status='active') contra
 * `apps/api/database.worktree.sqlite`.
 *
 * Si los fixtures no están sembrados, el suite entero se salta con un
 * motivo legible en vez de salir en rojo por un problema de entorno.
 *
 * The "Formulario de edición" block (2026-10-07) needs only the
 * E2E_ADMIN_HEALTH_* user: any account with participant:update and
 * participant:health in E2E_HEALTH_RETREAT_ID works, e.g. a local superadmin
 * passed inline:
 *   E2E_ADMIN_HEALTH_EMAIL=… E2E_ADMIN_HEALTH_PASSWORD=… npx playwright test \
 *     tests/e2e/participant-health-permission-guard.spec.ts --project=chromium
 * It never saves: participant writes are aborted and asserted to be zero.
 */

test.use({ locale: 'es-MX' });

const RETREAT_ID = process.env.E2E_HEALTH_RETREAT_ID || 'e9b3c568-050a-4d66-a99d-305f287a59df';

const REGULAR_SERVER = {
	email: process.env.E2E_REGULAR_SERVER_EMAIL || 'e2e-regular-server@test.local',
	password: process.env.E2E_REGULAR_SERVER_PASSWORD || 'Test1234!',
};
const ADMIN_HEALTH = {
	email: process.env.E2E_ADMIN_HEALTH_EMAIL || 'e2e-admin-health@test.local',
	password: process.env.E2E_ADMIN_HEALTH_PASSWORD || 'Test1234!',
};

/**
 * Login por UI (no por API): esto prueba el guard de verdad — computed del
 * Sidebar + `router.beforeEach` — no solo lo que la API autoriza.
 * `selectedRetreatId` se inyecta en localStorage antes de que la app cargue
 * (mismo patrón que `sequences-inbox.spec.ts`), así el usuario no depende de
 * "most recent retreat" para tener contexto de retiro.
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
	// stack used to time out here and skip the test as "fixture missing" with a
	// valid user. A rejected login skips with the API's reason; an accepted
	// login that never reaches /app is a real failure.
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

/**
 * Why a fixture login was rejected, for the skip message. The login limiter
 * (10 failures per 15 min per IP + email) answers 429 after a few runs with an
 * unseeded fixture, and in dev it is only off with
 * NODE_ENV=development SKIP_RATE_LIMIT=true on the API.
 */
function loginSkipReason(email: string, status: number, apiMessage?: string): string {
	if (status === 429) {
		return (
			`Login de ${email} bloqueado por el limitador de login (429): esperar 15 min o levantar ` +
			'el API con NODE_ENV=development SKIP_RATE_LIMIT=true.'
		);
	}
	return (
		`Login de ${email} rechazado (${status}${apiMessage ? `: ${apiMessage}` : ''}) — si es ` +
		'credencial inválida, el fixture no existe o la contraseña no coincide en esta DB: sembrar ' +
		'antes de correr este spec (ver docstring del archivo).'
	);
}

test.describe('Guard de participant:health (Medicinas / Alimentos)', () => {
	test.beforeEach(async ({ page }, testInfo) => {
		// Skip por-test (no beforeAll global) para que el motivo del skip quede
		// junto a cada test en el reporte, no oculto en un hook compartido.
		const loginError = await loginViaUi(page, REGULAR_SERVER, RETREAT_ID);
		if (loginError) testInfo.skip(true, loginError);
	});

	test('regular_server NO ve "Alimentos" ni "Reporte de Medicinas" en el sidebar', async ({
		page,
	}) => {
		// Esperar un ítem SIEMPRE visible para este rol (participant:read, que
		// regular_server sí tiene) antes de contar ausencias — un toHaveCount(0)
		// contra un sidebar que aún no montó siempre pasa, y sería un falso verde.
		await expect(page.getByRole('link', { name: 'Caminantes', exact: true })).toBeVisible();

		await expect(page.getByRole('link', { name: 'Alimentos', exact: true })).toHaveCount(0);
		await expect(
			page.getByRole('link', { name: 'Reporte de Medicinas', exact: true }),
		).toHaveCount(0);
	});

	test('regular_server no alcanza /app/medicines-report ni /app/food por URL directa', async ({
		page,
	}) => {
		await expect(page.getByRole('link', { name: 'Caminantes', exact: true })).toBeVisible();

		await page.goto('/app/medicines-report');
		await page.waitForLoadState('networkidle');
		expect(page.url(), 'el guard del router debe redirigir, no mostrar la vista').not.toContain(
			'medicines-report',
		);

		await page.goto('/app/food');
		await page.waitForLoadState('networkidle');
		expect(page.url(), 'el guard del router debe redirigir, no mostrar la vista').not.toContain(
			'/app/food',
		);
	});
});

/**
 * Drops participant:health from every permission list in the auth profile the
 * app receives (login and /auth/status), so the frontend behaves as a role with
 * participant:update but without participant:health.
 *
 * As of 2026-10-07 no role in the catalog has that combination (checked in
 * role_permissions of the dev DB; communications was the last one), so it
 * cannot be a seeded user. This only changes what the
 * browser believes: the API still treats the user as authorized. What the
 * server does with a health field from a caller without the permission (403
 * with `fields`) is pinned in
 * apps/api/src/tests/routes/participantHealthWriteGate.simple.test.ts.
 */
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

/**
 * Aborts and records every participant write, so the spec can assert it never
 * saved anything to the dev database.
 */
async function blockParticipantWrites(page: Page) {
	const writes: string[] = [];
	await page.route('**/api/participants/**', async (route) => {
		const method = route.request().method();
		if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
			writes.push(`${method} ${route.request().url()}`);
			return route.abort();
		}
		return route.continue();
	});
	return writes;
}

/**
 * Opens the edit dialog of the first participant in /app/cancellation-and-notes,
 * a view whose own form columns list `notes`. Returns null when the retreat
 * has no participants to edit.
 */
async function openFirstEditDialogInNotesView(page: Page) {
	// Skip only on real absence of data, read from the API response: waiting
	// for a row with a timeout would also skip when dev is just slow (Vite
	// recompiling, several workers), and hide a real failure behind a skip.
	const listResponse = page.waitForResponse(
		(r) => /\/api\/participants\?/.test(r.url()) && r.request().method() === 'GET',
	);
	await page.goto('/app/cancellation-and-notes');
	const participants = await (await listResponse).json().catch(() => null);
	if (!Array.isArray(participants) || participants.length === 0) return null;

	const firstRow = page.locator('tr.participant-row').first();
	await expect(firstRow).toBeVisible({ timeout: 20000 });
	await firstRow.getByRole('button', { name: 'Editar Participante' }).click();
	const dialog = page.getByRole('dialog');
	// Wait for a field every editor sees before asserting any absence: a
	// toHaveCount(0) on a dialog that has not rendered yet always passes.
	await expect(dialog.locator('[for="isCancelled"]')).toBeVisible();
	return dialog;
}

test.describe('Formulario de edición sin participant:health', () => {
	test('a role with participant:update but no participant:health does not get the notes field', async ({
		page,
	}, testInfo) => {
		await simulateMissingHealthPermission(page);
		const writes = await blockParticipantWrites(page);
		const loginError = await loginViaUi(page, ADMIN_HEALTH, RETREAT_ID);
		if (loginError) testInfo.skip(true, loginError);

		const dialog = await openFirstEditDialogInNotesView(page);
		if (!dialog) {
			testInfo.skip(true, `El retiro ${RETREAT_ID} no tiene participantes que editar en esta DB.`);
			return;
		}

		// Before the fix the view's form columns bypassed the permission filter:
		// the field rendered with its raw key as label, and saving it got the
		// API's 403. Checking `for`/`id` catches it whatever the label says.
		await expect(dialog.locator('[for="notes"], #notes')).toHaveCount(0);
		await expect(dialog.getByText('Notas', { exact: true })).toHaveCount(0);

		// Nothing is saved: the dialog is closed without submitting.
		await dialog.getByRole('button', { name: 'Cancelar' }).click();
		expect(writes).toEqual([]);
	});

	test('control: with participant:health the same dialog shows the notes field', async ({
		page,
	}, testInfo) => {
		const writes = await blockParticipantWrites(page);
		const loginError = await loginViaUi(page, ADMIN_HEALTH, RETREAT_ID);
		if (loginError) testInfo.skip(true, loginError);

		const dialog = await openFirstEditDialogInNotesView(page);
		if (!dialog) {
			testInfo.skip(true, `El retiro ${RETREAT_ID} no tiene participantes que editar en esta DB.`);
			return;
		}

		await expect(dialog.locator('[for="notes"]')).toBeVisible();
		await expect(dialog.locator('[for="notes"]')).toHaveText('Notas');

		await dialog.getByRole('button', { name: 'Cancelar' }).click();
		expect(writes).toEqual([]);
	});
});

test.describe('Contraste: admin (con participant:health) sí puede', () => {
	test('admin ve y puede abrir Medicinas y Alimentos', async ({ page }, testInfo) => {
		const loginError = await loginViaUi(page, ADMIN_HEALTH, RETREAT_ID);
		if (loginError) testInfo.skip(true, loginError);

		await expect(page.getByRole('link', { name: 'Alimentos', exact: true })).toBeVisible();
		await expect(
			page.getByRole('link', { name: 'Reporte de Medicinas', exact: true }),
		).toBeVisible();

		await page.goto('/app/medicines-report');
		await page.waitForLoadState('networkidle');
		expect(page.url()).toContain('medicines-report');
	});
});
