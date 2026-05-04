import axios from 'axios';
import { getApiUrl } from '@/config/runtimeConfig';

let csrfToken: string | null = null;

// Configurar Axios con la URL base de la API (runtime)
axios.defaults.baseURL = getApiUrl();
axios.defaults.withCredentials = true;

/**
 * Obtiene un token CSRF del servidor
 */
export async function fetchCsrfToken(): Promise<string> {
	try {
		const response = await axios.get('/csrf-token');
		// Prioritize header token over body token since headers are set by middleware
		const headerToken = response.headers['x-csrf-token'];
		const bodyToken = response.data.csrfToken;
		csrfToken = headerToken || bodyToken || '';
		return csrfToken || '';
	} catch (error) {
		console.error('Error fetching CSRF token:', error);
		throw error;
	}
}

// Cache the token for up to 10 minutes to avoid fetching on every mutating request
let csrfTokenTimestamp = 0;
const CSRF_TOKEN_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Obtiene el token CSRF actual (cached) o lo obtiene si expiró/no existe
 */
export async function getCsrfToken(): Promise<string> {
	if (csrfToken && Date.now() - csrfTokenTimestamp < CSRF_TOKEN_TTL) {
		return csrfToken;
	}
	const token = await fetchCsrfToken();
	csrfTokenTimestamp = Date.now();
	return token;
}

/**
 * Configura los headers CSRF para una petición
 */
export async function setupCsrfHeaders(
	headers: Record<string, string> = {},
): Promise<Record<string, string>> {
	const token = await getCsrfToken();
	return {
		...headers,
		'X-CSRF-Token': token,
	};
}

/**
 * Interceptor de Axios para agregar automáticamente tokens CSRF
 */
export function setupCsrfInterceptor(axiosInstance: any = axios) {
	axiosInstance.interceptors.request.use(
		async (config: any) => {
			// Solo agregar token a peticiones que modifican datos
			if (['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase() || '')) {
				try {
					const token = await getCsrfToken();
					if (token) {
						config.headers['X-CSRF-Token'] = token;
					}
				} catch (error) {
					console.warn('No se pudo obtener el token CSRF:', error);
				}
			}
			return config;
		},
		(error: any) => {
			return Promise.reject(error);
		},
	);

	// Manejar errores CSRF
	axiosInstance.interceptors.response.use(
		(response: any) => response,
		(error: any) => {
			if (
				error.response?.status === 403 &&
				(error.response?.data?.error === 'CSRF_TOKEN_INVALID' ||
					error.response?.data?.error === 'CSRF_TOKEN_REQUIRED')
			) {
				console.error('Error de CSRF, obteniendo nuevo token...');
				csrfToken = null; // Forzar nueva obtención
				csrfTokenTimestamp = 0;

				// Reintentar la petición automáticamente con nuevo token
				return fetchCsrfToken()
					.then(() => {
						csrfTokenTimestamp = Date.now();
						const originalRequest = error.config;
						originalRequest.headers['X-CSRF-Token'] = csrfToken;
						// Use the same axios instance (with baseURL and credentials)
						return axiosInstance.request(originalRequest);
					})
					.catch((fetchError) => {
						console.error('No se pudo obtener nuevo token CSRF:', fetchError);
						return Promise.reject(error);
					});
			}
			return Promise.reject(error);
		},
	);
}

/**
 * Inicializa la protección CSRF
 */
export function initializeCsrfProtection() {
	setupCsrfInterceptor(axios);

	// Primero establecer sesión con una petición simple, luego obtener CSRF token
	const initializeSessionAndCsrf = async (attempt = 0) => {
		const MAX_ATTEMPTS = 5;
		if (attempt >= MAX_ATTEMPTS) return;
		try {
			await axios.get('/auth/status', { withCredentials: true });
			await fetchCsrfToken();
		} catch (error) {
			console.warn('Auth status check failed, proceeding with CSRF token fetch:', error);
			try {
				await fetchCsrfToken();
			} catch (csrfError) {
				console.error('Error obteniendo token CSRF:', csrfError);
				// Exponential backoff: 2s, 4s, 8s, 16s
				const delay = Math.min(2000 * Math.pow(2, attempt), 30_000);
				setTimeout(() => {
					initializeSessionAndCsrf(attempt + 1).catch(console.error);
				}, delay);
			}
		}
	};

	initializeSessionAndCsrf();
}

/**
 * Función para agregar CSRF a formularios HTML tradicionales
 */
export function addCsrfToForm(form: HTMLFormElement): void {
	if (!csrfToken) return;

	// Buscar input CSRF existente
	let csrfInput = form.querySelector('input[name="_csrf"]') as HTMLInputElement;

	if (!csrfInput) {
		csrfInput = document.createElement('input');
		csrfInput.type = 'hidden';
		csrfInput.name = '_csrf';
		form.appendChild(csrfInput);
	}

	csrfInput.value = csrfToken;
}
