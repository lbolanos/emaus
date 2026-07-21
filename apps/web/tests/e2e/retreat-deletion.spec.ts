import { test, expect, request } from '@playwright/test';
import { loginAs, withCsrf, E2E_USERS, E2E_HOUSE_ID } from './helpers/auth';

const RANDOM_RETREAT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * E2E de autorización del endpoint DELETE /api/retreats/:id.
 *
 * Cubre el límite de seguridad extremo-a-extremo (HTTP → auth → CSRF → requirePermission)
 * sin depender de datos concretos ni de credenciales de admin (usa los usuarios e2e sembrados,
 * que NO tienen permiso `retreat:delete`). El happy-path (superadmin/admin borrando en cascada)
 * está cubierto por los tests de integración de Jest en apps/api.
 */
test.describe('Eliminación de retiro — autorización (API e2e)', () => {
	test('rechaza DELETE sin autenticación', async ({ baseURL }) => {
		const ctx = await request.newContext({ baseURL: baseURL! });
		const res = await ctx.delete(`/api/retreats/${RANDOM_RETREAT_ID}`);
		// Sin sesión: bloqueado por auth/CSRF (401 o 403 según el orden de middlewares).
		expect([401, 403]).toContain(res.status());
		await ctx.dispose();
	});

	test('un usuario sin permiso retreat:delete no puede borrar (403)', async ({ baseURL }) => {
		// Los usuarios e2e los siembra la migración 20260516200000; si la DB local trae
		// datos de prod (make db-pull) no existen → saltamos con motivo claro. En CI sí corren.
		const session = await loginAs(baseURL!, E2E_USERS.owner).catch(() => null);
		test.skip(!session, 'usuarios e2e no sembrados en esta base (¿DB con datos de prod?)');

		const res = await session!.ctx.delete(`/api/retreats/${RANDOM_RETREAT_ID}`, {
			headers: withCsrf(session!.csrfToken),
		});
		// Autenticado pero sin el permiso → 403 (la autorización corre antes que el 404).
		expect(res.status()).toBe(403);
		await session!.dispose();
	});

	test('superadmin crea y borra un retiro (happy-path, sin huérfanos)', async ({ baseURL }) => {
		// e2e-superadmin + casa E2E los siembra 20260721130000 (prod-guarded). En una DB con
		// datos de prod (make db-pull) no existen → se salta; corre en CI con la DB de test.
		const session = await loginAs(baseURL!, E2E_USERS.superadmin).catch(() => null);
		test.skip(!session, 'e2e-superadmin no sembrado en esta base (¿DB con datos de prod?)');

		// Crear un retiro (usa la casa E2E fija; parish único para evitar choques de slug).
		const parish = `E2E Borrado ${Date.now()}`;
		const createRes = await session!.ctx.post('/api/retreats', {
			headers: withCsrf(session!.csrfToken),
			data: {
				parish,
				startDate: '2030-01-10',
				endDate: '2030-01-12',
				houseId: E2E_HOUSE_ID,
			},
		});
		expect(createRes.ok(), `create retreat: ${createRes.status()}`).toBeTruthy();
		const created = await createRes.json();
		expect(created.id).toBeTruthy();

		// Borrarlo → 204.
		const delRes = await session!.ctx.delete(`/api/retreats/${created.id}`, {
			headers: withCsrf(session!.csrfToken),
		});
		expect(delRes.status()).toBe(204);

		// Ya no existe.
		const getRes = await session!.ctx.get(`/api/retreats/${created.id}`);
		expect([403, 404]).toContain(getRes.status());

		await session!.dispose();
	});
});
