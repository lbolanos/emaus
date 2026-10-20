import { reactive } from 'vue';
import { getOfflineStore } from './storage';
import { getCacheUser, setResponseOverlay, type CachedResponse } from './readCache';
import {
	applyOps,
	editedFields,
	kindDef,
	type OutboxMeta,
	type OutboxOp,
	type QueueableMatch,
} from './outboxKinds';

/**
 * Writes waiting for signal (specs/offline-mode, M4 — FR-10/FR-11).
 *
 * Each queued write keeps the exact request (method, path, body), its
 * Idempotency-Key and the device time. While it waits, it is applied on top of
 * every GET answer of its retreat (`setResponseOverlay`), so the screens show it
 * even after a reload. When the server accepts it, the change is written into the
 * saved answers and the write leaves the queue; if the server rejects it, it stays
 * as a conflict until the user retries or discards it.
 */

export const outbox = reactive({
	ops: [] as OutboxOp[],
	loaded: false,
	syncing: false,
	/** The session expired: writes wait until the user logs in again (D8). */
	needsLogin: false,
	lastSyncAt: null as number | null,
});

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const byOrder = (a: OutboxOp, b: OutboxOp) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

async function loadOutbox(): Promise<void> {
	try {
		const entries = await getOfflineStore().entries<OutboxOp>('outbox');
		outbox.ops = entries.map(([, op]) => ({ ...op, status: op.status === 'syncing' ? 'pending' : op.status }));
	} catch (error) {
		console.warn('[offline] could not read the pending changes', error);
	} finally {
		outbox.loaded = true;
	}
}

// Lazy: api.ts (and so this module) also loads on the public registration pages,
// which must not even open IndexedDB on a walker's phone.
let ready: Promise<void> | null = null;

/** Reads the queue saved on the device the first time it is needed. */
export const outboxReady = (): Promise<void> => (ready ??= loadOutbox());

/** Only for tests: reload from the (swapped) store. */
export function _reloadOutboxForTests(): Promise<void> {
	outbox.ops = [];
	outbox.loaded = false;
	outbox.syncing = false;
	outbox.needsLogin = false;
	ready = loadOutbox();
	return ready;
}

/** The current user's queue, oldest first. */
export function userOps(userId: string | null = getCacheUser()): OutboxOp[] {
	return outbox.ops.filter((op) => op.userId === userId).sort(byOrder);
}

export const pendingOps = (userId?: string | null): OutboxOp[] =>
	userOps(userId).filter((op) => op.status !== 'conflict');

export const conflictOps = (userId?: string | null): OutboxOp[] =>
	userOps(userId).filter((op) => op.status === 'conflict');

export async function persistOp(op: OutboxOp): Promise<void> {
	await getOfflineStore().put('outbox', op.id, plain(op));
}

export async function removeOp(op: OutboxOp): Promise<void> {
	outbox.ops = outbox.ops.filter((o) => o.id !== op.id);
	await getOfflineStore().delete('outbox', op.id);
}

export function newIdempotencyKey(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	// RFC 4122 v4 from Math.random — only on very old engines without randomUUID.
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
	});
}

// Two writes in the same millisecond must keep the order they were made in (the
// queue is sent oldest first): time, then a per-page counter, then a random tail.
let opSequence = 0;
const newOpId = (occurredAt: string) => {
	opSequence = (opSequence + 1) % 1_000_000;
	return `${String(Date.parse(occurredAt)).padStart(15, '0')}-${String(opSequence).padStart(6, '0')}-${Math.random().toString(36).slice(2, 8)}`;
};

// ── Saved answers ────────────────────────────────────────────────────────────

async function savedAnswers(
	userId: string,
	route: string,
	retreatId?: string | null,
): Promise<Array<[string, CachedResponse<any>]>> {
	const entries = await getOfflineStore().entries<CachedResponse<any>>('responses');
	return entries.filter(
		([, e]) => e?.userId === userId && e.route === route && (!retreatId || e.retreatId === retreatId),
	);
}

const fullName = (p: any): string | undefined =>
	p ? [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || undefined : undefined;

/** First participant object with this id in the saved answers of the retreat. */
async function findParticipant(userId: string, retreatId: string | null, id: string): Promise<any | undefined> {
	for (const [, e] of await savedAnswers(userId, 'participants', retreatId)) {
		const p = Array.isArray(e.data) ? e.data.find((x: any) => x?.id === id) : undefined;
		if (p) return p;
	}
	for (const [, e] of await savedAnswers(userId, 'reception', retreatId)) {
		const list = [...(e.data?.pendingList ?? []), ...(e.data?.arrivedList ?? [])];
		const p = list.find((x: any) => x?.participantId === id);
		if (p) return { id, firstName: p.firstName, lastName: p.lastName };
	}
	for (const [, e] of await savedAnswers(userId, 'tables', retreatId)) {
		for (const t of Array.isArray(e.data) ? e.data : []) {
			const p = [...(t.walkers ?? []), t.lider, t.colider1, t.colider2].find((x: any) => x?.id === id);
			if (p) return p;
		}
	}
	for (const [, e] of await savedAnswers(userId, 'beds', retreatId)) {
		const bed = Array.isArray(e.data) ? e.data.find((b: any) => b?.participant?.id === id) : undefined;
		if (bed) return bed.participant;
	}
	return undefined;
}

async function findInList(
	userId: string,
	route: string,
	id: string,
): Promise<{ retreatId: string | null; item: any } | undefined> {
	for (const [, e] of await savedAnswers(userId, route)) {
		const list = Array.isArray(e.data) ? e.data : route === 'table' ? [e.data] : [];
		const item = list.find((x: any) => x?.id === id);
		if (item) return { retreatId: e.retreatId, item };
	}
	return undefined;
}

/** Retreat id and label data for the panel, read from what the phone saved. */
async function describe(match: QueueableMatch, userId: string): Promise<{ retreatId: string | null; meta: OutboxMeta }> {
	const meta: OutboxMeta = { ...match.ids };
	let retreatId = match.retreatId;

	if (meta.itemId) {
		const found = await findInList(userId, 'schedule', meta.itemId);
		retreatId ??= found?.retreatId ?? null;
		meta.item = found?.item?.name;
	}
	if (meta.bedId) {
		const found = await findInList(userId, 'beds', meta.bedId);
		retreatId ??= found?.retreatId ?? null;
		if (found) meta.bed = `${found.item.roomNumber}-${found.item.bedNumber}`;
	}
	if (meta.tableId) {
		const found =
			(await findInList(userId, 'tables', meta.tableId)) ?? (await findInList(userId, 'table', meta.tableId));
		retreatId ??= found?.retreatId ?? null;
		meta.table = found?.item?.name;
	}
	if (!retreatId) {
		try {
			retreatId = localStorage.getItem('selectedRetreatId');
		} catch {
			retreatId = null;
		}
	}
	if (meta.participantId) {
		const p = await findParticipant(userId, retreatId, meta.participantId);
		meta.name = fullName(p);
		// Beds and tables paint the card from the participant object.
		if (match.def.kind === 'beds.assign' || match.def.kind === 'tables.assignWalker') {
			meta.participant = p ? plain(p) : { id: meta.participantId };
		}
	}
	return { retreatId, meta };
}

/** What the caller would have received from the server, built from the device. */
async function syntheticResponse(op: OutboxOp): Promise<unknown> {
	const ops = pendingOps(op.userId);
	const overlaid = async (route: string, id: string) => {
		const found = await findInList(op.userId, route, id);
		if (!found) return undefined;
		const [, entry] =
			(await savedAnswers(op.userId, route, found.retreatId)).find(([, e]) =>
				(Array.isArray(e.data) ? e.data : [e.data]).some((x: any) => x?.id === id),
			) ?? [];
		return entry ? { list: applyOps(route, entry.data, ops) as any, retreatId: entry.retreatId } : undefined;
	};

	switch (op.kind) {
		case 'reception.checkin': {
			const checked = op.body?.checkedIn === true || op.body?.checkedIn === 'true';
			return { checkedIn: checked, checkedInAt: checked ? op.occurredAt : null };
		}
		case 'reception.payment':
			return { id: `offline-${op.id}`, ...op.body, queued: true };
		case 'participant.setCancelled':
			return { id: op.meta.participantId, isCancelled: op.body?.isCancelled };
		case 'participant.edit':
			return { id: op.meta.participantId, ...editedFields(op.body) };
		case 'bags.bagMade':
			return { ok: true };
		case 'schedule.start':
		case 'schedule.complete': {
			const found = await overlaid('schedule', op.meta.itemId!);
			return (
				found?.list.find((x: any) => x.id === op.meta.itemId) ?? {
					id: op.meta.itemId,
					retreatId: op.retreatId,
					status: op.kind === 'schedule.start' ? 'active' : 'completed',
				}
			);
		}
		case 'schedule.shift': {
			const found = await overlaid('schedule', op.meta.itemId!);
			return found?.list ?? [];
		}
		case 'schedule.shiftDay': {
			const [entry] = await savedAnswers(op.userId, 'schedule', op.retreatId);
			return entry ? applyOps('schedule', entry[1].data, ops) : [];
		}
		case 'beds.assign': {
			const found = await overlaid('beds', op.meta.bedId!);
			return found?.list.find((b: any) => b.id === op.meta.bedId) ?? {
				id: op.meta.bedId,
				participantId: op.body?.participantId ?? null,
			};
		}
		case 'tables.assignWalker':
		case 'tables.unassignWalker': {
			const found = (await overlaid('tables', op.meta.tableId!)) ?? (await overlaid('table', op.meta.tableId!));
			const list = found ? (Array.isArray(found.list) ? found.list : [found.list]) : [];
			return list.find((t: any) => t?.id === op.meta.tableId) ?? { id: op.meta.tableId, walkers: [] };
		}
	}
}

export interface EnqueueInput {
	match: QueueableMatch;
	method: string;
	path: string;
	body: unknown;
	key: string;
	occurredAt: string;
}

/**
 * Saves a write that could not reach the server. Returns the queued op and the
 * answer the caller gets instead of the server's. Throws when nobody is logged in
 * (there is no one to send it as).
 */
export async function enqueue(input: EnqueueInput): Promise<{ op: OutboxOp; response: unknown }> {
	await outboxReady();
	const userId = getCacheUser();
	if (!userId) throw new Error('No hay sesión para guardar el cambio sin conexión');

	// The same key twice means the same write (a retry of a queued one): keep one.
	const existing = outbox.ops.find((o) => o.key === input.key);
	if (existing) return { op: existing, response: await syntheticResponse(existing) };

	const { retreatId, meta } = await describe(input.match, userId);
	const op: OutboxOp = {
		id: newOpId(input.occurredAt),
		key: input.key,
		kind: input.match.def.kind,
		method: input.match.def.method,
		url: input.path,
		body: input.body ?? null,
		retreatId,
		userId,
		occurredAt: input.occurredAt,
		status: 'pending',
		attempts: 0,
		lastError: null,
		lastStatus: null,
		meta,
	};
	outbox.ops.push(op);
	await persistOp(op);
	return { op, response: await syntheticResponse(op) };
}

/** After the server accepted `op`: write its change into the saved answers. */
export async function commitToSavedAnswers(op: OutboxOp): Promise<void> {
	const store = getOfflineStore();
	for (const route of kindDef(op.kind).routes) {
		for (const [key, entry] of await savedAnswers(op.userId, route, op.retreatId)) {
			await store.put('responses', key, { ...entry, data: applyOps(route, entry.data, [op]) });
		}
	}
}

export async function markConflict(op: OutboxOp, status: number | null, message: string): Promise<void> {
	op.status = 'conflict';
	op.lastStatus = status;
	op.lastError = message;
	await persistOp(op);
}

/** A conflict the user wants to send again (e.g. after freeing the bed). */
export async function retryOp(op: OutboxOp): Promise<void> {
	op.status = 'pending';
	op.attempts = 0;
	op.lastError = null;
	op.lastStatus = null;
	await persistOp(op);
}

/** Only on the user's explicit request (spec: a write is never dropped silently). */
export async function discardOp(op: OutboxOp): Promise<void> {
	await removeOp(op);
}

// Pending writes painted on top of every GET answer of their retreat.
setResponseOverlay(
	(route, retreatId, data) => {
		const ops = pendingOps().filter((op) => !op.retreatId || !retreatId || op.retreatId === retreatId);
		return ops.length ? applyOps(route, data, ops) : data;
	},
	() => outboxReady(),
);
