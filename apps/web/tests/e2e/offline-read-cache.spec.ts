import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { SENSITIVE_HEALTH_FIELDS } from '@repo/types';

/**
 * offline-mode M2 E2E (specs/offline-mode): with real IndexedDB in a real
 * browser, the retreat views keep working without signal from what the phone
 * saved, the app starts without the login screen, and health data never lands
 * on the device.
 *
 * Runs against `vite preview` of a production build (the service worker is what
 * serves the app shell offline); it skips itself on the dev server:
 *
 *   E2E_BASE_URL=http://localhost:4179 npx playwright test tests/e2e/offline-read-cache.spec.ts --project=chromium
 *
 * Writes nothing: logs in, reads, goes offline.
 */

test.use({ locale: 'es-MX', serviceWorkers: 'allow' });

const RETREAT_ID = process.env.E2E_RETREAT_ID || 'e9b3c568-050a-4d66-a99d-305f287a59df';
const USER = {
	email: process.env.E2E_LOCAL_EMAIL || 'leonardo.bolanos@gmail.com',
	password: process.env.E2E_LOCAL_PASSWORD || '123456',
};

async function skipReason(request: APIRequestContext): Promise<string | null> {
	const sw = await request.get('/sw.js');
	if (!sw.ok() || !(await sw.text()).includes('workbox')) {
		return 'needs a production build served by vite preview: this server has no service worker';
	}
	return null;
}

async function login(page: Page): Promise<string | null> {
	await page.addInitScript((rid) => {
		localStorage.setItem('preferred-locale', 'es');
		localStorage.setItem('selectedRetreatId', rid);
	}, RETREAT_ID);
	await page.goto('/login');
	await page.locator('input[type="email"]').fill(USER.email);
	await page.locator('input[type="password"]').fill(USER.password);
	const loginResponse = page.waitForResponse(
		(r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
		{ timeout: 30000 },
	);
	await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
	const response = await loginResponse;
	if (!response.ok()) return `login rejected with ${response.status()} for ${USER.email}`;
	await page.waitForURL(/\/app/, { timeout: 30000 });
	await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
		timeout: 60000,
	});
	return null;
}

/** Everything saved in the offline store, as the browser has it. */
async function savedResponses(page: Page): Promise<Array<{ key: string; value: any }>> {
	return page.evaluate(
		() =>
			new Promise<Array<{ key: string; value: any }>>((resolve, reject) => {
				const open = indexedDB.open('emaus-offline');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const store = open.result.transaction('responses', 'readonly').objectStore('responses');
					const keys = store.getAllKeys();
					const values = store.getAll();
					values.onsuccess = () =>
						resolve(keys.result.map((k, i) => ({ key: String(k), value: values.result[i] })));
					values.onerror = () => reject(values.error);
				};
			}),
	);
}

/** Every object that looks like a person (firstName + lastName), at any depth. */
function participantShapedObjects(value: unknown, found: Array<Record<string, any>> = []) {
	if (Array.isArray(value)) value.forEach((v) => participantShapedObjects(v, found));
	else if (value && typeof value === 'object') {
		const obj = value as Record<string, any>;
		if ('firstName' in obj && 'lastName' in obj) found.push(obj);
		Object.values(obj).forEach((v) => participantShapedObjects(v, found));
	}
	return found;
}

/**
 * Opens a view and waits until its answer is saved on the device. Waiting for a
 * fresh response instead is racy: the sidebar may have fetched the same list
 * already, and the view then reuses it.
 */
async function visit(page: Page, path: string, savedKeyFragment: string) {
	await page.goto(path, { waitUntil: 'networkidle' });
	await expect
		.poll(async () => (await savedResponses(page)).some((s) => s.key.includes(savedKeyFragment)), {
			timeout: 30000,
			message: `answer for ${savedKeyFragment} saved on the device`,
		})
		.toBe(true);
}

test('the retreat views keep working without signal from what the phone saved', async ({
	page,
	context,
	request,
}) => {
	test.setTimeout(180_000);
	const skip = await skipReason(request);
	test.skip(skip !== null, skip ?? '');
	const loginSkip = await login(page);
	test.skip(loginSkip !== null, loginSkip ?? '');
	// The saved data of a retreat whose window closed is deleted on start (D9):
	// pin the browser clock inside the retreat instead of touching its dates.
	const retreat = await (await context.request.get(`/api/retreats/${RETREAT_ID}`)).json();
	await context.clock.setFixedTime(new Date(Date.parse(retreat.startDate) + 18 * 60 * 60 * 1000));

	// Online: open the views once, as the team would on Thursday.
	await visit(page, '/app/walkers', `/participants?`);
	await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 30000 });
	const firstWalkerRow = (await page.locator('table tbody tr').first().innerText()).trim();
	await visit(page, `/app/retreats/${RETREAT_ID}/reception`, `/participants/reception/${RETREAT_ID}`);
	await visit(page, `/app/retreats/${RETREAT_ID}/bed-assignments`, `/retreats/${RETREAT_ID}/beds`);
	await visit(page, `/app/retreats/${RETREAT_ID}/minuto-a-minuto`, `/schedule/retreats/${RETREAT_ID}/items`);

	// What landed on the device: the retreat's answers, and no health data at all.
	const saved = await savedResponses(page);
	const keys = saved.map((s) => s.key);
	expect(keys.some((k) => k.includes('/participants?') && k.includes(RETREAT_ID))).toBe(true);
	expect(keys.some((k) => k.includes(`/participants/reception/${RETREAT_ID}`))).toBe(true);
	expect(keys.some((k) => k.includes(`/retreats/${RETREAT_ID}/beds`))).toBe(true);
	expect(keys.some((k) => k.includes(`/schedule/retreats/${RETREAT_ID}/items`))).toBe(true);
	const reception = saved.find((s) => s.key.includes('/participants/reception/'))!.value.data;
	const receptionEntry = reception.pendingList[0] ?? reception.arrivedList[0];
	const receptionName = `${receptionEntry.firstName}`;
	const schedule = saved.find((s) => s.key.includes('/items'))!.value.data;
	const scheduleItemName: string = schedule[0].name;

	// Payments, the house and schedule items keep their own `notes`; what must
	// never be saved is a health field on a person.
	const people = participantShapedObjects(saved);
	expect(people.length).toBeGreaterThan(10);
	const leaks = people.flatMap((p) =>
		SENSITIVE_HEALTH_FIELDS.filter((field) => field in p).map((field) => `${p.firstName}: ${field}`),
	);
	expect(leaks, 'health fields saved on the device').toEqual([]);

	// No signal from here on.
	await context.setOffline(true);
	try {
		// A new tab, cold start, no signal: no login screen.
		const offlinePage = await context.newPage();
		await offlinePage.goto('/app/walkers');
		await expect(offlinePage).not.toHaveURL(/\/login/);
		await expect(offlinePage.getByTestId('connectivity-chip')).toHaveAttribute(
			'data-state',
			'offline',
			{ timeout: 20000 },
		);
		await expect(offlinePage.locator('table tbody tr').first()).toBeVisible({ timeout: 30000 });
		expect((await offlinePage.locator('table tbody tr').first().innerText()).trim()).toBe(
			firstWalkerRow,
		);
		await expect(offlinePage.getByTestId('offline-banner')).toContainText('guardados');

		// Reception and the schedule from the device: names only the saved answers carry.
		await offlinePage.goto(`/app/retreats/${RETREAT_ID}/reception`);
		await expect(offlinePage.getByTestId('offline-banner')).toBeVisible();
		await expect(offlinePage.locator('main')).toContainText(receptionName, { timeout: 30000 });

		await offlinePage.goto(`/app/retreats/${RETREAT_ID}/minuto-a-minuto`);
		await expect(offlinePage.locator('main')).toContainText(scheduleItemName, { timeout: 30000 });

		// Food: health is never on the device, so the report says so.
		await offlinePage.goto('/app/food');
		await expect(offlinePage.getByTestId('health-needs-connection')).toBeVisible({
			timeout: 30000,
		});
	} finally {
		await context.setOffline(false);
	}
});
