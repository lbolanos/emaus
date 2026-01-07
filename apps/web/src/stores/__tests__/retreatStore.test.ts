import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createMockRetreat } from '@/test/utils';

// Mock the api service
vi.mock('@/services/api', () => ({
	api: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	},
}));

// Mock @repo/ui useToast
vi.mock('@repo/ui', () => ({
	useToast: () => ({
		toast: vi.fn(),
	}),
	Button: { template: '<button><slot /></button>' },
	Input: { template: '<input />' },
	Dialog: { template: '<div><slot /></div>' },
}));

describe('RetreatStore', () => {
	let store: any;
	let useRetreatStore: any;
	const mockRetreats = [
		createMockRetreat({ id: 'retreat-1', name: 'Retreat 2024' }),
		createMockRetreat({ id: 'retreat-2', name: 'Retreat 2025' }),
	];

	beforeEach(async () => {
		// Clear localStorage before each test
		(window.localStorage as any)?._reset?.();
		setActivePinia(createPinia());
		// Import store after mocks are set up
		const retreatStoreModule = await import('../retreatStore');
		useRetreatStore = retreatStoreModule.useRetreatStore;
		store = useRetreatStore();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Initial State', () => {
		it('should initialize with empty state', () => {
			expect(store.retreats).toEqual([]);
			expect(store.selectedRetreatId).toBeNull();
			expect(store.loading).toBe(false);
			expect(store.selectedRetreat).toBeNull();
		});

		it('should load selected retreat from localStorage', async () => {
			const storageId = 'stored-retreat-id';
			localStorage.setItem('selectedRetreatId', storageId);

			// Create a fresh Pinia instance to load from localStorage
			const freshPinia = createPinia();
			setActivePinia(freshPinia);
			const { useRetreatStore: useRetreatStoreFresh } = await import('../retreatStore');
			const newStore = useRetreatStoreFresh();
			expect(newStore.selectedRetreatId).toBe(storageId);

			localStorage.removeItem('selectedRetreatId');
		});
	});

	describe('Computed Properties', () => {
		it('should return most recent retreat', () => {
			store.retreats = mockRetreats;
			expect(store.mostRecentRetreat).toEqual(mockRetreats[0]);
		});

		it('should return null for mostRecentRetreat when no retreats', () => {
			expect(store.mostRecentRetreat).toBeNull();
		});

		it('should return selected retreat', () => {
			store.retreats = mockRetreats;
			store.selectRetreat('retreat-2');
			expect(store.selectedRetreat).toEqual(mockRetreats[1]);
		});

		it('should return null for selectedRetreat when nothing selected', () => {
			store.retreats = mockRetreats;
			expect(store.selectedRetreat).toBeNull();
		});

		it('should return null for selectedRetreat when id does not exist', () => {
			store.retreats = mockRetreats;
			store.selectRetreat('non-existent');
			expect(store.selectedRetreat).toBeNull();
		});

		it('should generate walker registration link', () => {
			store.selectRetreat('retreat-1');
			expect(store.walkerRegistrationLink).toContain('/register/walker/retreat-1');
		});

		it('should return empty string for walker link when no retreat selected', () => {
			expect(store.walkerRegistrationLink).toBe('');
		});

		it('should generate server registration link', () => {
			store.selectRetreat('retreat-1');
			expect(store.serverRegistrationLink).toContain('/register/server/retreat-1');
		});

		it('should return empty string for server link when no retreat selected', () => {
			expect(store.serverRegistrationLink).toBe('');
		});
	});

	describe('Select Retreat', () => {
		it('should select retreat by id', () => {
			store.selectRetreat('retreat-1');
			expect(store.selectedRetreatId).toBe('retreat-1');
		});

		it('should persist selected retreat to localStorage', async () => {
			store.selectRetreat('retreat-2');
			// Wait for watch to trigger
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(localStorage.getItem('selectedRetreatId')).toBe('retreat-2');
		});

		it('should clear selection when null is passed', async () => {
			store.selectRetreat('retreat-1');
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(store.selectedRetreatId).toBe('retreat-1');

			store.selectedRetreatId = null;
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(localStorage.getItem('selectedRetreatId')).toBeNull();
		});
	});

	describe('Fetch Retreats', () => {
		it('should fetch retreats successfully', async () => {
			const { api } = await import('@/services/api');
			(api.get as any).mockResolvedValue({ data: mockRetreats });

			await store.fetchRetreats();

			expect(api.get).toHaveBeenCalledWith('/retreats');
			expect(store.retreats).toEqual(mockRetreats);
			expect(store.loading).toBe(false);
		});

		it('should auto-select most recent retreat if nothing selected', async () => {
			const { api } = await import('@/services/api');
			(api.get as any).mockResolvedValue({ data: mockRetreats });

			await store.fetchRetreats();

			expect(store.selectedRetreatId).toBe(mockRetreats[0].id);
		});

		it('should not change selection if retreat is already selected', async () => {
			const { api } = await import('@/services/api');
			(api.get as any).mockResolvedValue({ data: mockRetreats });

			store.selectRetreat('retreat-2');
			await store.fetchRetreats();

			expect(store.selectedRetreatId).toBe('retreat-2');
		});

		it('should handle fetch retreats error', async () => {
			const { api } = await import('@/services/api');
			(api.get as any).mockRejectedValue({
				response: { data: { message: 'Network error' } },
			});

			await store.fetchRetreats();

			expect(store.retreats).toEqual([]);
			expect(store.loading).toBe(false);
		});
	});

	describe('Fetch Single Retreat', () => {
		it('should fetch single retreat successfully', async () => {
			const { api } = await import('@/services/api');
			const mockRetreat = createMockRetreat({ id: 'retreat-3' });
			(api.get as any).mockResolvedValue({ data: mockRetreat });

			await store.fetchRetreat('retreat-3');

			expect(api.get).toHaveBeenCalledWith('/retreats/retreat-3');
			expect(store.retreats).toContainEqual(mockRetreat);
			expect(store.selectedRetreatId).toBe('retreat-3');
		});

		it('should update existing retreat in list', async () => {
			store.retreats = [mockRetreats[0]];
			const { api } = await import('@/services/api');
			const updatedRetreat = { ...mockRetreats[0], name: 'Updated Retreat' };
			(api.get as any).mockResolvedValue({ data: updatedRetreat });

			await store.fetchRetreat(mockRetreats[0].id);

			expect(store.retreats[0].name).toBe('Updated Retreat');
		});

		it('should add new retreat to list if not exists', async () => {
			store.retreats = [mockRetreats[0]];
			const { api } = await import('@/services/api');
			const newRetreat = createMockRetreat({ id: 'retreat-3' });
			(api.get as any).mockResolvedValue({ data: newRetreat });

			await store.fetchRetreat('retreat-3');

			expect(store.retreats).toHaveLength(2);
			expect(store.retreats).toContainEqual(newRetreat);
		});

		it('should handle fetch single retreat error', async () => {
			const { api } = await import('@/services/api');
			(api.get as any).mockRejectedValue({
				response: { data: { message: 'Not found' } },
			});

			await store.fetchRetreat('non-existent');

			expect(store.loading).toBe(false);
		});
	});

	describe('Create Retreat', () => {
		it('should create retreat successfully', async () => {
			const newRetreatData = {
				parish: 'New Parish',
				startDate: new Date('2024-06-01'),
				endDate: new Date('2024-06-03'),
				houseId: 'house-1',
			};
			const createdRetreat = createMockRetreat(newRetreatData);

			const { api } = await import('@/services/api');
			(api.post as any).mockResolvedValue({ data: createdRetreat });

			await store.createRetreat(newRetreatData as any);

			expect(api.post).toHaveBeenCalledWith('/retreats', newRetreatData);
			expect(store.retreats[0]).toEqual(createdRetreat);
			expect(store.selectedRetreatId).toBe(createdRetreat.id);
			expect(store.loading).toBe(false);
		});

		it('should handle create retreat error', async () => {
			const retreatData = {
				parish: 'Test Parish',
			};

			const { api } = await import('@/services/api');
			(api.post as any).mockRejectedValue({
				response: { data: { message: 'Validation failed' } },
			});

			await expect(store.createRetreat(retreatData as any)).rejects.toThrow();
			expect(store.loading).toBe(false);
		});
	});

	describe('Update Retreat', () => {
		it('should update retreat successfully', async () => {
			const originalRetreat = createMockRetreat({
				id: 'retreat-1',
				name: 'Original Name',
			});
			const updatedRetreat = { ...originalRetreat, name: 'Updated Name' };
			store.retreats = [originalRetreat];

			const { api } = await import('@/services/api');
			(api.put as any).mockResolvedValue({ data: updatedRetreat });

			await store.updateRetreat(updatedRetreat);

			expect(api.put).toHaveBeenCalledWith('/retreats/retreat-1', updatedRetreat);
			expect(store.retreats[0].name).toBe('Updated Name');
			expect(store.loading).toBe(false);
		});

		it('should handle update retreat error', async () => {
			const retreat = createMockRetreat({ id: 'retreat-1' });
			store.retreats = [retreat];

			const { api } = await import('@/services/api');
			(api.put as any).mockRejectedValue({
				response: { data: { message: 'Update failed' } },
			});

			await expect(store.updateRetreat(retreat)).rejects.toThrow();
			expect(store.loading).toBe(false);
		});

		it('should handle update for non-existent retreat', async () => {
			const retreat = createMockRetreat({ id: 'non-existent' });
			store.retreats = [];

			const { api } = await import('@/services/api');
			(api.put as any).mockResolvedValue({ data: retreat });

			await store.updateRetreat(retreat);

			// Should not add to list if it doesn't exist
			expect(store.retreats).toHaveLength(0);
		});
	});

	describe('LocalStorage Integration', () => {
		it('should save selection to localStorage when it changes', async () => {
			store.selectRetreat('test-retreat-id');
			// Wait for watch to trigger
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(localStorage.getItem('selectedRetreatId')).toBe('test-retreat-id');
		});

		it('should clear localStorage when selection is cleared', async () => {
			store.selectRetreat('test-retreat-id');
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(localStorage.getItem('selectedRetreatId')).toBe('test-retreat-id');

			store.selectedRetreatId = null;
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(localStorage.getItem('selectedRetreatId')).toBeNull();
		});

		it('should handle localStorage errors gracefully', () => {
			const originalGetItem = localStorage.getItem;
			const originalSetItem = localStorage.setItem;
			const originalRemoveItem = localStorage.removeItem;

			// Mock localStorage to throw errors
			localStorage.getItem = vi.fn(() => {
				throw new Error('Storage error');
			});
			localStorage.setItem = vi.fn(() => {
				throw new Error('Storage error');
			});
			localStorage.removeItem = vi.fn(() => {
				throw new Error('Storage error');
			});

			// Should not throw when storage fails
			expect(() => {
				store.selectRetreat('test-id');
				store.selectedRetreatId = null;
			}).not.toThrow();

			// Restore original methods
			localStorage.getItem = originalGetItem;
			localStorage.setItem = originalSetItem;
			localStorage.removeItem = originalRemoveItem;
		});
	});

	describe('Loading States', () => {
		it('should set loading state during fetchRetreats', async () => {
			const { api } = await import('@/services/api');
			let resolveFetch: (value: any) => void;
			const fetchPromise = new Promise((resolve) => {
				resolveFetch = resolve;
			});
			(api.get as any).mockReturnValue(fetchPromise);

			const fetchRetreatsPromise = store.fetchRetreats();
			expect(store.loading).toBe(true);

			resolveFetch!({ data: mockRetreats });
			await fetchRetreatsPromise;

			expect(store.loading).toBe(false);
		});

		it('should set loading state during fetchRetreat', async () => {
			const { api } = await import('@/services/api');
			let resolveFetch: (value: any) => void;
			const fetchPromise = new Promise((resolve) => {
				resolveFetch = resolve;
			});
			(api.get as any).mockReturnValue(fetchPromise);

			const fetchRetreatPromise = store.fetchRetreat('retreat-1');
			expect(store.loading).toBe(true);

			resolveFetch!({ data: createMockRetreat() });
			await fetchRetreatPromise;

			expect(store.loading).toBe(false);
		});

		it('should set loading state during createRetreat', async () => {
			const { api } = await import('@/services/api');
			let resolveCreate: (value: any) => void;
			const createPromise = new Promise((resolve) => {
				resolveCreate = resolve;
			});
			(api.post as any).mockReturnValue(createPromise);

			const createRetreatPromise = store.createRetreat({} as any);
			expect(store.loading).toBe(true);

			resolveCreate!({ data: createMockRetreat() });
			await createRetreatPromise;

			expect(store.loading).toBe(false);
		});

		it('should set loading state during updateRetreat', async () => {
			const retreat = createMockRetreat({ id: 'retreat-1' });
			store.retreats = [retreat];

			const { api } = await import('@/services/api');
			let resolveUpdate: (value: any) => void;
			const updatePromise = new Promise((resolve) => {
				resolveUpdate = resolve;
			});
			(api.put as any).mockReturnValue(updatePromise);

			const updateRetreatPromise = store.updateRetreat(retreat);
			expect(store.loading).toBe(true);

			resolveUpdate!({ data: retreat });
			await updateRetreatPromise;

			expect(store.loading).toBe(false);
		});
	});

	describe('Reactive Behavior', () => {
		it('should reactively update selectedRetreat when selectedRetreatId changes', () => {
			store.retreats = mockRetreats;

			expect(store.selectedRetreat).toBeNull();

			store.selectRetreat('retreat-2');
			expect(store.selectedRetreat).toEqual(mockRetreats[1]);

			store.selectRetreat('retreat-1');
			expect(store.selectedRetreat).toEqual(mockRetreats[0]);
		});

		it('should reactively update selectedRetreat when retreats list changes', () => {
			store.selectRetreat('retreat-1');

			expect(store.selectedRetreat).toBeNull();

			store.retreats = [mockRetreats[0]];

			expect(store.selectedRetreat).toEqual(mockRetreats[0]);
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty retreats list', async () => {
			const { api } = await import('@/services/api');
			(api.get as any).mockResolvedValue({ data: [] });

			await store.fetchRetreats();

			expect(store.retreats).toEqual([]);
			expect(store.selectedRetreatId).toBeNull();
		});

		it('should handle rapid selection changes', () => {
			store.selectRetreat('retreat-1');
			store.selectRetreat('retreat-2');
			store.selectRetreat('retreat-1');

			expect(store.selectedRetreatId).toBe('retreat-1');
		});

		it('should handle selecting same retreat twice', async () => {
			store.selectRetreat('retreat-1');
			await new Promise((resolve) => setTimeout(resolve, 0));
			const firstSelection = localStorage.getItem('selectedRetreatId');

			store.selectRetreat('retreat-1');
			await new Promise((resolve) => setTimeout(resolve, 0));
			const secondSelection = localStorage.getItem('selectedRetreatId');

			expect(firstSelection).toBe('retreat-1');
			expect(secondSelection).toBe('retreat-1');
		});
	});
});
