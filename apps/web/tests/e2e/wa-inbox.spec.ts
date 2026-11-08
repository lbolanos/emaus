import { test, expect, type Page } from '@playwright/test';

/**
 * E2E dry-run de la bandeja WhatsApp de solo lectura (specs/whatsapp-inbox M5).
 *
 * DRY-RUN: sin WhatsApp real, sin vínculos reales y sin escrituras en la base.
 * Lo que prueba que un unit test no puede: que el guard `requiresPermission`
 * del router y el filtro del Sidebar funcionan juntos en el navegador contra
 * `whatsappInbox:read` (nuevo recurso).
 *
 * Login con credenciales locales del dev (fallback de sequences-inbox.spec.ts).
 * El caso "sin permiso" se SIMULA en el navegador quitando el permiso del
 * perfil de /auth/login y /auth/status ANTES de loguear (patrón de
 * participant-health-permission-guard.spec.ts — el perfil persistido en el
 * store no se re-evalúa con un reload, hay session nueva): solo cambia lo que
 * cree el frontend — lo que el API hace con un caller sin el permiso (403/503)
 * está fijado en apps/api/src/tests/controllers/waBridgeController.test.ts.
 *
 * La entrada vive en la sección «Comunicaciones» del sidebar, colapsada por
 * defecto: expandir el header antes de clicar (el header intercepta el click —
 * ver troubleshooting, Playwright + sidebar colapsado).
 *
 * Correrlo contra el dev del worktree:
 *   E2E_BASE_URL=http://localhost:5174 \
 *   E2E_LOCAL_EMAIL=leonardo.bolanos@gmail.com E2E_LOCAL_PASSWORD=123456 \
 *   npx playwright test tests/e2e/wa-inbox.spec.ts --project=chromium
 */

test.use({ locale: 'es-MX' });

const CRED = {
	email: process.env.E2E_LOCAL_EMAIL || 'leonardo.bolanos@gmail.com',
	password: process.env.E2E_LOCAL_PASSWORD || '123456',
};

const SIDEBAR_ITEM = 'WhatsApp del Retiro';
const SECTION = 'Comunicaciones';
const VIEW_HEADING = 'Mensajes que los caminantes envían';

async function loginViaUi(page: Page, creds: { email: string; password: string }): Promise<string | null> {
	await page.addInitScript(() => {
		localStorage.setItem('preferred-locale', 'es');
	});
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
		return `Login de ${creds.email} rechazado (${response.status()}${body?.message ? `: ${body.message}` : ''}) — credenciales locales del dev no válidas en esta base.`;
	}
	await page.waitForURL(/\/app/, { timeout: 30000 });
	return null;
}

/** Quita el recurso 'whatsappInbox' de cada lista de permisos del perfil auth. */
async function simulateMissingWaInboxPermission(page: Page) {
	// El perfil mezcla formas: objetos {resource, operation} y strings
	// 'resource:operation' — quitar ambas. Además quitar user:delete: el
	// sidebar da TODOS los menús a isSuperadmin (= tener user:delete), así que
	// sin esto quitar el permiso no oculta nada.
	const isRemoved = (p: any) =>
		(p && typeof p === 'object' && p.resource === 'whatsappInbox') ||
		(typeof p === 'string' && p.startsWith('whatsappInbox:')) ||
		(p && typeof p === 'object' && p.resource === 'user' && p.operation === 'delete') ||
		(typeof p === 'string' && p === 'user:delete');
	const strip = (node: any): any => {
		if (Array.isArray(node)) return node.filter((item) => !isRemoved(item)).map(strip);
		if (node && typeof node === 'object') {
			return Object.fromEntries(
				Object.entries(node).map(([k, v]) => [
					k,
					// Renombrar el rol superadmin: isSuperadmin del frontend viene del
					// NOMBRE del rol y concede todo por bypass — sin esto, quitar el
					// permiso no oculta nada.
					v === 'superadmin' ? 'staff_sin_whatsapp' : strip(v),
				]),
			);
		}
		return node;
	};
	for (const pattern of ['**/api/auth/status', '**/api/auth/login']) {
		await page.route(pattern, async (route) => {
			const response = await route.fetch();
			const body = await response.json().catch(() => null);
			if (!body) return route.fulfill({ response });
			await route.fulfill({ response, json: strip(body) });
		});
	}
}

/** Expande la sección «Comunicaciones» del sidebar (colapsada por defecto). */
async function expandCommunicationsSection(page: Page) {
	const header = page.getByText(SECTION, { exact: true });
	if (await header.count()) {
		await header.first().click();
	}
}

test.describe('Bandeja WhatsApp (wa-inbox) — con permiso', () => {
	test.beforeEach(async ({ page }, testInfo) => {
		const loginError = await loginViaUi(page, CRED);
		if (loginError) testInfo.skip(true, loginError);
	});

	test('superadmin ve la entrada en el sidebar y la vista carga', async ({ page }) => {
		// Ancla positiva SIEMPRE visible antes de contar ausencias o presencias.
		await expect(page.getByRole('link', { name: 'Caminantes', exact: true })).toBeVisible();

		await expandCommunicationsSection(page);
		const entry = page.getByRole('link', { name: SIDEBAR_ITEM, exact: true });
		await expect(entry).toBeVisible();
		await entry.click();
		await expect(page.getByText(VIEW_HEADING, { exact: false })).toBeVisible();
	});

	test('directo a /app/wa-inbox por URL muestra la vista (superadmin)', async ({ page }) => {
		await expect(page.getByRole('link', { name: 'Caminantes', exact: true })).toBeVisible();

		await page.goto('/app/wa-inbox');
		await page.waitForLoadState('networkidle');
		expect(page.url(), 'un superadmin debe poder abrir la vista por URL').toContain('wa-inbox');
		await expect(page.getByText(VIEW_HEADING, { exact: false })).toBeVisible();
	});
});

test.describe('Bandeja WhatsApp (wa-inbox) — sin whatsappInbox:read', () => {
	test('la entrada no aparece y la URL directa redirige', async ({ page }, testInfo) => {
		// Las rutas van ANTES del login: el perfil que recibe la app ya viene
		// sin el permiso (el store persistido no se re-evalúa con reload).
		await simulateMissingWaInboxPermission(page);
		const loginError = await loginViaUi(page, CRED);
		if (loginError) testInfo.skip(true, loginError);

		await expect(page.getByRole('link', { name: 'Caminantes', exact: true })).toBeVisible();
		// Sin expandir: la sección colapsada no debe tener el enlace de todas formas.
		await expect(page.getByRole('link', { name: SIDEBAR_ITEM, exact: true })).toHaveCount(0);

		await page.goto('/app/wa-inbox');
		await page.waitForLoadState('networkidle');
		expect(page.url(), 'el guard del router debe redirigir, no mostrar la vista').not.toContain(
			'wa-inbox',
		);
	});
});
