import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock the API functions
vi.mock('@/services/api', () => ({
	getTablesByRetreat: vi.fn(),
	assignLeaderToTable: vi.fn(),
	assignWalkerToTable: vi.fn(),
	unassignLeader: vi.fn(),
	unassignWalker: vi.fn(),
	api: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	},
}));

// Mock @repo/ui useToast
const toastSpy = vi.fn();
vi.mock('@repo/ui', () => ({
	useToast: vi.fn(() => ({
		toast: toastSpy,
	})),
}));

// Mock vue-router
vi.mock('vue-router', () => ({
	useRouter: () => ({
		push: vi.fn(),
	}),
}));

describe('TableMesaStore', () => {
	let store: any;
	let retreatStore: any;
	let participantStore: any;

	beforeEach(async () => {
		toastSpy.mockClear();
		const pinia = createPinia();
		setActivePinia(pinia);

		// Initialize retreatStore with selectedRetreatId
		const { useRetreatStore: useRetreatStoreImport } = await import('../retreatStore');
		retreatStore = useRetreatStoreImport();
		retreatStore.selectRetreat('test-retreat-id');

		// Initialize participantStore
		const { useParticipantStore: useParticipantStoreImport } = await import('../participantStore');
		participantStore = useParticipantStoreImport();

		// Import tableMesaStore after dependencies are set up
		const { useTableMesaStore: useTableMesaStoreImport } = await import('../tableMesaStore');
		store = useTableMesaStoreImport();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Initial State', () => {
		it('should initialize with empty tables array', () => {
			expect(store.tables).toEqual([]);
		});

		it('should initialize with isLoading false', () => {
			expect(store.isLoading).toBe(false);
		});

		it('should initialize with error null', () => {
			expect(store.error).toBe(null);
		});
	});

	describe('fetchTables', () => {
		const mockTables = [
			{ id: 'table-1', name: 'Mesa 1', retreatId: 'test-retreat-id' },
			{ id: 'table-2', name: 'Mesa 2', retreatId: 'test-retreat-id' },
		];

		it('should fetch tables successfully', async () => {
			const { getTablesByRetreat } = await import('@/services/api');
			(getTablesByRetreat as any).mockResolvedValue(mockTables);

			await store.fetchTables();

			expect(getTablesByRetreat).toHaveBeenCalledWith('test-retreat-id');
			expect(store.tables).toEqual(mockTables);
			expect(store.isLoading).toBe(false);
		});

		it('should return early with null retreatId', async () => {
			retreatStore.selectRetreat(null);

			await store.fetchTables();

			expect(store.tables).toEqual([]);
		});

		it('should handle API errors with toast', async () => {
			const { getTablesByRetreat } = await import('@/services/api');
			const error = new Error('Failed to fetch');
			(getTablesByRetreat as any).mockRejectedValue(error);

			await store.fetchTables();

			expect(store.error).toBe('Failed to fetch tables.');
			expect(store.isLoading).toBe(false);
			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Failed to fetch tables.',
				variant: 'destructive',
			});
		});
	});

	describe('assignLeader - CROSS-TABLE LOGIC', () => {
		const baseTable = { id: 'table-1', name: 'Mesa 1', retreatId: 'retreat-1', liders: [] };
		const updatedTable = { ...baseTable, liders: [{ participantId: 'part-1', role: 'lider' }] };

		it('should assign leader to table', async () => {
			const { assignLeaderToTable } = await import('@/services/api');
			store.tables = [baseTable];
			(assignLeaderToTable as any).mockResolvedValue(updatedTable);

			await store.assignLeader('table-1', 'part-1', 'lider');

			expect(assignLeaderToTable).toHaveBeenCalledWith('table-1', 'part-1', 'lider');
			expect(store.tables[0]).toEqual(updatedTable);
		});

		it('should handle same-table role changes', async () => {
			const { assignLeaderToTable, unassignLeader } = await import('@/services/api');
			store.tables = [{ ...baseTable, liders: [{ participantId: 'part-1', role: 'lider' }] }];
			(unassignLeader as any).mockResolvedValue(baseTable);
			(assignLeaderToTable as any).mockResolvedValue(updatedTable);

			await store.assignLeader('table-1', 'part-1', 'colider1', 'table-1', 'lider');

			expect(unassignLeader).toHaveBeenCalledWith('table-1', 'lider');
			expect(assignLeaderToTable).toHaveBeenCalledWith('table-1', 'part-1', 'colider1');
		});

		it('should handle errors with toast', async () => {
			const { assignLeaderToTable } = await import('@/services/api');
			const error = new Error('Assignment failed');
			store.tables = [baseTable];
			(assignLeaderToTable as any).mockRejectedValue(error);

			await store.assignLeader('table-1', 'part-1', 'lider');

			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Failed to assign lider',
				variant: 'destructive',
			});
		});
	});

	describe('assignWalkerToTable', () => {
		const baseTable = {
			id: 'table-1',
			name: 'Mesa 1',
			retreatId: 'retreat-1',
			walkers: [],
		};
		const updatedTable = { ...baseTable, walkers: [{ id: 'walker-1', name: 'Walker 1' }] };

		it('should assign walker to table', async () => {
			const { assignWalkerToTable: assignWalkerToTableApi } = await import('@/services/api');
			store.tables = [baseTable];
			(assignWalkerToTableApi as any).mockResolvedValue(updatedTable);

			await store.assignWalkerToTable('table-1', 'walker-1');

			expect(assignWalkerToTableApi).toHaveBeenCalledWith('table-1', 'walker-1');
			expect(store.tables[0]).toEqual(updatedTable);
		});

		it('should handle API errors with toast', async () => {
			const { assignWalkerToTable: assignWalkerToTableApi } = await import('@/services/api');
			const error = { response: { data: { message: 'Custom error' } } };
			store.tables = [baseTable];
			(assignWalkerToTableApi as any).mockRejectedValue(error);

			await store.assignWalkerToTable('table-1', 'walker-1');

			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Custom error',
				variant: 'destructive',
			});
		});
	});

	describe('unassignLeader', () => {
		const baseTable = {
			id: 'table-1',
			name: 'Mesa 1',
			retreatId: 'retreat-1',
			liders: [{ participantId: 'part-1', role: 'lider' }],
		};
		const updatedTable = { id: 'table-1', name: 'Mesa 1', retreatId: 'retreat-1', liders: [] };

		it('should unassign leader successfully', async () => {
			const { unassignLeader: unassignLeaderApi } = await import('@/services/api');
			store.tables = [baseTable];
			(unassignLeaderApi as any).mockResolvedValue(updatedTable);

			await store.unassignLeader('table-1', 'lider');

			expect(unassignLeaderApi).toHaveBeenCalledWith('table-1', 'lider');
			expect(store.tables[0]).toEqual(updatedTable);
		});

		it('should handle errors with toast', async () => {
			const { unassignLeader: unassignLeaderApi } = await import('@/services/api');
			const error = new Error('Unassign failed');
			store.tables = [baseTable];
			(unassignLeaderApi as any).mockRejectedValue(error);

			await store.unassignLeader('table-1', 'lider');

			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Failed to unassign lider',
				variant: 'destructive',
			});
		});
	});

	describe('unassignWalkerFromTable - OPTIMISTIC UPDATES', () => {
		const walker = { id: 'walker-1', name: 'Walker 1', tableId: 'table-1' };
		const baseTable = {
			id: 'table-1',
			name: 'Mesa 1',
			retreatId: 'retreat-1',
			walkers: [walker],
		};

		beforeEach(() => {
			participantStore.participants = [walker];
		});

		it('should optimistically remove walker before API call', async () => {
			const { unassignWalker: unassignWalkerApi } = await import('@/services/api');
			store.tables = [baseTable];
			(unassignWalkerApi as any).mockResolvedValue({});

			await store.unassignWalkerFromTable('table-1', 'walker-1');

			// Walker should be removed immediately (optimistic update)
			expect(store.tables[0].walkers).toHaveLength(0);
		});

		it('should update participantStore after successful unassignment', async () => {
			const { unassignWalker: unassignWalkerApi } = await import('@/services/api');
			store.tables = [baseTable];
			(unassignWalkerApi as any).mockResolvedValue({});

			await store.unassignWalkerFromTable('table-1', 'walker-1');

			expect(participantStore.participants[0].tableId).toBe(null);
		});

		it('should handle errors with toast', async () => {
			const { unassignWalker: unassignWalkerApi } = await import('@/services/api');
			const error = new Error('Unassign failed');
			store.tables = [baseTable];
			(unassignWalkerApi as any).mockRejectedValue(error);

			await store.unassignWalkerFromTable('table-1', 'walker-1');

			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Failed to unassign walker',
				variant: 'destructive',
			});
		});
	});

	describe('rebalanceTables', () => {
		it('should rebalance tables and refetch', async () => {
			const { api } = await import('@/services/api');
			const mockTables = [
				{ id: 'table-1', name: 'Mesa 1', retreatId: 'test-retreat-id' },
				{ id: 'table-2', name: 'Mesa 2', retreatId: 'test-retreat-id' },
			];
			(api.post as any).mockResolvedValue({});
			const { getTablesByRetreat } = await import('@/services/api');
			(getTablesByRetreat as any).mockResolvedValue(mockTables);

			await store.rebalanceTables('test-retreat-id');

			expect(api.post).toHaveBeenCalledWith('/tables/rebalance/test-retreat-id');
			expect(getTablesByRetreat).toHaveBeenCalledWith('test-retreat-id');
			expect(store.tables).toEqual(mockTables);
		});

		it('should handle errors with toast', async () => {
			const { api } = await import('@/services/api');
			const error = new Error('Rebalance failed');
			(api.post as any).mockRejectedValue(error);

			await store.rebalanceTables('retreat-1');

			expect(store.error).toBe('Failed to rebalance tables.');
			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Failed to rebalance tables.',
				variant: 'destructive',
			});
		});
	});

	describe('createTable', () => {
		it('should create table with auto-incremented name', async () => {
			const { api } = await import('@/services/api');
			store.tables = [
				{ id: 'table-1', name: 'Mesa 1', retreatId: 'test-retreat-id' },
				{ id: 'table-2', name: 'Mesa 2', retreatId: 'test-retreat-id' },
			];
			const newTable = { id: 'table-3', name: 'Mesa 3', retreatId: 'test-retreat-id' };
			(api.post as any).mockResolvedValue({ data: newTable });

			await store.createTable();

			expect(api.post).toHaveBeenCalledWith('/tables', {
				name: 'Mesa 3',
				retreatId: 'test-retreat-id',
			});
			expect(store.tables).toHaveLength(3);
			expect(store.tables[2]).toEqual(newTable);
		});

		it('should return early if no retreat selected', async () => {
			retreatStore.selectRetreat(null);

			await store.createTable();

			// Should not make any API call
			const { api } = await import('@/services/api');
			expect(api.post).not.toHaveBeenCalled();
		});

		it('should handle errors with toast', async () => {
			const { api } = await import('@/services/api');
			const error = new Error('Create failed');
			store.tables = [];
			(api.post as any).mockRejectedValue(error);

			await store.createTable();

			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Failed to create table',
				variant: 'destructive',
			});
		});
	});

	describe('deleteTable', () => {
		it('should delete table successfully', async () => {
			const { api } = await import('@/services/api');
			store.tables = [
				{ id: 'table-1', name: 'Mesa 1', retreatId: 'retreat-1' },
				{ id: 'table-2', name: 'Mesa 2', retreatId: 'retreat-1' },
			];
			(api.delete as any).mockResolvedValue({});

			await store.deleteTable('table-1');

			expect(api.delete).toHaveBeenCalledWith('/tables/table-1');
			expect(store.tables).toHaveLength(1);
			expect(store.tables[0].id).toBe('table-2');
		});

		it('should re-throw errors for component handling', async () => {
			const { api } = await import('@/services/api');
			const error = new Error('Delete failed');
			store.tables = [{ id: 'table-1', name: 'Mesa 1', retreatId: 'retreat-1' }];
			(api.delete as any).mockRejectedValue(error);

			await expect(store.deleteTable('table-1')).rejects.toThrow(error);
			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Failed to delete table',
				variant: 'destructive',
			});
		});
	});

	describe('Edge Cases', () => {
		it('should handle missing walkers array', async () => {
			const { unassignWalker: unassignWalkerApi } = await import('@/services/api');
			const tableWithoutWalkers = {
				id: 'table-1',
				name: 'Mesa 1',
				retreatId: 'retreat-1',
			};
			store.tables = [tableWithoutWalkers];
			(unassignWalkerApi as any).mockResolvedValue({});

			// Should not throw error
			await store.unassignWalkerFromTable('table-1', 'walker-1');

			expect(store.tables[0]).toEqual(tableWithoutWalkers);
		});

		it('should handle non-existent table in unassignWalker', async () => {
			const { unassignWalker: unassignWalkerApi } = await import('@/services/api');
			store.tables = [];
			(unassignWalkerApi as any).mockResolvedValue({});

			// Should not throw error
			await store.unassignWalkerFromTable('table-1', 'walker-1');
		});
	});
});
