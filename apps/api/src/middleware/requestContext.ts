import { Request, Response, NextFunction } from 'express';
import { auditContext } from '../utils/auditContext';
import { readClientTime } from '../utils/occurredAt';
import { readIdempotencyKey } from './idempotency';
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
	const idempotencyKey = readIdempotencyKey(req);
	const ctx = {
		userId: authReq.user?.id ?? null,
		ip: req.ip ?? null,
		userAgent: req.headers['user-agent'] ?? null,
		idempotencyKey: idempotencyKey || null,
		clientTime: idempotencyKey ? readClientTime(req.get('X-Client-Time')) : null,
		fromOutbox: Boolean(idempotencyKey) && req.get('X-Outbox-Sync') === '1',
	};
	auditContext.run(ctx, () => next());
}
