import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock del cliente de API antes de importar el store.
vi.mock('@/services/api', () => ({
	getGlobalSequences: vi.fn(),
	createGlobalSequence: vi.fn(),
	updateGlobalSequence: vi.fn(),
	deleteGlobalSequence: vi.fn(),
	toggleGlobalSequenceActive: vi.fn(),
	copyGlobalSequenceToRetreat: vi.fn(),
}));

describe('globalMessageSequenceStore', () => {
	let store: any;
	let api: any;

	beforeEach(async () => {
		setActivePinia(createPinia());
		api = await import('@/services/api');
		const mod = await import('../globalMessageSequenceStore');
		store = mod.useGlobalMessageSequenceStore();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('fetchSequences carga la lista', async () => {
		api.getGlobalSequences.mockResolvedValue([{ id: 'g1', name: 'A' }]);
		await store.fetchSequences();
		expect(api.getGlobalSequences).toHaveBeenCalled();
		expect(store.sequences).toHaveLength(1);
		expect(store.sequences[0].name).toBe('A');
	});

	it('create antepone la nueva plantilla', async () => {
		store.sequences = [{ id: 'g0', name: 'Old' }];
		api.createGlobalSequence.mockResolvedValue({ id: 'g1', name: 'New' });
		const created = await store.create({ name: 'New' });
		expect(created.id).toBe('g1');
		expect(store.sequences[0].id).toBe('g1'); // unshift
	});

	it('update reemplaza la plantilla en la lista', async () => {
		store.sequences = [{ id: 'g1', name: 'A' }];
		api.updateGlobalSequence.mockResolvedValue({ id: 'g1', name: 'A2' });
		await store.update('g1', { name: 'A2' });
		expect(store.sequences[0].name).toBe('A2');
	});

	it('remove la quita de la lista', async () => {
		store.sequences = [{ id: 'g1' }, { id: 'g2' }];
		api.deleteGlobalSequence.mockResolvedValue(undefined);
		await store.remove('g1');
		expect(store.sequences.map((s: any) => s.id)).toEqual(['g2']);
	});

	it('toggleActive actualiza el estado en la lista', async () => {
		store.sequences = [{ id: 'g1', isActive: true }];
		api.toggleGlobalSequenceActive.mockResolvedValue({ id: 'g1', isActive: false });
		await store.toggleActive('g1');
		expect(store.sequences[0].isActive).toBe(false);
	});

	it('copyToRetreat delega en la API con el retreatId', async () => {
		api.copyGlobalSequenceToRetreat.mockResolvedValue({ id: 'seq-ret', retreatId: 'r1' });
		const res = await store.copyToRetreat('g1', 'r1');
		expect(api.copyGlobalSequenceToRetreat).toHaveBeenCalledWith('g1', 'r1');
		expect(res.retreatId).toBe('r1');
	});
});
