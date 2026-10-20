import { api } from '@/services/api';
import { apiErrorMessage } from '@/services/apiError';
import { isOfflineModeEnabled } from './flag';
import { getCacheUser } from './readCache';
import {
	connectivity,
	isNetworkError,
	onReconnect,
	probe,
	reportNetworkFailure,
	reportSuccess,
} from './connectivity';
import {
	commitToSavedAnswers,
	markConflict,
	outbox,
	outboxReady,
	pendingOps,
	persistOp,
	removeOp,
} from './outbox';
import type { OutboxOp } from './outboxKinds';
import { purgeClosedRetreats } from './prepareRetreat';

/**
 * Sends the queued writes when there is signal (specs/offline-mode, FR-12/FR-13).
 *
 * Oldest first, one at a time, through the same endpoints the screens use, with
 * the op's own Idempotency-Key (a resend is replayed by the server, never applied
 * twice) and `X-Outbox-Sync: 1` for the audit. Per answer:
 * - 2xx → the change is written into the saved answers and the op leaves the queue;
 * - no answer, 409 IDEMPOTENCY_IN_PROGRESS, 5xx → stop and try again later
 *   (a 5xx five times in a row becomes a conflict so it does not block the queue);
 * - 401 → stop and wait for the user to log in again; nothing is dropped;
 * - any other 4xx → conflict with the server's message; the queue goes on.
 */

const SEND_TIMEOUT_MS = 15_000;
export const MAX_SERVER_ERRORS = 5;
const RETRY_EVERY_MS = 30_000;

type Outcome = 'done' | 'retry' | 'login' | 'conflict';

async function send(op: OutboxOp): Promise<Outcome> {
	try {
		await api.request({
			method: op.method,
			url: op.url,
			data: op.body ?? undefined,
			timeout: SEND_TIMEOUT_MS,
			headers: {
				'Idempotency-Key': op.key,
				'X-Client-Time': op.occurredAt,
				'X-Outbox-Sync': '1',
			},
			outboxReplay: true,
		} as any);
		return 'done';
	} catch (error: any) {
		if (isNetworkError(error)) {
			reportNetworkFailure();
			return 'retry';
		}
		const status: number | undefined = error?.response?.status;
		const code: string | undefined = error?.response?.data?.code;
		if (status === 401) return 'login';
		if (status === 409 && code === 'IDEMPOTENCY_IN_PROGRESS') return 'retry';
		if (status !== undefined && status >= 500) {
			op.attempts += 1;
			if (op.attempts >= MAX_SERVER_ERRORS) {
				await markConflict(op, status, apiErrorMessage(error, 'Error del servidor'));
				return 'conflict';
			}
			op.lastStatus = status;
			op.lastError = apiErrorMessage(error, 'Error del servidor');
			return 'retry';
		}
		await markConflict(op, status ?? null, apiErrorMessage(error, 'El servidor rechazó el cambio'));
		return 'conflict';
	}
}

async function doFlush(): Promise<void> {
	await outboxReady();
	if (!isOfflineModeEnabled() || !getCacheUser()) return;
	const queue = pendingOps();
	if (!queue.length) return;

	outbox.syncing = true;
	outbox.needsLogin = false;
	try {
		for (const op of queue) {
			if (op.status === 'conflict') continue;
			op.status = 'syncing';
			const outcome = await send(op);
			if (outcome === 'done') {
				reportSuccess();
				await commitToSavedAnswers(op);
				await removeOp(op);
				continue;
			}
			if (outcome === 'conflict') {
				reportSuccess();
				continue;
			}
			op.status = 'pending';
			await persistOp(op);
			if (outcome === 'login') outbox.needsLogin = true;
			break;
		}
	} finally {
		outbox.syncing = false;
		outbox.lastSyncAt = Date.now();
	}
	// With the queue sent, saved data of retreats that already ended can go (D9).
	if (!pendingOps().length) await purgeClosedRetreats().catch(() => 0);
}

let flushing: Promise<void> | null = null;

/** Sends what is queued. Concurrent calls share the same run. */
export function flushOutbox(): Promise<void> {
	if (!flushing) {
		flushing = doFlush()
			.catch((error) => console.warn('[offline] sync failed', error))
			.finally(() => {
				flushing = null;
			});
	}
	return flushing;
}

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

/** Wires the triggers once (AppLayout): signal back, tab visible, every 30 s, and now. */
export function startOutboxSync(): void {
	if (started || typeof window === 'undefined') return;
	started = true;
	onReconnect(() => void flushOutbox());
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden && pendingOps().length) void tick();
	});
	timer = setInterval(() => void tick(), RETRY_EVERY_MS);
	void tick();
}

async function tick(): Promise<void> {
	await outboxReady();
	if (!pendingOps().length) return;
	// Offline, a reachable server flips the state and onReconnect flushes.
	if (!connectivity.online) await probe();
	else await flushOutbox();
}

/** Only for tests. */
export function _stopOutboxSyncForTests(): void {
	if (timer) clearInterval(timer);
	timer = null;
	started = false;
	flushing = null;
}
