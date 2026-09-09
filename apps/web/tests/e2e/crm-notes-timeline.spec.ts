import { test, expect } from '@playwright/test';
import { E2E_USERS, loginAs, withCsrf } from './helpers/auth';

/**
 * E2E de autorización del hilo de notas, el timeline y la vista previa de un
 * paso de secuencia.
 *
 * Este hilo guarda notas del coordinador sobre personas concretas ("la mamá
 * está enojada") y el timeline expone teléfonos, correos y pagos, así que el
 * gating importa más que en una lista cualquiera. Lo que se fija aquí:
 *  - anónimo → 401/403 en lectura y escritura.
 *  - un usuario autenticado SIN acceso al retiro → 403/404, nunca 200.
 *  - un id de retiro o participante inventado no filtra nada.
 *
 * La autoría (sólo el autor edita su nota) se cubre en el test de integración
 * del controlador, que puede sembrar dos autores distintos.
 *
 * Pre-req: migración `SeedE2ETestUsers` (usuarios fixture).
 */
test.use({ locale: 'es-MX' });

const FAKE_RETREAT = '00000000-0000-0000-0000-0000000000aa';
const FAKE_PARTICIPANT = '00000000-0000-0000-0000-0000000000bb';

test.describe.serial('CRM — hilo de notas y timeline: Auth E2E', () => {
	test('SECURITY: anónimo no lee el hilo de notas', async ({ request }) => {
		const r = await request.get(
			`/api/crm/retreat/${FAKE_RETREAT}/participants/${FAKE_PARTICIPANT}/notes`,
		);
		expect([401, 403]).toContain(r.status());
	});

	test('SECURITY: anónimo no lee el timeline', async ({ request }) => {
		const r = await request.get(
			`/api/crm/retreat/${FAKE_RETREAT}/participants/${FAKE_PARTICIPANT}/timeline`,
		);
		expect([401, 403]).toContain(r.status());
	});

	test('SECURITY: anónimo no crea notas', async ({ request }) => {
		const r = await request.post('/api/crm/notes', {
			data: {
				retreatId: FAKE_RETREAT,
				participantId: FAKE_PARTICIPANT,
				body: 'nota de un intruso',
			},
		});
		expect([401, 403]).toContain(r.status());
	});

	test('SECURITY: anónimo no edita ni borra notas', async ({ request }) => {
		const put = await request.put(`/api/crm/notes/${FAKE_PARTICIPANT}`, {
			data: { body: 'cambiada' },
		});
		expect([401, 403]).toContain(put.status());

		const del = await request.delete(`/api/crm/notes/${FAKE_PARTICIPANT}`);
		expect([401, 403]).toContain(del.status());
	});

	test('SECURITY: anónimo no genera vistas previas de secuencia', async ({ request }) => {
		// El preview resuelve destinatarios reales (teléfonos, correos del
		// invitador y de los familiares), así que es una superficie de fuga.
		const r = await request.post('/api/message-sequences/preview', {
			data: {
				retreatId: FAKE_RETREAT,
				participantId: FAKE_PARTICIPANT,
				templateType: 'GENERAL',
				channel: 'whatsapp',
				recipientTarget: 'participant',
			},
		});
		expect([401, 403]).toContain(r.status());
	});

	test('autenticado sin acceso al retiro no lee el hilo', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.other);
		const r = await s.ctx.get(
			`/api/crm/retreat/${FAKE_RETREAT}/participants/${FAKE_PARTICIPANT}/notes`,
		);
		expect(r.status()).not.toBe(200);
		expect([403, 404]).toContain(r.status());
		await s.dispose();
	});

	test('autenticado sin acceso al retiro no lee el timeline', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.other);
		const r = await s.ctx.get(
			`/api/crm/retreat/${FAKE_RETREAT}/participants/${FAKE_PARTICIPANT}/timeline`,
		);
		expect(r.status()).not.toBe(200);
		expect([403, 404]).toContain(r.status());
		await s.dispose();
	});

	test('autenticado sin acceso al retiro no crea notas', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.other);
		const r = await s.ctx.post('/api/crm/notes', {
			data: {
				retreatId: FAKE_RETREAT,
				participantId: FAKE_PARTICIPANT,
				body: 'nota sin permiso',
			},
			headers: withCsrf(s.csrfToken),
		});
		expect(r.status()).not.toBe(201);
		expect([403, 404]).toContain(r.status());
		await s.dispose();
	});

	test('autenticado sin acceso al retiro no genera vistas previas', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.other);
		const r = await s.ctx.post('/api/message-sequences/preview', {
			data: {
				retreatId: FAKE_RETREAT,
				participantId: FAKE_PARTICIPANT,
				templateType: 'GENERAL',
				channel: 'email',
				recipientTarget: 'inviter',
			},
			headers: withCsrf(s.csrfToken),
		});
		expect(r.status()).not.toBe(200);
		expect([403, 404]).toContain(r.status());
		await s.dispose();
	});

	test('una nota vacía se rechaza con 400, no se guarda', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.superadmin);
		const r = await s.ctx.post('/api/crm/notes', {
			data: { retreatId: FAKE_RETREAT, participantId: FAKE_PARTICIPANT, body: '   ' },
			headers: withCsrf(s.csrfToken),
		});
		// 400 por el schema; 403/404 si el gating pega antes. Nunca 201.
		expect(r.status()).not.toBe(201);
		expect([400, 403, 404]).toContain(r.status());
		await s.dispose();
	});
});
