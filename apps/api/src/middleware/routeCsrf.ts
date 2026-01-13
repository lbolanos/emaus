import { csrfMiddleware } from './csrfAlternative';
import { Router } from 'express';

/**
 * Aplica protección CSRF a un router específico
 */
export function applyCsrfProtection(router: Router): void {
	router.use(csrfMiddleware.validate);
}

/**
 * Convierte un patrón con comodines a una regex
 */
function patternToRegex(pattern: string): RegExp {
	const regexPattern = pattern
		.replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
		.replace(/\*/g, '.*'); // Convert * to .*
	return new RegExp(`^${regexPattern}`);
}

/**
 * Aplica protección CSRF a todas las rutas excepto las especificadas
 * Soporta patrones con comodines (*)
 */
export function applyCsrfProtectionExcept(router: Router, excludedPaths: string[]): void {
	router.use((req, res, next) => {
		const path = req.path;

		// Si la ruta está en la lista de exclusiones, no aplicar CSRF
		// Soporta patrones con comodines usando regex
		const isExcluded = excludedPaths.some((excluded) => {
			if (excluded.includes('*')) {
				const regex = patternToRegex(excluded);
				return regex.test(path);
			}
			return path.startsWith(excluded);
		});

		if (isExcluded) {
			return next();
		}

		// Aplicar validación CSRF
		csrfMiddleware.validate(req, res, next);
	});
}
