import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * offline-mode M1 E2E (specs/offline-mode): the app shell keeps loading without
 * signal once the service worker is installed.
 *
 * The service worker only exists in a production build, so this spec runs
 * against `vite preview` of `dist/` (proxied to an API), not against the dev
 * server — it skips itself with a readable reason when /sw.js is not a real
 * worker script:
 *
 *   pnpm --filter web exec vite build --mode production
 *   VITE_API_PROXY_TARGET=http://localhost:<api> pnpm --filter web exec vite preview --port 4179
 *   E2E_BASE_URL=http://localhost:4179 npx playwright test tests/e2e/offline-shell.spec.ts --project=chromium
 *
 * Writes nothing: it only logs in and reloads.
 */

test.use({ locale: 'es-MX', serviceWorkers: 'allow' });

const USER = {
	email: process.env.E2E_LOCAL_EMAIL || 'leonardo.bolanos@gmail.com',
	password: process.env.E2E_LOCAL_PASSWORD || '123456',
};

async function serviceWorkerSkipReason(request: APIRequestContext): Promise<string | null> {
	const response = await request.get('/sw.js');
	const type = response.headers()['content-type'] ?? '';
	const body = await response.text();
	if (!response.ok() || !type.includes('javascript') || !body.includes('workbox')) {
		return 'needs a production build served by vite preview: this server has no service worker';
	}
	return null;
}

async function login(page: Page): Promise<string | null> {
	await page.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
	await page.goto('/login');
	await page.locator('input[type="email"]').fill(USER.email);
	await page.locator('input[type="password"]').fill(USER.password);
	const loginResponse = page.waitForResponse(
		(r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
		{ timeout: 30000 },
	);
	await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
	const response = await loginResponse;
	if (!response.ok()) {
		return `login rejected with ${response.status()} for ${USER.email}`;
	}
	await page.waitForURL(/\/app/, { timeout: 30000 });
	return null;
}

async function waitForServiceWorkerControl(page: Page) {
	// clientsClaim: once the first worker activates it controls this page.
	await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
		timeout: 60000,
	});
}

test.describe('offline app shell', () => {
	test('reloading without signal renders the app instead of the browser error page', async ({
		page,
		context,
		request,
	}) => {
		const skip = await serviceWorkerSkipReason(request);
		test.skip(skip !== null, skip ?? '');
		const loginSkip = await login(page);
		test.skip(loginSkip !== null, loginSkip ?? '');

		await waitForServiceWorkerControl(page);

		await context.setOffline(true);
		try {
			await page.reload();
			// The shell boots from the precache: either the app itself (with the
			// saved session, M2 — offline-read-cache.spec.ts checks that path) or the
			// login form, both part of the shell. A blank page or the browser's own
			// error page is the failure.
			await expect(page.locator('#app')).not.toBeEmpty();
			await expect(
				page.locator('input[type="email"]').or(page.getByTestId('connectivity-chip')),
			).toBeVisible({ timeout: 15000 });

			// A deep link opened without signal also gets the shell.
			await page.goto('/app/help');
			await expect(page.locator('#app')).not.toBeEmpty();
		} finally {
			await context.setOffline(false);
		}
	});

	test('the service worker never answers /api from its caches', async ({ page, context, request }) => {
		const skip = await serviceWorkerSkipReason(request);
		test.skip(skip !== null, skip ?? '');
		const loginSkip = await login(page);
		test.skip(loginSkip !== null, loginSkip ?? '');

		await waitForServiceWorkerControl(page);
		// Online, the same request works…
		const online = await page.evaluate(() =>
			fetch('/api/csrf-token', { credentials: 'include' }).then((r) => r.status),
		);
		expect(online).toBe(200);

		await context.setOffline(true);
		try {
			// …offline it must fail: API data lives in the app's own cache (M2).
			const offline = await page.evaluate(() =>
				fetch('/api/csrf-token', { credentials: 'include' })
					.then((r) => `status ${r.status}`)
					.catch(() => 'network-error'),
			);
			expect(offline).toBe('network-error');
		} finally {
			await context.setOffline(false);
		}
	});

	test('public pages do not install the service worker', async ({ page, request }) => {
		const skip = await serviceWorkerSkipReason(request);
		test.skip(skip !== null, skip ?? '');

		await page.goto('/');
		await page.waitForLoadState('networkidle');
		const registrations = await page.evaluate(async () =>
			(await navigator.serviceWorker.getRegistrations()).length,
		);
		expect(registrations).toBe(0);
		// Nor any offline storage on a walker's phone (M2/M4 stay behind the login).
		const databases = await page.evaluate(async () =>
			(await indexedDB.databases()).map((d) => d.name),
		);
		expect(databases).not.toContain('emaus-offline');
	});

	test.describe('control: without the service worker', () => {
		test.use({ serviceWorkers: 'block' });

		// Proves the first test measures the worker and not some browser cache:
		// the same offline reload with workers blocked must hit the network error.
		test('the same offline reload fails', async ({ page, context, request }) => {
			const skip = await serviceWorkerSkipReason(request);
			test.skip(skip !== null, skip ?? '');
			const loginSkip = await login(page);
			test.skip(loginSkip !== null, loginSkip ?? '');

			await context.setOffline(true);
			try {
				await expect(page.reload()).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/);
			} finally {
				await context.setOffline(false);
			}
		});
	});

	test('the manifest makes the app installable', async ({ page, request }) => {
		const skip = await serviceWorkerSkipReason(request);
		test.skip(skip !== null, skip ?? '');

		await page.goto('/login');
		const href = await page.locator('link[rel="manifest"]').getAttribute('href');
		expect(href).toBe('/manifest.webmanifest');

		const manifest = await (await request.get(href!)).json();
		expect(manifest.start_url).toBe('/app');
		expect(manifest.display).toBe('standalone');
		for (const icon of manifest.icons as Array<{ src: string }>) {
			const iconResponse = await request.get(icon.src);
			expect(iconResponse.ok(), icon.src).toBe(true);
		}
		const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
		expect((await request.get(apple!)).ok()).toBe(true);
	});
});
