import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock de la API antes de importar el store (incluye todos los named imports).
vi.mock('@/services/api', () => ({
	getRetreatSequences: vi.fn(),
	createMessageSequence: vi.fn(),
	updateMessageSequence: vi.fn(),
	deleteMessageSequence: vi.fn(),
	getSequenceQueue: vi.fn(),
	getSequenceStats: vi.fn(),
	getScheduledMessageDetail: vi.fn(),
	runSequences: vi.fn(),
	regenerateSequenceQueue: vi.fn(),
	bulkResolveSequenceIssues: vi.fn(),
	dispatchScheduledMessage: vi.fn(),
	skipScheduledMessage: vi.fn(),
	retryScheduledMessage: vi.fn(),
	discardScheduledMessage: vi.fn(),
	openScheduledMessage: vi.fn(),
	assignScheduledMessage: vi.fn(),
	setParticipantDoNotContact: vi.fn(),
}));

describe('messageSequenceStore — despacho/ownership/opt-out', () => {
	let store: any;
	let api: any;

	beforeEach(async () => {
		setActivePinia(createPinia());
		api = await import('@/services/api');
		const mod = await import('../messageSequenceStore');
		store = mod.useMessageSequenceStore();
		vi.clearAllMocks();
	});

	afterEach(() => vi.restoreAllMocks());

	it('dispatch saca el ítem de la bandeja', async () => {
		store.queue = [{ id: 'a' }, { id: 'b' }];
		api.dispatchScheduledMessage.mockResolvedValue(undefined);
		await store.dispatch('a');
		expect(store.queue.map((q: any) => q.id)).toEqual(['b']);
	});

	it('skip saca el ítem de la bandeja', async () => {
		store.queue = [{ id: 'a' }, { id: 'b' }];
		api.skipScheduledMessage.mockResolvedValue(undefined);
		await store.skip('b');
		expect(store.queue.map((q: any) => q.id)).toEqual(['a']);
	});

	it('open marca openedAt sin sacar el ítem', async () => {
		store.queue = [{ id: 'a', openedAt: null }];
		api.openScheduledMessage.mockResolvedValue(undefined);
		await store.open('a');
		expect(api.openScheduledMessage).toHaveBeenCalledWith('a');
		expect(store.queue).toHaveLength(1);
		expect(store.queue[0].openedAt).toBeTruthy();
	});

	it('assign actualiza assignedTo en la bandeja', async () => {
		store.queue = [{ id: 'a', assignedTo: null }];
		api.assignScheduledMessage.mockResolvedValue(undefined);
		await store.assign('a', 'user-1');
		expect(api.assignScheduledMessage).toHaveBeenCalledWith('a', 'user-1');
		expect(store.queue[0].assignedTo).toBe('user-1');
	});

	it('retry saca el ítem de problemas (y de la cola)', async () => {
		store.issues = [{ id: 'x' }, { id: 'y' }];
		store.queue = [{ id: 'x' }];
		api.retryScheduledMessage.mockResolvedValue(undefined);
		await store.retry('x');
		expect(api.retryScheduledMessage).toHaveBeenCalledWith('x');
		expect(store.issues.map((q: any) => q.id)).toEqual(['y']);
		expect(store.queue).toHaveLength(0);
	});

	it('discard saca el ítem de problemas', async () => {
		store.issues = [{ id: 'x' }, { id: 'y' }];
		api.discardScheduledMessage.mockResolvedValue(undefined);
		await store.discard('y');
		expect(api.discardScheduledMessage).toHaveBeenCalledWith('y');
		expect(store.issues.map((q: any) => q.id)).toEqual(['x']);
	});

	it('regenerateQueue llama al endpoint y refresca la bandeja', async () => {
		api.regenerateSequenceQueue.mockResolvedValue({ regenerated: 3 });
		api.getSequenceQueue.mockResolvedValue([]);
		const res = await store.regenerateQueue('r1');
		expect(api.regenerateSequenceQueue).toHaveBeenCalledWith('r1');
		expect(api.getSequenceQueue).toHaveBeenCalledWith('r1');
		expect(res).toEqual({ regenerated: 3 });
	});

	it('bulkResolveIssues llama al endpoint con la acción y refresca', async () => {
		api.bulkResolveSequenceIssues.mockResolvedValue({ affected: 5 });
		api.getSequenceQueue.mockResolvedValue([]);
		api.getSequenceStats.mockResolvedValue({ stats: {}, issues: [] });
		const res = await store.bulkResolveIssues('r1', 'discard');
		expect(api.bulkResolveSequenceIssues).toHaveBeenCalledWith('r1', 'discard');
		expect(res).toEqual({ affected: 5 });
	});

	it('setDoNotContact actualiza el detalle abierto del participante', async () => {
		store.detail = { participant: { id: 'p1', doNotContact: false } };
		api.setParticipantDoNotContact.mockResolvedValue({ id: 'p1', doNotContact: true });
		await store.setDoNotContact('r1', 'p1', true);
		expect(api.setParticipantDoNotContact).toHaveBeenCalledWith('r1', 'p1', true);
		expect(store.detail.participant.doNotContact).toBe(true);
	});
});
