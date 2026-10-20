/**
 * The writes that can wait for signal (specs/offline-mode, D2 + FR-15b): how each
 * one is recognized on its way out, and how it changes the data saved on the
 * device so the views show it before it reaches the server.
 *
 * Reducers mirror what the server does (participantService, retreatScheduleService,
 * retreatBedController, tableMesaService) closely enough to paint the screens; the
 * server stays the judge when the write arrives (D5): if it disagrees, the write
 * becomes a conflict and the next fetch shows the server's truth.
 */

export type OutboxKind =
	| 'reception.checkin'
	| 'reception.payment'
	| 'participant.setCancelled'
	| 'bags.bagMade'
	| 'schedule.start'
	| 'schedule.complete'
	| 'schedule.shift'
	| 'schedule.shiftDay'
	| 'beds.assign'
	| 'tables.assignWalker'
	| 'tables.unassignWalker';

export type OutboxStatus = 'pending' | 'syncing' | 'conflict';

/** Ids and label data captured when the write is queued. */
export interface OutboxMeta {
	participantId?: string;
	itemId?: string;
	bedId?: string;
	tableId?: string;
	walkerId?: string;
	day?: number;
	name?: string;
	item?: string;
	bed?: string;
	table?: string;
	amount?: number;
	/** Participant snapshot (no health fields) for beds/tables, to paint the card. */
	participant?: Record<string, unknown>;
}

export interface OutboxOp {
	/** Sortable: device time in ms + random suffix. */
	id: string;
	/** Sent as Idempotency-Key on every attempt. */
	key: string;
	kind: OutboxKind;
	method: 'post' | 'put' | 'patch' | 'delete';
	url: string;
	body: any;
	retreatId: string | null;
	userId: string;
	/** When it happened on the device (ISO). */
	occurredAt: string;
	status: OutboxStatus;
	attempts: number;
	lastError: string | null;
	lastStatus: number | null;
	meta: OutboxMeta;
}

export interface KindDef {
	kind: OutboxKind;
	method: OutboxOp['method'];
	pattern: RegExp;
	/** Extra condition on the body (PUT /participants/:id is also the full edit). */
	accepts?: (body: any) => boolean;
	/** Ids read from the URL and body. */
	ids: (m: RegExpExecArray, body: any) => OutboxMeta;
	/** Retreat id when the request itself carries it. */
	retreatId: (m: RegExpExecArray, body: any) => string | null;
	/** Writes whose time matters (D7) carry `occurredAt` in the body. */
	stampBody?: boolean;
	/** Cached GET routes (readCache.CACHEABLE_ROUTES names) this write changes. */
	routes: string[];
	reduce: (route: string, data: any, op: OutboxOp) => any;
	label: (op: OutboxOp) => { key: string; params: Record<string, unknown> };
}

const isTrue = (v: unknown) => v === true || v === 'true';
const shiftIso = (iso: string, minutes: number) =>
	new Date(Date.parse(iso) + minutes * 60_000).toISOString();
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const who = (op: OutboxOp) => op.meta.name || '—';

const findIn = (list: any[] | undefined, id: string | undefined) =>
	Array.isArray(list) ? list.find((x) => x?.id === id || x?.participantId === id) : undefined;

const recountReception = (d: any) => {
	d.arrived = d.arrivedList.length;
	d.pending = d.pendingList.length;
	return d;
};

const updateParticipant = (data: any, id: string | undefined, patch: (p: any) => void) => {
	if (!Array.isArray(data)) return data;
	const p = data.find((x) => x?.id === id);
	if (p) patch(p);
	return data;
};

const forEachTable = (route: string, data: any, fn: (table: any) => void) => {
	if (route === 'tables' && Array.isArray(data)) data.forEach(fn);
	if (route === 'table' && data && typeof data === 'object') fn(data);
	return data;
};

const removeFromTable = (table: any, participantId: string) => {
	if (Array.isArray(table.walkers)) {
		table.walkers = table.walkers.filter((w: any) => w?.id !== participantId);
	}
	for (const role of ['lider', 'colider1', 'colider2']) {
		if (table[role]?.id === participantId) {
			table[role] = null;
			if (`${role}Id` in table) table[`${role}Id`] = null;
		}
	}
};

const shiftItems = (items: any[], selected: any[], minutes: number, now: string, markLate: boolean) => {
	for (const x of selected) {
		const wasLate =
			markLate && minutes > 0 && x.status === 'pending' && Date.parse(x.startTime) <= Date.parse(now);
		x.startTime = shiftIso(x.startTime, minutes);
		x.endTime = shiftIso(x.endTime, minutes);
		if (wasLate) x.status = 'delayed';
	}
	return items;
};

export const KINDS: KindDef[] = [
	{
		kind: 'reception.checkin',
		method: 'put',
		pattern: /^\/participants\/([^/]+)\/checkin$/,
		ids: (m) => ({ participantId: m[1] }),
		retreatId: (_m, body) => body?.retreatId ?? null,
		stampBody: true,
		routes: ['reception', 'participants'],
		reduce(route, data, op) {
			const checked = isTrue(op.body?.checkedIn);
			const at = checked ? op.occurredAt : null;
			if (route === 'participants') {
				return updateParticipant(data, op.meta.participantId, (p) => {
					p.checkedIn = checked;
					p.checkedInAt = at;
				});
			}
			if (!data?.pendingList || !data?.arrivedList) return data;
			const from = checked ? data.pendingList : data.arrivedList;
			const to = checked ? data.arrivedList : data.pendingList;
			const idx = from.findIndex((e: any) => e.participantId === op.meta.participantId);
			const entry = idx >= 0 ? from.splice(idx, 1)[0] : findIn(to, op.meta.participantId);
			if (!entry) return data;
			entry.checkedIn = checked;
			entry.checkedInAt = at;
			if (idx >= 0) to.push(entry);
			return recountReception(data);
		},
		label: (op) => ({
			key: isTrue(op.body?.checkedIn) ? 'offline.ops.checkin' : 'offline.ops.undoCheckin',
			params: { name: who(op) },
		}),
	},
	{
		kind: 'reception.payment',
		method: 'post',
		pattern: /^\/payments$/,
		accepts: (body) => Boolean(body?.participantId && body?.retreatId),
		ids: (_m, body) => ({ participantId: body?.participantId, amount: Number(body?.amount) || 0 }),
		retreatId: (_m, body) => body?.retreatId ?? null,
		routes: ['reception', 'participants'],
		reduce(route, data, op) {
			const amount = Number(op.body?.amount) || 0;
			if (route === 'reception') {
				const entry =
					findIn(data?.pendingList, op.meta.participantId) ?? findIn(data?.arrivedList, op.meta.participantId);
				if (entry) entry.totalPaid = (Number(entry.totalPaid) || 0) + amount;
				return data;
			}
			return updateParticipant(data, op.meta.participantId, (p) => {
				if (Array.isArray(p.payments)) {
					p.payments.push({
						id: `offline-${op.id}`,
						amount,
						paymentDate: op.body?.paymentDate,
						paymentMethod: op.body?.paymentMethod,
						retreatId: op.retreatId,
					});
				}
				if (typeof p.totalPaid === 'number') p.totalPaid += amount;
				if (typeof p.paymentRemaining === 'number') {
					p.paymentRemaining = Math.max(0, p.paymentRemaining - amount);
					if (p.paymentStatus !== 'scholarship') {
						p.paymentStatus = p.paymentRemaining === 0 ? 'paid' : 'partial';
					}
				}
			});
		},
		label: (op) => ({ key: 'offline.ops.payment', params: { name: who(op), amount: op.meta.amount } }),
	},
	{
		kind: 'participant.setCancelled',
		method: 'put',
		pattern: /^\/participants\/([0-9a-f-]{36})$/i,
		// Only the explicit no-show body; a full-record edit is never queued.
		accepts: (body) =>
			body &&
			typeof body === 'object' &&
			typeof body.isCancelled === 'boolean' &&
			Object.keys(body).every((k) => k === 'isCancelled' || k === 'contextRetreatId'),
		ids: (m) => ({ participantId: m[1] }),
		retreatId: (_m, body) => body?.contextRetreatId ?? null,
		routes: ['reception', 'participants', 'beds', 'tables', 'table'],
		reduce(route, data, op) {
			const cancelled = op.body?.isCancelled === true;
			const pid = op.meta.participantId!;
			if (route === 'participants') {
				return updateParticipant(data, pid, (p) => {
					p.isCancelled = cancelled;
					if (cancelled) p.tableId = null;
				});
			}
			if (!cancelled) return data;
			if (route === 'reception' && data?.pendingList) {
				const before = data.pendingList.length + data.arrivedList.length;
				data.pendingList = data.pendingList.filter((e: any) => e.participantId !== pid);
				data.arrivedList = data.arrivedList.filter((e: any) => e.participantId !== pid);
				const removed = before - data.pendingList.length - data.arrivedList.length;
				if (typeof data.total === 'number') data.total -= removed;
				return recountReception(data);
			}
			if (route === 'beds' && Array.isArray(data)) {
				for (const bed of data) {
					if (bed?.participantId === pid) {
						bed.participantId = null;
						bed.participant = null;
					}
				}
				return data;
			}
			return forEachTable(route, data, (table) => removeFromTable(table, pid));
		},
		label: (op) => ({
			key: op.body?.isCancelled === true ? 'offline.ops.cancel' : 'offline.ops.reactivate',
			params: { name: who(op) },
		}),
	},
	{
		kind: 'bags.bagMade',
		method: 'patch',
		pattern: /^\/history\/retreat\/([^/]+)\/participant\/([^/]+)\/bag-made$/,
		ids: (m) => ({ participantId: m[2] }),
		retreatId: (m) => m[1],
		routes: ['participants', 'reception'],
		reduce(route, data, op) {
			const made = op.body?.bagMade === true;
			if (route === 'participants') {
				return updateParticipant(data, op.meta.participantId, (p) => (p.bagMade = made));
			}
			const entry =
				findIn(data?.pendingList, op.meta.participantId) ?? findIn(data?.arrivedList, op.meta.participantId);
			if (entry) entry.bagMade = made;
			return data;
		},
		label: (op) => ({
			key: op.body?.bagMade === true ? 'offline.ops.bagMade' : 'offline.ops.bagUndone',
			params: { name: who(op) },
		}),
	},
	{
		kind: 'schedule.start',
		method: 'post',
		pattern: /^\/schedule\/items\/([^/]+)\/start$/,
		ids: (m) => ({ itemId: m[1] }),
		retreatId: () => null,
		stampBody: true,
		routes: ['schedule'],
		reduce(_route, data, op) {
			const item = findIn(data, op.meta.itemId);
			if (item) {
				item.status = 'active';
				item.actualStartTime = op.occurredAt;
			}
			return data;
		},
		label: (op) => ({ key: 'offline.ops.scheduleStart', params: { item: op.meta.item || '—' } }),
	},
	{
		kind: 'schedule.complete',
		method: 'post',
		pattern: /^\/schedule\/items\/([^/]+)\/complete$/,
		ids: (m) => ({ itemId: m[1] }),
		retreatId: () => null,
		stampBody: true,
		routes: ['schedule'],
		reduce(_route, data, op) {
			const item = findIn(data, op.meta.itemId);
			if (item) {
				item.status = 'completed';
				item.actualEndTime = op.occurredAt;
			}
			return data;
		},
		label: (op) => ({ key: 'offline.ops.scheduleComplete', params: { item: op.meta.item || '—' } }),
	},
	{
		kind: 'schedule.shift',
		method: 'post',
		pattern: /^\/schedule\/items\/([^/]+)\/shift$/,
		ids: (m) => ({ itemId: m[1] }),
		retreatId: () => null,
		routes: ['schedule'],
		reduce(_route, data, op) {
			if (!Array.isArray(data)) return data;
			const item = findIn(data, op.meta.itemId);
			if (!item) return data;
			const minutes = Number(op.body?.minutesDelta) || 0;
			const selected =
				op.body?.propagate === false
					? [item]
					: data.filter(
							(x) => x.id === item.id || (x.day === item.day && Date.parse(x.startTime) >= Date.parse(item.startTime)),
						);
			return shiftItems(data, selected, minutes, op.occurredAt, true);
		},
		label: (op) => ({
			key: 'offline.ops.scheduleShift',
			params: { item: op.meta.item || '—', delta: signed(Number(op.body?.minutesDelta) || 0) },
		}),
	},
	{
		kind: 'schedule.shiftDay',
		method: 'post',
		pattern: /^\/schedule\/retreats\/([^/]+)\/days\/(\d+)\/shift$/,
		ids: (m) => ({ day: Number(m[2]) }),
		retreatId: (m) => m[1],
		routes: ['schedule'],
		reduce(_route, data, op) {
			if (!Array.isArray(data)) return data;
			const minutes = Number(op.body?.minutesDelta) || 0;
			return shiftItems(data, data.filter((x) => x.day === op.meta.day), minutes, op.occurredAt, false);
		},
		label: (op) => ({
			key: 'offline.ops.dayShift',
			params: { day: op.meta.day, delta: signed(Number(op.body?.minutesDelta) || 0) },
		}),
	},
	{
		kind: 'beds.assign',
		method: 'put',
		pattern: /^\/retreat-beds\/([^/]+)\/assign$/,
		ids: (m, body) => ({ bedId: m[1], participantId: body?.participantId ?? undefined }),
		retreatId: () => null,
		routes: ['beds'],
		reduce(_route, data, op) {
			if (!Array.isArray(data)) return data;
			const pid = op.body?.participantId ?? null;
			if (pid) {
				for (const bed of data) {
					if (bed?.participantId === pid && bed.id !== op.meta.bedId) {
						bed.participantId = null;
						bed.participant = null;
					}
				}
			}
			const target = findIn(data, op.meta.bedId);
			if (target) {
				target.participantId = pid;
				target.participant = pid ? (op.meta.participant ?? { id: pid }) : null;
			}
			return data;
		},
		label: (op) =>
			op.body?.participantId
				? { key: 'offline.ops.bedAssign', params: { name: who(op), bed: op.meta.bed || '—' } }
				: { key: 'offline.ops.bedUnassign', params: { bed: op.meta.bed || '—' } },
	},
	{
		kind: 'tables.assignWalker',
		method: 'post',
		pattern: /^\/tables\/([^/]+)\/walkers$/,
		ids: (m, body) => ({ tableId: m[1], participantId: body?.participantId }),
		retreatId: () => null,
		routes: ['tables', 'table', 'participants'],
		reduce(route, data, op) {
			const pid = op.meta.participantId!;
			if (route === 'participants') {
				return updateParticipant(data, pid, (p) => (p.tableId = op.meta.tableId));
			}
			return forEachTable(route, data, (table) => {
				removeFromTable(table, pid);
				if (table.id === op.meta.tableId) {
					table.walkers = [...(table.walkers ?? []), op.meta.participant ?? { id: pid }];
				}
			});
		},
		label: (op) => ({ key: 'offline.ops.tableAssign', params: { name: who(op), table: op.meta.table || '—' } }),
	},
	{
		kind: 'tables.unassignWalker',
		method: 'delete',
		pattern: /^\/tables\/([^/]+)\/walkers\/([^/]+)$/,
		ids: (m) => ({ tableId: m[1], walkerId: m[2], participantId: m[2] }),
		retreatId: () => null,
		routes: ['tables', 'table', 'participants'],
		reduce(route, data, op) {
			const pid = op.meta.walkerId!;
			if (route === 'participants') {
				return updateParticipant(data, pid, (p) => {
					if (p.tableId === op.meta.tableId) p.tableId = null;
				});
			}
			return forEachTable(route, data, (table) => {
				if (table.id === op.meta.tableId && Array.isArray(table.walkers)) {
					table.walkers = table.walkers.filter((w: any) => w?.id !== pid);
				}
			});
		},
		label: (op) => ({ key: 'offline.ops.tableUnassign', params: { name: who(op), table: op.meta.table || '—' } }),
	},
];

export interface QueueableMatch {
	def: KindDef;
	ids: OutboxMeta;
	retreatId: string | null;
}

/** Is this write one that can wait for signal? */
export function matchQueueable(method: string | undefined, path: string, body: any): QueueableMatch | null {
	const m = (method ?? '').toLowerCase();
	for (const def of KINDS) {
		if (def.method !== m) continue;
		const match = def.pattern.exec(path);
		if (!match) continue;
		if (def.accepts && !def.accepts(body)) continue;
		return { def, ids: def.ids(match, body), retreatId: def.retreatId(match, body) };
	}
	return null;
}

export function kindDef(kind: OutboxKind): KindDef {
	const def = KINDS.find((k) => k.kind === kind);
	if (!def) throw new Error(`Unknown outbox kind: ${kind}`);
	return def;
}

const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

/** Applies `ops` (oldest first) to a cached GET answer. Never mutates `data`. */
export function applyOps(route: string, data: unknown, ops: OutboxOp[]): unknown {
	let out = data;
	let copied = false;
	for (const op of ops) {
		const def = kindDef(op.kind);
		if (!def.routes.includes(route)) continue;
		if (!copied) {
			out = clone(out);
			copied = true;
		}
		try {
			out = def.reduce(route, out, op);
		} catch (error) {
			console.warn('[offline] could not apply a pending change to the screen', op.kind, error);
		}
	}
	return out;
}
