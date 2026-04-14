import { defineStore } from 'pinia';
import { ref } from 'vue';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SKIPPED_VERSION_KEY = 'version_update_skipped';

export const useVersionStore = defineStore('version', () => {
	const updateAvailable = ref(false);
	const dismissed = ref(false);
	const detectedVersion = ref<string | null>(null);

	let pollTimer: ReturnType<typeof setInterval> | null = null;

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
	function reloadForUpdate() {
		try {
			if (detectedVersion.value) {
				sessionStorage.setItem(SKIPPED_VERSION_KEY, detectedVersion.value);
			}
		} catch {
			// best-effort
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
	};
});
