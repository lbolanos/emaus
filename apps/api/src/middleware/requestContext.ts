import { Request, Response, NextFunction } from 'express';
import { auditContext } from '../utils/auditContext';
import type { AuthenticatedRequest } from './authorization';

/**
 * Puebla el `auditContext` (AsyncLocalStorage) con el actor del request actual.
 *
 * Debe registrarse DESPUÉS de `passport.session()` (para que `req.user` ya esté
 * deserializado) y ANTES de las rutas de la API. El `next()` se invoca DENTRO de
 * `auditContext.run(...)` para que el contexto se propague a todo el pipeline
 * downstream (controllers → services → repos).
 */
export function requestContextMiddleware(
	req: Request,
	_res: Response,
	next: NextFunction,
): void {
	const authReq = req as AuthenticatedRequest;
	const ctx = {
		userId: authReq.user?.id ?? null,
		ip: req.ip ?? null,
		userAgent: req.headers['user-agent'] ?? null,
	};
	auditContext.run(ctx, () => next());
}
