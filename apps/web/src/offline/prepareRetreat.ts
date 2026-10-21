import { api } from '@/services/api';
import {
	addDaysYmd,
	DEFAULT_RETREAT_TIMEZONE,
	isRetreatLive,
	todayYmdInTz,
	toYmd,
	type RetreatLikeDates,
} from '@/utils/retreatLiveStatus';
import { isOfflineModeEnabled } from './flag';
import { connectivity } from './connectivity';
import { getCacheUser, purgeResponses, type CachedResponse } from './readCache';
import { getOfflineStore } from './storage';

/**
 * "Preparar para trabajar sin conexión" (specs/offline-mode, D4 — FR-8/FR-9/FR-9c).
 *
 * Downloads, one after another, every answer the retreat views ask for, with the
 * exact URLs and params they use, so the read cache (readCache.ts) saves them as
 * if each screen had been opened. Health data is stripped on save as always; the
 * food and medicine reports have no endpoint of their own to fetch. App chunks are
 * not warmed here: the service worker precaches all of them (M1).
 *
 * The same answers leave the phone when the retreat window closes
 * (`purgeClosedRetreats`, D9).
 */

export interface PrepareStep {
	url: string;
	params?: Record<string, unknown>;
}

/** The GETs of the retreat views, as they send them. */
export function prepareSteps(retreatId: string): PrepareStep[] {
	return [
		{ url: '/retreats' },
		{ url: `/retreats/${retreatId}` },
		{ url: '/participants', params: { retreatId, includePayments: true } },
		// The walker, server and angelito lists (ParticipantList) leave the cancelled out.
		{ url: '/participants', params: { retreatId, isCancelled: false, includePayments: true } },
		{ url: '/participants', params: { retreatId, type: 'partial_server' } },
		// Mesas lists the cancelled apart, so a search for one of them explains itself.
		{ url: '/participants', params: { retreatId, isCancelled: true } },
		// Minuto a minuto asks for the names of the people in charge without payments.
		{ url: '/participants', params: { retreatId } },
		{ url: `/participants/reception/${retreatId}` },
		{ url: '/tags', params: { retreatId } },
		{ url: `/retreats/${retreatId}/beds` },
		{ url: `/tables/retreat/${retreatId}` },
		{ url: `/schedule/retreats/${retreatId}/items` },
		{ url: '/responsibilities', params: { retreatId } },
		{ url: `/santisimo/retreats/${retreatId}/slots` },
		{ url: `/service-teams/retreat/${retreatId}` },
	];
}

export interface PreparedSummary {
	at: number;
	ok: number;
	failed: number;
	bytes: number;
}

const preparedKey = (retreatId: string) => `prepared:${retreatId}`;

export async function getPrepared(retreatId: string): Promise<PreparedSummary | null> {
	try {
		return (await getOfflineStore().get<PreparedSummary>('meta', preparedKey(retreatId))) ?? null;
	} catch {
		return null;
	}
}

export async function prepareRetreat(
	retreatId: string,
	onProgress?: (done: number, total: number) => void,
	now: () => number = Date.now,
): Promise<PreparedSummary> {
	const steps = prepareSteps(retreatId);
	const summary: PreparedSummary = { at: now(), ok: 0, failed: 0, bytes: 0 };
	for (const [i, step] of steps.entries()) {
		try {
			const response: any = await api.get(step.url, { params: step.params });
			// An answer served from the phone means there is no signal: not a fresh download.
			if (response?.fromCache) summary.failed += 1;
			else {
				summary.ok += 1;
				summary.bytes += JSON.stringify(response?.data ?? null).length;
			}
		} catch {
			summary.failed += 1;
		}
		onProgress?.(i + 1, steps.length);
	}
	if (summary.ok > 0) {
		await getOfflineStore().put('meta', preparedKey(retreatId), summary).catch(() => {});
	}
	return summary;
}

/** Between 7 days before the start and the end of the retreat (D4). */
export function canPrepare(retreat: RetreatLikeDates | null | undefined, at: Date = new Date()): boolean {
	const start = toYmd(retreat?.startDate);
	const end = toYmd(retreat?.endDate);
	if (!start || !end) return false;
	const today = todayYmdInTz(retreat?.timezone || DEFAULT_RETREAT_TIMEZONE, at);
	return today >= addDaysYmd(start, -7) && today <= end;
}

const AUTO_EVERY_MS = 15 * 60 * 1000;
let autoRunning = false;

/**
 * While the retreat is live (D1), refresh what the phone has each time the
 * retreat is opened with signal — at most every 15 minutes, in the background.
 */
export async function maybeAutoPrepare(
	retreat: (RetreatLikeDates & { id?: string }) | null | undefined,
	at: Date = new Date(),
): Promise<boolean> {
	if (!retreat?.id || autoRunning || !isOfflineModeEnabled() || !connectivity.online) return false;
	if (!getCacheUser() || !isRetreatLive(retreat, at)) return false;
	const last = await getPrepared(retreat.id);
	if (last && at.getTime() - last.at < AUTO_EVERY_MS) return false;
	autoRunning = true;
	try {
		await prepareRetreat(retreat.id, undefined, () => at.getTime());
		return true;
	} finally {
		autoRunning = false;
	}
}

/**
 * Deletes the saved answers of every retreat whose window closed — the day after
 * `endDate` in the retreat's time zone (D9). Pending writes are never touched.
 * Retreat dates come from what the phone saved (it may be offline).
 */
export async function purgeClosedRetreats(at: Date = new Date()): Promise<number> {
	const store = getOfflineStore();
	let entries: Array<[string, CachedResponse<any>]>;
	try {
		entries = await store.entries<CachedResponse<any>>('responses');
	} catch {
		return 0;
	}
	const retreats = new Map<string, RetreatLikeDates>();
	for (const [, e] of entries) {
		if (e?.route === 'retreats' && Array.isArray(e.data)) {
			for (const r of e.data) if (r?.id) retreats.set(r.id, r);
		}
		if (e?.route === 'retreat' && e.data?.id) retreats.set(e.data.id, e.data);
	}
	const closed = (retreatId: string) => {
		const r = retreats.get(retreatId);
		const end = toYmd(r?.endDate);
		if (!end) return false;
		return todayYmdInTz(r?.timezone || DEFAULT_RETREAT_TIMEZONE, at) > end;
	};
	const removed = await purgeResponses(closed);
	for (const id of retreats.keys()) {
		if (closed(id)) await store.delete('meta', preparedKey(id)).catch(() => {});
	}
	return removed;
}

/** Only for tests. */
export function _resetAutoPrepareForTests(): void {
	autoRunning = false;
}
