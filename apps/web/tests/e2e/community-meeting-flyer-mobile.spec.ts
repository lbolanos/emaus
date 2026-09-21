import {
	test,
	expect,
	devices,
	type BrowserContext,
	type Page,
} from '@playwright/test';
import { loginAs, type AuthSession } from './helpers/auth';

/**
 * E2E of the meeting flyer on a phone (2026-09-21): the custom design is a
 * fixed 850px canvas, so on a phone it must scale down (ResizeObserver) with
 * the container reserving the scaled height — no horizontal scroll on any of
 * the four styles — and the editor must be usable there too: preview above the
 * panel, block arrows (drag is pointer-only), save, persistence.
 *
 * The device is declared inline (like server-registration-mobile.spec.ts) so
 * the spec runs as a phone under any project. Firefox can't emulate a mobile
 * viewport, so it skips.
 *
 * Same community discipline as the editor spec: this WRITES
 * community.flyerOptions, so the beforeAll clears leftovers for a deterministic
 * start and the afterAll ALWAYS restores (DELETE both), even if a test fails.
 * The style buttons keep an accessible name below `sm` (sr-only labels) — this
 * spec selects them by role name on a 390px viewport, which is also the guard
 * for that.
 */
const iPhone = devices['iPhone 12'];

test.use({
	viewport: iPhone.viewport,
	userAgent: iPhone.userAgent,
	deviceScaleFactor: iPhone.deviceScaleFactor,
	isMobile: iPhone.isMobile,
	hasTouch: iPhone.hasTouch,
	// The assertions read the Spanish UI: Playwright defaults to en-US and the
	// app follows navigator.language when nothing is stored.
	locale: 'es-MX',
});

test.skip(
	({ browserName }) => browserName === 'firefox',
	'Firefox no emula touch ni viewport móvil',
);

const USER = {
	email: process.env.E2E_SUPERADMIN_EMAIL || 'leonardo.bolanos@gmail.com',
	password: process.env.E2E_SUPERADMIN_PASSWORD || '123456',
};

test.describe.serial('Community meeting flyer — phone (E2E)', () => {
	const stamp = Date.now();
	const meetingTitle = `Convivencia de Adviento del volante móvil ZZE2E ${stamp}`;

	let s: AuthSession;
	let communityId = '';
	let meetingId = '';
	let context: BrowserContext;
	let page: Page;
	let skipReason = '';

	test.beforeAll(async ({ browser, baseURL }) => {
		s = await loginAs(baseURL!, USER);

		const listRes = await s.ctx.get('/api/communities');
		if (!listRes.ok()) {
			skipReason = `GET /api/communities falló (${listRes.status()})`;
			return;
		}
		const body = await listRes.json();
		const list = Array.isArray(body) ? body : (body?.data ?? body?.communities ?? []);
		if (!Array.isArray(list) || list.length === 0) {
			skipReason = 'no hay comunidades en la DB para el E2E';
			return;
		}
		communityId = list[0].id;

		// Deterministic start + guaranteed restore, exactly like the editor spec.
		await s.ctx.delete(`/api/communities/${communityId}/flyer-options`, {
			headers: { 'X-CSRF-Token': s.csrfToken },
		});
		await s.ctx.delete(`/api/communities/${communityId}/flyer-background`, {
			headers: { 'X-CSRF-Token': s.csrfToken },
		});

		const createRes = await s.ctx.post(`/api/communities/${communityId}/meetings`, {
			data: {
				title: meetingTitle,
				startDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
				durationMinutes: 90,
			},
			headers: { 'X-CSRF-Token': s.csrfToken, 'content-type': 'application/json' },
		});
		if (createRes.status() !== 201) {
			skipReason = `crear reunión falló (${createRes.status()}: ${await createRes.text()})`;
			return;
		}
		meetingId = (await createRes.json()).id as string;

		const state = await s.ctx.storageState();
		context = await browser.newContext({ storageState: state, locale: 'es-MX' });
		page = await context.newPage();
		await page.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
	});

	test.afterAll(async () => {
		// Real community: ALWAYS give back its design and background, then delete
		// the throwaway meeting (flat URL — the communityId is NOT in the path).
		if (communityId) {
			await s.ctx.delete(`/api/communities/${communityId}/flyer-options`, {
				headers: { 'X-CSRF-Token': s.csrfToken },
			});
			await s.ctx.delete(`/api/communities/${communityId}/flyer-background`, {
				headers: { 'X-CSRF-Token': s.csrfToken },
			});
		}
		if (meetingId) {
			await s.ctx.delete(`/api/communities/meetings/${meetingId}?scope=this`, {
				headers: { 'X-CSRF-Token': s.csrfToken },
			});
		}
		await page?.close();
		await context?.close();
		await s?.dispose();
	});

	const openFlyer = async (baseURL: string) => {
		await page.goto(`${baseURL}/app/communities/${communityId}/meetings/${meetingId}/flyer`);
		await expect(page.locator('#printable-area')).toBeVisible();
	};

	/**
	 * The page must not scroll sideways on a phone. Every style renders inside
	 * the same container, so this is the shared "it fits" assertion.
	 */
	const horizontalOverflow = () =>
		page.evaluate(
			() => document.documentElement.scrollWidth - window.innerWidth,
		);

	test('Personalizado: el diseño de 850px escala a la pantalla y reserva su altura', async ({
		baseURL,
	}) => {
		test.skip(!!skipReason, skipReason);
		await openFlyer(baseURL!);

		// Below `sm` the style buttons are icon-only, but their labels are
		// sr-only — the accessible name survives the phone.
		await page.getByRole('button', { name: 'Personalizado', exact: true }).click();

		const canvas = page.locator('#printable-area[data-custom-canvas]');
		await expect(canvas).toBeVisible();
		await expect(page.locator('[data-flyer-block]')).toHaveCount(5);

		// The ResizeObserver downscale has run once the transform is a matrix.
		await expect(canvas).toHaveCSS('transform', /^matrix\(/);

		const m = await page.evaluate(() => {
			const canvas = document.querySelector('#printable-area') as HTMLElement;
			const container = canvas.parentElement as HTMLElement;
			const transform = new DOMMatrixReadOnly(getComputedStyle(canvas).transform);
			return {
				innerWidth: window.innerWidth,
				scale: transform.a,
				designWidth: canvas.getBoundingClientRect().width / transform.a,
				layoutHeight: canvas.scrollHeight,
				reservedHeight: parseFloat(container.style.height),
			};
		});
		// Scaled down, and the scaled design fits the phone's width.
		expect(m.scale).toBeGreaterThan(0);
		expect(m.scale).toBeLessThan(1);
		expect(m.designWidth * m.scale).toBeLessThanOrEqual(m.innerWidth + 1);
		// The container reserves the SCALED height (a transformed element keeps
		// its unscaled layout box): reserved ≈ layoutHeight × scale.
		expect(m.reservedHeight).toBeGreaterThan(300);
		expect(Math.abs(m.reservedHeight - m.layoutHeight * m.scale)).toBeLessThan(4);
		// And nothing spills sideways.
		expect(await horizontalOverflow()).toBeLessThanOrEqual(1);

		// The QR keeps its white plate — it must survive the downscale visible.
		await expect(page.locator('[data-flyer-block="locationQr"]')).toBeVisible();
	});

	test('Default, Poster y WhatsApp tampoco desbordan la pantalla', async ({ baseURL }) => {
		test.skip(!!skipReason, skipReason);
		await openFlyer(baseURL!);

		await page.getByRole('button', { name: 'Default', exact: true }).click();
		await expect(page.getByRole('heading', { name: meetingTitle })).toBeVisible();
		await expect(page.locator('[data-flyer-block]')).toHaveCount(0);
		expect(await horizontalOverflow()).toBeLessThanOrEqual(1);

		await page.getByRole('button', { name: 'Poster', exact: true }).click();
		await expect(page.locator('#printable-area')).toHaveCSS('background-image', /poster\.png/);
		expect(await horizontalOverflow()).toBeLessThanOrEqual(1);

		await page.getByRole('button', { name: 'WhatsApp', exact: true }).click();
		await expect(page.locator('#printable-area')).toBeVisible();
		await expect(page.locator('[data-custom-canvas]')).toHaveCount(0);
		expect(await horizontalOverflow()).toBeLessThanOrEqual(1);
	});

	test('el editor en el móvil: vista previa arriba, flechas, guardar y persiste', async ({
		baseURL,
	}) => {
		test.skip(!!skipReason, skipReason);
		await openFlyer(baseURL!);

		await page.getByRole('button', { name: 'Editar diseño' }).click();
		// On a phone the app shell hides the page's h1 (AppLayout's
		// mobile-hide-h1) and lifts its text into the fixed title bar, so the
		// arrival signal is the bar text, not a heading role.
		await expect(page.locator('span.truncate.pl-10')).toHaveText(
			'Editor del volante de reunión',
		);
		await expect(page.locator('[data-flyer-block="dateTime"]')).toBeVisible();

		// The small-screen layout call: the preview sticks ABOVE the panel, or
		// editing a block below the fold shows no reaction.
		const [previewTop, panelTop] = await Promise.all([
			page.getByRole('heading', { name: 'Vista previa', exact: true }).boundingBox(),
			page.getByRole('tab', { name: 'Diseño', exact: true }).boundingBox(),
		]);
		expect(previewTop!.y).toBeLessThan(panelTop!.y);
		expect(await horizontalOverflow()).toBeLessThanOrEqual(1);

		// Reorder without a mouse — the arrows are the phone's only way in.
		await page.locator('[data-move-down="dateTime"]').click();

		const putPromise = page.waitForResponse(
			(r) => r.request().method() === 'PUT' && /\/flyer-options$/.test(r.url()),
		);
		await page.getByRole('button', { name: 'Guardar', exact: true }).click();
		expect((await putPromise).status()).toBe(200);

		// Back on the published flyer the saved layout shows through, and it
		// persists across a reload (community.flyerOptions, not local state).
		await page.getByRole('link', { name: 'Volver al volante' }).click();
		await expect(page.locator('#printable-area')).toBeVisible();
		await page.getByRole('button', { name: 'Personalizado', exact: true }).click();
		const leftBlocks = () =>
			page
				.locator('[data-flyer-slot="left"] [data-flyer-block]')
				.evaluateAll((els) => els.map((el) => el.getAttribute('data-flyer-block')));
		await expect(page.locator('#printable-area[data-custom-canvas]')).toBeVisible();
		expect(await leftBlocks()).toEqual(['description', 'dateTime']);

		await page.reload();
		await expect(page.locator('#printable-area[data-custom-canvas]')).toBeVisible();
		expect(await leftBlocks()).toEqual(['description', 'dateTime']);
	});
});
