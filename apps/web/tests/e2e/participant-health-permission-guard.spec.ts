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
): Promise<'ok' | 'login-failed'> {
	await page.addInitScript((rid) => {
		localStorage.setItem('preferred-locale', 'es');
		localStorage.setItem('selectedRetreatId', rid);
	}, retreatId);
	await page.goto('/login');
	await page.locator('input[type="email"]').fill(creds.email);
	await page.locator('input[type="password"]').fill(creds.password);
	await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
	try {
		await page.waitForURL(/\/app/, { timeout: 15000 });
		return 'ok';
	} catch {
		return 'login-failed';
	}
}

test.describe('Guard de participant:health (Medicinas / Alimentos)', () => {
	test.beforeEach(async ({ page }, testInfo) => {
		// Skip por-test (no beforeAll global) para que el motivo del skip quede
		// junto a cada test en el reporte, no oculto en un hook compartido.
		const probe = await loginViaUi(page, REGULAR_SERVER, RETREAT_ID);
		if (probe === 'login-failed') {
			testInfo.skip(
				true,
				`Fixture ${REGULAR_SERVER.email} no existe o la contraseña no coincide en esta DB — ` +
					'sembrar antes de correr este spec (ver docstring del archivo).',
			);
		}
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

test.describe('Contraste: admin (con participant:health) sí puede', () => {
	test('admin ve y puede abrir Medicinas y Alimentos', async ({ page }, testInfo) => {
		const probe = await loginViaUi(page, ADMIN_HEALTH, RETREAT_ID);
		if (probe === 'login-failed') {
			testInfo.skip(
				true,
				`Fixture ${ADMIN_HEALTH.email} no existe o la contraseña no coincide en esta DB — ` +
					'sembrar antes de correr este spec (ver docstring del archivo).',
			);
		}

		await expect(page.getByRole('link', { name: 'Alimentos', exact: true })).toBeVisible();
		await expect(
			page.getByRole('link', { name: 'Reporte de Medicinas', exact: true }),
		).toBeVisible();

		await page.goto('/app/medicines-report');
		await page.waitForLoadState('networkidle');
		expect(page.url()).toContain('medicines-report');
	});
});
