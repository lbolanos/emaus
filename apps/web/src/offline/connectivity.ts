import { reactive } from 'vue';
import { isNetworkError as isNoResponse } from '@/services/apiError';

/**
 * Whether the app can reach the server right now (specs/offline-mode, D10).
 *
 * `navigator.onLine` is not trusted for "online": at the retreat house the phone
 * is often on a Wi-Fi with no way out. The state comes from what actually happens
 * to requests: a network error or a timeout → offline; any HTTP answer → online.
 * The browser's `offline` event is trusted (airplane mode really means offline);
 * its `online` event only triggers a probe.
 */

export interface ConnectivityState {
	online: boolean;
	/** Last time a request got an answer from the server. */
	lastOnlineAt: number | null;
	/** Oldest `fetchedAt` among the saved answers shown since the signal was lost. */
	oldestServedFromCacheAt: number | null;
	/** A view asked for data that was never saved on this device. */
	missedWhileOffline: boolean;
}

export const connectivity = reactive<ConnectivityState>({
	online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
	lastOnlineAt: null,
	oldestServedFromCacheAt: null,
	missedWhileOffline: false,
});

type Listener = () => void;
const reconnectListeners = new Set<Listener>();

export function reportSuccess(now: number = Date.now()): void {
	const wasOffline = !connectivity.online;
	connectivity.online = true;
	connectivity.lastOnlineAt = now;
	if (wasOffline) {
		connectivity.oldestServedFromCacheAt = null;
		connectivity.missedWhileOffline = false;
		reconnectListeners.forEach((fn) => fn());
	}
}

export function reportNetworkFailure(): void {
	connectivity.online = false;
}

export function reportServedFromCache(fetchedAt: number): void {
	if (
		connectivity.oldestServedFromCacheAt === null ||
		fetchedAt < connectivity.oldestServedFromCacheAt
	) {
		connectivity.oldestServedFromCacheAt = fetchedAt;
	}
}

export function reportMissingOfflineData(): void {
	connectivity.missedWhileOffline = true;
}

/** Called when the connection comes back (the outbox sync hooks in here, M4). */
export function onReconnect(fn: Listener): () => void {
	reconnectListeners.add(fn);
	return () => reconnectListeners.delete(fn);
}

/**
 * Cheap reachability check: any HTTP answer from our own origin counts.
 * version.json is tiny and never cached by nginx.
 */
export async function probe(timeoutMs = 5000): Promise<boolean> {
	const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
	const timer = setTimeout(() => controller?.abort(), timeoutMs);
	try {
		await fetch(`/version.json?_=${Date.now()}`, {
			cache: 'no-store',
			signal: controller?.signal,
		});
		reportSuccess();
		return true;
	} catch {
		reportNetworkFailure();
		return false;
	} finally {
		clearTimeout(timer);
	}
}

let listening = false;

/** Wires the browser events once (AppLayout). */
export function startConnectivityListeners(): void {
	if (listening || typeof window === 'undefined') return;
	listening = true;
	window.addEventListener('offline', () => reportNetworkFailure());
	window.addEventListener('online', () => {
		void probe();
	});
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden && !connectivity.online) void probe();
	});
}

/**
 * A failure that means "no connection", not "the server said no" — the existing
 * axios check of apiError.ts, minus requests the app cancelled on purpose.
 */
export function isNetworkError(error: unknown): boolean {
	return isNoResponse(error) && (error as { code?: string }).code !== 'ERR_CANCELED';
}

/** Only for tests. */
export function _resetConnectivityForTests(online = true): void {
	connectivity.online = online;
	connectivity.lastOnlineAt = null;
	connectivity.oldestServedFromCacheAt = null;
	connectivity.missedWhileOffline = false;
	reconnectListeners.clear();
}
