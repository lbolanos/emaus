import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';
import i18n from './i18n';
import { useAuthStore } from './stores/authStore';
import { initializeCsrfProtection } from './utils/csrf';
import { installRecaptcha } from './services/recaptcha';
import { loadGoogleMaps } from './utils/googleMaps';

import './assets/main.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(i18n);

// Install reCAPTCHA for bot protection on public forms
installRecaptcha(app);

const authStore = useAuthStore();

// Load Google Maps dynamically using runtime config key (supports window.EMAUS_RUNTIME_CONFIG)
loadGoogleMaps().catch((err) => console.error('[Maps]', err));

// Set up CSRF interceptors immediately (sync setup, async token fetch)
initializeCsrfProtection();

// Mount app immediately so public pages render without waiting for auth
app.mount('#app');

// Check auth status in background — router guard handles protected routes
authStore.checkAuthStatus().catch((err) => console.error('[Auth]', err));
