import { test, expect } from '@playwright/test';

/**
 * E2E coverage del community membership journey.
 *
 * Cobertura por gap:
 *  - G1 (auto-link Participant→User): cubierto en unit tests del service (5 casos)
 *  - G2 (email transición de estado): cubierto en unit tests (4 casos)
 *  - G3 (notificar reunión próxima): cubierto en unit tests (3 casos)
 *  - G4 (vista Mis Comunidades): aquí E2E UI — ruta protegida + asistencia pública
 *  - G5 (audit fields): cubierto en unit tests (1 caso explícito) + BD verificable
 *
 * Los E2E aquí complementan unit tests con el flujo HTTP real:
 *  - Confirma que la ruta /app/my-communities existe y está protegida
 *  - Confirma que /public/attendance/:c/:m carga sin auth
 *  - Smoke test del flujo público end-to-end (join-public con reCAPTCHA en dev)
 */

test.use({ locale: 'es-MX' });

test.describe('Community Journey — E2E', () => {
	test('G4: /app/my-communities está protegido por auth (redirige a /login)', async ({ page }) => {
		await page.goto('/app/my-communities');
		await page.waitForLoadState('networkidle');
		expect(page.url()).toContain('/login');
	});

	test('Asistencia pública: ruta /public/attendance/:c/:m existe', async ({ page }) => {
		// Usar IDs reales de BD para validar que la vista carga.
		// Si la combinación no existe, la vista debe mostrar error gracefully (no 404 del router).
		// "EMAÚS Polanco" comunidad sin meetings reales → endpoint devolverá error o empty.
		await page.goto('/public/attendance/f271d131-01f6-4aa0-9904-5eab1170e722/non-existent-meeting');
		await page.waitForLoadState('networkidle');
		// La ruta debe existir (no redirige a 404 ni a login)
		expect(page.url()).toContain('/public/attendance/');
		expect(page.url()).not.toContain('/login');
	});

	test('Landing: enlace "Mis Comunidades" en menú aparece SOLO en area autenticada', async ({ page }) => {
		// Sin auth, el landing público no debería mostrar "Mis Comunidades" en su nav.
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		// El nav del landing no debe contener este texto
		const navText = await page.locator('nav').first().innerText();
		expect(navText).not.toContain('Mis Comunidades');
	});

	test('Endpoint API /api/communities/public devuelve lista (smoke test)', async ({ request }) => {
		const response = await request.get('/api/communities/public');
		expect(response.status()).toBe(200);
		const data = await response.json();
		expect(Array.isArray(data)).toBe(true);
		// Hay al menos 1 comunidad activa en BD
		expect(data.length).toBeGreaterThan(0);
		// Cada item debe tener los campos del select público
		expect(data[0]).toHaveProperty('id');
		expect(data[0]).toHaveProperty('name');
	});

	test('Endpoint API /api/communities/my requiere autenticación (G4)', async ({ request }) => {
		const response = await request.get('/api/communities/my');
		// Sin cookie de sesión: debe rechazar
		expect([401, 403]).toContain(response.status());
	});

	test('Endpoint API /api/communities/public/meetings devuelve futuras', async ({ request }) => {
		const response = await request.get('/api/communities/public/meetings');
		expect(response.status()).toBe(200);
		const data = await response.json();
		expect(Array.isArray(data)).toBe(true);
		// Si hay meetings, deben tener startDate
		if (data.length > 0) {
			expect(data[0]).toHaveProperty('startDate');
			expect(data[0]).toHaveProperty('community');
		}
	});

	// ─── SECURITY: IDOR fix ──────────────────────────────────────────────────

	test('SECURITY: POST /:id/meetings/:meetingId/notify requiere autenticación', async ({ request }) => {
		// Tomar una community y meeting reales del listing público
		const meetingsRes = await request.get('/api/communities/public/meetings');
		const meetings = await meetingsRes.json();
		if (meetings.length === 0) {
			test.skip(true, 'No upcoming meetings to test against');
			return;
		}
		const m = meetings[0];

		const response = await request.post(`/api/communities/${m.community.id}/meetings/${m.id}/notify`);
		// Sin sesión: debe rechazar (no envía emails)
		expect([401, 403]).toContain(response.status());
	});

	test('SECURITY: el endpoint notify rechaza el cross-tenant attack incluso con community :id válido', async ({ request }) => {
		// Tomar dos meetings de DIFERENTES communities del listing público
		const meetingsRes = await request.get('/api/communities/public/meetings');
		const meetings = await meetingsRes.json();
		const distinctCommunities = new Set(meetings.map((m: any) => m.community.id));
		if (distinctCommunities.size < 2 || meetings.length < 2) {
			test.skip(true, 'Need meetings from at least 2 different communities');
			return;
		}

		// Buscar meetings de dos communities distintas
		const mA = meetings[0];
		const mB = meetings.find((m: any) => m.community.id !== mA.community.id);
		if (!mB) {
			test.skip(true, 'No second community found');
			return;
		}

		// Cross-tenant: poner mA.community.id en el URL pero mB.id como meetingId
		// Sin auth — el primer gate (401/403) ya bloquea.
		// Con auth (en un escenario real) requireCommunityMeetingAccess('meetingId')
		// resolvería contra mB.community.id, rechazando porque el caller no es admin de B.
		const response = await request.post(`/api/communities/${mA.community.id}/meetings/${mB.id}/notify`);
		// El response NUNCA debe ser 2xx (notification dispatched) en este escenario
		expect(response.status()).toBeGreaterThanOrEqual(400);
	});
});
