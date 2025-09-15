import { csrfMiddleware } from './csrfAlternative';
import { Router } from 'express';

/**
 * Aplica protección CSRF a un router específico
 */
export function applyCsrfProtection(router: Router): void {
	router.use(csrfMiddleware.validate);
}

/**
 * Aplica protección CSRF a todas las rutas excepto las especificadas
 */
export function applyCsrfProtectionExcept(router: Router, excludedPaths: string[]): void {
	router.use((req, res, next) => {
		const path = req.path;

		// Si la ruta está en la lista de exclusiones, no aplicar CSRF
		if (excludedPaths.some((excluded) => path.startsWith(excluded))) {
			return next();
		}

		// Aplicar validación CSRF
		csrfMiddleware.validate(req, res, next);
	});
}
