// Prevent double-boot (Safari can evaluate entry module twice via different URLs)
if ((window as any).__EMAUS_BOOTED) {
	// skip
} else {
	(window as any).__EMAUS_BOOTED = true;

	(async function boot() {
		await import('./assets/main.css');
		const { createApp } = await import('vue');
		const { createPinia } = await import('pinia');
		const App = (await import('./App.vue')).default;
		const router = (await import('./router')).default;
		const i18n = (await import('./i18n')).default;
		const { useAuthStore } = await import('./stores/authStore');
		const { initializeCsrfProtection } = await import('./utils/csrf');
		const { installRecaptcha } = await import('./services/recaptcha');
		const { loadGoogleMaps } = await import('./utils/googleMaps');

		const app = createApp(App);
		const pinia = createPinia();

		app.use(pinia);
		app.use(router);
		app.use(i18n);

		installRecaptcha(app);

		const authStore = useAuthStore();

		// Global handler for uncaught errors in component setup/render. The
		// blank-page-after-login bug was caused by `useRoute()` injection
		// failing on first paint when navigation hadn't yet committed; a
		// component setup throws → Vue silently leaves the page blank. Below
		// we (a) await router.isReady() before mounting (root cause fix) and
		// (b) keep this handler as a defensive log + auto-reload safety net
		// for any *other* setup error that surfaces in production.
		app.config.errorHandler = (err, _instance, info) => {
			console.error('[Vue errorHandler]', info, err);
			const w = window as any;
			if (!w.__EMAUS_BOOT_RECOVERED && info === 'setup function') {
				w.__EMAUS_BOOT_RECOVERED = true;
				console.warn('[Vue errorHandler] setup-function error during first paint, forcing reload');
				setTimeout(() => window.location.reload(), 50);
			}
		};

		loadGoogleMaps().catch((err) => console.error('[Maps]', err));
		initializeCsrfProtection();

		// Wait for the router to resolve the initial navigation before
		// mounting. Without this, components that call `useRoute()` at
		// `<script setup>` top-level (e.g. AppLayout, RetreatDashboardView)
		// race with the router's first `push/replace` and the inject of
		// `Symbol(route location)` returns undefined → setup throws →
		// blank page until manual reload.
		await router.isReady();

		app.mount('#app');

		// Check auth status in background — router guard handles protected routes
		authStore.checkAuthStatus().catch((err) => console.error('[Auth]', err));
	})();
}
