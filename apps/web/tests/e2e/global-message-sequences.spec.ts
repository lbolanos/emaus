import { test, expect } from '@playwright/test';
import { E2E_USERS, loginAs, withCsrf } from './helpers/auth';

/**
 * E2E de autorización para las plantillas globales de secuencias.
 *
 * Las rutas `/api/global-message-sequences` están gated por el permiso
 * `globalMessageTemplate:*` (nivel superadmin de "Configuración Global"):
 *  - anónimo  → 401/403
 *  - un usuario sin ese permiso (owner de comunidad) → 403
 *  - `copy-to-retreat` exige además acceso al retiro destino.
 *
 * Pre-req: migración `20260516200000_SeedE2ETestUsers` (usuarios fixture).
 */
test.use({ locale: 'es-MX' });

test.describe.serial('Global message sequences — Auth E2E', () => {
	test('SECURITY: anónimo GET es rechazado', async ({ request }) => {
		const r = await request.get('/api/global-message-sequences');
		expect([401, 403]).toContain(r.status());
	});

	test('SECURITY: anónimo POST (crear) es rechazado', async ({ request }) => {
		const r = await request.post('/api/global-message-sequences', {
			data: { name: 'should fail', trigger: 'birthday', steps: [] },
		});
		expect([401, 403]).toContain(r.status());
	});

	test('SECURITY: anónimo copy-to-retreat es rechazado', async ({ request }) => {
		const r = await request.post('/api/global-message-sequences/any-id/copy-to-retreat', {
			data: { retreatId: 'any-retreat' },
		});
		expect([401, 403]).toContain(r.status());
	});

	test('owner (sin permiso global) GET es forbidden', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.owner);
		const r = await s.ctx.get('/api/global-message-sequences');
		expect(r.status()).toBe(403);
		await s.dispose();
	});

	test('owner (sin permiso global) POST crear es forbidden', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.owner);
		const r = await s.ctx.post('/api/global-message-sequences', {
			data: { name: 'E2E intento', trigger: 'birthday', steps: [] },
			headers: withCsrf(s.csrfToken),
		});
		expect(r.status()).toBe(403);
		await s.dispose();
	});
});
