import axios from 'axios';

let csrfToken: string | null = null;

/**
 * Obtiene un token CSRF del servidor
 */
export async function fetchCsrfToken(): Promise<string> {
	try {
		const response = await axios.get('/api/csrf-token', {
			withCredentials: true,
		});
		csrfToken = response.data.csrfToken || '';
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
	if (!csrfToken) {
		return await fetchCsrfToken();
	}
	return csrfToken;
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
export function setupCsrfInterceptor() {
	axios.interceptors.request.use(
		async (config) => {
			// Solo agregar token a peticiones que modifican datos
			if (['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase() || '')) {
				const token = await getCsrfToken();
				config.headers['X-CSRF-Token'] = token;
			}
			return config;
		},
		(error) => {
			return Promise.reject(error);
		},
	);

	// Manejar errores CSRF
	axios.interceptors.response.use(
		(response) => response,
		(error) => {
			if (error.response?.status === 403 && error.response?.data?.error === 'CSRF_TOKEN_INVALID') {
				console.error('CSRF token inválido, obteniendo nuevo token...');
				csrfToken = null; // Forzar nueva obtención
				// Opcional: reintentar la petición automáticamente
				return fetchCsrfToken().then(() => {
					return axios.request(error.config);
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
	setupCsrfInterceptor();

	// Obtener token inicial
	fetchCsrfToken().catch(console.error);
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
