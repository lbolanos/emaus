import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The manager caches the resolved config on its singleton, so every case needs
// a fresh module. In vitest import.meta.env is a live object (Vite never
// statically replaces it here), which is exactly what lets vi.stubEnv prove
// that VITE_API_URL is actually read.
const loadFreshModule = async () => {
	vi.resetModules();
	return import('../runtimeConfig');
};

describe('runtimeConfig — VITE_API_URL resolution', () => {
	beforeEach(() => {
		delete (window as { EMAUS_RUNTIME_CONFIG?: unknown }).EMAUS_RUNTIME_CONFIG;
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('honors VITE_API_URL when there is no runtime injection', async () => {
		// Regression: this used to fall through to the localhost default because
		// the import_meta shim was never assigned in the browser.
		vi.stubEnv('VITE_API_URL', 'http://localhost:3091/api');
		const { getApiUrl } = await loadFreshModule();

		expect(getApiUrl()).toBe('http://localhost:3091/api');
	});

	it('falls back to the development default without env var or injection', async () => {
		// happy-dom runs at http://localhost/ → environment resolves to
		// development → default API on the dev port. Vitest loads the local
		// apps/web/.env* files, so the "no env var" premise has to be stubbed:
		// the dev start script writes VITE_API_URL to .env.local and a local
		// .env may set it too.
		vi.stubEnv('VITE_API_URL', '');
		const { getApiUrl } = await loadFreshModule();

		expect(getApiUrl()).toBe('http://localhost:3084/api');
	});

	it('keeps runtime-injected config winning over VITE_API_URL', async () => {
		vi.stubEnv('VITE_API_URL', 'http://localhost:3091/api');
		(window as { EMAUS_RUNTIME_CONFIG?: { apiUrl: string } }).EMAUS_RUNTIME_CONFIG = {
			apiUrl: 'https://injected.test/api',
		};
		const { getApiUrl } = await loadFreshModule();

		expect(getApiUrl()).toBe('https://injected.test/api');
	});

	it('exposes build-time keys for maps and recaptcha', async () => {
		vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'AIza-test-key');
		vi.stubEnv('VITE_RECAPTCHA_SITE_KEY', 'site-key-test');
		const { getGoogleMapsApiKey, getRecaptchaSiteKey } = await loadFreshModule();

		expect(getGoogleMapsApiKey()).toBe('AIza-test-key');
		expect(getRecaptchaSiteKey()).toBe('site-key-test');
	});
});
