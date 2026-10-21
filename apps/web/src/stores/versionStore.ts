import { defineStore } from 'pinia';
import { ref } from 'vue';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SKIPPED_VERSION_KEY = 'version_update_skipped';

/**
 * Hooks the service worker registration hands to the store (src/pwa/registerSw.ts).
 * With a service worker the page is served from its precache, so a plain reload
 * keeps showing the old version: the update has to go through the waiting worker.
 */
export interface ServiceWorkerHooks {
	/** Ask the browser to fetch sw.js again and install a new version if there is one. */
	checkForUpdate: () => Promise<void>;
	/** Activate the waiting worker and reload. Resolves false if there was nothing to activate. */
	applyUpdate: () => Promise<boolean>;
}

export const useVersionStore = defineStore('version', () => {
	const updateAvailable = ref(false);
	const dismissed = ref(false);
	const detectedVersion = ref<string | null>(null);

	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let serviceWorker: ServiceWorkerHooks | null = null;

	function attachServiceWorker(hooks: ServiceWorkerHooks) {
		serviceWorker = hooks;
	}

	/** A new service worker finished installing and waits for the user to accept it. */
	function markServiceWorkerWaiting() {
		updateAvailable.value = true;
	}

	async function checkVersion() {
		try {
			// cache-busting query param + fetch option to bypass any browser cache
			const response = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' });
			if (!response.ok) return;
			const data: { version?: string } = await response.json();
			if (data.version && data.version !== __APP_VERSION__) {
				// Don't show the banner again if user already clicked update for this version
				try {
					if (sessionStorage.getItem(SKIPPED_VERSION_KEY) === data.version) return;
				} catch {
					// sessionStorage unavailable — continue showing
				}
				detectedVersion.value = data.version;
				updateAvailable.value = true;
				// Start installing the new service worker now, so that by the time the
				// user clicks "Actualizar" it is usually already waiting.
				serviceWorker?.checkForUpdate().catch(() => {});
			}
		} catch {
			// Network errors are silently ignored — next poll will retry
		}
	}

	function handleVisibilityChange() {
		if (!document.hidden) {
			checkVersion();
		}
	}

	function startPolling() {
		if (pollTimer !== null) return; // already running
		checkVersion();
		pollTimer = setInterval(checkVersion, POLL_INTERVAL_MS);
		document.addEventListener('visibilitychange', handleVisibilityChange);
	}

	function stopPolling() {
		if (pollTimer !== null) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
		document.removeEventListener('visibilitychange', handleVisibilityChange);
	}

	function dismiss() {
		dismissed.value = true;
	}

	/** Mark detected server version as seen before reloading */
	async function reloadForUpdate() {
		try {
			if (detectedVersion.value) {
				sessionStorage.setItem(SKIPPED_VERSION_KEY, detectedVersion.value);
			}
		} catch {
			// best-effort
		}
		if (serviceWorker) {
			try {
				// On success the worker takes control and the page reloads itself.
				if (await serviceWorker.applyUpdate()) return;
			} catch {
				// fall through to a plain reload
			}
		}
		window.location.reload();
	}

	return {
		updateAvailable,
		dismissed,
		detectedVersion,
		startPolling,
		stopPolling,
		dismiss,
		reloadForUpdate,
		attachServiceWorker,
		markServiceWorkerWaiting,
	};
});
