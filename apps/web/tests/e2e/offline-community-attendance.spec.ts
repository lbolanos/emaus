import { test, expect, type Page, type APIRequestContext, type BrowserContext } from '@playwright/test';

/**
 * CA-3 of specs/community-attendance-faces (D9, FR-8..FR-10): without signal,
 * tapping 3 members in the community attendance view leaves each card marked and
 * "Pendiente" with nothing sent to the server; when the signal returns the offline
 * outbox drains by itself, the badges go away and the server holds exactly one
 * attendance row with attended=true per member.
 *
 * THIS SPEC WRITES TO THE DATABASE (it marks 3 members) and undoes it at the end,
 * so it only runs with a disposable copy and E2E_OFFLINE_WRITES=1 (same guard as
 * offline-outbox.spec.ts):
 *
 *   E2E_OFFLINE_WRITES=1 E2E_LOCAL_PASSWORD=<local password> E2E_BASE_URL=http://localhost:5175 \
 *     npx playwright test tests/e2e/offline-community-attendance.spec.ts --project=chromium
 *
 * The community and the meeting are discovered through the API (the first one the
 * user sees with a meeting and at least 3 members not marked yet), no fixed ids.
 */

test.use({ locale: 'es-MX' });

const USER = {
	email: process.env.E2E_LOCAL_EMAIL || 'leonardo.bolanos@gmail.com',
	password: process.env.E2E_LOCAL_PASSWORD,
};
const TAPS = 3;

interface Target {
	communityId: string;
	meetingId: string;
}

async function login(page: Page): Promise<string | null> {
	await page.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
	await page.goto('/login');
	await page.locator('input[type="email"]').fill(USER.email);
	await page.locator('input[type="password"]').fill(USER.password ?? '');
	const loginResponse = page.waitForResponse(
		(r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
		{ timeout: 30000 },
	);
	await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
	const response = await loginResponse;
	if (!response.ok()) return `login rejected with ${response.status()} for ${USER.email}`;
	await page.waitForURL(/\/app/, { timeout: 30000 });
	return null;
}

/** API calls with the browser's session (the context shares its cookies). */
function serverApi(context: BrowserContext) {
	const req: APIRequestContext = context.request;
	const csrf = async () => (await (await req.get('/api/csrf-token')).json()).csrfToken as string;
	return {
		get: async (path: string) => {
			const response = await req.get(`/api${path}`);
			if (!response.ok()) throw new Error(`GET ${path} → ${response.status()}`);
			return response.json();
		},
		post: async (path: string, data: unknown) => {
			const response = await req.post(`/api${path}`, { data, headers: { 'x-csrf-token': await csrf() } });
			if (!response.ok()) throw new Error(`POST ${path} → ${response.status()}`);
		},
	};
}

test('three taps without signal stay pending, then reach the server once each', async ({ page, context }) => {
	test.setTimeout(180_000);
	test.skip(
		process.env.E2E_OFFLINE_WRITES !== '1',
		'writes to the database: run only against a disposable copy with E2E_OFFLINE_WRITES=1',
	);
	test.skip(!USER.password, 'set E2E_LOCAL_PASSWORD (the password is never written in the repo)');
	const loginSkip = await login(page);
	test.skip(loginSkip !== null, loginSkip ?? '');

	const api = serverApi(context);

	// Discover a community + meeting with at least TAPS members not marked present.
	let target: Target | null = null;
	const communities = (await api.get('/communities')) as Array<{ id: string }>;
	for (const community of communities) {
		const meetings = (await api.get(`/communities/${community.id}/meetings`)) as Array<{ id: string }>;
		if (!meetings.length) continue;
		const members = (await api.get(`/communities/${community.id}/members`)) as Array<{ id: string }>;
		const meetingId = meetings[0].id;
		const rows = (await api.get(`/communities/${community.id}/meetings/${meetingId}/attendance`)) as Array<{
			memberId: string;
			attended: boolean;
		}>;
		const marked = new Set(rows.filter((r) => r.attended).map((r) => r.memberId));
		if (members.filter((m) => !marked.has(m.id)).length >= TAPS) {
			target = { communityId: community.id, meetingId };
			break;
		}
	}
	test.skip(!target, `no community the user can see has a meeting with ${TAPS}+ unmarked members`);
	const { communityId, meetingId } = target!;
	const singlePath = `/communities/${communityId}/meetings/${meetingId}/attendance/single`;
	const isSingle = (url: string) => url.includes(`/meetings/${meetingId}/attendance/single`);

	// Every attendance write that leaves the browser, with the answer it got.
	const sent: Array<{ memberId: string; key: string | undefined; status: number | null }> = [];
	page.on('requestfinished', async (request) => {
		if (!isSingle(request.url()) || request.method() !== 'POST') return;
		const response = await request.response();
		sent.push({
			memberId: JSON.parse(request.postData() || '{}').memberId,
			key: request.headers()['idempotency-key'],
			status: response ? response.status() : null,
		});
	});

	const cards = page.locator('.member-card');
	const unmarkedCards = page.locator('.member-card:not(.bg-green-50)');
	const pendingBadges = page.getByTestId('pending-badge');
	let tappedIds: string[] = [];

	try {
		await test.step('online: open the attendance view so the list is loaded', async () => {
			await page.goto(`/app/communities/${communityId}/attendance/${meetingId}`, { waitUntil: 'networkidle' });
			await expect(cards.first()).toBeVisible({ timeout: 30000 });
			await expect(unmarkedCards.nth(TAPS - 1)).toBeVisible();
			await expect(pendingBadges).toHaveCount(0);
		});

		const names: string[] = [];
		await test.step('no signal: tap 3 different unmarked members', async () => {
			for (let i = 0; i < TAPS; i++) {
				const name = (await unmarkedCards.nth(i).locator('.font-medium').first().innerText()).trim();
				names.push(name);
			}
			await context.setOffline(true);
			// The detector flips on the browser's own `offline` event (see offline/connectivity.ts).
			await page.waitForFunction(() => navigator.onLine === false);

			for (const name of names) {
				const card = cards.filter({ hasText: name }).first();
				await card.click();
				await expect(card).toHaveClass(/bg-green-50/, { timeout: 15000 });
				await expect(card.getByTestId('pending-badge')).toBeVisible({ timeout: 15000 });
			}
			await expect(pendingBadges).toHaveCount(TAPS);
			// Nothing was answered by the server while offline.
			expect(sent).toEqual([]);
		});

		await test.step('signal back: the queue drains by itself and the badges go away', async () => {
			await context.setOffline(false);
			await expect(pendingBadges).toHaveCount(0, { timeout: 90000 });
			// Marked cards stay marked after the sync.
			for (const name of names) {
				await expect(cards.filter({ hasText: name }).first()).toHaveClass(/bg-green-50/);
			}
			tappedIds = sent.map((s) => s.memberId);
		});

		await test.step('the server has one present row per tapped member', async () => {
			// One accepted request per member, each with its idempotency key.
			expect(tappedIds).toHaveLength(TAPS);
			expect(new Set(tappedIds).size).toBe(TAPS);
			for (const s of sent) {
				expect(s.status).toBe(201);
				expect(s.key).toBeTruthy();
			}
			const rows = (await api.get(`/communities/${communityId}/meetings/${meetingId}/attendance`)) as Array<{
				memberId: string;
				attended: boolean;
			}>;
			for (const memberId of tappedIds) {
				const own = rows.filter((r) => r.memberId === memberId);
				expect(own).toHaveLength(1);
				expect(own[0].attended).toBe(true);
			}
		});
	} finally {
		// Leave the disposable copy as found: unmark the members this run marked.
		await context.setOffline(false);
		for (const memberId of tappedIds.length ? tappedIds : sent.map((s) => s.memberId)) {
			await api.post(singlePath, { memberId, attended: false });
		}
	}
});
