/**
 * When an action really happened on the device (specs/offline-mode, D7/FR-17).
 *
 * The web app queues check-ins and schedule start/complete while there is no signal
 * and sends them later; without this, the server would stamp every one of them with
 * the time of the sync. The value is accepted only inside a sane window so a phone
 * with a wrong clock cannot write absurd times.
 */

/** Tolerance for a device clock slightly ahead of the server. */
export const MAX_FUTURE_MS = 5 * 60 * 1000;
/** A queue older than this is not a retreat weekend anymore. */
export const MAX_PAST_MS = 14 * 24 * 60 * 60 * 1000;

export class InvalidOccurredAtError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidOccurredAtError';
	}
}

/**
 * `undefined` when the field is absent (the caller keeps using "now");
 * a Date when valid; throws `InvalidOccurredAtError` otherwise.
 */
export function parseOccurredAt(value: unknown, now: Date = new Date()): Date | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value !== 'string') {
		throw new InvalidOccurredAtError('occurredAt debe ser una fecha ISO 8601');
	}
	const time = Date.parse(value);
	if (!Number.isFinite(time) || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
		throw new InvalidOccurredAtError('occurredAt debe ser una fecha ISO 8601');
	}
	if (time > now.getTime() + MAX_FUTURE_MS) {
		throw new InvalidOccurredAtError('occurredAt no puede estar en el futuro');
	}
	if (time < now.getTime() - MAX_PAST_MS) {
		throw new InvalidOccurredAtError('occurredAt tiene más de 14 días');
	}
	return new Date(time);
}

/** Lenient variant for headers (`X-Client-Time`): invalid or out of range → null. */
export function readClientTime(value: unknown, now: Date = new Date()): string | null {
	try {
		return parseOccurredAt(value, now)?.toISOString() ?? null;
	} catch {
		return null;
	}
}
