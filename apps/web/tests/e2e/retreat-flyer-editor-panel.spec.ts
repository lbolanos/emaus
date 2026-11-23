import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import assert from 'node:assert';
import { loginAs } from './helpers/auth';

/**
 * E2E of the flyer editor's panel features that shipped after the first spec
 * (retreat-flyer-editor.spec.ts): the title-row icon colour, the recent-colour
 * swatches, the column gap, the per-role veil/shadow toggles, the accordion,
 * the scoped hover glow, the autosaved draft, the preview zoom and sticky
 * pane, the contact-card reflow, copying another retreat's design, and the
 * meeting editor sharing the same panel.
 *
 * Read-only by design, like its sibling: everything edits the in-memory DRAFT
 * (nothing clicks Guardar), and the data a test needs that the dev DB may not
 * have (contact phones, another retreat's design) is injected with page.route
 * on the GET — never written.
 *
 * Every test opens a FRESH tab: localStorage is shared by the context, and the
 * recents and the autosaved draft are exactly what these tests poke at. A
 * one-time init script (guarded by sessionStorage, which survives a reload in
 * the same tab) resets both, so a reload inside a test keeps what it made.
 */
test.use({ locale: 'es-MX' });

const USER = {
	email: process.env.E2E_SUPERADMIN_EMAIL || 'leonardo.bolanos@gmail.com',
	password: process.env.E2E_SUPERADMIN_PASSWORD || '123456',
};

/** Default: Santa Clara — present in the dev DB. Any other retreat works too. */
const RETREAT_ID = process.env.E2E_RETREAT_ID || 'ac694780-1a2a-41ea-ba25-1646d22a1dd5';
const TEXT_RECENTS = 'emaus-flyer-recent-colors/text';
const ICON_RECENTS = 'emaus-flyer-recent-colors/icon';

test.describe.serial('Retreat flyer editor — panel features (E2E)', () => {
	let context: BrowserContext;
	let page: Page;
	let skipReason: string | null = null;
	let meetingPath: string | null = null;
	let meetingCommunityId: string | null = null;
	const rateLimited: string[] = [];

	test.beforeAll(async ({ browser, baseURL }) => {
		if (!baseURL) {
			skipReason = 'sin baseURL';
			return;
		}
		let session;
		try {
			session = await loginAs(baseURL, USER);
		} catch (error) {
			skipReason = `login falló: ${String(error).slice(0, 160)}`;
			return;
		}
		const check = await session.ctx.get(`/api/retreats/${RETREAT_ID}`);
		if (!check.ok()) {
			skipReason = `retiro ${RETREAT_ID} no existe aquí (${check.status()})`;
			await session.ctx.dispose();
			return;
		}

		// Any existing meeting, read-only, for the shared-panel test (skips if none)
		const communities = await session.ctx.get('/api/communities');
		const list = communities.ok() ? ((await communities.json()) as { id: string }[]) : [];
		for (const community of Array.isArray(list) ? list.slice(0, 5) : []) {
			const res = await session.ctx.get(`/api/communities/${community.id}/meetings`);
			const meetings = res.ok() ? ((await res.json()) as { id: string }[]) : [];
			if (Array.isArray(meetings) && meetings.length > 0) {
				meetingPath = `/app/communities/${community.id}/meetings/${meetings[0].id}/flyer/edit`;
				meetingCommunityId = community.id;
				break;
			}
		}

		const state = await session.ctx.storageState();
		context = await browser.newContext({ storageState: state, locale: 'es-MX' });
		await session.ctx.dispose();
	});

	test.afterAll(async () => {
		await context?.close();
	});

	test.afterEach(() => {
		expect(
			rateLimited,
			'el API respondió 429 (límite de 300 req/min): arranca el API con ' +
				'NODE_ENV=development SKIP_RATE_LIMIT=true o espera un minuto',
		).toEqual([]);
	});

	/** A fresh tab with clean recents/draft (seeded once per tab), on the editor. */
	async function openFresh(seed: { text?: string[]; icon?: string[] } = {}, path?: string) {
		await page?.close();
		page = await context.newPage();
		// Each fresh tab boots the whole app: a full run of this spec can cross
		// the dev API's 300 req/min limiter, and a 429 then surfaces as an
		// unrelated "element not found" far away. Name it instead.
		page.on('response', (res) => {
			if (res.status() === 429) rateLimited.push(new URL(res.url()).pathname);
		});
		await page.addInitScript(
			({ id, meetingDraftId, text, icon, textKey, iconKey }) => {
				localStorage.setItem('preferred-locale', 'es');
				if (sessionStorage.getItem('flyer-e2e-seeded')) return;
				sessionStorage.setItem('flyer-e2e-seeded', '1');
				localStorage.removeItem(`emaus-flyer-draft-${id}`);
				if (meetingDraftId) localStorage.removeItem(`emaus-flyer-draft-${meetingDraftId}`);
				localStorage.setItem(textKey, JSON.stringify(text));
				localStorage.setItem(iconKey, JSON.stringify(icon));
			},
			{
				id: RETREAT_ID,
				meetingDraftId: meetingCommunityId,
				text: seed.text ?? [],
				icon: seed.icon ?? [],
				textKey: TEXT_RECENTS,
				iconKey: ICON_RECENTS,
			},
		);
		if (path) return;
		await page.goto(`/app/retreats/${RETREAT_ID}/flyer/edit`);
		await expect(page.getByRole('heading', { name: 'Editor del volante' })).toBeVisible();
		await expect(page.locator('[data-block="startTime"]')).toBeVisible();
	}

	const selectBlock = async (id: string) => {
		await page.locator(`[data-block="${id}"] button`).first().click();
		await expect(page.getByRole('button', { name: 'Restaurar', exact: true })).toBeVisible();
	};

	/** The selected block's section for a role (the theme panel's comes first). */
	const slotSection = (slot: string) => page.locator(`[data-font-slot-section="${slot}"]`).last();

	const openSlot = async (slot: string) => {
		const header = slotSection(slot).locator(`[data-section="font-${slot}"]`);
		if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
		await expect(header).toHaveAttribute('aria-expanded', 'true');
	};

	const blockStyle = (id: string) =>
		page.locator(`[data-flyer-block="${id}"]`).getAttribute('style').then((s) => s ?? '');

	const storedList = (key: string) =>
		page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]') as string[], key);

	/** Sets a colour input's value and fires ONLY the given events. */
	const pokeColour = (selector: string, hex: string, events: ('input' | 'change')[]) =>
		page.locator(selector).first().evaluate(
			(el, { value, fire }) => {
				const input = el as HTMLInputElement;
				const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
				setter.call(input, value);
				for (const type of fire) input.dispatchEvent(new Event(type, { bubbles: true }));
			},
			{ value: hex, fire: events },
		);

	test('the title row recolours its icon chip from its own palette; None brings the gradient back', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await openFresh();
		await selectBlock('startTime');
		await openSlot('title');

		const chip = page.locator('[data-flyer-block="startTime"] .fb-title-chip');
		const otherChip = page.locator('[data-flyer-block="location"] .fb-title-chip');
		await expect(chip).toHaveCSS('background-image', /linear-gradient/);

		await slotSection('title').locator('[data-icon-swatch="#15803d"]').click();
		await expect(chip).toHaveCSS('background-color', 'rgb(21, 128, 61)');
		await expect(chip).toHaveCSS('background-image', 'none');
		// Only the block that asked for it
		await expect(otherChip).toHaveCSS('background-image', /linear-gradient/);

		// A ready-made swatch is one click away already: it records nothing.
		// Only a colour chosen in the picker window lands in the recents —
		// and an icon colour in the ICON list, never the text one.
		expect(await storedList(ICON_RECENTS)).toEqual([]);
		await pokeColour(
			'[data-font-slot-section="title"] >> nth=-1 >> [data-chip-picker]',
			'#7c2d12',
			['input', 'change'],
		);
		await expect(chip).toHaveCSS('background-color', 'rgb(124, 45, 18)');
		expect(await storedList(ICON_RECENTS)).toEqual(['#7c2d12']);
		expect(await storedList(TEXT_RECENTS)).toEqual([]);
		await expect(slotSection('title').locator('[data-icon-recent-swatch="#7c2d12"]')).toBeVisible();
		await expect(page.locator('[data-recent-swatch="#7c2d12"]')).toHaveCount(0);

		await slotSection('title').locator('[data-chip-clear]').click();
		await expect(chip).toHaveCSS('background-image', /linear-gradient/);
	});

	test('a colour reaches the recents only when the picker closes, and they survive a reload', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await openFresh();
		await selectBlock('startTime');
		await openSlot('emphasis');

		const picker = '[data-font-slot-section="emphasis"] >> nth=-1 >> input[type="color"]';
		const date = page.locator('[data-flyer-block="startTime"] .fb-emphasis').first();

		// A stock swatch or a veil shortcut is not a pick from the window: nothing recorded
		await slotSection('emphasis').locator('[data-slot-color-swatch="emphasis:#fde68a"]').click();
		await slotSection('emphasis').locator('[data-slot-veil="emphasis:light"]').click();
		expect(await storedList(TEXT_RECENTS)).toEqual([]);

		// Dragging inside the colour window: live on the canvas, NOT recorded
		await pokeColour(picker, '#123456', ['input']);
		await expect(date).toHaveCSS('color', 'rgb(18, 52, 86)');
		expect(await storedList(TEXT_RECENTS)).toEqual([]);

		// Closing it commits the pick
		await pokeColour(picker, '#123456', ['change']);
		expect(await storedList(TEXT_RECENTS)).toEqual(['#123456']);

		// Same tab, reloaded: the recent is offered on another block, one click applies it
		await page.reload();
		await expect(page.locator('[data-block="location"]')).toBeVisible();
		await selectBlock('location');
		await openSlot('body');
		await slotSection('body').locator('[data-recent-swatch="#123456"]').click();
		await expect(page.locator('[data-flyer-block="location"] .fb-body').first()).toHaveCSS(
			'color',
			'rgb(18, 52, 86)',
		);
	});

	test('ten recents wrap inside the section (no sideways scroll) and the eleventh pushes the oldest out', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		const ten = [
			'#111111', '#222222', '#333333', '#444444', '#555555',
			'#666666', '#777777', '#888888', '#999999', '#aaaaaa',
		];
		await openFresh({ text: ten });
		await selectBlock('startTime');
		await openSlot('emphasis');

		const section = slotSection('emphasis');
		await expect(section.locator('[data-recent-swatch]')).toHaveCount(10);
		const fits = await section.evaluate((el) => {
			const box = el.getBoundingClientRect();
			const swatches = [...el.querySelectorAll('[data-recent-swatch]')];
			// The panel card is the scroller: it must not grow a horizontal scrollbar
			const card = el.closest('.lg\\:overflow-y-auto') as HTMLElement | null;
			return {
				inside: swatches.every((s) => s.getBoundingClientRect().right <= box.right + 1),
				cardScrolls: card ? card.scrollWidth > card.clientWidth + 1 : false,
			};
		});
		expect(fits).toEqual({ inside: true, cardScrolls: false });

		await pokeColour(
			'[data-font-slot-section="emphasis"] >> nth=-1 >> input[type="color"]',
			'#0f766e',
			['input', 'change'],
		);
		const stored = await storedList(TEXT_RECENTS);
		expect(stored).toHaveLength(10);
		expect(stored[0]).toBe('#0f766e');
		expect(stored).not.toContain('#aaaaaa');
	});

	test('a role veil goes on and None takes it off again', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await openFresh();
		await selectBlock('startTime');
		await openSlot('emphasis');

		await slotSection('emphasis').locator('[data-slot-veil="emphasis:light"]').click();
		expect(await blockStyle('startTime')).toMatch(/--fb-emphasis-bg: rgba\(255, 255, 255/);
		expect(await blockStyle('startTime')).toContain('--fb-body-bg: transparent');

		await slotSection('emphasis').locator('[data-slot-veil="emphasis:none"]').click();
		expect(await blockStyle('startTime')).toContain('--fb-emphasis-bg: transparent');
		await expect(slotSection('emphasis').locator('[data-slot-veil="emphasis:none"]')).toHaveClass(
			/border-primary/,
		);
	});

	test('shadow Sí lights only that role, and No takes it off', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await openFresh();
		await selectBlock('startTime');
		await openSlot('emphasis');

		await slotSection('emphasis').locator('[data-slot-shadow="emphasis:on"]').click();
		const on = await blockStyle('startTime');
		expect(on).not.toContain('--fb-emphasis-shadow: none');
		expect(on).toContain('--fb-body-shadow: none');

		await slotSection('emphasis').locator('[data-slot-shadow="emphasis:off"]').click();
		expect(await blockStyle('startTime')).toContain('--fb-emphasis-shadow: none');
	});

	test('opening one role section closes the one that was open', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await openFresh();
		await selectBlock('startTime');

		await openSlot('title');
		await openSlot('emphasis');
		await expect(slotSection('title').locator('[data-section="font-title"]')).toHaveAttribute(
			'aria-expanded',
			'false',
		);
		await expect(slotSection('emphasis').locator('[data-section="font-emphasis"]')).toHaveAttribute(
			'aria-expanded',
			'true',
		);
	});

	test('hovering a role glows it in the selected block only; the whole-flyer panel glows it everywhere', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await openFresh();
		await selectBlock('startTime');
		const glowing = page.locator('[data-highlight-slot]');

		await slotSection('emphasis').hover();
		await expect(glowing).toHaveCount(1);
		await expect(glowing).toHaveAttribute('data-highlight-slot', 'emphasis');
		await expect(glowing).toHaveAttribute('data-flyer-block', 'startTime');

		// Off the section: nothing glows
		await page.getByRole('heading', { name: 'Editor del volante' }).hover();
		await expect(glowing).toHaveCount(0);

		// The theme panel's section reaches every block that has the role
		const whole = page.locator('[data-section="whole-flyer"]');
		if ((await whole.getAttribute('aria-expanded')) !== 'true') await whole.click();
		await page.locator('[data-font-slot-section="emphasis"]').first().hover();
		await expect.poll(() => glowing.count()).toBeGreaterThan(2);
	});

	test('contact draws two card columns at full width and one once the block is shrunk', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await openFresh({}, 'deferred');
		// Two phones, injected on the GETs — the dev retreat may have none. Both
		// the single retreat AND the list: the store replaces the selected retreat
		// with the list's copy when the sidebar loads it, which dropped a stub
		// that only covered /retreats/:id.
		const phones = 'Madre Carmen 285 956 60 47\nGuillermo 285 109 65 63';
		await page.route(
			(url) => /\/api\/retreats\/?$/.test(url.pathname) || url.pathname.endsWith(`/api/retreats/${RETREAT_ID}`),
			async (route) => {
				if (route.request().method() !== 'GET') return route.continue();
				const response = await route.fetch();
				const body = await response.json();
				const patch = (r: { id?: string; contactPhones?: string }) => {
					if (r?.id === RETREAT_ID) r.contactPhones = phones;
				};
				if (Array.isArray(body)) body.forEach(patch);
				else if (Array.isArray(body?.data)) body.data.forEach(patch);
				else patch(body);
				await route.fulfill({ response, json: body });
			},
		);
		await page.goto(`/app/retreats/${RETREAT_ID}/flyer/edit`);
		await expect(page.locator('[data-flyer-block="contact"] .fb-stack')).toBeVisible();

		const columns = () =>
			page
				.locator('[data-flyer-block="contact"] .fb-stack')
				.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
		const cardsInside = () =>
			page.locator('[data-flyer-block="contact"]').evaluate((el) => {
				const block = el.getBoundingClientRect();
				return [...el.querySelectorAll('.fb-stack > div')].every((card) => {
					const box = card.getBoundingClientRect();
					return box.left >= block.left - 1 && box.right <= block.right + 1;
				});
			});
		expect(await columns()).toBe(2);
		expect(await cardsInside()).toBe(true);

		// Shrink to ~55% with the edge handle
		await selectBlock('contact');
		const handle = page.locator('[data-flyer-block="contact"] [data-resize-handle]');
		const columnWidth = (await page
			.locator('[data-flyer-slot="right"]')
			.evaluate((el) => el.clientWidth)) as number;
		const box = await handle.boundingBox();
		assert(box, 'contact handle has a bounding box');
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x - columnWidth * 0.45, box.y + box.height / 2, { steps: 8 });
		await page.mouse.up();
		await expect(page.locator('[data-flyer-block="contact"]')).toHaveAttribute('style', /width: (50|55|60)%/);

		await expect.poll(columns).toBe(1);
		expect(await cardsInside()).toBe(true);
	});

	test('the column gap pushes the right column toward the edge, and reset returns to the design', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await openFresh();
		const whole = page.locator('[data-section="whole-flyer"]');
		if ((await whole.getAttribute('aria-expanded')) !== 'true') await whole.click();

		const grid = page.locator('.print-optimized .grid.grid-cols-2').first();
		const rightLeft = () =>
			page.locator('[data-flyer-slot="right"]').evaluate((el) => el.getBoundingClientRect().left);
		const before = await rightLeft();
		expect((await grid.getAttribute('style')) ?? '').not.toContain('column-gap');

		await page.locator('[data-column-gap-slider]').evaluate((el) => {
			const input = el as HTMLInputElement;
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
			setter.call(input, '120');
			input.dispatchEvent(new Event('input', { bubbles: true }));
		});
		await expect(grid).toHaveAttribute('style', /column-gap: 120px/);
		expect(await rightLeft()).toBeGreaterThan(before);

		await page.getByRole('button', { name: 'Volver a la separación de diseño' }).click();
		await expect.poll(async () => (await grid.getAttribute('style')) ?? '').not.toContain('column-gap');
	});

	test('a change survives a reload as a recovered draft; Descartar borrador goes back to the saved design', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await openFresh();
		const date = page.locator('[data-flyer-block="startTime"] .fb-emphasis').first();
		const savedColour = await date.evaluate((el) => getComputedStyle(el).color);

		await selectBlock('startTime');
		await openSlot('emphasis');
		await slotSection('emphasis').locator('[data-slot-color-swatch="emphasis:#fde68a"]').click();
		await expect(date).toHaveCSS('color', 'rgb(253, 230, 138)');
		await expect
			.poll(() => page.evaluate((id) => !!localStorage.getItem(`emaus-flyer-draft-${id}`), RETREAT_ID))
			.toBe(true);

		await page.reload();
		await expect(page.locator('[data-draft-banner]')).toBeVisible();
		// The date really lands in the notice (it used to read "del ." — the
		// string was passed as the default message, not as {0})
		await expect(page.locator('[data-draft-banner]')).toContainText(/del \d{1,2}\/\d{1,2}\/\d{4}/);
		await expect(date).toHaveCSS('color', 'rgb(253, 230, 138)');

		await page.getByRole('button', { name: 'Descartar borrador' }).click();
		await expect(page.locator('[data-draft-banner]')).toHaveCount(0);
		await expect(date).toHaveCSS('color', savedColour);
		expect(
			await page.evaluate((id) => localStorage.getItem(`emaus-flyer-draft-${id}`), RETREAT_ID),
		).toBeNull();
	});

	test('zooming out fits the whole flyer and the preview scrollbar goes away', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await openFresh();
		// A short laptop screen: at 100% the flyer is taller than the pane
		await page.setViewportSize({ width: 1280, height: 560 });
		const pane = page.locator('div.overflow-y-auto:has(> div > .print-optimized)');
		const overflowing = () =>
			pane.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
		await expect.poll(overflowing).toBe(true);

		const zoomOut = page.getByRole('button', { name: 'Reducir la vista previa' });
		for (let i = 0; i < 6 && (await overflowing()); i++) await zoomOut.click();
		expect(await overflowing()).toBe(false);
		await expect(page.locator('[data-preview-zoom]')).not.toContainText('100%');
	});

	test('copying another retreat brings its look into the draft, and Deshacer takes it back', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await openFresh({}, 'deferred');
		await page.goto(`/app/retreats/${RETREAT_ID}/flyer/edit`);
		const select = page.locator('[data-copy-design-select]');
		await expect(select).toBeVisible();
		const sourceId = await select
			.locator('option')
			.evaluateAll((opts) => (opts as HTMLOptionElement[]).map((o) => o.value).find((v) => !!v) ?? null);
		test.skip(!sourceId, 'no hay otro retiro del que copiar');

		// The source's design is injected: a red heading nobody ships by default
		await page.route(`**/api/retreats/${sourceId}`, async (route) => {
			const response = await route.fetch();
			const body = await response.json();
			body.flyer_options = {
				...(body.flyer_options ?? {}),
				theme: { ...(body.flyer_options?.theme ?? {}), headingColor: '#b91c1c' },
				blockStyles: {},
			};
			await route.fulfill({ response, json: body });
		});
		const before = await blockStyle('location');
		await select.selectOption(sourceId!);
		await expect.poll(() => blockStyle('location')).toContain('--fb-heading: #b91c1c');

		await page.getByRole('button', { name: 'Deshacer' }).click();
		await expect.poll(() => blockStyle('location')).toBe(before);
	});

	// The store autosaves a draft on every change, and the meeting view's
	// Descartar reloaded the community — which restores that very draft. The
	// retreat view had the same bug (fixed with discardDraft).
	test('Descartar cambios in the meeting editor really throws the change away', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		test.skip(!meetingPath, 'no hay reuniones en la DB para el E2E');
		await openFresh({}, 'deferred');
		await page.goto(meetingPath!);
		await expect(page.locator('[data-block="dateTime"]')).toBeVisible();
		const chip = page.locator('[data-flyer-block="dateTime"] .fb-title-chip');
		await expect(chip).toHaveCSS('background-image', /linear-gradient/);

		await page.locator('[data-block="dateTime"] button').first().click();
		await openSlot('title');
		await slotSection('title').locator('[data-icon-swatch="#b45309"]').click();
		await expect(chip).toHaveCSS('background-image', 'none');

		await page.getByRole('button', { name: 'Descartar cambios' }).click();
		await expect(chip).toHaveCSS('background-image', /linear-gradient/);
	});

	test('the meeting editor shares the panel: its Icon row recolours the meeting chip too', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		test.skip(!meetingPath, 'no hay reuniones en la DB para el E2E');
		await openFresh({}, 'deferred');
		await page.goto(meetingPath!);
		await expect(page.locator('[data-block="dateTime"]')).toBeVisible();
		await page.locator('[data-block="dateTime"] button').first().click();
		await openSlot('title');

		await slotSection('title').locator('[data-icon-swatch="#b45309"]').click();
		const chip = page.locator('[data-flyer-block="dateTime"] .fb-title-chip');
		await expect(chip).toHaveCSS('background-color', 'rgb(180, 83, 9)');
		await expect(chip).toHaveCSS('background-image', 'none');
	});
	test('the meeting editor matches the retreat one: draft notice, redo, double-click to text, zoom', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		test.skip(!meetingPath, 'no hay reuniones en la DB para el E2E');
		await openFresh({}, 'deferred');
		await page.goto(meetingPath!);
		await expect(page.locator('[data-block="dateTime"]')).toBeVisible();
		const chip = page.locator('[data-flyer-block="dateTime"] .fb-title-chip');

		// A change, undone and redone from the toolbar
		await page.locator('[data-block="dateTime"] button').first().click();
		await openSlot('title');
		await slotSection('title').locator('[data-icon-swatch="#b45309"]').click();
		await expect(chip).toHaveCSS('background-image', 'none');
		await page.getByRole('button', { name: 'Deshacer' }).click();
		await expect(chip).toHaveCSS('background-image', /linear-gradient/);
		await page.getByRole('button', { name: 'Rehacer' }).click();
		await expect(chip).toHaveCSS('background-image', 'none');

		// Reloaded: the autosaved draft comes back WITH a notice, and the
		// notice's Descartar borrador really goes back to the saved design
		await page.reload();
		await expect(page.locator('[data-draft-banner]')).toBeVisible();
		await expect(page.locator('[data-draft-banner]')).toContainText(/del \d{1,2}\/\d{1,2}\/\d{4}/);
		await expect(chip).toHaveCSS('background-image', 'none');
		await page.getByRole('button', { name: 'Descartar borrador' }).click();
		await expect(page.locator('[data-draft-banner]')).toHaveCount(0);
		await expect(chip).toHaveCSS('background-image', /linear-gradient/);

		// Double-clicking a label on the flyer lands on its Texts field
		await page.locator('[data-text-override="dateLabelOverride"]').dblclick();
		await expect(page.locator('#flyer-text-dateLabelOverride')).toBeFocused();
		// …and flashes it (the old scoped-CSS flash never reached the field)
		expect(
			await page.locator('#flyer-text-dateLabelOverride').evaluate((el) => el.getAnimations().length),
		).toBeGreaterThan(0);

		// Zoom out shrinks the preview, the label follows
		await page.getByRole('button', { name: 'Reducir la vista previa' }).click();
		await expect(page.locator('[data-preview-zoom]')).toContainText('90%');
	});
});
