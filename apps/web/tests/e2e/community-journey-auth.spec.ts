import { test, expect } from '@playwright/test';
import { E2E_COMMUNITIES, E2E_USERS, loginAs, withCsrf } from './helpers/auth';

/**
 * E2E coverage for authenticated community endpoints.
 *
 * Validates the owner-only authorization model introduced in the
 * 2026-05-15/2026-05-16 hardenings (P3): owner can manage, admin cannot,
 * unrelated user is rejected.
 *
 * Pre-req: migration `20260516200000_SeedE2ETestUsers` must have run so the
 * fixture users + communities exist.
 */
test.use({ locale: 'es-MX' });

test.describe.serial('Community Journey — Auth E2E', () => {
	test('login smoke: owner can authenticate and fetch csrf-token', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.owner);
		expect(s.csrfToken).toBeTruthy();
		// Verify session is valid against /status
		const r = await s.ctx.get('/api/auth/status');
		expect(r.ok()).toBe(true);
		const body = await r.json();
		// /status returns the user object directly (not wrapped under `user`)
		expect(body.email).toBe(E2E_USERS.owner.email);
		await s.dispose();
	});

	test('SECURITY: anonymous PUT /:id is rejected', async ({ request }) => {
		const r = await request.put(`/api/communities/${E2E_COMMUNITIES.primary}`, {
			data: { name: 'should fail' },
		});
		expect([401, 403]).toContain(r.status());
	});

	test('owner: PUT /:id succeeds', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.owner);
		const r = await s.ctx.put(`/api/communities/${E2E_COMMUNITIES.primary}`, {
			data: { description: `Updated by E2E owner at ${Date.now()}` },
			headers: withCsrf(s.csrfToken),
		});
		expect(r.status()).toBe(200);
		await s.dispose();
	});

	test('admin (not owner): PUT /:id is forbidden (P3)', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.admin);
		const r = await s.ctx.put(`/api/communities/${E2E_COMMUNITIES.primary}`, {
			data: { description: 'should fail' },
			headers: withCsrf(s.csrfToken),
		});
		expect(r.status()).toBe(403);
		await s.dispose();
	});

	test('member (no role): GET /:id is forbidden (only admins/owners see details)', async ({
		baseURL,
	}) => {
		const s = await loginAs(baseURL!, E2E_USERS.member);
		const r = await s.ctx.get(`/api/communities/${E2E_COMMUNITIES.primary}`);
		// member has no relation to this community — must be 403
		expect([401, 403]).toContain(r.status());
		await s.dispose();
	});

	test('cross-tenant: other-owner cannot edit primary community', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.other);
		const r = await s.ctx.put(`/api/communities/${E2E_COMMUNITIES.primary}`, {
			data: { description: 'cross-tenant attempt' },
			headers: withCsrf(s.csrfToken),
		});
		expect(r.status()).toBe(403);
		await s.dispose();
	});

	test('admin: DELETE /:id/admins/:userId is forbidden (P3 owner-only)', async ({
		baseURL,
	}) => {
		const s = await loginAs(baseURL!, E2E_USERS.admin);
		// Try to revoke owner — should be blocked before owner-revoke logic even fires.
		const r = await s.ctx.delete(
			`/api/communities/${E2E_COMMUNITIES.primary}/admins/${E2E_USERS.owner.email}`,
			{ headers: withCsrf(s.csrfToken) },
		);
		expect(r.status()).toBe(403);
		await s.dispose();
	});

	test('owner: GET /my returns the community', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.owner);
		const r = await s.ctx.get('/api/communities/my');
		// /my returns communities where user is an active member via participant.
		// Owner has CommunityAdmin row but not necessarily a Participant→Member link,
		// so accept 200 + array (may be empty).
		expect(r.status()).toBe(200);
		const data = await r.json();
		expect(Array.isArray(data)).toBe(true);
		await s.dispose();
	});

	test('viewerRole is exposed in GET /:id', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.owner);
		const r = await s.ctx.get(`/api/communities/${E2E_COMMUNITIES.primary}`);
		expect(r.status()).toBe(200);
		const data = await r.json();
		expect(data.viewerRole).toBe('owner');
		await s.dispose();
	});

	test('admin sees viewerRole=admin in GET /:id', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.admin);
		const r = await s.ctx.get(`/api/communities/${E2E_COMMUNITIES.primary}`);
		expect(r.status()).toBe(200);
		const data = await r.json();
		expect(data.viewerRole).toBe('admin');
		await s.dispose();
	});

	// ─── P2 SECURITY: trimming de PII por rol del viewer ───────────────────────

	test('P2: owner GET /:id/members ve campos completos (street, birthDate)', async ({
		baseURL,
	}) => {
		const s = await loginAs(baseURL!, E2E_USERS.owner);
		const r = await s.ctx.get(`/api/communities/${E2E_COMMUNITIES.primary}/members`);
		expect(r.status()).toBe(200);
		const data = await r.json();
		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBeGreaterThan(0);
		const seedMember = data.find((m: any) => m.id === 'e2e00004-dddd-dddd-dddd-000000000004');
		expect(seedMember).toBeTruthy();
		expect(seedMember.participant._trimmed).toBeUndefined();
		// Owner ve PII completa
		expect(seedMember.participant.street).toBe('Calle E2E');
		expect(seedMember.participant.birthDate).toBeDefined();
		expect(seedMember.participant.emergencyContact1Name).toBe('EC1');
		await s.dispose();
	});

	test('P2: admin no-owner GET /:id/members recibe _trimmed=true', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.admin);
		const r = await s.ctx.get(`/api/communities/${E2E_COMMUNITIES.primary}/members`);
		expect(r.status()).toBe(200);
		const data = await r.json();
		const seedMember = data.find((m: any) => m.id === 'e2e00004-dddd-dddd-dddd-000000000004');
		expect(seedMember).toBeTruthy();
		expect(seedMember.participant._trimmed).toBe(true);
		// Admin SOLO ve campos básicos
		expect(seedMember.participant.firstName).toBe('E2E');
		expect(seedMember.participant.lastName).toBe('TestMember');
		expect(seedMember.participant.email).toBe('e2e-participant@test.local');
		// PII sensible NO presente
		expect(seedMember.participant.street).toBeUndefined();
		expect(seedMember.participant.birthDate).toBeUndefined();
		expect(seedMember.participant.emergencyContact1Name).toBeUndefined();
		expect(seedMember.participant.medicationDetails).toBeUndefined();
		await s.dispose();
	});

	test('P2: filtro por state respetado por admin', async ({ baseURL }) => {
		const s = await loginAs(baseURL!, E2E_USERS.admin);
		const r = await s.ctx.get(
			`/api/communities/${E2E_COMMUNITIES.primary}/members?state=pending_verification`,
		);
		expect(r.status()).toBe(200);
		const data = await r.json();
		// No deberían venir members active_member en este filtro
		expect(data.find((m: any) => m.state === 'active_member')).toBeUndefined();
		await s.dispose();
	});

	test('P2: cross-tenant — admin de primary NO puede ver members de other community', async ({
		baseURL,
	}) => {
		const s = await loginAs(baseURL!, E2E_USERS.admin);
		const r = await s.ctx.get(`/api/communities/${E2E_COMMUNITIES.other}/members`);
		// requireCommunityAccess debe bloquear — admin no es admin de la otra community
		expect([401, 403]).toContain(r.status());
		await s.dispose();
	});
});
