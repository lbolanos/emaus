import cron from 'node-cron';
import { LessThan } from 'typeorm';
import { AppDataSource } from '../data-source';
import { IdempotencyKey } from '../entities/idempotencyKey.entity';

/** `statusCode` stored while the first request with a key is still running. */
export const IN_PROGRESS = 0;
/** Keys are kept long enough to cover a retreat weekend plus the trip back. */
export const RETENTION_DAYS = 7;
/** Longest 4xx body kept for replay (an error message, never a full DTO). */
const MAX_ERROR_BODY = 2000;
/**
 * A reservation still "in progress" after this long was abandoned (the process
 * restarted mid-request, e.g. a deploy): it is reclaimed so the device can retry,
 * instead of getting 409 until the 7-day purge. Trade-off, logged when it happens:
 * if that request had committed before dying, the retry runs it again.
 */
export const STALE_IN_PROGRESS_MS = 2 * 60 * 1000;

export type ReserveResult =
	| { kind: 'new' }
	| { kind: 'replay'; statusCode: number; body: unknown }
	| { kind: 'in-progress' }
	| { kind: 'mismatch' };

export interface KeyOwner {
	key: string;
	userId: string;
	method: string;
	path: string;
}

const isUniqueViolation = (error: unknown): boolean => {
	const message = error instanceof Error ? error.message : String(error);
	return /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(message);
};

const parseBody = (raw: string | null | undefined): unknown => {
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
};

class IdempotencyService {
	private get repo() {
		return AppDataSource.getRepository(IdempotencyKey);
	}

	private classify(row: IdempotencyKey, owner: KeyOwner): ReserveResult {
		if (row.userId !== owner.userId || row.method !== owner.method || row.path !== owner.path) {
			return { kind: 'mismatch' };
		}
		if (row.statusCode === IN_PROGRESS) return { kind: 'in-progress' };
		return { kind: 'replay', statusCode: row.statusCode, body: parseBody(row.responseBody) };
	}

	/**
	 * Claims a key for the first request that carries it. The INSERT on the primary
	 * key is the lock: two concurrent requests with the same key cannot both win.
	 */
	async reserve(owner: KeyOwner, now: Date = new Date()): Promise<ReserveResult> {
		const existing = await this.repo.findOne({ where: { key: owner.key } });
		if (existing) {
			const verdict = this.classify(existing, owner);
			const age = now.getTime() - new Date(existing.createdAt).getTime();
			if (verdict.kind === 'in-progress' && age > STALE_IN_PROGRESS_MS) {
				// Reclaim only if nobody else did in the meantime (same createdAt).
				const result = await this.repo.update(
					{ key: owner.key, statusCode: IN_PROGRESS, createdAt: existing.createdAt },
					{ createdAt: now },
				);
				if ((result.affected ?? 0) > 0) {
					console.warn(`[idempotency] reclaimed an abandoned reservation for ${owner.method} ${owner.path}`);
					return { kind: 'new' };
				}
				return { kind: 'in-progress' };
			}
			return verdict;
		}
		try {
			await this.repo.insert({
				key: owner.key,
				userId: owner.userId,
				method: owner.method,
				path: owner.path,
				statusCode: IN_PROGRESS,
				responseBody: null,
				completedAt: null,
			});
			return { kind: 'new' };
		} catch (error) {
			if (!isUniqueViolation(error)) throw error;
			const winner = await this.repo.findOne({ where: { key: owner.key } });
			return winner ? this.classify(winner, owner) : { kind: 'in-progress' };
		}
	}

	/**
	 * Records the outcome of the first request. A 5xx releases the key so the device
	 * can retry the same operation; anything else is final and will be replayed.
	 */
	async complete(key: string, statusCode: number, body: unknown): Promise<void> {
		if (statusCode >= 500) {
			await this.repo.delete({ key });
			return;
		}
		let responseBody: string | null = null;
		if (statusCode >= 400 && body !== undefined) {
			try {
				responseBody = JSON.stringify(body).slice(0, MAX_ERROR_BODY);
			} catch {
				responseBody = null;
			}
		}
		await this.repo.update({ key }, { statusCode, responseBody, completedAt: new Date() });
	}

	async purgeOlderThan(days: number = RETENTION_DAYS): Promise<number> {
		const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
		const result = await this.repo.delete({ createdAt: LessThan(cutoff) });
		return result.affected ?? 0;
	}

	startScheduledTasks(): void {
		cron.schedule('17 3 * * *', async () => {
			try {
				const purged = await this.purgeOlderThan();
				if (purged > 0) console.log(`🧹 Purged ${purged} idempotency keys`);
			} catch (error) {
				console.error('Error purging idempotency keys:', error);
			}
		});
		console.log('✅ Idempotency key purge scheduled (daily)');
	}
}

export const idempotencyService = new IdempotencyService();
