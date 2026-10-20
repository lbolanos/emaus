import { Request, Response, NextFunction } from 'express';
import { idempotencyService } from '../services/idempotencyService';

/**
 * Makes a write safe to resend (specs/offline-mode, FR-16).
 *
 * Mounted per route, after authentication and permission checks, on the writes the
 * web app can queue without signal. Without the `Idempotency-Key` header the route
 * behaves exactly as before. With it:
 *
 * - first time: the handler runs and its outcome is stored before the answer leaves;
 * - again (the device never got the answer and resends): the stored outcome is
 *   replayed with `Idempotent-Replayed: true` and the handler does NOT run;
 * - while the first request is still running: 409 `IDEMPOTENCY_IN_PROGRESS`, which
 *   the device retries later;
 * - the same key for another user, method or path: 422 `IDEMPOTENCY_KEY_REUSED`.
 *
 * A 5xx releases the key, so a failed write can be retried with the same key.
 */

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valid key from the request, `null` when absent, `false` when malformed. */
export const readIdempotencyKey = (req: Request): string | null | false => {
	const raw = req.get(IDEMPOTENCY_HEADER);
	if (raw === undefined || raw === '') return null;
	return KEY_PATTERN.test(raw) ? raw.toLowerCase() : false;
};

export async function idempotency(req: Request, res: Response, next: NextFunction): Promise<void> {
	const key = readIdempotencyKey(req);
	if (key === null) return next();
	if (key === false) {
		res.status(400).json({ message: 'Idempotency-Key inválida', code: 'IDEMPOTENCY_KEY_INVALID' });
		return;
	}
	const userId = (req.user as { id?: string } | undefined)?.id;
	if (!userId) return next();

	const owner = {
		key,
		userId,
		method: req.method,
		path: req.originalUrl.split('?')[0].slice(0, 255),
	};

	let reservation;
	try {
		reservation = await idempotencyService.reserve(owner);
	} catch (error) {
		return next(error);
	}

	if (reservation.kind === 'mismatch') {
		res.status(422).json({
			message: 'Esta clave de idempotencia ya se usó para otra operación',
			code: 'IDEMPOTENCY_KEY_REUSED',
		});
		return;
	}
	if (reservation.kind === 'in-progress') {
		res.status(409).json({
			message: 'La operación original todavía se está procesando',
			code: 'IDEMPOTENCY_IN_PROGRESS',
		});
		return;
	}
	if (reservation.kind === 'replay') {
		res.setHeader('Idempotent-Replayed', 'true');
		if (reservation.statusCode === 204) {
			res.status(204).end();
			return;
		}
		res
			.status(reservation.statusCode)
			.json(reservation.body ?? { idempotentReplay: true });
		return;
	}

	// First time: store the outcome before the answer leaves, so a resend that
	// arrives right after the device gave up already finds it.
	let settled = false;
	const sendJson = res.json.bind(res);
	res.json = ((body?: unknown) => {
		if (settled) return sendJson(body);
		settled = true;
		idempotencyService
			.complete(key, res.statusCode, body)
			.catch((error) => console.error('[idempotency] could not store outcome', error))
			.finally(() => sendJson(body));
		return res;
	}) as Response['json'];
	// Answers that bypass res.json (send/end/sendStatus) are recorded without a body.
	res.on('finish', () => {
		if (settled) return;
		settled = true;
		idempotencyService
			.complete(key, res.statusCode, undefined)
			.catch((error) => console.error('[idempotency] could not store outcome', error));
	});
	next();
}
