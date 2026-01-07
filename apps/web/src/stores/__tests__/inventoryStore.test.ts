import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock the api service - define it first
const mockApi = {
	get: vi.fn(),
	post: vi.fn(),
	put: vi.fn(),
	delete: vi.fn(),
};

vi.mock('@/services/api', () => ({
	api: mockApi,
}));

// Mock @repo/ui useToast - create a spy for the toast function
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

describe('InventoryStore', () => {
	let store: any;

	beforeEach(async () => {
		toastSpy.mockClear();
		setActivePinia(createPinia());
		// Import store after mocks are set up
		const { useInventoryStore: useInventoryStoreImport } = await import('../inventoryStore');
		store = useInventoryStoreImport();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Initial State', () => {
		it('should initialize with empty arrays', () => {
			expect(store.categories).toEqual([]);
			expect(store.teams).toEqual([]);
			expect(store.items).toEqual([]);
			expect(store.retreatInventory).toEqual([]);
			expect(store.retreatInventoryByCategory).toEqual({});
			expect(store.inventoryAlerts).toEqual([]);
		});

		it('should initialize with loading false', () => {
			expect(store.loading).toBe(false);
		});

		it('should initialize with error null', () => {
			expect(store.error).toBe(null);
		});
	});

	describe('Categories', () => {
		const mockCategories = [
			{ id: 'cat-1', name: 'Food', description: 'Food items' },
			{ id: 'cat-2', name: 'Drinks', description: 'Beverages' },
		];

		it('should fetch categories successfully', async () => {
			mockApi.get.mockResolvedValue({ data: mockCategories });

			await store.fetchCategories();

			expect(mockApi.get).toHaveBeenCalledWith('/inventory/categories');
			expect(store.categories).toEqual(mockCategories);
		});

		it('should handle API errors with toast', async () => {
			const error = new Error('Failed to fetch');
			mockApi.get.mockRejectedValue(error);

			await store.fetchCategories();

			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: expect.any(String),
				variant: 'destructive',
			});
		});

		it('should create category successfully', async () => {
			const newCategory = { name: 'Snacks', description: 'Snack items' };
			const createdCategory = { id: 'cat-3', ...newCategory };
			mockApi.post.mockResolvedValue({ data: createdCategory });

			await store.createCategory(newCategory);

			expect(mockApi.post).toHaveBeenCalledWith('/inventory/categories', newCategory);
			expect(store.categories).toContainEqual(createdCategory);
		});

		it('should handle create category errors', async () => {
			const error = new Error('Create failed');
			mockApi.post.mockRejectedValue(error);

			await store.createCategory({ name: 'Test' });

			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: expect.any(String),
				variant: 'destructive',
			});
		});
	});

	describe('Teams', () => {
		const mockTeams = [
			{ id: 'team-1', name: 'Kitchen', description: 'Kitchen staff' },
			{ id: 'team-2', name: 'Cleaning', description: 'Cleaning staff' },
		];

		it('should fetch teams successfully', async () => {
			mockApi.get.mockResolvedValue({ data: mockTeams });

			await store.fetchTeams();

			expect(mockApi.get).toHaveBeenCalledWith('/inventory/teams');
			expect(store.teams).toEqual(mockTeams);
		});

		it('should create team successfully', async () => {
			const newTeam = { name: 'Security', description: 'Security team' };
			const createdTeam = { id: 'team-3', ...newTeam };
			mockApi.post.mockResolvedValue({ data: createdTeam });

			await store.createTeam(newTeam);

			expect(mockApi.post).toHaveBeenCalledWith('/inventory/teams', newTeam);
			expect(store.teams).toContainEqual(createdTeam);
		});
	});

	describe('Items', () => {
		const mockItems = [
			{ id: 'item-1', name: 'Apple', categoryId: 'cat-1', teamId: 'team-1', ratio: 2, unit: 'kg' },
			{ id: 'item-2', name: 'Orange', categoryId: 'cat-1', teamId: 'team-1', ratio: 3, unit: 'kg' },
		];

		it('should fetch items successfully', async () => {
			mockApi.get.mockResolvedValue({ data: mockItems });

			await store.fetchItems();

			expect(mockApi.get).toHaveBeenCalledWith('/inventory/items');
			expect(store.items).toEqual(mockItems);
		});

		it('should create item successfully', async () => {
			const newItem = {
				name: 'Banana',
				description: 'Yellow fruit',
				categoryId: 'cat-1',
				teamId: 'team-1',
				ratio: 1,
				unit: 'kg',
			};
			const createdItem = { id: 'item-3', ...newItem };
			mockApi.post.mockResolvedValue({ data: createdItem });

			await store.createItem(newItem);

			expect(mockApi.post).toHaveBeenCalledWith('/inventory/items', newItem);
			expect(store.items).toContainEqual(createdItem);
		});

		it('should update item successfully', async () => {
			store.items = [
				{
					id: 'item-1',
					name: 'Apple',
					categoryId: 'cat-1',
					teamId: 'team-1',
					ratio: 2,
					unit: 'kg',
				},
			];
			const updatedItem = { ...store.items[0], ratio: 3 };
			mockApi.put.mockResolvedValue({ data: updatedItem });

			await store.updateItem('item-1', { ratio: 3 });

			expect(mockApi.put).toHaveBeenCalledWith('/inventory/items/item-1', { ratio: 3 });
			expect(store.items[0]).toEqual(updatedItem);
		});
	});

	describe('Retreat Inventory', () => {
		const mockRetreatInventory = [
			{ id: 'inv-1', itemId: 'item-1', retreatId: 'retreat-1', quantity: 10 },
			{ id: 'inv-2', itemId: 'item-2', retreatId: 'retreat-1', quantity: 20 },
		];

		it('should fetch retreat inventory successfully', async () => {
			mockApi.get.mockResolvedValue({ data: mockRetreatInventory });

			await store.fetchRetreatInventory('retreat-1');

			expect(mockApi.get).toHaveBeenCalledWith('/inventory/retreat/retreat-1');
			expect(store.retreatInventory).toEqual(mockRetreatInventory);
		});

		it('should fetch retreat inventory by category successfully', async () => {
			const categoryData = {
				'cat-1': [{ id: 'inv-1', itemId: 'item-1', retreatId: 'retreat-1', quantity: 10 }],
			};
			mockApi.get.mockResolvedValue({ data: categoryData });

			await store.fetchRetreatInventoryByCategory('retreat-1');

			expect(mockApi.get).toHaveBeenCalledWith('/inventory/retreat/retreat-1/by-category');
			expect(store.retreatInventoryByCategory).toEqual(categoryData);
		});
	});

	describe('updateRetreatInventory - DUAL-ARRAY SYNC', () => {
		const baseInventory = [
			{ id: 'inv-1', inventoryItemId: 'item-1', retreatId: 'retreat-1', quantity: 10 },
			{ id: 'inv-2', inventoryItemId: 'item-2', retreatId: 'retreat-1', quantity: 20 },
		];

		it('should update flat retreatInventory array', async () => {
			store.retreatInventory = [...baseInventory];
			const updatedItem = { ...baseInventory[0], quantity: 15 };
			mockApi.put.mockResolvedValue({ data: updatedItem });

			await store.updateRetreatInventory('retreat-1', 'item-1', { quantity: 15 });

			expect(mockApi.put).toHaveBeenCalledWith('/inventory/retreat/retreat-1/item-1', {
				quantity: 15,
			});
			expect(store.retreatInventory[0]).toEqual(updatedItem);
		});

		it('should update retreatInventoryByCategory when item exists in category', async () => {
			store.retreatInventory = [...baseInventory];
			store.retreatInventoryByCategory = {
				'cat-1': [
					{
						id: 'inv-1',
						inventoryItemId: 'item-1',
						categoryId: 'cat-1',
						retreatId: 'retreat-1',
						quantity: 10,
					},
				],
			};
			const updatedItem = {
				...baseInventory[0],
				categoryId: 'cat-1',
				quantity: 15,
			};
			mockApi.put.mockResolvedValue({ data: updatedItem });

			await store.updateRetreatInventory('retreat-1', 'item-1', { quantity: 15 });

			// Should update both arrays
			expect(store.retreatInventory[0].quantity).toBe(15);
			expect(store.retreatInventoryByCategory['cat-1'][0].quantity).toBe(15);
		});

		it('should handle errors gracefully', async () => {
			store.retreatInventory = [...baseInventory];
			const error = new Error('Update failed');
			mockApi.put.mockRejectedValue(error);

			await store.updateRetreatInventory('retreat-1', 'item-1', { quantity: 15 });

			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Failed to update inventory.',
				variant: 'destructive',
			});
		});
	});

	describe('calculateRequiredQuantities', () => {
		it('should calculate and refresh data', async () => {
			mockApi.post.mockResolvedValue({});
			mockApi.get.mockResolvedValue({ data: [] });

			await store.calculateRequiredQuantities('retreat-1');

			expect(mockApi.post).toHaveBeenCalledWith('/inventory/retreat/retreat-1/calculate');
			// Should refresh data after calculation
			expect(mockApi.get).toHaveBeenCalled();
		});
	});

	describe('fetchInventoryAlerts', () => {
		const mockAlerts = [
			{ id: 'alert-1', itemId: 'item-1', retreatId: 'retreat-1', type: 'low_stock' },
			{ id: 'alert-2', itemId: 'item-2', retreatId: 'retreat-1', type: 'overstock' },
		];

		it('should fetch alerts successfully', async () => {
			mockApi.get.mockResolvedValue({ data: mockAlerts });

			await store.fetchInventoryAlerts('retreat-1');

			expect(mockApi.get).toHaveBeenCalledWith('/inventory/retreat/retreat-1/alerts');
			expect(store.inventoryAlerts).toEqual(mockAlerts);
		});
	});

	describe('exportInventory', () => {
		const mockExportData = [
			{ item: 'Apple', quantity: 10, unit: 'kg' },
			{ item: 'Orange', quantity: 20, unit: 'kg' },
		];

		it('should export inventory data successfully', async () => {
			mockApi.get.mockResolvedValue({ data: mockExportData });

			const result = await store.exportInventory('retreat-1');

			expect(mockApi.get).toHaveBeenCalledWith('/inventory/retreat/retreat-1/export');
			expect(result).toEqual(mockExportData);
		});
	});

	describe('importInventory - MULTI-REFRESH', () => {
		const mockImportData = [
			{ itemId: 'item-1', quantity: 10 },
			{ itemId: 'item-2', quantity: 20 },
		];

		it('should import inventory and refresh data', async () => {
			mockApi.post.mockResolvedValue({
				data: {
					success: mockImportData,
					failed: 0,
					errors: [],
				},
			});
			mockApi.get.mockResolvedValue({ data: [] });

			const result = await store.importInventory('retreat-1', mockImportData);

			expect(mockApi.post).toHaveBeenCalledWith('/inventory/retreat/retreat-1/import', {
				data: mockImportData,
			});
			// Should refresh data after import
			expect(result).toEqual({
				success: mockImportData,
				failed: 0,
				errors: [],
			});
			expect(mockApi.get).toHaveBeenCalled();
		});

		it('should handle partial import success with toast', async () => {
			mockApi.post.mockResolvedValue({
				data: {
					success: [{ itemId: 'item-1', quantity: 10 }],
					failed: 1,
					errors: ['Item 2 not found'],
				},
			});
			mockApi.get.mockResolvedValue({ data: [] });

			await store.importInventory('retreat-1', mockImportData);

			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Import Complete',
				description: 'Successfully imported 1 items. 1 errors occurred.',
				variant: 'destructive',
			});
		});
	});

	describe('initializeInventoryData', () => {
		it('should fetch categories, teams, and items in parallel', async () => {
			mockApi.get.mockResolvedValue({ data: [] });

			await store.initializeInventoryData();

			// Should make 3 parallel calls
			expect(mockApi.get).toHaveBeenCalledWith('/inventory/categories');
			expect(mockApi.get).toHaveBeenCalledWith('/inventory/teams');
			expect(mockApi.get).toHaveBeenCalledWith('/inventory/items');
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty categories in fetchRetreatInventoryByCategory', async () => {
			mockApi.get.mockResolvedValue({ data: {} });

			await store.fetchRetreatInventoryByCategory('retreat-1');

			expect(store.retreatInventoryByCategory).toEqual({});
		});

		it('should handle missing item in updateRetreatInventory', async () => {
			store.retreatInventory = [];
			store.retreatInventoryByCategory = {};
			mockApi.put.mockResolvedValue({ data: {} });

			await store.updateRetreatInventory('retreat-1', 'nonexistent-item', { quantity: 5 });

			// Should not throw error
			expect(mockApi.put).toHaveBeenCalled();
		});

		it('should handle concurrent operations gracefully', async () => {
			mockApi.get.mockResolvedValue({ data: [] });
			mockApi.post.mockResolvedValue({ data: {} });

			// Fire multiple operations
			const op1 = store.fetchCategories();
			const op2 = store.fetchTeams();
			const op3 = store.fetchItems();

			await Promise.all([op1, op2, op3]);

			// All should complete without errors
			expect(mockApi.get).toHaveBeenCalled();
		});
	});
});
