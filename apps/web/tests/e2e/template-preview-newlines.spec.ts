import { test, expect, Page, Locator } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Browser e2e for the WhatsApp-format template previews.
 *
 * The list previews used to collapse ALL whitespace to single spaces, so a
 * multi-line WhatsApp template read as one long running line. These specs pin
 * the fix in both views:
 *  - the preview keeps its newlines in the DOM and renders them as real lines
 *    (white-space: pre-line, more than one rendered line),
 *  - "Ver más" expands the retreat row with the full paragraph structure,
 *  - the search filter — which matches against the flattened text — still
 *    finds a phrase that spans a line break.
 *
 * Read-only: it never creates or edits templates, so it is safe against any
 * DB. It skips with a readable reason when there is no long multi-line
 * template to anchor on (e.g. a DB where the WhatsApp format migration has
 * not run — the old HTML templates have no newlines to preserve).
 */

const EMAIL = process.env.E2E_LOCAL_EMAIL;
const PASSWORD = process.env.E2E_LOCAL_PASSWORD;

/** Retreat table cell / global card preview, both fixed by the same change. */
const RETREAT_PREVIEW = 'div.line-clamp-3.whitespace-pre-line';
const GLOBAL_PREVIEW = 'p.line-clamp-3.whitespace-pre-line';

/** Element screenshots of the walkthrough, outside the repo on purpose. */
const SHOT_DIR = '/tmp/emaus-e2e-visual';

test.use({ locale: 'es-MX' });

interface PreviewInfo {
	index: number;
	text: string;
}

/** Index and full text of the first preview with real paragraph structure. */
async function firstMultilinePreview(page: Page, selector: string): Promise<PreviewInfo | null> {
	// Wait for the view to actually mount before reading the DOM — otherwise
	// the empty list makes every spec silently skip (false skip).
	await expect(page.locator(selector).first()).toBeVisible({ timeout: 20000 });
	const texts = await page.locator(selector).evaluateAll((els) =>
		els.map((el, index) => ({ index, text: el.textContent ?? '' })),
	);
	return (
		texts.find(
			(t) => (t.text.match(/\n/g) ?? []).length >= 3 && t.text.replace(/\n/g, ' ').length > 100,
		) ?? null
	);
}

/** Computed white-space and rendered line count of a preview element. */
async function renderedLines(el: Locator): Promise<{ whiteSpace: string; lines: number }> {
	return el.evaluate((node) => {
		const cs = getComputedStyle(node);
		return {
			whiteSpace: cs.whiteSpace,
			lines: Math.round(node.clientHeight / parseFloat(cs.lineHeight || '20')),
		};
	});
}

/**
 * True when the API itself serves a long multi-line message — i.e. the DB has
 * WhatsApp-formatted templates. This separates the two ways the anchor lookup
 * can come back empty: a DB without the format migration (legitimate skip)
 * vs. a rendering regression that flattened the newlines out of the DOM
 * (must fail, not skip — otherwise the spec is a false green).
 */
async function apiHasMultilineTemplate(page: Page, url: string): Promise<boolean> {
	const res = await page.request.get(url);
	if (!res.ok()) return false;
	const templates = (await res.json()) as { message?: string }[];
	return templates.some(
		(t) =>
			(t.message?.match(/\n/g) ?? []).length >= 3 &&
			(t.message ?? '').replace(/\n/g, ' ').length > 100,
	);
}

async function login(page: Page) {
	await page.goto('/login');
	await page.locator('input[type="email"]').fill(EMAIL!);
	await page.locator('input[type="password"]').fill(PASSWORD!);
	await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
	await page.waitForURL(/\/app/, { timeout: 20000 });
}

test.describe('Template previews keep WhatsApp line breaks', () => {
	test.beforeEach(async ({ page }) => {
		test.skip(!EMAIL || !PASSWORD, 'set E2E_LOCAL_EMAIL / E2E_LOCAL_PASSWORD');
		await page.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
	});

	test('retreat list renders multi-line previews and expands with the full structure', async ({
		page,
	}) => {
		await login(page);
		// Capture the retreat the view itself loads (no hardcoded retreat id).
		const listUrlPromise = page.waitForRequest(
			(r) => /\/api\/message-templates\?retreatId=/.test(r.url()),
			{ timeout: 20000 },
		);
		await page.goto('/app/settings/message-templates');

		const anchor = await firstMultilinePreview(page, RETREAT_PREVIEW);
		const apiUrl = (await listUrlPromise).url();
		const migrated = await apiHasMultilineTemplate(page, apiUrl);
		test.skip(
			!migrated,
			'no multi-line template in the active retreat (WhatsApp format migration not applied?)',
		);
		expect(
			anchor,
			'API serves multi-line messages but the list preview flattened the newlines',
		).toBeTruthy();

		const anchorEl = page.locator(RETREAT_PREVIEW).nth(anchor!.index);
		await expect(anchorEl).toBeVisible();

		const collapsed = await renderedLines(anchorEl);
		expect(collapsed.whiteSpace).toContain('pre-line');
		expect(collapsed.lines).toBeGreaterThan(1);

		// "Ver más" reveals the full message with its paragraph structure.
		const row = anchorEl.locator('xpath=ancestor::tr');
		await row.getByText('Ver más').click();
		const expanded = page.locator('div.whitespace-pre-wrap.font-mono').first();
		await expect(expanded).toBeVisible();
		const fullText = (await expanded.textContent()) ?? '';
		expect((fullText.match(/\n/g) ?? []).length).toBeGreaterThanOrEqual(3);
	});

	test('retreat search still matches text flattened across line breaks', async ({ page }) => {
		await login(page);
		const listUrlPromise = page.waitForRequest(
			(r) => /\/api\/message-templates\?retreatId=/.test(r.url()),
			{ timeout: 20000 },
		);
		await page.goto('/app/settings/message-templates');

		const anchor = await firstMultilinePreview(page, RETREAT_PREVIEW);
		const apiUrl = (await listUrlPromise).url();
		const migrated = await apiHasMultilineTemplate(page, apiUrl);
		test.skip(
			!migrated,
			'no multi-line template in the active retreat (WhatsApp format migration not applied?)',
		);
		expect(
			anchor,
			'API serves multi-line messages but the list preview flattened the newlines',
		).toBeTruthy();

		// A phrase joining the end of one line with the start of the next only
		// matches because the filter compares against the flattened text.
		const lines = anchor!.text
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);
		const phrase = `${lines[0].split(' ').pop()} ${lines[1].split(' ')[0]}`;

		const search = page.getByPlaceholder('Buscar variables...').first();
		await expect(search).toBeVisible();
		await search.fill(phrase);
		// hasText normalizes whitespace, so the multi-line cell matches the
		// single-space phrase.
		await expect(page.locator(RETREAT_PREVIEW).filter({ hasText: phrase }).first()).toBeVisible();

		await search.fill('zzz-no-existe-zzz');
		await expect(page.locator(RETREAT_PREVIEW)).toHaveCount(0);

		await search.fill('');
		await expect(page.locator(RETREAT_PREVIEW).first()).toBeVisible();
	});

	test('retreat editor loads a multi-line WhatsApp template without flattening it', async ({
		page,
	}) => {
		await login(page);
		const listUrlPromise = page.waitForRequest(
			(r) => /\/api\/message-templates\?retreatId=/.test(r.url()),
			{ timeout: 20000 },
		);
		await page.goto('/app/settings/message-templates');

		const anchor = await firstMultilinePreview(page, RETREAT_PREVIEW);
		const apiUrl = (await listUrlPromise).url();
		const migrated = await apiHasMultilineTemplate(page, apiUrl);
		test.skip(
			!migrated,
			'no multi-line template in the active retreat (WhatsApp format migration not applied?)',
		);
		expect(
			anchor,
			'API serves multi-line messages but the list preview flattened the newlines',
		).toBeTruthy();

		// Open the edit modal of the anchored row. Read-only: it reads the
		// editor and closes with Escape — it never saves.
		const row = page.locator(RETREAT_PREVIEW).nth(anchor!.index).locator('xpath=ancestor::tr');
		await row.locator('button[title="Editar"]').click();
		const dialog = page.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 10000 });

		// The edit surface keeps the newlines. The rich HTML editor parsed the
		// plain-text message as HTML and collapsed every \n into one running
		// paragraph (and re-serialized it flat on the first keystroke, which
		// destroyed the format on save); plain-text templates must edit in a
		// surface that round-trips the content untouched.
		const editor = dialog.locator('textarea').first();
		await expect(editor).toBeVisible({ timeout: 10000 });
		const value = await editor.inputValue();
		expect(
			(value.match(/\n/g) ?? []).length,
			'edit surface flattened the newlines of a WhatsApp-format template',
		).toBeGreaterThanOrEqual(3);

		// The preview tab renders the paragraph structure too (pre-line, not
		// v-html collapsing).
		await dialog.getByRole('tab', { name: 'Vista Previa' }).click();
		const preview = dialog.locator('.preview-content.whitespace-pre-line');
		await expect(preview).toBeVisible({ timeout: 10000 });
		const previewText = (await preview.textContent()) ?? '';
		expect(
			(previewText.match(/\n/g) ?? []).length,
			'preview tab flattened the newlines of a WhatsApp-format template',
		).toBeGreaterThanOrEqual(3);

		await page.keyboard.press('Escape');
	});

	test('global template cards render multi-line previews', async ({ page }) => {
		await login(page);
		await page.goto('/app/settings/global-message-templates');

		const anchor = await firstMultilinePreview(page, GLOBAL_PREVIEW);
		const migrated = await apiHasMultilineTemplate(page, '/api/global-message-templates');
		test.skip(!migrated, 'no multi-line global template (format migration not applied?)');
		expect(
			anchor,
			'API serves multi-line globals but the card preview flattened the newlines',
		).toBeTruthy();

		const collapsed = await renderedLines(page.locator(GLOBAL_PREVIEW).nth(anchor!.index));
		expect(collapsed.whiteSpace).toContain('pre-line');
		expect(collapsed.lines).toBeGreaterThan(1);
	});

	// Walks every surface the coordinator looks at, asserts the paragraph
	// structure on each, and drops element screenshots in /tmp/emaus-e2e-visual
	// as human-checkable evidence. Read-only: it never saves a template.
	test('visual walkthrough: every surface keeps the paragraph structure', async ({
		page,
	}) => {
		mkdirSync(SHOT_DIR, { recursive: true });
		const shot = (name: string) => `${SHOT_DIR}/${name}.png`;

		await login(page);
		const listUrlPromise = page.waitForRequest(
			(r) => /\/api\/message-templates\?retreatId=/.test(r.url()),
			{ timeout: 20000 },
		);
		await page.goto('/app/settings/message-templates');

		const anchor = await firstMultilinePreview(page, RETREAT_PREVIEW);
		const apiUrl = (await listUrlPromise).url();
		const migrated = await apiHasMultilineTemplate(page, apiUrl);
		test.skip(
			!migrated,
			'no multi-line template in the active retreat (WhatsApp format migration not applied?)',
		);
		expect(anchor, 'list preview flattened the newlines').toBeTruthy();

		// 1. Retreat list: collapsed cell renders >1 real line.
		const cell = page.locator(RETREAT_PREVIEW).nth(anchor!.index);
		const collapsedCell = await renderedLines(cell);
		expect(collapsedCell.whiteSpace).toContain('pre-line');
		expect(collapsedCell.lines).toBeGreaterThan(1);
		await cell.locator('xpath=ancestor::tr').screenshot({ path: shot('1-retiro-lista-colapsada') });

		// 2. Same row expanded via "Ver más": full structure with its newlines.
		const row = cell.locator('xpath=ancestor::tr');
		await row.getByText('Ver más').click();
		const expanded = page.locator('div.whitespace-pre-wrap.font-mono').first();
		await expect(expanded).toBeVisible();
		const fullText = (await expanded.textContent()) ?? '';
		expect((fullText.match(/\n/g) ?? []).length).toBeGreaterThanOrEqual(3);
		await expanded.screenshot({ path: shot('2-retiro-fila-expandida') });

		// 3. Editor: the anchored template opens with its newlines intact.
		await row.getByText('Ver menos').click();
		const editRow = page.locator(RETREAT_PREVIEW).nth(anchor!.index).locator('xpath=ancestor::tr');
		await editRow.locator('button[title="Editar"]').click();
		const dialog = page.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 10000 });
		const editor = dialog.locator('textarea').first();
		await expect(editor).toBeVisible({ timeout: 10000 });
		const value = await editor.inputValue();
		expect((value.match(/\n/g) ?? []).length).toBeGreaterThanOrEqual(3);
		await editor.screenshot({ path: shot('3-editor-textarea') });

		// 4. Preview tab: renders the resolved message as real lines.
		await dialog.getByRole('tab', { name: 'Vista Previa' }).click();
		const preview = dialog.locator('.preview-content.whitespace-pre-line');
		await expect(preview).toBeVisible({ timeout: 10000 });
		const previewText = (await preview.textContent()) ?? '';
		expect((previewText.match(/\n/g) ?? []).length).toBeGreaterThanOrEqual(3);
		const previewBox = await preview.boundingBox();
		await page.screenshot({
			path: shot('4-editor-vista-previa'),
			clip: previewBox ?? undefined,
		});
		await page.keyboard.press('Escape');

		// 5. Global cards: same paragraph structure in the grid preview.
		await page.goto('/app/settings/global-message-templates');
		const globalAnchor = await firstMultilinePreview(page, GLOBAL_PREVIEW);
		const globalMigrated = await apiHasMultilineTemplate(page, '/api/global-message-templates');
		test.skip(!globalMigrated, 'no multi-line global template (format migration not applied?)');
		expect(globalAnchor, 'global card preview flattened the newlines').toBeTruthy();
		const cardEl = page
			.locator(GLOBAL_PREVIEW)
			.nth(globalAnchor!.index)
			.locator('xpath=ancestor::div[contains(@class,"shadow-md")][1]');
		await cardEl.screenshot({ path: shot('5-globales-card') });
	});
});
