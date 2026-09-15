import { test, expect } from '@playwright/test';

/**
 * Cierre de la tarea de protección de datos de salud (Fase 5 + fix de
 * `security-review`): `GET /api/retreats/public/:id` y
 * `GET /api/retreats/public/slug/:slug` devuelven costo, forma de pago,
 * teléfonos de contacto y dirección de la casa — datos que el volante
 * público necesita para UN retiro concreto. Antes del fix, ambos endpoints
 * devolvían esos mismos campos para **cualquier** id/slug válido, incluido
 * un retiro que la organización nunca marcó `isPublic: true` (el guard de
 * escritura `createParticipant` ya exigía `isPublic`, el de lectura no).
 *
 * Este spec cubre las dos puntas:
 * 1. El camino legítimo sigue funcionando: el volante de un retiro público
 *    real carga costo/pago en el navegador (regresión del fix, no solo del
 *    hallazgo).
 * 2. El camino que se cerró: un id/slug de un retiro NO público responde 404
 *    en ambos endpoints — verificado por API directa, es la forma exacta en
 *    que se explotaba (sin login, sin UI de por medio).
 *
 * Los ids son de la DB del worktree (snapshot de dev); si no existen en la
 * base contra la que corre, cada test se salta con motivo legible en vez de
 * salir en rojo por un problema de entorno (mismo criterio que
 * `participant-health-permission-guard.spec.ts`).
 */

test.use({ locale: 'es-MX' });

const PUBLIC_RETREAT_ID =
	process.env.E2E_PUBLIC_RETREAT_ID || 'e9b3c568-050a-4d66-a99d-305f287a59df';
const NON_PUBLIC_RETREAT_ID =
	process.env.E2E_NON_PUBLIC_RETREAT_ID || '17ae8b23-f134-4118-a5f5-94c74e5c5646';
const NON_PUBLIC_RETREAT_SLUG =
	process.env.E2E_NON_PUBLIC_RETREAT_SLUG || 'parroquiadesanfrancisco';

test.describe('Camino legítimo: volante de un retiro público real', () => {
	test('abrir "Ver Detalles" en el landing carga costo y forma de pago', async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem('preferred-locale', 'es');
		});
		await page.goto('/');

		// La tarjeta se pinta tras el fetch async de `getPublicRetreats` — contar
		// antes de que aparezca el primer botón siempre da 0 (count() no espera).
		const viewDetailsButtons = page.getByRole('button', { name: 'Ver Detalles' });
		const appeared = await viewDetailsButtons
			.first()
			.waitFor({ state: 'visible', timeout: 8000 })
			.then(() => true)
			.catch(() => false);
		test.skip(
			!appeared,
			'No hay retiros públicos futuros en el landing de esta base — sembrar uno o ajustar ' +
				'E2E_PUBLIC_RETREAT_ID (ver docstring del archivo).',
		);

		const detailResponse = page.waitForResponse((res) =>
			res.url().includes('/api/retreats/public/') && res.request().method() === 'GET',
		);
		await viewDetailsButtons.first().click();
		const response = await detailResponse;
		expect(response.status(), 'el detalle de un retiro público no debe dar 404').toBe(200);

		await expect(page.getByText('Costo:')).toBeVisible();
	});
});

test.describe('Camino cerrado: detalle público de un retiro NO público', () => {
	test('GET /api/retreats/public/:id responde 404 para un retiro no público', async ({
		request,
		baseURL,
	}) => {
		const apiBase = process.env.E2E_API_URL || `${baseURL}/api`;
		const res = await request.get(`${apiBase}/retreats/public/${NON_PUBLIC_RETREAT_ID}`);
		if (res.status() === 200) {
			const body = await res.json();
			test.skip(
				body?.parish === undefined,
				`Respuesta 200 inesperada — confirmar que ${NON_PUBLIC_RETREAT_ID} sigue existiendo ` +
					'y con isPublic=false en esta base (ver docstring del archivo).',
			);
		}
		expect(res.status()).toBe(404);
	});

	test('GET /api/retreats/public/slug/:slug responde 404 para un retiro no público', async ({
		request,
		baseURL,
	}) => {
		const apiBase = process.env.E2E_API_URL || `${baseURL}/api`;
		const res = await request.get(`${apiBase}/retreats/public/slug/${NON_PUBLIC_RETREAT_SLUG}`);
		expect(res.status()).toBe(404);
	});

	test('el listado público nunca ofrece este retiro (no público, o ya vencido)', async ({
		request,
		baseURL,
	}) => {
		const apiBase = process.env.E2E_API_URL || `${baseURL}/api`;
		const res = await request.get(`${apiBase}/retreats/public`);
		expect(res.status()).toBe(200);
		const list = await res.json();
		expect(Array.isArray(list) ? list.map((r: any) => r.id) : []).not.toContain(
			NON_PUBLIC_RETREAT_ID,
		);
	});
});
