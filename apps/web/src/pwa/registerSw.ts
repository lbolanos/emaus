import { Workbox } from 'workbox-window';
import { isOfflineModeEnabled } from '@/offline/flag';
import { useVersionStore } from '@/stores/versionStore';

/**
 * Service worker registration for the offline app shell (specs/offline-mode, M1).
 *
 * Loaded with a dynamic `import()` from AppLayout once the app is mounted, so it
 * never runs on public pages and adds nothing to the boot chain (Safari iOS has
 * a short stack for module evaluation).
 *
 * Updates never activate on their own (registerType 'prompt'): a new worker
 * waits until the user clicks "Actualizar" in the existing UpdateBanner, so the
 * chunks of an open view never change underneath it.
 */

const SW_URL = '/sw.js';
/** How long "Actualizar" waits for a new worker that is still installing. */
const WAIT_FOR_INSTALL_MS = 20_000;
const CACHE_PREFIXES = ['workbox-', 'emaus-'];

let registered = false;

export async function unregisterServiceWorkers(): Promise<void> {
	const registrations = await navigator.serviceWorker.getRegistrations();
	await Promise.all(registrations.map((r) => r.unregister()));
	if (typeof caches === 'undefined') return;
	const keys = await caches.keys();
	await Promise.all(
		keys
			.filter((key) => CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
			.map((key) => caches.delete(key)),
	);
}

export async function registerServiceWorker(options: { isProduction?: boolean } = {}): Promise<void> {
	if (registered) return;
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

	if (!isOfflineModeEnabled()) {
		await unregisterServiceWorkers().catch(() => {});
		return;
	}

	// The dev server does not serve sw.js; registering would only log a 404.
	const isProduction = options.isProduction ?? import.meta.env.PROD;
	if (!isProduction) return;

	registered = true;
	const wb = new Workbox(SW_URL, { scope: '/' });
	const versionStore = useVersionStore();

	let waiting = false;
	const waitingListeners: Array<() => void> = [];
	wb.addEventListener('waiting', () => {
		waiting = true;
		versionStore.markServiceWorkerWaiting();
		waitingListeners.splice(0).forEach((resolve) => resolve());
	});

	const waitForInstall = () =>
		new Promise<boolean>((resolve) => {
			if (waiting) return resolve(true);
			const timer = setTimeout(() => resolve(waiting), WAIT_FOR_INSTALL_MS);
			waitingListeners.push(() => {
				clearTimeout(timer);
				resolve(true);
			});
		});

	versionStore.attachServiceWorker({
		checkForUpdate: async () => {
			await wb.update();
		},
		applyUpdate: async () => {
			if (!waiting) {
				await wb.update().catch(() => {});
				if (!(await waitForInstall())) return false;
			}
			wb.addEventListener('controlling', () => window.location.reload());
			wb.messageSkipWaiting();
			return true;
		},
	});

	try {
		await wb.register();
	} catch (error) {
		registered = false;
		console.warn('[PWA] service worker registration failed', error);
	}
}

/** Reset module state — only for tests. */
export function _resetForTests(): void {
	registered = false;
}
