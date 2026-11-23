import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import assert from 'node:assert';
import { loginAs } from './helpers/auth';

/**
 * E2E of the retreat flyer design editor's interaction layer (2026-11-20):
 * per-slot typography sections, colour/size on the canvas, undo/redo,
 * double-click-to-text-field and the artwork palette.
 *
 * Read-only by design: everything here edits the DRAFT the store holds in
 * memory. Nothing clicks Guardar and nothing writes the database — persistence
 * is covered by the store's unit tests, so this spec stays green on any
 * retreat without capture/restore scaffolding.
 */
test.use({ locale: 'es-MX' });

const USER = {
	email: process.env.E2E_SUPERADMIN_EMAIL || 'leonardo.bolanos@gmail.com',
	password: process.env.E2E_SUPERADMIN_PASSWORD || '123456',
};

/** Default: Santa Clara — present in the dev DB. Any other retreat works too. */
const RETREAT_ID = process.env.E2E_RETREAT_ID || 'ac694780-1a2a-41ea-ba25-1646d22a1dd5';

test.describe.serial('Retreat flyer editor — slots, undo/redo, text jump (E2E)', () => {
	let context: BrowserContext;
	let page: Page;
	let skipReason: string | null = null;

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

		// The default retreat is perishable: skip legibly on another database
		const check = await session.ctx.get(`/api/retreats/${RETREAT_ID}`);
		if (!check.ok()) {
			skipReason = `retiro ${RETREAT_ID} no existe aquí (${check.status()})`;
			await session.ctx.dispose();
			return;
		}

		const state = await session.ctx.storageState();
		context = await browser.newContext({ storageState: state, locale: 'es-MX' });
		page = await context.newPage();
		await page.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
	});

	test.afterAll(async () => {
		await context?.close();
	});

	/**
	 * Deterministic start: the autosaved draft from a previous session (a
	 * manual test, a crashed tab) comes back on load, which shifts every
	 * baseline. Removing the key before the app boots means no banner, no
	 * restore, always the saved design — checking `isVisible` on the banner
	 * raced its mount and let the draft through.
	 */
	async function openEditorClean() {
		await page.addInitScript(
			(id) => localStorage.removeItem(`emaus-flyer-draft-${id}`),
			RETREAT_ID,
		);
		await page.goto(`/app/retreats/${RETREAT_ID}/flyer/edit`);
		await expect(page.getByRole('heading', { name: 'Editor del volante' })).toBeVisible();
		await expect(page.locator('[data-block="startTime"]')).toBeVisible();
	}

	test('opens the editor with the slot sections collapsed and a hint per block', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await page.goto(`/app/retreats/${RETREAT_ID}/flyer/edit`);
		await expect(page.getByRole('heading', { name: 'Editor del volante' })).toBeVisible();

		// Select a three-slot block from the list
		await page.locator('[data-block="startTime"] button').first().click();

		// Sections ship collapsed: headers there, controls hidden
		const blockSections = page.locator('[data-font-slot-section]', {
			has: page.locator('[data-slot-scale-plus]'),
		});
		// The three block slots exist (the theme panel renders its own three)
		await expect(page.locator('[data-font-slot-section="title"]')).toHaveCount(2);
		await expect(page.locator('[data-font-slot-section="emphasis"]')).toHaveCount(2);
		await expect(page.locator('[data-font-slot-section="body"]')).toHaveCount(2);

		// A collapsed section shows its summary, not its size stepper
		const emphasisCard = page.locator('[data-font-slot-section="emphasis"]').last();
		await expect(emphasisCard.getByRole('button', { name: /destacado/i })).toBeVisible();
		await expect(emphasisCard.locator('[data-slot-scale-plus="emphasis"]')).toBeHidden();

		// The per-block hint explains what each slot is
		await expect(page.getByText(/Destacado es la fecha; Texto, la hora/i)).toBeVisible();
	});

	test('colour and size of one slot land on the canvas without touching the others', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await openEditorClean();
		await page.locator('[data-block="startTime"] button').first().click();

		const emphasisCard = page.locator('[data-font-slot-section="emphasis"]').last();
		await emphasisCard.getByRole('button', { name: /destacado/i }).click();
		await expect(emphasisCard.locator('[data-slot-scale-plus="emphasis"]')).toBeVisible();

		// A stock swatch recolours the emphasis slot on the wrapper
		await emphasisCard.locator('[data-slot-color-swatch="emphasis:#fde68a"]').click();
		await expect(page.locator('[data-flyer-block="startTime"]')).toHaveAttribute(
			'style',
			/--fb-emphasis-color: #fde68a/,
		);
		// …while the body slot keeps the block's own body colour
		await expect(page.locator('[data-flyer-block="startTime"]')).not.toHaveAttribute(
			'style',
			/--fb-body-color: #fde68a/,
		);

		// One tap of + steps the size 5%
		await emphasisCard.locator('[data-slot-scale-plus="emphasis"]').click();
		await expect(page.locator('[data-flyer-block="startTime"]')).toHaveAttribute(
			'style',
			/--fb-emphasis-scale: 1\.05/,
		);
	});

	test('undo steps the change back, redo brings it again', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await openEditorClean();
		await page.locator('[data-block="startTime"] button').first().click();
		const emphasisCard = page.locator('[data-font-slot-section="emphasis"]').last();
		await emphasisCard.getByRole('button', { name: /destacado/i }).click();
		await emphasisCard.locator('[data-slot-scale-plus="emphasis"]').click();
		await expect(page.locator('[data-flyer-block="startTime"]')).toHaveAttribute(
			'style',
			/--fb-emphasis-scale: 1\.05/,
		);

		await page.getByRole('button', { name: /^Deshacer$/ }).click();
		await expect(page.locator('[data-flyer-block="startTime"]')).not.toHaveAttribute(
			'style',
			/--fb-emphasis-scale: 1\.05/,
		);

		await page.getByRole('button', { name: /^Rehacer$/ }).click();
		await expect(page.locator('[data-flyer-block="startTime"]')).toHaveAttribute(
			'style',
			/--fb-emphasis-scale: 1\.05/,
		);
	});

	test('emphasis alignment moves the intro badge, a width-capped box', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await openEditorClean();
		await page.locator('[data-block="intro"] button').first().click();

		const emphasisCard = page.locator('[data-font-slot-section="emphasis"]').last();
		await emphasisCard.getByRole('button', { name: /destacado/i }).click();
		await emphasisCard.locator('[data-slot-align="emphasis:right"]').click();

		// The badge is an inline-block span text-align cannot move; the emphasis
		// slot flips its auto margins instead
		await expect(page.locator('[data-flyer-block="intro"]')).toHaveAttribute(
			'style',
			/--fb-emph-ml: auto/,
		);
		await expect(page.locator('[data-flyer-block="intro"]')).toHaveAttribute(
			'style',
			/--fb-emph-mr: 0/,
		);
	});

	test('double-clicking copy on the flyer opens its Texts field', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await openEditorClean();

		// The registration call-to-action belongs to registerOverride
		await page.locator('[data-flyer-block="registrationQr"] h3').dblclick();

		// Texts tab opened on that exact field, focused
		const field = page.locator('#flyer-text-registerOverride');
		await expect(field).toBeVisible();
		await expect(field).toBeFocused();
	});

	test('puts a veil behind one role only, and warns about blocks with no content', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await openEditorClean();

		// Veil on a block WITH content: startTime's emphasis (the date)
		await page.locator('[data-block="startTime"] button').first().click();
		const emphasisCard = page.locator('[data-font-slot-section="emphasis"]').last();
		await emphasisCard.getByRole('button', { name: /destacado/i }).click();
		await expect(emphasisCard.locator('[data-slot-veil="emphasis:light"]')).toBeVisible();
		await emphasisCard.locator('[data-slot-veil="emphasis:light"]').click();

		const block = page.locator('[data-flyer-block="startTime"]');
		await expect(block).toHaveAttribute('style', /--fb-emphasis-bg: rgba\(255, 255, 255, 0\.85\)/);
		// It paints behind this role's line…
		await expect(block.locator('p.fb-emphasis')).toHaveCSS(
			'background-color',
			'rgba(255, 255, 255, 0.85)',
		);
		// …and nowhere else in the block
		await expect(block.locator('h4')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

		// A block with nothing to draw (contact without phones on this retreat)
		// must say so instead of silently ignoring every control
		await page.locator('[data-block="contact"] button').first().click();
		// Anchor first: the selected-block card is up (the block Reset only
		// lives there), so the count-0 below can't pass against a dead panel
		await expect(page.getByRole('button', { name: 'Restaurar', exact: true })).toBeVisible();

		// Contact is born flat-right; its TITLE slot must still be able to
		// pull left — the furniture follows the slot, not the flat default
		const contactTitleCard = page.locator('[data-font-slot-section="title"]').last();
		await contactTitleCard.getByRole('button', { name: /título/i }).click();
		await contactTitleCard.locator('[data-slot-align="title:left"]').click();
		await expect(page.locator('[data-flyer-block="contact"]')).toHaveAttribute(
			'data-title-align',
			'left',
		);

		// The phone/email cards follow the TITLE slot — the block's chrome —
		// so heading and cards travel together
		const contactTitleCard2 = page.locator('[data-font-slot-section="title"]').last();
		await contactTitleCard2.locator('[data-slot-align="title:left"]').click();
		await expect(page.locator('[data-flyer-block="contact"]')).toHaveAttribute(
			'style',
			/--fb-box-ml: 0/,
		);
		await expect(page.locator('[data-flyer-block="contact"]')).toHaveAttribute(
			'style',
			/--fb-box-mr: auto/,
		);

		const contactCard = page.locator('[data-contentless-notice]');
		const contactEmpty = (await page
			.locator('[data-flyer-block="contact"]')
			.evaluate((el) => !(el.textContent || '').trim())) as boolean;
		if (contactEmpty) {
			await expect(contactCard).toBeVisible();
			await expect(contactCard).toContainText(/no dibuja nada/i);
		} else {
			await expect(contactCard).toHaveCount(0);
		}
	});

	test('grabs the selected block by its edge to make it smaller and whole again', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await openEditorClean();
		await page.locator('[data-block="startTime"] button').first().click();

		// Both affordances appear on the selected block
		const block = page.locator('[data-flyer-block="startTime"]');
		await expect(block.locator('[data-move-handle]')).toBeVisible();
		const handle = block.locator('[data-resize-handle]');
		await expect(handle).toBeVisible();

		// Drag the edge left by ~28% of the column: the width lands snapped to 5%
		const columnWidth = (await page
			.locator('[data-flyer-slot="left"]')
			.evaluate((el) => el.clientWidth)) as number;
		const box = await handle.boundingBox();
		assert(box, 'resize handle has a bounding box');
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x - columnWidth * 0.28, box.y + box.height / 2, { steps: 8 });
		await page.mouse.up();
		await expect(block).toHaveAttribute('style', /width: (70|75)%/);

		// A shrunk block lines up by its own alignment (left: flush left)
		await expect(block).toHaveAttribute('style', /margin-left: 0/);
		await expect(block).toHaveAttribute('style', /margin-right: auto/);

		// Double-click on the edge restores the full width (stored as absent)
		await handle.dblclick();
		await expect(block).not.toHaveAttribute('style', /width: \d+%/);

		// Contact: born flat-right. Shrunk, it must hug the side its TEXT slot
		// is on — not drift to the centre between two alignment knobs
		await page.locator('[data-block="contact"] button').first().click();
		const contactBlock = page.locator('[data-flyer-block="contact"]');
		const contactHandle = contactBlock.locator('[data-resize-handle]');
		const contactColumnWidth = (await page
			.locator('[data-flyer-slot="right"]')
			.evaluate((el) => el.clientWidth)) as number;
		const contactBox = await contactHandle.boundingBox();
		assert(contactBox, 'contact handle has a bounding box');
		await page.mouse.move(contactBox.x + contactBox.width / 2, contactBox.y + contactBox.height / 2);
		await page.mouse.down();
		await page.mouse.move(contactBox.x - contactColumnWidth * 0.3, contactBox.y + contactBox.height / 2, {
			steps: 8,
		});
		await page.mouse.up();
		await expect(contactBlock).toHaveAttribute('style', /width: (70|75)%/);
		// Born right: the shrunk block hugs the RIGHT edge
		await expect(contactBlock).toHaveAttribute('style', /margin-left: auto/);
		await expect(contactBlock).toHaveAttribute('style', /margin-right: 0/);

		// TITLE → left flips the SAME knob the cards follow: block flush left
		const titleCardResize = page.locator('[data-font-slot-section="title"]').last();
		await titleCardResize.getByRole('button', { name: /título/i }).click();
		await titleCardResize.locator('[data-slot-align="title:left"]').click();
		await expect(contactBlock).toHaveAttribute('style', /margin-left: 0/);
		await expect(contactBlock).toHaveAttribute('style', /margin-right: auto/);

		// The cards reflow instead of spilling past the shrunk block: every
		// card's box stays inside the block's box
		const cardsInside = contactBlock.evaluate((el) => {
			const block = el.getBoundingClientRect();
			return [...el.querySelectorAll('.fb-stack > div')].every((card) => {
				const box = card.getBoundingClientRect();
				return (
					box.left >= block.left - 1 &&
					box.right <= block.right + 1 &&
					box.width <= block.width + 1
				);
			});
		});
		await expect(await cardsInside).toBe(true);
	});

	test('reads the artwork palette and offers it as swatches', async () => {
		test.skip(!!skipReason, skipReason ?? '');
		await openEditorClean();
		await page.locator('[data-palette-button]').click();
		const row = page.locator('[data-palette-row]');
		await expect(row).toBeVisible();
		// Five distinct colours out of the artwork, darkest first
		await expect(row.locator('span[style*="background-color"]')).toHaveCount(5);
	});
});
