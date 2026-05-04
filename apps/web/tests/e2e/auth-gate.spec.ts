import { test, expect } from '@playwright/test';

/**
 * E2E coverage for the auth gate guarding `/app/*` routes. Verifies that
 * unauthenticated users land on /login when they try to reach protected
 * routes — the inverse of `mam-public-view.spec.ts`.
 *
 * This test catches regressions in `router/index.ts:beforeEach` and in the
 * pathless-mount refactor (Bug B from 2026-04-28): if someone reintroduces
 * a `router.use(isAuthenticated)` blanket on a sub-router that affects
 * downstream routes, this still passes (it's UI-side); the API-side guard
 * is covered by `pathlessMounts.simple.test.ts`.
 */

test.describe('Auth gate for /app/* routes', () => {
	test('redirects to /login when unauthenticated', async ({ page }) => {
		await page.goto('/app');
		await page.waitForLoadState('networkidle');
		// Either redirected outright OR shows a login form. We accept both
		// by URL match.
		expect(page.url()).toContain('/login');
	});

	test('redirects to /login from a deep app route', async ({ page }) => {
		await page.goto('/app/walkers');
		await page.waitForLoadState('networkidle');
		expect(page.url()).toContain('/login');
	});

	test('does NOT redirect /mam/:slug (public)', async ({ page }) => {
		await page.goto('/mam/some-slug');
		await page.waitForLoadState('networkidle');
		expect(page.url()).not.toContain('/login');
		expect(page.url()).toContain('/mam/some-slug');
	});

	test('does NOT redirect /santisimo/:slug (public)', async ({ page }) => {
		await page.goto('/santisimo/some-slug');
		await page.waitForLoadState('networkidle');
		expect(page.url()).not.toContain('/login');
	});

	test('does NOT redirect / (landing)', async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		expect(page.url()).not.toContain('/login');
	});
});
