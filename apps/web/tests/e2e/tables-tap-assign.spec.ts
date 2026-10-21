import { test, expect, type Browser, type Page } from '@playwright/test';
import { loginAs, withCsrf, E2E_USERS, type AuthSession } from './helpers/auth';

/**
 * E2e guard of the mobile tables UX delivered in ciclos 1-2 (specs
 * tables-mobile-ux D3/D4 and tables-second-cycle D1, kept honest by
 * tables-regression-guards D1). Everything asserted here was verified by hand
 * twice with Playwright MCP; this spec makes those manual sessions repeatable:
 *
 *  - the sticky panel stays slim (<= 130 px at 390 wide) and pinned while the
 *    unassigned pills scroll away with the content;
 *  - tap-to-assign works end to end on a touch context: pill -> banner inside
 *    the sticky -> free slot -> assigned -> "Quitar de mesa" -> unassigned.
 *
 * Runs against the dev database: retreat from E2E_RETREAT_ID (default: Buen
 * Despacho demo, 10 tables). The participant is taken dynamically from the
 * first server pill (no hardcoded names); the assignment is undone in the
 * test's finally via the API, so the run leaves the database as it was.
 */

test.use({ locale: 'es-MX' });

const RETREAT_ID = process.env.E2E_RETREAT_ID || 'e9b3c568-050a-4d66-a99d-305f287a59df';

/** iPhone-ish descriptor inline: 390x844 with real touch events. */
const TOUCH_CONTEXT_OPTIONS = {
	viewport: { width: 390, height: 844 },
	deviceScaleFactor: 3,
	isMobile: true,
	hasTouch: true,
	userAgent:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 ' +
		'(KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
};

/**
 * Logs in with whatever credentials this database has (seeded e2e users
 * first, then E2E_LOCAL_*). Returns the creds too — the UI login needs them.
 * A 429 THROWS instead of skipping: the rate limit burns out when the suite
 * runs a few times in a row, and a green skip would hide that.
 */
async function login(
	baseURL: string,
): Promise<{ session: AuthSession; creds: { email: string; password: string } } | null> {
	const local =
		process.env.E2E_LOCAL_EMAIL && process.env.E2E_LOCAL_PASSWORD
			? { email: process.env.E2E_LOCAL_EMAIL, password: process.env.E2E_LOCAL_PASSWORD }
			: null;
	let rateLimited = false;
	for (const creds of [E2E_USERS.superadmin, local]) {
		if (!creds) continue;
		try {
			const session = await loginAs(baseURL, creds);
			return { session, creds };
		} catch (err) {
			if (String(err).includes(': 429')) rateLimited = true;
		}
	}
	if (rateLimited) {
		throw new Error(
			'login rate-limited (429): /auth/login allows 10 attempts per 15 minutes and the ' +
				'window is exhausted. Wait for it to expire and re-run — this is the test ' +
				'environment, not the code under test.',
		);
	}
	return null;
}

let auth: Awaited<ReturnType<typeof login>> = null;
let page: Page;

/** Count shown by the "Servidores Sin Asignar (N)" tab, or null if unreadable. */
async function serverTabCount(): Promise<number | null> {
	const label = await page.getByRole('button', { name: /Servidores Sin Asignar/ }).textContent();
	const match = label?.match(/\((\d+)\)/);
	return match ? Number(match[1]) : null;
}

/** Throws (does not skip) when the retreat has no unassigned servers (R4). */
async function requireUnassignedServer(): Promise<void> {
	const count = await serverTabCount();
	if (count === null || count === 0) {
		throw new Error(
			`precondition not met: retreat ${RETREAT_ID} shows ${count ?? 'no readable count of'} ` +
				'unassigned servers. The tap-assign flow needs at least one; pick another ' +
				'retreat via E2E_RETREAT_ID or unassign a server in the dev data.',
		);
	}
}

test.describe.serial('Mesas móvil: sticky, pastillas y tap-to-assign', () => {
	test.beforeAll(async ({ browser, baseURL }) => {
		auth = await login(baseURL!);
		test.skip(!auth, 'no usable credentials (set E2E_LOCAL_EMAIL/E2E_LOCAL_PASSWORD)');

		// Data precondition: the retreat must expose its tables over the API.
		const tablesRes = await auth!.session.ctx.get(`/api/tables/retreat/${RETREAT_ID}`);
		test.skip(
			!tablesRes.ok(),
			`retreat ${RETREAT_ID} did not return tables (HTTP ${tablesRes.status()}) — ` +
				'set E2E_RETREAT_ID to a retreat with tables',
		);

		const context = await (browser as Browser).newContext({
			...TOUCH_CONTEXT_OPTIONS,
			locale: 'es-MX',
		});
		page = await context.newPage();
		await page.addInitScript((rid) => {
			localStorage.setItem('preferred-locale', 'es');
			localStorage.setItem('selectedRetreatId', rid);
		}, RETREAT_ID);

		await page.goto('/login');
		await page.locator('input[type="email"]').fill(auth!.creds.email);
		await page.locator('input[type="password"]').fill(auth!.creds.password);
		await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
		await page.waitForURL(/\/app/, { timeout: 20000 });

		await page.goto('/app/tables');
		// Screen fully loaded before any negative assertion on the banner.
		await expect(page.locator('.table-card').first()).toBeVisible({ timeout: 20000 });
	});

	test.afterAll(async () => {
		await page?.context().close();
		await auth?.session.dispose();
	});

	test('R1: sticky base <= 130 px, pinned, y las pastillas se van con el scroll', async () => {
		// Base state: fresh page, no participant selected, so no banner.
		await expect(page.getByTestId('tap-assign-banner')).toHaveCount(0);

		const sticky = page.locator('div.sticky.top-0');
		await expect(sticky).toHaveCount(1);

		const baseHeight = await sticky.evaluate((el) => el.offsetHeight);
		expect(
			baseHeight,
			`sticky base height at 390px is ${baseHeight}px (spec tables-regression-guards R1: <= 130)`,
		).toBeLessThanOrEqual(130);

		// The server tab owns the pills used by the tap-assign flow.
		await page.getByRole('button', { name: /Servidores Sin Asignar/ }).click();
		await requireUnassignedServer();

		// Mobile pills container (the desktop one is max-h-32 and hidden here).
		const pills = page.locator('div.max-h-24').first();
		await expect(pills.locator('span.rounded-full').first()).toBeVisible();

		const stickyTopBefore = await sticky.evaluate((el) => el.getBoundingClientRect().top);
		const pillsBottomBefore = await pills.evaluate((el) => el.getBoundingClientRect().bottom);
		expect(pillsBottomBefore).toBeGreaterThan(0);

		// The scroller of this view is <main>, not the window.
		await page.locator('main').evaluate((el) => {
			el.scrollTop = 600;
		});
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));

		const stickyTopAfter = await sticky.evaluate((el) => el.getBoundingClientRect().top);
		const pillsBottomAfter = await pills.evaluate((el) => el.getBoundingClientRect().bottom);

		// Pinned: same top (inside the viewport, below the fixed topbar).
		expect(Math.abs(stickyTopAfter - stickyTopBefore)).toBeLessThanOrEqual(1);
		expect(stickyTopAfter).toBeGreaterThan(0);
		// Pills left the viewport: their bottom is above the sticky's top.
		expect(pillsBottomAfter).toBeLessThan(stickyTopAfter);
	});

	test('R2: tap en pastilla → banner → slot libre → asignado → Quitar → sin asignar', async () => {
		let assignedParticipantId: string | null = null;
		const banner = page.getByTestId('tap-assign-banner');
		const serverTab = page.getByRole('button', { name: /Servidores Sin Asignar/ });

		try {
			await page.locator('main').evaluate((el) => {
				el.scrollTop = 0;
			});
			await serverTab.click();
			await requireUnassignedServer();
			const countBefore = (await serverTabCount())!;

			// First server pill, taken dynamically (R4: no hardcoded names).
			const pills = page.locator('div.max-h-24').first();
			const pill = pills.locator('span.rounded-full').first();
			await expect(pill).toBeVisible();
			const firstName = ((await pill.textContent()) ?? '').trim().split(' ')[0];
			expect(firstName.length, 'pill text is readable').toBeGreaterThan(0);

			await pill.tap();
			await expect(banner).toBeVisible();
			await expect(banner).toContainText(firstName);

			// The banner lives inside the sticky panel, not floating elsewhere.
			const stickyBox = await page.locator('div.sticky.top-0').boundingBox();
			const bannerBox = await banner.boundingBox();
			expect(bannerBox && stickyBox && bannerBox.y < stickyBox.y + stickyBox.height).toBeTruthy();

			// Free server slots ring blue while a server is selected. The zone
			// is pinned with elementHandle: after the assignment the ring moves
			// to the next free slot, and a live locator would follow it.
			const freeSlot = page.locator('div.border-dashed.ring-blue-500').first();
			await expect(freeSlot).toBeVisible();
			const zone = (await freeSlot.elementHandle())!;
			await zone.tap();

			// Assigned: this zone now holds the participant, the banner is gone
			// and the tab count dropped by one.
			const assignedPill = await zone.waitForSelector('[data-participant-id]', {
				state: 'visible',
			});
			assignedParticipantId = await assignedPill.getAttribute('data-participant-id');
			await expect(banner).toBeHidden();
			await expect
				.poll(async () => serverTabCount(), {
					message: 'unassigned server count after the assignment',
				})
				.toBe(countBefore - 1);

			// Tap the assigned pill: the banner comes back offering removal.
			await assignedPill.tap();
			await expect(banner).toBeVisible();
			const removeButton = banner.getByRole('button', { name: 'Quitar de mesa' });
			await expect(removeButton).toBeVisible();
			await removeButton.click();

			// Back to unassigned: the zone is empty again, banner gone, count
			// restored.
			await zone.waitForSelector('[data-participant-id]', { state: 'detached' });
			await zone.waitForSelector('text=Sin asignar');
			await expect(banner).toBeHidden();
			await expect
				.poll(async () => serverTabCount(), {
					message: 'unassigned server count after Quitar de mesa',
				})
				.toBe(countBefore);
		} finally {
			// Restore the original state even if the flow failed midway: if the
			// participant we assigned is still seated at any table, remove them
			// through the API (the UI path is what failed, not the data).
			if (assignedParticipantId && auth) {
				const { ctx, csrfToken } = auth.session;
				const res = await ctx.get(`/api/tables/retreat/${RETREAT_ID}`);
				const tables = await res.json();
				for (const table of Array.isArray(tables) ? tables : (tables?.data ?? [])) {
					const role = (['lider', 'colider1', 'colider2'] as const).find(
						(r) => table[r]?.id === assignedParticipantId,
					);
					if (role) {
						await ctx.delete(`/api/tables/${table.id}/leader/${role}`, {
							headers: withCsrf(csrfToken),
						});
					}
				}
			}
		}
	});
});
