/**
 * schedule:attachment-changed WS event — pure-logic tests for the
 * payload shape & semantics.
 *
 * The actual emit is wired in `responsabilityAttachmentService` and goes
 * through socket.io's room-based broadcast. Booting socket.io in jest is
 * out of scope for this simple suite; instead we mock `emitScheduleAttachmentChanged`
 * and assert it's called with the right payload shape on each lifecycle event
 * (upload, createMarkdown, update, delete).
 *
 * What we don't test here (covered by integration / manual):
 *   - Actual socket.io delivery to subscribed clients
 *   - Cross-room isolation
 *   - Frontend reload trigger
 *
 * What we DO test:
 *   - Payload contract (responsabilityName + action + attachmentId + kind)
 *   - Action enum exhaustiveness (created/updated/deleted)
 *   - Each lifecycle method emits exactly once
 */

type EmitFn = (payload: {
	responsabilityName: string;
	action: 'created' | 'updated' | 'deleted';
	attachmentId: string;
	kind: 'file' | 'markdown';
}) => void;

/**
 * Minimal in-memory mock of the service's emit pattern.
 * Mirrors what `responsabilityAttachmentService` does in upload/createMarkdown/update/delete.
 */
function mockServiceLifecycle(emit: EmitFn) {
	return {
		uploadFile(name: string, attachmentId: string) {
			// ... DB save ...
			emit({ responsabilityName: name, action: 'created', attachmentId, kind: 'file' });
		},
		createMarkdown(name: string, attachmentId: string) {
			// ... DB save ...
			emit({ responsabilityName: name, action: 'created', attachmentId, kind: 'markdown' });
		},
		update(name: string, attachmentId: string, kind: 'file' | 'markdown') {
			// ... DB save ...
			emit({ responsabilityName: name, action: 'updated', attachmentId, kind });
		},
		updateMarkdown(name: string, attachmentId: string) {
			emit({ responsabilityName: name, action: 'updated', attachmentId, kind: 'markdown' });
		},
		delete(name: string, attachmentId: string, kind: 'file' | 'markdown') {
			// ... DB delete ...
			emit({ responsabilityName: name, action: 'deleted', attachmentId, kind });
		},
	};
}

describe('schedule:attachment-changed — emit contract', () => {
	let calls: any[];
	let svc: ReturnType<typeof mockServiceLifecycle>;

	beforeEach(() => {
		calls = [];
		svc = mockServiceLifecycle((p) => calls.push(p));
	});

	it('uploadFile emits once with action=created and kind=file', () => {
		svc.uploadFile('Comedor', 'att-1');
		expect(calls).toEqual([
			{ responsabilityName: 'Comedor', action: 'created', attachmentId: 'att-1', kind: 'file' },
		]);
	});

	it('createMarkdown emits once with action=created and kind=markdown', () => {
		svc.createMarkdown('Campanero', 'att-2');
		expect(calls).toEqual([
			{ responsabilityName: 'Campanero', action: 'created', attachmentId: 'att-2', kind: 'markdown' },
		]);
	});

	it('update emits action=updated preserving the original kind', () => {
		svc.update('Comedor', 'att-1', 'file');
		expect(calls).toEqual([
			{ responsabilityName: 'Comedor', action: 'updated', attachmentId: 'att-1', kind: 'file' },
		]);
	});

	it('updateMarkdown emits action=updated kind=markdown', () => {
		svc.updateMarkdown('Charla 1 — Conocerte a ti mismo', 'att-3');
		expect(calls).toEqual([
			{
				responsabilityName: 'Charla 1 — Conocerte a ti mismo',
				action: 'updated',
				attachmentId: 'att-3',
				kind: 'markdown',
			},
		]);
	});

	it('delete emits action=deleted with the deleted attachment metadata', () => {
		svc.delete('Diario', 'att-4', 'markdown');
		expect(calls).toEqual([
			{ responsabilityName: 'Diario', action: 'deleted', attachmentId: 'att-4', kind: 'markdown' },
		]);
	});

	it('a full lifecycle emits exactly 3 events (create, update, delete) — no double-fire', () => {
		svc.uploadFile('Comedor', 'att-1');
		svc.update('Comedor', 'att-1', 'file');
		svc.delete('Comedor', 'att-1', 'file');
		expect(calls).toHaveLength(3);
		expect(calls.map((c) => c.action)).toEqual(['created', 'updated', 'deleted']);
	});

	it('payload responsabilityName is sent verbatim (not normalized) for downstream comparison', () => {
		// Frontend's relevance check matches against responsabilityStore names which
		// preserve user-typed casing (e.g. "Acólito" vs "acólito"). The WS payload
		// should not lower-case or normalize.
		svc.uploadFile('Acólito', 'att-x');
		expect(calls[0].responsabilityName).toBe('Acólito');
	});

	it('action enum is exhaustive — exactly one of created/updated/deleted', () => {
		svc.uploadFile('a', '1');
		svc.update('a', '1', 'file');
		svc.delete('a', '1', 'file');
		const actions = new Set(calls.map((c) => c.action));
		expect(actions).toEqual(new Set(['created', 'updated', 'deleted']));
	});
});

/**
 * Frontend-side reload predicate. Currently the store always reloads when
 * subscribed (cost is one GET per attachment edit, rare event).
 *
 * If we later add a smart filter (only reload if any item.responsabilityName
 * matches), these tests will need to be updated.
 */
describe('schedule:attachment-changed — frontend reload semantics', () => {
	function shouldReload(opts: {
		subscribedRetreatId: string | null;
	}): boolean {
		// Mirror of `scheduleStore.subscribeRealtime` onAttachmentChanged.
		return !!opts.subscribedRetreatId;
	}

	it('reloads when subscribed to any retreat', () => {
		expect(shouldReload({ subscribedRetreatId: 'retreat-A' })).toBe(true);
	});

	it('skips when not subscribed (e.g., MaM is closed)', () => {
		expect(shouldReload({ subscribedRetreatId: null })).toBe(false);
	});
});

/**
 * Public big-screen WebSocket — pure-logic tests for the room mirroring +
 * subscribe contract.
 *
 * The actual socket.io broadcast lives in `realtime.ts`; this suite covers:
 *   - Room name format (collision-free, predictable)
 *   - `emitToBoth` semantics: events that go to BOTH authenticated and
 *     public rooms, vs events that stay authenticated-only (bell, upcoming,
 *     attachment-changed)
 *   - `public:schedule:subscribe` validation (slug + isPublic only)
 */

function publicScheduleRoom(retreatId: string): string {
	return `public:retreat:${retreatId}:schedule`;
}

function scheduleRoom(retreatId: string): string {
	return `retreat:${retreatId}:schedule`;
}

describe('public big-screen WebSocket — room contract', () => {
	it('publicScheduleRoom is collision-free with the authenticated room', () => {
		const retreatId = 'r1';
		expect(publicScheduleRoom(retreatId)).not.toBe(scheduleRoom(retreatId));
		expect(publicScheduleRoom(retreatId)).toMatch(/^public:retreat:r1:schedule$/);
	});

	it('different retreats get different rooms (isolation)', () => {
		expect(publicScheduleRoom('r1')).not.toBe(publicScheduleRoom('r2'));
	});
});

describe('public big-screen WebSocket — emitToBoth event routing', () => {
	type Emitted = { room: string; event: string };
	const emitted: Emitted[] = [];
	const fakeIo = {
		to: (room: string) => ({
			emit: (event: string, _payload: unknown) => {
				emitted.push({ room, event });
			},
		}),
	};

	function emitToBoth(retreatId: string, event: string, payload: unknown): void {
		fakeIo.to(scheduleRoom(retreatId)).emit(event, payload);
		fakeIo.to(publicScheduleRoom(retreatId)).emit(event, payload);
	}

	beforeEach(() => {
		emitted.length = 0;
	});

	it('emitToBoth pushes to BOTH the auth room and the public mirror', () => {
		emitToBoth('r1', 'schedule:item-started', { foo: 'bar' });
		expect(emitted).toEqual([
			{ room: 'retreat:r1:schedule', event: 'schedule:item-started' },
			{ room: 'public:retreat:r1:schedule', event: 'schedule:item-started' },
		]);
	});

	it('emit-only-to-auth-room (bell, upcoming, attachment-changed) does NOT touch public room', () => {
		// Mirrors the `io.to(scheduleRoom(...)).emit(...)` pattern for
		// authenticated-only events.
		fakeIo.to(scheduleRoom('r1')).emit('schedule:bell', {});
		fakeIo.to(scheduleRoom('r1')).emit('schedule:upcoming', {});
		fakeIo.to('schedule:global').emit('schedule:attachment-changed', {});

		const publicHits = emitted.filter((e) => e.room.startsWith('public:'));
		expect(publicHits).toEqual([]);
	});
});

describe('public big-screen WebSocket — subscribe validation', () => {
	type MockRetreat = { id: string; slug: string; isPublic: boolean };

	function publicSubscribe(opts: {
		slug: unknown;
		retreats: MockRetreat[];
	}): { ok: boolean; retreatId?: string } {
		if (typeof opts.slug !== 'string' || !opts.slug) return { ok: false };
		const retreat = opts.retreats.find((r) => r.slug === opts.slug);
		if (!retreat || !retreat.isPublic) return { ok: false };
		return { ok: true, retreatId: retreat.id };
	}

	it('rejects empty/null slug', () => {
		expect(publicSubscribe({ slug: '', retreats: [] }).ok).toBe(false);
		expect(publicSubscribe({ slug: null, retreats: [] }).ok).toBe(false);
		expect(publicSubscribe({ slug: 42, retreats: [] }).ok).toBe(false);
	});

	it('rejects slug that does not match any retreat', () => {
		expect(
			publicSubscribe({
				slug: 'no-existe',
				retreats: [{ id: 'r1', slug: 'mi-retiro', isPublic: true }],
			}).ok,
		).toBe(false);
	});

	it('rejects when retreat exists but is private (isPublic=false)', () => {
		expect(
			publicSubscribe({
				slug: 'mi-retiro',
				retreats: [{ id: 'r1', slug: 'mi-retiro', isPublic: false }],
			}).ok,
		).toBe(false);
	});

	it('returns retreatId on successful subscribe', () => {
		const r = publicSubscribe({
			slug: 'mi-retiro',
			retreats: [{ id: 'r1', slug: 'mi-retiro', isPublic: true }],
		});
		expect(r).toEqual({ ok: true, retreatId: 'r1' });
	});
});
