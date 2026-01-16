import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';
import i18n from './i18n';
import { useAuthStore } from './stores/authStore';
import { initializeCsrfProtection } from './utils/csrf';
import { installRecaptcha } from './services/recaptcha';

import './assets/main.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(i18n);

// Install reCAPTCHA for bot protection on public forms
installRecaptcha(app);

const authStore = useAuthStore();

// Inicializar protección CSRF después de verificar autenticación
authStore.checkAuthStatus().then(() => {
	// Inicializar protección CSRF después de establecer sesión
	initializeCsrfProtection();
	app.mount('#app');
});
