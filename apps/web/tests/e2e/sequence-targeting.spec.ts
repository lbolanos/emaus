import { test, expect } from '@playwright/test';
import { E2E_USERS, loginAs, withCsrf } from './helpers/auth';

/**
 * E2E de autorización para los endpoints de targeting/ownership del motor de
 * secuencias (mejoras 2026-06-13):
 *  - despacho asistido: open / assign (gated por isAuthenticated + acceso al retiro)
 *  - opt-out: do-not-contact (gated por requireRetreatAccess)
 *
 * Pre-req: migración `20260516200000_SeedE2ETestUsers` (usuarios fixture).
 */
test.use({ locale: 'es-MX' });

test.describe.serial('Sequence targeting/ownership — Auth E2E', () => {
	test('SECURITY: anónimo open es rechazado', async ({ request }) => {
		const r = await request.post('/api/message-sequences/scheduled/any-id/open');
		expect([401, 403]).toContain(r.status());
	});

	test('SECURITY: anónimo assign es rechazado', async ({ request }) => {
		const r = await request.post('/api/message-sequences/scheduled/any-id/assign', {
			data: { userId: 'someone' },
		});
		expect([401, 403]).toContain(r.status());
	});

	test('SECURITY: anónimo do-not-contact es rechazado', async ({ request }) => {
		const r = await request.post(
			'/api/crm/retreat/any-retreat/participants/any-participant/do-not-contact',
			{ data: { value: true } },
		);
		expect([401, 403]).toContain(r.status());
	});

	test('owner: do-not-contact en un retiro sin acceso es forbidden', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.owner);
		const r = await s.ctx.post(
			'/api/crm/retreat/00000000-0000-0000-0000-000000000000/participants/00000000-0000-0000-0000-000000000000/do-not-contact',
			{ data: { value: true }, headers: withCsrf(s.csrfToken) },
		);
		expect(r.status()).toBe(403);
		await s.dispose();
	});

	test('owner: open de un pendiente inexistente devuelve 404 (ruta montada + auth OK)', async ({
		baseURL,
	}) => {
		const s = await loginAs(baseURL!, E2E_USERS.owner);
		const r = await s.ctx.post('/api/message-sequences/scheduled/00000000-0000-0000-0000-000000000000/open', {
			headers: withCsrf(s.csrfToken),
		});
		expect(r.status()).toBe(404);
		await s.dispose();
	});
});
