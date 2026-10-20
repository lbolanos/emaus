import { ref } from 'vue';
import { SENSITIVE_HEALTH_FIELDS } from '@repo/types';
import { getOfflineStore } from './storage';
import {
	isNetworkError,
	reportMissingOfflineData,
	reportServedFromCache,
} from './connectivity';

/**
 * Read cache for the retreat views (specs/offline-mode, M2 — FR-6/FR-7/FR-9b).
 *
 * The API client saves the answers of a short list of GETs and, when a later
 * request for the same URL fails for lack of signal, answers it from the device.
 * Views do not know: they receive the same DTOs, marked `fromCache`.
 *
 * Health data never reaches the device (decision 2026-10-19): every
 * participant-shaped object loses the `SENSITIVE_HEALTH_FIELDS` before saving,
 * whatever the user's permissions, and the food/medicine views say "needs
 * connection" when they would be fed from the cache.
 */

/** GETs that can be answered from the device. Order does not matter. */
export const CACHEABLE_ROUTES: Array<{ name: string; pattern: RegExp }> = [
	{ name: 'participants', pattern: /^\/participants$/ },
	{ name: 'reception', pattern: /^\/participants\/reception\/([^/]+)$/ },
	{ name: 'tags', pattern: /^\/tags$/ },
	{ name: 'retreats', pattern: /^\/retreats$/ },
	{ name: 'retreat', pattern: /^\/retreats\/([^/]+)$/ },
	{ name: 'beds', pattern: /^\/retreats\/([^/]+)\/beds$/ },
	{ name: 'tables', pattern: /^\/tables\/retreat\/([^/]+)$/ },
	{ name: 'table', pattern: /^\/tables\/([0-9a-f-]{36})$/i },
	{ name: 'schedule', pattern: /^\/schedule\/retreats\/([^/]+)\/items$/ },
	{ name: 'responsibilities', pattern: /^\/responsibilities$/ },
	{ name: 'santisimo', pattern: /^\/santisimo\/retreats\/([^/]+)\/slots$/ },
	{ name: 'serviceTeams', pattern: /^\/service-teams\/retreat\/([^/]+)$/ },
];

const HEALTH_KEYS = new Set<string>(SENSITIVE_HEALTH_FIELDS);

export interface CachedResponse<T = unknown> {
	data: T;
	fetchedAt: number;
	retreatId: string | null;
	userId: string;
	route: string;
}

/** Minimal shape of an axios request config, so this module stays testable without axios. */
export interface RequestLike {
	method?: string;
	url?: string;
	baseURL?: string;
	params?: Record<string, unknown>;
	offlineCache?: false;
}

// Reactive so the pending-changes chip recomputes when the user becomes known.
const cacheUser = ref<string | null>(null);

/** The cache is per user: set on login / auth check, cleared on logout. */
export function setCacheUser(userId: string | null): void {
	cacheUser.value = userId;
}

export function getCacheUser(): string | null {
	return cacheUser.value;
}

/**
 * Applies the writes still waiting in the outbox (M4) on top of a GET answer, so
 * a view shows what the team already did even when the data comes from the
 * device or from a server that has not received those writes yet. Registered by
 * `outbox.ts`; identity until then.
 */
type Overlay = (route: string, retreatId: string | null, data: unknown) => unknown;
let overlay: Overlay = (_route, _retreatId, data) => data;
let overlayReady: () => Promise<void> = async () => {};

/** `ready` resolves once the queue saved on the device has been read. */
export function setResponseOverlay(fn: Overlay, ready?: () => Promise<void>): void {
	overlay = fn;
	if (ready) overlayReady = ready;
}

export const waitForOverlay = (): Promise<void> => overlayReady();

export function applyOverlay(config: RequestLike, data: unknown): unknown {
	const route = matchCacheableRoute(config);
	return route ? overlay(route.name, route.retreatId, data) : data;
}

/** Path relative to the API base (`/participants`, not `/api/participants`), without query. */
export const pathOf = (config: RequestLike): string => {
	let url = config.url ?? '';
	if (/^https?:\/\//.test(url)) url = new URL(url).pathname;
	url = url.split('?')[0];
	// Calls made with an absolute base keep only the part after /api.
	const apiIdx = url.indexOf('/api/');
	if (apiIdx !== -1) url = url.slice(apiIdx + 4);
	return url.length > 1 ? url.replace(/\/$/, '') : url;
};

export function matchCacheableRoute(config: RequestLike): { name: string; retreatId: string | null } | null {
	if ((config.method ?? 'get').toLowerCase() !== 'get' || config.offlineCache === false) return null;
	const path = pathOf(config);
	for (const route of CACHEABLE_ROUTES) {
		const m = route.pattern.exec(path);
		if (!m) continue;
		const fromParams = config.params?.retreatId;
		const fromPath = route.name === 'table' ? null : (m[1] ?? null);
		const retreatId =
			typeof fromParams === 'string' && fromParams ? fromParams : fromPath;
		return { name: route.name, retreatId };
	}
	return null;
}

/** Stable key: user + path + params in a fixed order. */
export function cacheKey(config: RequestLike, userId: string): string {
	const params = config.params ?? {};
	const query = Object.keys(params)
		.filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
		.sort()
		.map((k) => `${k}=${String(params[k])}`)
		.join('&');
	return `${userId}|${pathOf(config)}${query ? `?${query}` : ''}`;
}

const looksLikeParticipant = (value: Record<string, unknown>): boolean =>
	'firstName' in value && 'lastName' in value;

/**
 * Copy of `data` without health fields in any participant-shaped object, at any
 * depth (lists, reception entries, bed.participant, table walkers…). Other
 * objects keep their own `notes` (schedule items, payments).
 */
export function stripHealthForCache<T>(data: T): T {
	const walk = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(walk);
		if (!value || typeof value !== 'object' || value instanceof Date) return value;
		const source = value as Record<string, unknown>;
		const strip = looksLikeParticipant(source);
		const out: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(source)) {
			if (strip && HEALTH_KEYS.has(key)) continue;
			out[key] = walk(child);
		}
		return out;
	};
	return walk(data) as T;
}

/** Saves a successful GET answer. Fire-and-forget: a storage failure never breaks the view. */
export async function saveResponse(config: RequestLike, data: unknown, now: number = Date.now()): Promise<void> {
	const userId = cacheUser.value;
	const route = matchCacheableRoute(config);
	if (!userId || !route) return;
	const entry: CachedResponse = {
		data: stripHealthForCache(data),
		fetchedAt: now,
		retreatId: route.retreatId,
		userId,
		route: route.name,
	};
	try {
		await getOfflineStore().put('responses', cacheKey(config, userId), entry);
	} catch (error) {
		console.warn('[offline] could not save response', error);
	}
}

export class OfflineNoDataError extends Error {
	readonly isOfflineNoData = true;
	constructor(readonly original: unknown) {
		super('Sin conexión y sin datos guardados para esta pantalla');
		this.name = 'OfflineNoDataError';
	}
}

export interface CacheServedResponse<T = unknown> {
	data: T;
	status: 200;
	statusText: 'OK (offline cache)';
	headers: Record<string, string>;
	config: RequestLike;
	fromCache: true;
	fetchedAt: number;
}

/**
 * For a GET that failed: the saved answer when it was a lack of signal and there
 * is one; otherwise `null` (the caller rethrows the original error) or an
 * `OfflineNoDataError` when the route is cacheable but nothing was saved.
 */
export async function answerFromCache(
	config: RequestLike,
	error: unknown,
): Promise<CacheServedResponse | OfflineNoDataError | null> {
	const userId = cacheUser.value;
	if (!userId || !isNetworkError(error) || !matchCacheableRoute(config)) return null;
	let entry: CachedResponse | undefined;
	try {
		entry = await getOfflineStore().get<CachedResponse>('responses', cacheKey(config, userId));
	} catch {
		entry = undefined;
	}
	if (!entry) {
		reportMissingOfflineData();
		return new OfflineNoDataError(error);
	}
	reportServedFromCache(entry.fetchedAt);
	await overlayReady().catch(() => {});
	return {
		data: overlay(entry.route, entry.retreatId, entry.data),
		status: 200,
		statusText: 'OK (offline cache)',
		headers: {},
		config,
		fromCache: true,
		fetchedAt: entry.fetchedAt,
	};
}

/** Was this axios-like response served from the device? */
export function isFromCache(response: unknown): boolean {
	return Boolean((response as { fromCache?: boolean } | null)?.fromCache);
}

/** Deletes every saved answer (logout, "Borrar datos sin conexión"). */
export async function clearSavedResponses(): Promise<void> {
	await getOfflineStore().clear('responses');
}

/**
 * Deletes the saved answers of retreats whose window closed (D9). `isClosed`
 * decides per retreat id; answers without a retreat (the retreat list) stay
 * until logout. Returns how many entries were removed.
 */
export async function purgeResponses(isClosed: (retreatId: string) => boolean): Promise<number> {
	const store = getOfflineStore();
	const entries = await store.entries<CachedResponse>('responses');
	let removed = 0;
	for (const [key, entry] of entries) {
		if (entry?.retreatId && isClosed(entry.retreatId)) {
			await store.delete('responses', key);
			removed += 1;
		}
	}
	return removed;
}
