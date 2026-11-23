import { ref } from 'vue';

/**
 * Colours the coordinator picked recently, offered as one-click swatches in
 * every colour row of the flyer editor — picking the parish's amber once
 * should not mean typing the hex again on the next block.
 *
 * Persisted in localStorage, capped, most recent first. Disabled under
 * vitest: cross-suite localStorage pollution already bit the draft feature.
 */

const KEY = 'emaus-flyer-recent-colors';
const CAP = 8;

const recent = ref<string[]>(load());

function load(): string[] {
	if (import.meta.env.MODE === 'test') return [];
	try {
		const raw = localStorage.getItem(KEY);
		const parsed = raw ? (JSON.parse(raw) as unknown) : [];
		return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
	} catch {
		return [];
	}
}

function persist() {
	if (import.meta.env.MODE === 'test') return;
	try {
		localStorage.setItem(KEY, JSON.stringify(recent.value));
	} catch {
		// Private mode/quota: the feature degrades to session-only
	}
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Records a picked colour (deduped, most recent first, capped). */
export function recordRecentColor(hex: string) {
	if (!HEX.test(hex)) return;
	recent.value = [hex, ...recent.value.filter((c) => c.toLowerCase() !== hex.toLowerCase())].slice(
		0,
		CAP,
	);
	persist();
}

/** The list to render as swatches. */
export function recentColors() {
	return recent;
}
