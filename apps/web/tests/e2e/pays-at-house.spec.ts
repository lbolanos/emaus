import { test, expect, type Page } from '@playwright/test';

/**
 * pays-at-house E2E (specs/pays-at-house): the "Paga en la casa" state
 * visually replaces Pendiente for the walker who said they will pay on Friday
 * arrival at the retreat house.
 *
 * Covers what mocked unit tests cannot: that the three surfaces (Balances,
 * Palancas, Reception) render the badge/toggle from the real list GET, and
 * that the toggle fires the correct PUT against the real API with CSRF and
 * the active retreat's contextRetreatId.
 *
 * Rules from `.claude/rules/e2e-tests.md` this file follows:
 *  - NOTHING is persisted: PUTs to /api/participants/** are aborted and
 *    recorded so the payload can be asserted (blockParticipantWrites pattern
 *    from the participant-health spec). Display-only "marked" states are
 *    injected with a page.route overlay on the GET — only what this browser
 *    sees changes.
 *  - Skips are decided by reading the API response (real absence of data),
 *    not by row-wait timeouts.
 *  - Login through the UI to exercise the router guard for real; the reject
 *    reason comes from the API response (429 = login limiter).
 *
 * Default user: the local dev superadmin (participant:update). With
 * E2E_PAYS_AT_HOUSE_EMAIL/PASSWORD the spec can target another profile
 * (e.g. a communications one) without touching the spec.
 */

test.use({ locale: 'es-MX' });

const RETREAT_ID = process.env.E2E_RETREAT_ID || 'e9b3c568-050a-4d66-a99d-305f287a59df';

const USER = {
	email: process.env.E2E_PAYS_AT_HOUSE_EMAIL || 'leonardo.bolanos@gmail.com',
	password: process.env.E2E_PAYS_AT_HOUSE_PASSWORD || '123456',
};

interface RecordedWrite {
	method: string;
	url: string;
	body: unknown;
}

/**
 * Login through the UI (not the API) so the real router guard and the
 * localStorage retreat context take part. `selectedRetreatId` is injected
 * before the app loads (same pattern as
 * participant-health-permission-guard).
 */
async function loginViaUi(
	page: Page,
	creds: { email: string; password: string },
	retreatId: string,
): Promise<string | null> {
	await page.addInitScript((rid) => {
		localStorage.setItem('preferred-locale', 'es');
		localStorage.setItem('selectedRetreatId', rid);
	}, retreatId);
	await page.goto('/login');
	await page.locator('input[type="email"]').fill(creds.email);
	await page.locator('input[type="password"]').fill(creds.password);
	// Decide from the API's answer, not from a navigation timeout: a slow dev
	// stack used to time out here and skip the test as "fixture missing" with
	// a valid user.
	const loginResponse = page.waitForResponse(
		(r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
		{ timeout: 30000 },
	);
	await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
	const response = await loginResponse;
	if (!response.ok()) {
		const body = await response.json().catch(() => ({}));
		return loginSkipReason(creds.email, response.status(), body?.message);
	}
	await page.waitForURL(/\/app/, { timeout: 30000 });
	return null;
}

function loginSkipReason(email: string, status: number, apiMessage?: string): string {
	if (status === 429) {
		return (
			`Login for ${email} blocked by the login limiter (429): wait 15 min or start the API ` +
			'with NODE_ENV=development SKIP_RATE_LIMIT=true.'
		);
	}
	return (
		`Login for ${email} rejected (${status}${apiMessage ? `: ${apiMessage}` : ''}) — if the ` +
		'credential is invalid, the user does not exist or the password does not match in this DB.'
	);
}

/**
 * Aborts and records writes to /api/participants/** (PUT/PATCH/POST). GETs
 * go through. Nothing the browser does reaches the database.
 */
async function captureParticipantWrites(page: Page): Promise<RecordedWrite[]> {
	const writes: RecordedWrite[] = [];
	await page.route('**/api/participants/**', async (route) => {
		const method = route.request().method();
		if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
			let body: unknown = null;
			try {
				body = route.request().postDataJSON();
			} catch {
				body = null;
			}
			writes.push({ method, url: route.request().url(), body });
			return route.abort();
		}
		return route.continue();
	});
	return writes;
}

/** Waiting hook for the retreat's participants list (GET /api/participants?...). */
function participantsListResponse(page: Page) {
	return page.waitForResponse(
		(r) => /\/api\/participants\?/.test(r.url()) && r.request().method() === 'GET',
		{ timeout: 30000 },
	);
}

/** A row the UI would show the pays-at-house badge for (marked or not). */
function owesMoney(p: Record<string, unknown>): boolean {
	const balance = Number((p as any).chargeBreakdown?.balance ?? 0);
	return balance > 0 && !(p as any).isScholarship && !(p as any).isCancelled;
}

/**
 * A row the un-marked toggle applies to (owes AND not marked yet). Only valid
 * against a response WITHOUT the overlay — the overlay sets paysAtHouse on
 * every owing row, so post-overlay lists have none of these left.
 */
function isOwingCandidate(p: Record<string, unknown>): boolean {
	return owesMoney(p) && !(p as any).paysAtHouse;
}

/**
 * Overlay: marks every owing row of the participants list as paysAtHouse for
 * THIS browser only (the API response is rewritten in flight; no DB write).
 */
async function overlayPaysAtHouseOnOwing(page: Page) {
	await page.route(/\/api\/participants\?/, async (route) => {
		const response = await route.fetch();
		const body = await response.json().catch(() => null);
		if (Array.isArray(body)) {
			for (const p of body) {
				if (isOwingCandidate(p)) (p as any).paysAtHouse = true;
			}
		}
		await route.fulfill({ response, json: body ?? [] });
	});
}

test.describe('Balances (Pagos view)', () => {
	test('marked with a balance: "Paga en la casa" badge, no WhatsApp reminder button (D5), toggle to remove', async (
		{ page },
		testInfo,
	) => {
		await overlayPaysAtHouseOnOwing(page);
		const writes = await captureParticipantWrites(page);
		const loginError = await loginViaUi(page, USER, RETREAT_ID);
		if (loginError) testInfo.skip(true, loginError);

		const listResponse = participantsListResponse(page);
		await page.goto('/app/payments');
		const participants = await (await listResponse).json().catch(() => null);
		// NOTE: this response is the OVERLAID one — every owing row already
		// carries paysAtHouse=true, so the skip predicate must not require
		// "not marked" here.
		if (!Array.isArray(participants) || !participants.some((p: any) => owesMoney(p))) {
			testInfo.skip(
				true,
				`Retreat ${RETREAT_ID} has no owing participants to mark in this DB.`,
			);
			return;
		}

		// Positive wait first: the badge must be there for the marked rows.
		const badge = page.locator('.bg-sky-100').getByText('Paga en la casa', { exact: true });
		await expect(badge.first()).toBeVisible({ timeout: 20000 });

		// D5: a marked participant gets no payment reminder button, even with a
		// phone on file (overlay marked EVERY owing row).
		await expect(page.locator('button[title="Recordatorio"]')).toHaveCount(0);

		// The toggle now offers to remove the mark.
		await expect(page.locator('button[title="Quitar «paga en la casa»"]').first()).toBeVisible();

		// Display only: nothing was written.
		expect(writes).toEqual([]);
	});

	test('marking from Balances sends PUT paysAtHouse=true with the active contextRetreatId', async (
		{ page },
		testInfo,
	) => {
		const writes = await captureParticipantWrites(page);
		const loginError = await loginViaUi(page, USER, RETREAT_ID);
		if (loginError) testInfo.skip(true, loginError);

		const listResponse = participantsListResponse(page);
		await page.goto('/app/payments');
		const participants = await (await listResponse).json().catch(() => null);
		if (!Array.isArray(participants) || !participants.some((p: any) => isOwingCandidate(p))) {
			testInfo.skip(
				true,
				`Retreat ${RETREAT_ID} has no owing participants to mark in this DB.`,
			);
			return;
		}

		const toggle = page.locator('button[title="Marcar que paga en la casa"]').first();
		await expect(toggle).toBeVisible({ timeout: 20000 });

		// The toggle is confirm-gated; accept before clicking.
		page.once('dialog', (dialog) => dialog.accept());
		await toggle.click();

		await expect
			.poll(() => writes.length, { timeout: 15000, message: 'toggle PUT captured' })
			.toBe(1);
		expect(writes[0].method).toBe('PUT');
		expect(writes[0].url).toMatch(/\/api\/participants\/[^/?]+/);
		expect(writes[0].body).toEqual({ paysAtHouse: true, contextRetreatId: RETREAT_ID });
	});
});

test.describe('Palancas (palanquero quick action)', () => {
	test('the inline per-row toggle sends the same PUT for the active retreat', async ({ page }, testInfo) => {
		const writes = await captureParticipantWrites(page);
		const loginError = await loginViaUi(page, USER, RETREAT_ID);
		if (loginError) testInfo.skip(true, loginError);

		const listResponse = participantsListResponse(page);
		await page.goto('/app/palancas');
		const participants = await (await listResponse).json().catch(() => null);
		const owingWalker = Array.isArray(participants)
			? participants.some((p: any) => p.type === 'walker' && isOwingCandidate(p))
			: false;
		if (!owingWalker) {
			testInfo.skip(
				true,
				`Retreat ${RETREAT_ID} has no owing walkers to mark in this DB.`,
			);
			return;
		}

		const toggle = page.locator('button[title="Marcar que paga en la casa"]').first();
		await expect(toggle).toBeVisible({ timeout: 20000 });

		page.once('dialog', (dialog) => dialog.accept());
		await toggle.click();

		await expect
			.poll(() => writes.length, { timeout: 15000, message: 'toggle PUT captured' })
			.toBe(1);
		expect(writes[0].method).toBe('PUT');
		expect(writes[0].url).toMatch(/\/api\/participants\/[^/?]+/);
		expect(writes[0].body).toEqual({ paysAtHouse: true, contextRetreatId: RETREAT_ID });
	});
});

test.describe('Reception (informative badge, D7)', () => {
	/**
	 * Navigates to the reception view with a reception overlay applied. The
	 * picker decides which pendingList entries get paysAtHouse=true in THIS
	 * browser only; it returns the marked full names so tests can target rows.
	 */
	async function gotoReceptionWithOverlay(
		page: Page,
		pick: (p: Record<string, unknown>) => boolean,
	): Promise<string[] | null> {
		let markedNames: string[] | null = null;
		await page.route(/\/api\/participants\/reception\//, async (route) => {
			const response = await route.fetch();
			const body = await response.json().catch(() => null);
			if (body && Array.isArray(body.pendingList)) {
				markedNames = [];
				for (const p of body.pendingList) {
					if (pick(p)) {
						(p as any).paysAtHouse = true;
						markedNames.push(`${(p as any).firstName} ${(p as any).lastName}`);
					}
				}
			}
			await route.fulfill({ response, json: body ?? {} });
		});

		const loginError = await loginViaUi(page, USER, RETREAT_ID);
		if (loginError) return null;

		const statsResponse = page.waitForResponse(
			(r) => /\/api\/participants\/reception\//.test(r.url()) && r.request().method() === 'GET',
			{ timeout: 30000 },
		);
		await page.goto(`/app/retreats/${RETREAT_ID}/reception`);
		await statsResponse;
		await page.waitForLoadState('networkidle');
		return markedNames;
	}

	test('the "Paga en la casa" badge coexists with the Cobrar button', async ({ page }, testInfo) => {
		const names = await gotoReceptionWithOverlay(
			page,
			(p) => !(p as any).isScholarship && Number((p as any).totalPaid ?? 0) === 0,
		);
		if (names === null) {
			testInfo.skip(true, `Login rejected or reception unreachable for ${USER.email}.`);
			return;
		}
		if (names.length === 0) {
			testInfo.skip(
				true,
				`Retreat ${RETREAT_ID} has no unpaid pending participants in this DB.`,
			);
			return;
		}

		const li = page.locator('li').filter({ hasText: names[0] }).first();
		await expect(li).toBeVisible({ timeout: 20000 });
		await expect(li.getByText('Paga en la casa', { exact: true })).toBeVisible();
		// D7: the badge informs, it does not replace charging at the door.
		await expect(li.locator('button[title="Cobrar"]')).toBeVisible();
	});

	test('with a registered payment the badge disappears (same threshold as Cobrar)', async (
		{ page },
		testInfo,
	) => {
		const names = await gotoReceptionWithOverlay(
			page,
			(p) => Number((p as any).totalPaid ?? 0) > 0,
		);
		if (names === null) {
			testInfo.skip(true, `Login rejected or reception unreachable for ${USER.email}.`);
			return;
		}
		if (names.length === 0) {
			testInfo.skip(
				true,
				`Retreat ${RETREAT_ID} has no pending participants with a partial payment in this DB.`,
			);
			return;
		}

		const li = page.locator('li').filter({ hasText: names[0] }).first();
		await expect(li).toBeVisible({ timeout: 20000 });
		// Partial payment on record: the mark persists in data, but the badge
		// hides (the operator already started collecting at the door).
		await expect(li.getByText('Paga en la casa', { exact: true })).toHaveCount(0);
		await expect(li.locator('button[title="Cobrar"]')).toHaveCount(0);
	});
});
