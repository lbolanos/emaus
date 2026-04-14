// Shared guard for chunk error reloads: max 3 total reloads per session,
// throttled to one every 30 seconds. Prevents infinite loops if the server
// is genuinely broken (not just stale cache). Re-entrancy latch prevents
// double-fire when both vite:preloadError and router.onError trigger
// for the same navigation failure in the same tick.

const THROTTLE_MS = 30_000;
const MAX_RELOADS = 3;

let _reloadInFlight = false;

export function shouldReloadForChunkError(): boolean {
	if (_reloadInFlight) return false;
	const now = Date.now();
	try {
		const lastReload = sessionStorage.getItem('chunk_error_reload_ts');
		const count = parseInt(sessionStorage.getItem('chunk_error_reload_count') || '0', 10);
		if (count >= MAX_RELOADS) return false;
		if (lastReload && now - parseInt(lastReload, 10) < THROTTLE_MS) return false;
		sessionStorage.setItem('chunk_error_reload_ts', String(now));
		sessionStorage.setItem('chunk_error_reload_count', String(count + 1));
	} catch {
		// sessionStorage unavailable (e.g. Safari Private Browsing) — fail safe
		return false;
	}
	// Set latch after sessionStorage writes succeed so a storage failure
	// does not permanently block future reload attempts.
	_reloadInFlight = true;
	return true;
}

export function isChunkLoadError(error: Error): boolean {
	return (
		error.message?.includes('Failed to fetch dynamically imported module') ||
		error.message?.includes('Importing a module script failed') ||
		error.message?.includes('error loading dynamically imported module') ||
		error.name === 'ChunkLoadError'
	);
}

/** Reset module state — only for tests */
export function _resetForTests(): void {
	_reloadInFlight = false;
}
