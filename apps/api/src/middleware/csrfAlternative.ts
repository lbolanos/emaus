import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

// Almacén de tokens CSRF (en producción usar Redis)
const csrfTokens = new Map<string, { token: string; expires: number }>();

/**
 * Genera un token CSRF seguro
 */
function generateCsrfToken(): string {
	return crypto.randomBytes(32).toString('hex');
}

/**
 * Middleware para generar y enviar token CSRF
 */
export function csrfTokenMiddleware(req: Request, res: Response, next: NextFunction) {
	// Generar token CSRF si no existe
	if (!req.session.csrfToken) {
		req.session.csrfToken = generateCsrfToken();
	}

	// Enviar token en headers para APIs
	res.setHeader('X-CSRF-Token', req.session.csrfToken);

	// También enviarlo en respuesta para clientes web
	res.locals.csrfToken = req.session.csrfToken;

	next();
}

/**
 * Middleware para validar token CSRF
 */
export function csrfValidationMiddleware(req: Request, res: Response, next: NextFunction) {
	// Métodos seguros no requieren validación CSRF
	const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
	if (safeMethods.includes(req.method)) {
		return next();
	}

	// Obtener token de la sesión
	const sessionToken = req.session.csrfToken;
	if (!sessionToken) {
		return res.status(403).json({
			message: 'Token CSRF no encontrado en la sesión',
			error: 'CSRF_TOKEN_MISSING',
		});
	}

	// Obtener token de la petición
	const requestToken =
		(req.headers['x-csrf-token'] as string) ||
		(req.body._csrf as string) ||
		(req.query._csrf as string);

	if (!requestToken) {
		return res.status(403).json({
			message: 'Token CSRF requerido',
			error: 'CSRF_TOKEN_REQUIRED',
		});
	}

	// Validar token
	if (requestToken !== sessionToken) {
		return res.status(403).json({
			message: 'Token CSRF inválido',
			error: 'CSRF_TOKEN_INVALID',
		});
	}

	// Regenerar token después de uso válido (opcional)
	req.session.csrfToken = generateCsrfToken();

	next();
}

/**
 * Middleware para limpiar tokens expirados
 */
export function csrfCleanupMiddleware() {
	const now = Date.now();
	const expired = Array.from(csrfTokens.entries()).filter(([_, data]) => data.expires < now);

	expired.forEach(([key]) => csrfTokens.delete(key));
}

/**
 * Exportar middleware CSRF
 */
export const csrfMiddleware = {
	generateToken: csrfTokenMiddleware,
	validate: csrfValidationMiddleware,
	cleanup: csrfCleanupMiddleware,
};
