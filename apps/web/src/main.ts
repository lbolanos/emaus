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

		loadGoogleMaps().catch((err) => console.error('[Maps]', err));
		initializeCsrfProtection();

		app.mount('#app');

		// Check auth status in background — router guard handles protected routes
		authStore.checkAuthStatus().catch((err) => console.error('[Auth]', err));
	})();
}
