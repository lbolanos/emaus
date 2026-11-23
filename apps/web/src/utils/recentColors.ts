import { ref, type Ref } from 'vue';

/**
 * Colours the coordinator picked recently, offered as one-click swatches in
 * the flyer editor's colour rows — picking the parish's amber once should not
 * mean typing the hex again on the next block.
 *
 * Persisted in localStorage per scope (text picks and icon picks live apart),
 * capped, most recent first. Disabled under vitest: cross-suite localStorage
 * pollution already bit the draft feature.
 */

/** Scopes kept apart on purpose — mixing them was the report. */
export type RecentColorScope = 'text' | 'icon';

const SCOPES: RecentColorScope[] = ['text', 'icon'];
const keyFor = (scope: RecentColorScope) => `emaus-flyer-recent-colors/${scope}`;
const CAP = 10;
const HEX = /^#[0-9a-fA-F]{6}$/;

function loadScope(scope: RecentColorScope): string[] {
	if (import.meta.env.MODE === 'test') return [];
	try {
		const raw = localStorage.getItem(keyFor(scope));
		const parsed = raw ? (JSON.parse(raw) as unknown) : [];
		// Hex only: the values land in a style binding, and an older build or a
		// hand edit can leave anything under the key
		return Array.isArray(parsed)
			? parsed.filter((c): c is string => typeof c === 'string' && HEX.test(c)).slice(0, CAP)
			: [];
	} catch {
		return [];
	}
}

/** One stable ref per scope — records re-render every swatch row. */
const refs = Object.fromEntries(
	SCOPES.map((scope) => [scope, ref<string[]>(loadScope(scope))]),
) as Record<RecentColorScope, Ref<string[]>>;

function persist(scope: RecentColorScope) {
	if (import.meta.env.MODE === 'test') return;
	try {
		localStorage.setItem(keyFor(scope), JSON.stringify(refs[scope].value));
	} catch {
		// Private mode/quota: the feature degrades to session-only
	}
}


/** Records a committed pick (deduped, most recent first, capped at 10). */
export function recordRecentColor(scope: RecentColorScope, hex: string) {
	if (!HEX.test(hex)) return;
	const list = refs[scope].value;
	refs[scope].value = [
		hex,
		...list.filter((c) => c.toLowerCase() !== hex.toLowerCase()),
	].slice(0, CAP);
	persist(scope);
}

/** The scope's list, as a stable ref the swatch rows can render. */
export function recentColors(scope: RecentColorScope): Ref<string[]> {
	return refs[scope];
}
