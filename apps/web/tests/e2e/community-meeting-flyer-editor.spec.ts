import {
	test,
	expect,
	type BrowserContext,
	type Page,
} from '@playwright/test';
import { loginAs, type AuthSession } from './helpers/auth';
import {
	captureFlyerState,
	restoreFlyerState,
	type CommunityFlyerState,
} from './helpers/communityFlyerState';

/**
 * E2E of the meeting flyer design editor (2026-09-21): the fourth style
 * "Personalizado" renders the community's saved design, and the editor
 * (/flyer/edit) persists a whole design (layout, look, hidden texts) into
 * community.flyerOptions — inherited by every meeting of the community.
 *
 * Strategy (like community-flyer-background): API login as local superadmin,
 * throwaway meeting created via API on the first visible community (unique
 * title, deleted at the end), authenticated browser via storageState, changes
 * through the real user path (style buttons, editor toolbar, panel controls).
 *
 * The community is real: this editor WRITES community.flyerOptions, so the
 * beforeAll clears any leftover design/background for a deterministic start
 * and the afterAll ALWAYS restores what the community had before the run
 * (captured before the wipe — not a blanket NULL), even if a test fails halfway.
 * The legacy styles (Default/Poster/WhatsApp) must stay untouched by all of it.
 */
test.use({ locale: 'es-MX' });

const USER = {
	email: process.env.E2E_SUPERADMIN_EMAIL || 'leonardo.bolanos@gmail.com',
	password: process.env.E2E_SUPERADMIN_PASSWORD || '123456',
};

test.describe.serial('Community meeting flyer — design editor (E2E)', () => {
	const stamp = Date.now();
	const meetingTitle = `Convivencia de Adviento del editor de volante ZZE2E ${stamp}`;

	let s: AuthSession;
	let communityId = '';
	let meetingId = '';
	let context: BrowserContext;
	let page: Page;
	let skipReason = '';
	let priorFlyer: CommunityFlyerState | null = null;

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

		// Deterministic starting point: whatever a previous manual run left saved
		// (a design, a community background) would change the default-layout
		// assertions below. Both deletes are idempotent on an already-clean
		// community — and the afterAll puts back what was captured right here,
		// not a blanket NULL.
		priorFlyer = await captureFlyerState(s.ctx, communityId);
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
		// The community is real: ALWAYS give back its design, background and
		// opacity as they were found (captured in the beforeAll), then delete
		// the throwaway meeting (flat URL — the communityId is NOT in the path)
		// and close.
		if (communityId) {
			await restoreFlyerState(s.ctx, s.csrfToken, communityId, priorFlyer);
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
		// The flyer mounts (leaves the skeleton) once community + meetings load.
		await expect(page.locator('#printable-area')).toBeVisible();
	};

	const selectStyle = async (name: string) => {
		await page.getByRole('button', { name, exact: true }).click();
	};

	/** The published canvas only claims the custom attribute in 'custom'. */
	const customArea = () => page.locator('#printable-area[data-custom-canvas]');

	/** Block ids of the left column in DOM order — the saved layout, observable. */
	const leftBlocks = () =>
		page
			.locator('[data-flyer-slot="left"] [data-flyer-block]')
			.evaluateAll((els) => els.map((el) => el.getAttribute('data-flyer-block')));

	test('Personalizado: el volante publicado monta el canvas con la distribución por defecto', async ({
		baseURL,
	}) => {
		test.skip(!!skipReason, skipReason);
		await openFlyer(baseURL!);

		await selectStyle('Personalizado');
		await expect(customArea()).toBeVisible();
		await expect(page.locator('[data-flyer-block]')).toHaveCount(5);
		expect(await leftBlocks()).toEqual(['dateTime', 'description']);
	});

	test('el editor guarda diseño completo y la vista publicada lo hereda tras reload', async ({
		baseURL,
	}) => {
		test.skip(!!skipReason, skipReason);
		await openFlyer(baseURL!);

		await page.getByRole('button', { name: 'Editar diseño' }).click();
		await expect(page.getByRole('heading', { name: 'Editor del volante de reunión' })).toBeVisible();
		// The editor's preview carries the blocks (its canvas is not printable).
		await expect(page.locator('[data-flyer-block="dateTime"]')).toBeVisible();

		// 1) Reorder without a mouse: the panel arrows (drag is pointer-only).
		await page.locator('[data-move-down="dateTime"]').click();

		// 2) A quick look. Its buttons live in the folded "whole flyer" section.
		await page.locator('[data-section="whole-flyer"]').click();
		await page.getByRole('button', { name: /Cartel/ }).click();

		// 3) Hide a text (empty and hidden are different states).
		await page.getByRole('tab', { name: 'Textos' }).click();
		await page.locator('[data-text-toggle="footerTextOverride"]').click();
		await expect(page.getByText('Oculto: no aparece en el volante.')).toBeVisible();

		// 4) Save — the PUT replaces the community's whole flyerOptions.
		const putPromise = page.waitForResponse(
			(r) => r.request().method() === 'PUT' && /\/flyer-options$/.test(r.url()),
		);
		await page.getByRole('button', { name: 'Guardar', exact: true }).click();
		expect((await putPromise).status()).toBe(200);

		// 5) Back to the published flyer: the saved design shows through. (The
		// toolbar's back control is a Button as-child over a router-link, so it
		// reaches the a11y tree as a link, not a button.)
		await page.getByRole('link', { name: 'Volver al volante' }).click();
		await expect(page.locator('#printable-area')).toBeVisible();
		await selectStyle('Personalizado');
		await expect(customArea()).toBeVisible();
		await expect(page.locator('[data-flyer-block]')).toHaveCount(5);

		expect(await leftBlocks()).toEqual(['description', 'dateTime']);
		await expect(page.locator('#printable-area')).not.toContainText('¡Te esperamos!');
		// The 'Cartel' look reached the published canvas, not just the layout:
		// its dark 40% scrim. This flavour's boxless defaults already paint
		// transparent cards with white text, so the scrim is the part only the
		// saved theme can paint (inline style — the canvas's other dark rgba()s
		// live in scoped CSS and never match this selector).
		await expect(
			page.locator('#printable-area div[style*="background-color: rgba(0, 0, 0, 0.4)"]'),
		).toBeVisible();

		// 6) It persists across a reload (community.flyerOptions, not local state).
		await page.reload();
		await expect(customArea()).toBeVisible();
		await expect(page.locator('[data-flyer-block]')).toHaveCount(5);
		expect(await leftBlocks()).toEqual(['description', 'dateTime']);
	});

	test('Default, Poster y WhatsApp quedan intactos aunque haya un diseño guardado', async ({
		baseURL,
	}) => {
		test.skip(!!skipReason, skipReason);
		await openFlyer(baseURL!);

		await selectStyle('Default');
		await expect(page.getByRole('heading', { name: meetingTitle })).toBeVisible();
		await expect(page.locator('[data-flyer-block]')).toHaveCount(0);

		// The community background was restored to null: Poster falls back to
		// its own preset, not to anything the editor saved.
		await selectStyle('Poster');
		await expect(page.locator('#printable-area')).toHaveCSS('background-image', /poster\.png/);

		await selectStyle('WhatsApp');
		await expect(page.locator('#printable-area')).toBeVisible();
		await expect(page.locator('[data-custom-canvas]')).toHaveCount(0);
	});
});
