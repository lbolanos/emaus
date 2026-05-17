import { APIRequestContext, request, expect } from '@playwright/test';

/**
 * Test users seeded by migration 20260516200000_SeedE2ETestUsers.
 * Passwords are dev/test only — never use in production.
 */
export const E2E_USERS = {
	owner: { email: 'e2e-owner@test.local', password: 'Test1234!' },
	admin: { email: 'e2e-admin@test.local', password: 'Test1234!' },
	member: { email: 'e2e-member@test.local', password: 'Test1234!' },
	other: { email: 'e2e-other@test.local', password: 'Test1234!' },
} as const;

export const E2E_COMMUNITIES = {
	primary: 'e2e00001-aaaa-aaaa-aaaa-000000000001',
	other: 'e2e00002-bbbb-bbbb-bbbb-000000000002',
} as const;

export interface AuthSession {
	ctx: APIRequestContext;
	csrfToken: string;
	dispose: () => Promise<void>;
}

/**
 * Login a test user and return an APIRequestContext that has:
 *  - session cookie persisted (handled internally by playwright storage)
 *  - csrfToken already fetched for use on subsequent mutating requests
 *
 * Caller must `await session.dispose()` when done.
 */
export async function loginAs(
	baseURL: string,
	user: { email: string; password: string },
): Promise<AuthSession> {
	const ctx = await request.newContext({ baseURL });
	const loginRes = await ctx.post('/api/auth/login', {
		data: { email: user.email, password: user.password },
		headers: { 'content-type': 'application/json' },
	});
	if (!loginRes.ok()) {
		const body = await loginRes.text();
		await ctx.dispose();
		throw new Error(`Login failed for ${user.email}: ${loginRes.status()} ${body}`);
	}

	const csrfRes = await ctx.get('/api/csrf-token');
	if (!csrfRes.ok()) {
		await ctx.dispose();
		throw new Error(`csrf-token fetch failed: ${csrfRes.status()}`);
	}
	const { csrfToken } = await csrfRes.json();
	if (!csrfToken) {
		await ctx.dispose();
		throw new Error('csrf-token endpoint returned empty token');
	}

	return {
		ctx,
		csrfToken,
		dispose: () => ctx.dispose(),
	};
}

/**
 * Convenience headers helper for mutating requests.
 */
export function withCsrf(csrfToken: string, extra: Record<string, string> = {}) {
	return { 'X-CSRF-Token': csrfToken, 'content-type': 'application/json', ...extra };
}

/**
 * Assert that login itself works (smoke test). Useful for setup verification.
 */
export async function assertLoginsWork(baseURL: string) {
	for (const [key, creds] of Object.entries(E2E_USERS)) {
		const s = await loginAs(baseURL, creds);
		expect(s.csrfToken.length, `${key} should obtain csrf token`).toBeGreaterThan(0);
		await s.dispose();
	}
}
