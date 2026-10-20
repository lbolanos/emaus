/**
 * Guard against the recurring page freeze: a `DropdownMenuItem` whose handler
 * opens a reka-ui overlay (Dialog / AlertDialog / Sheet / Drawer of `@repo/ui`)
 * or calls `window.print` on this page, without going through
 * `useRekaDialogFix().deferOpen`, leaves `pointer-events: none` orphaned on
 * <body> when the menu closes — the page looks dead until reload.
 *
 * Mounted-component tests cannot catch this: the global `@repo/ui` mock in
 * `src/test/setup.ts` renders menus without any of reka-ui's side effects.
 * Like `repoUiToggleApi.test.ts`, this guard scans the source instead.
 *
 * Two rules:
 *  - PRINT: an item whose handler mentions `print` must defer. `window.print`
 *    on this page is blocked by the same body lock as a dialog. Handlers that
 *    print through a NEW window (`window.open` + `win.print()`, the
 *    usePrintableDocument pattern) are exempt — the dialog runs in the other
 *    window — and are allowlisted below.
 *  - OVERLAY: an item whose handler opens something (`ref = true` assignment
 *    or a Dialog/Modal-named call) must defer, unless the target overlay is a
 *    custom `<Teleport>` modal — those never touch reka's body lock. Each
 *    Teleport is allowlisted with its file; delete the entry when the dialog
 *    migrates to `DialogContent`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

const collectVueFiles = (dir: string, found: string[] = []): string[] => {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) collectVueFiles(full, found);
		else if (entry.endsWith('.vue')) found.push(full);
	}
	return found;
};

// file (relative to apps/web/src) :: exact @click expression
const TELEPORT_ALLOWLIST = new Set([
	// Custom <Teleport> modals — reka's body lock never applies to them.
	'views/TablesView.vue::isClearAllDialogOpen = true',
	'views/TablesView.vue::isDeleteEmptyDialogOpen = true',
	'views/TablesView.vue::isHelpOpen = true',
	'views/TablesView.vue::isLotteryCardsOpen = true',
	'views/TablesView.vue::isRebalanceDialogOpen = true',
	'components/layout/Sidebar.vue::isHelpPanelOpen = true',
	// openEditModal only flips isFormModalOpen, a custom <Teleport> modal.
	'views/CommunityListView.vue::openEditModal(community)',
]);

const NEW_WINDOW_PRINT_ALLOWLIST = new Set([
	// printMap builds its own window (window.open + win.print()); the print
	// dialog runs in that window, not over this page's body lock.
	'components/HouseBedMap.vue::printMap',
]);

const menuItemClicks = (): { id: string; tag: string }[] => {
	const items: { id: string; tag: string }[] = [];
	for (const file of collectVueFiles(resolve(__dirname, '..'))) {
		const rel = file.split('/apps/web/src/')[1] ?? file;
		const source = readFileSync(file, 'utf-8');
		const tags = source.match(/<DropdownMenuItem\b[^>]*>/gs) ?? [];
		for (const tag of tags) {
			const click = tag.match(/@click\s*=\s*"([^"]*)"/)?.[1];
			if (click) items.push({ id: `${rel}::${click}`, tag });
		}
	}
	return items;
};

describe('DropdownMenuItem actions that can freeze the page', () => {
	it('finds .vue files to scan', () => {
		expect(collectVueFiles(resolve(__dirname, '..')).length).toBeGreaterThan(50);
	});

	it('defers (or allowlists) every print / overlay-opening menu item', () => {
		const offenders: string[] = [];
		for (const { id, tag } of menuItemClicks()) {
			const click = id.split('::')[1];
			if (click.includes('deferOpen')) continue;
			const prints = /print/i.test(click);
			const opensOverlay = /=\s*true\b/.test(click) || /Dialog|Modal/i.test(click);
			if (!prints && !opensOverlay) continue;
			if (prints && NEW_WINDOW_PRINT_ALLOWLIST.has(id)) continue;
			if (opensOverlay && TELEPORT_ALLOWLIST.has(id)) continue;
			offenders.push(`${id} → ${tag.replace(/\s+/g, ' ').slice(0, 90)}`);
		}
		expect(offenders).toEqual([]);
	});

	it('keeps every allowlist entry pointing at a still-raw item', () => {
		// Only items WITHOUT deferOpen count: once an allowlisted item is
		// migrated to deferOpen its entry is stale and must be removed.
		const raw = new Set(menuItemClicks().filter(i => !i.id.split('::')[1].includes('deferOpen')).map(i => i.id));
		for (const id of [...TELEPORT_ALLOWLIST, ...NEW_WINDOW_PRINT_ALLOWLIST]) {
			expect(raw.has(id), `stale allowlist entry: ${id}`).toBe(true);
		}
	});
});
