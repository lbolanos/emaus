import axios from 'axios';

let csrfToken: string | null = null;

// Configurar Axios con la URL base de la API
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
axios.defaults.baseURL = apiUrl;
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

/**
 * Obtiene el token CSRF actual o lo obtiene si no existe
 */
export async function getCsrfToken(): Promise<string> {
	// Always fetch a fresh token to avoid using stale tokens
	return await fetchCsrfToken();
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

				// Reintentar la petición automáticamente con nuevo token
				return fetchCsrfToken()
					.then(() => {
						const originalRequest = error.config;
						originalRequest.headers['X-CSRF-Token'] = csrfToken;
						return axios.request(originalRequest);
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
	const initializeSessionAndCsrf = async () => {
		try {
			// Hacer una petición simple para establecer sesión
			await axios.get('/auth/status', { withCredentials: true });

			// Ahora obtener el token CSRF
			await fetchCsrfToken();
		} catch (error) {
			// El endpoint /auth/status ahora es público, pero puede devolver no autenticado
			// Eso está bien, solo necesitamos establecer la sesión y obtener el token CSRF
			console.warn('Auth status check failed, proceeding with CSRF token fetch:', error);

			// Intentar obtener el token CSRF de todos modos
			try {
				await fetchCsrfToken();
			} catch (csrfError) {
				console.error('Error obteniendo token CSRF:', csrfError);
				// Reintentar después de un breve retraso
				setTimeout(() => {
					initializeSessionAndCsrf().catch(console.error);
				}, 1000);
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
