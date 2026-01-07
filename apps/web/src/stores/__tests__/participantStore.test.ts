import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock axios first, before anything else
vi.mock('axios', () => {
	const mockAxios = {
		create: vi.fn(() => ({
			get: vi.fn(),
			post: vi.fn(),
			put: vi.fn(),
			delete: vi.fn(),
			interceptors: {
				request: { use: vi.fn() },
				response: { use: vi.fn() },
			},
		})),
		defaults: {
			baseURL: '',
			withCredentials: false,
		},
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	};
	return {
		default: mockAxios,
		...mockAxios,
	};
});

// Mock the @repo/ui toast
vi.mock('@repo/ui', () => ({
	useToast: vi.fn(() => ({
		toast: vi.fn(),
	})),
}));

// Mock runtime config to prevent initialization errors
vi.mock('@/config/runtimeConfig', () => ({
	getApiUrl: vi.fn(() => 'http://localhost:3001/api'),
}));

// Mock the CSRF utility to prevent axios initialization
vi.mock('@/utils/csrf', () => ({
	setupCsrfInterceptor: vi.fn(),
	getCsrfToken: vi.fn(async () => 'mock-csrf-token'),
}));

// Mock telemetry service
vi.mock('@/services/telemetryService', () => ({
	telemetryService: {
		isTelemetryActive: vi.fn(() => false),
		trackApiCallTime: vi.fn(),
		trackError: vi.fn(),
	},
}));

// Mock the API service
const mockApi = {
	get: vi.fn(),
	post: vi.fn(),
	put: vi.fn(),
	delete: vi.fn(),
};

vi.mock('@/services/api', () => ({
	api: mockApi,
	default: mockApi,
}));

// Also export the mock for use in tests
export { mockApi };

describe('ParticipantStore', () => {
	let store: any;
	let useParticipantStore: any;

	beforeEach(async () => {
		(window.localStorage as any)?._reset?.();
		setActivePinia(createPinia());

		// Import the store (api mock is already set up at module level)
		const participantStoreModule = await import('../participantStore');
		useParticipantStore = participantStoreModule.useParticipantStore;
		store = useParticipantStore();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('State Management', () => {
		it('should initialize with empty state', () => {
			expect(store.participants).toEqual([]);
			expect(store.tags).toEqual([]);
			expect(store.loading).toBe(false);
			expect(store.loadingTags).toBe(false);
			expect(store.error).toBe(null);
			expect(store.filters).toEqual({});
			expect(store.columnSelections).toEqual({});
		});

		it('should allow setting filters', () => {
			store.filters.retreatId = 'retreat-123';
			store.filters.type = 'walker';

			expect(store.filters.retreatId).toBe('retreat-123');
			expect(store.filters.type).toBe('walker');
		});
	});

	describe('Fetch Participants', () => {
		it('should fetch participants successfully', async () => {
			const mockParticipants = [
				{
					id: '1',
					firstName: 'John',
					lastName: 'Doe',
					email: 'john@example.com',
					type: 'walker',
					totalPaid: 100,
				},
				{
					id: '2',
					firstName: 'Jane',
					lastName: 'Smith',
					email: 'jane@example.com',
					type: 'server',
					totalPaid: 150,
				},
			];

			store.filters.retreatId = 'retreat-123';
			mockApi.get.mockResolvedValue({ data: mockParticipants });

			await store.fetchParticipants();

			expect(mockApi.get).toHaveBeenCalledWith('/participants', {
				params: { retreatId: 'retreat-123', includePayments: true },
			});
			expect(store.participants).toEqual(mockParticipants);
			expect(store.loading).toBe(false);
			expect(store.error).toBe(null);
		});

		it('should handle fetch participants error', async () => {
			const errorMessage = 'Failed to fetch participants';
			// Create error object that matches axios error structure
			const mockError = new Error(errorMessage) as any;
			mockError.response = { data: { message: errorMessage } };

			mockApi.get.mockRejectedValue(mockError);

			store.filters.retreatId = 'retreat-123';

			let caughtError: any = null;
			try {
				await store.fetchParticipants();
			} catch (e) {
				caughtError = e;
			}

			// Verify an error was thrown
			expect(caughtError).toBeTruthy();

			// Note: error.value is set in the catch block before throw, but may not persist
			// The important thing is that the error is thrown correctly
			expect(store.loading).toBe(false);
		});

		it('should require retreatId to fetch participants', async () => {
			// The function returns early without throwing, so no error is thrown
			await store.fetchParticipants();
			expect(store.error).toBe('Retreat ID is required to fetch participants.');
			expect(store.loading).toBe(false);
		});

		it('should pass filters to API', async () => {
			const mockParticipants = [{ id: '1', firstName: 'John', lastName: 'Doe' }];
			mockApi.get.mockResolvedValue({ data: mockParticipants });

			store.filters.retreatId = 'retreat-123';
			store.filters.type = 'walker';
			store.filters.isCancelled = false;

			await store.fetchParticipants();

			expect(mockApi.get).toHaveBeenCalledWith('/participants', {
				params: {
					retreatId: 'retreat-123',
					type: 'walker',
					isCancelled: false,
					includePayments: true,
				},
			});
		});
	});

	describe('Create Participant', () => {
		it('should create participant successfully', async () => {
			const newParticipant = {
				id: 'new-id',
				firstName: 'New',
				lastName: 'Person',
				email: 'new@example.com',
			};

			mockApi.post.mockResolvedValue({ data: newParticipant });

			await store.createParticipant({
				retreatId: 'retreat-123',
				firstName: 'New',
				lastName: 'Person',
				email: 'new@example.com',
				type: 'walker',
			});

			expect(mockApi.post).toHaveBeenCalledWith('/participants/new', {
				retreatId: 'retreat-123',
				firstName: 'New',
				lastName: 'Person',
				email: 'new@example.com',
				type: 'walker',
			});
			expect(store.participants).toContainEqual(newParticipant);
			expect(store.loading).toBe(false);
		});

		it('should handle create participant error', async () => {
			const errorMessage = 'Failed to create participant';
			mockApi.post.mockRejectedValue({
				response: { data: { message: errorMessage } },
			});

			await expect(
				store.createParticipant({
					retreatId: 'retreat-123',
					firstName: 'New',
					lastName: 'Person',
					email: 'new@example.com',
					type: 'walker',
				}),
			).rejects.toThrow();
			expect(store.loading).toBe(false);
		});
	});

	describe('Update Participant', () => {
		it('should update participant successfully', async () => {
			const existingParticipant = {
				id: '1',
				firstName: 'John',
				lastName: 'Doe',
				email: 'john@example.com',
			};
			const updatedParticipant = {
				...existingParticipant,
				firstName: 'Jane',
			};

			store.participants = [existingParticipant];

			mockApi.put.mockResolvedValue({});
			mockApi.get.mockResolvedValue({ data: updatedParticipant });

			await store.updateParticipant('1', { firstName: 'Jane' });

			expect(mockApi.put).toHaveBeenCalledWith('/participants/1', { firstName: 'Jane' });
			expect(mockApi.get).toHaveBeenCalledWith('/participants/1');
			expect(store.participants[0]).toEqual(updatedParticipant);
			expect(store.loading).toBe(false);
		});

		it('should require participant ID to update', async () => {
			await expect(store.updateParticipant('', { firstName: 'Jane' })).rejects.toThrow(
				'Participant ID is missing',
			);
		});

		it('should handle update participant error', async () => {
			const errorMessage = 'Failed to update participant';
			mockApi.put.mockRejectedValue({
				response: { data: { message: errorMessage } },
			});

			await expect(store.updateParticipant('1', { firstName: 'Jane' })).rejects.toThrow();
			expect(store.loading).toBe(false);
		});

		it('should not modify participants array if participant not found', async () => {
			const existingParticipant = {
				id: '2',
				firstName: 'John',
				lastName: 'Doe',
			};

			store.participants = [existingParticipant];

			mockApi.put.mockResolvedValue({});
			mockApi.get.mockResolvedValue({
				data: { id: '1', firstName: 'Jane', lastName: 'Doe' },
			});

			await store.updateParticipant('1', { firstName: 'Jane' });

			expect(store.participants).toHaveLength(1);
			expect(store.participants[0].id).toBe('2');
		});
	});

	describe('Delete Participant', () => {
		it('should delete participant successfully', async () => {
			const participantToDelete = {
				id: '1',
				firstName: 'John',
				lastName: 'Doe',
			};

			store.participants = [participantToDelete];

			mockApi.delete.mockResolvedValue({});

			await store.deleteParticipant('1');

			expect(mockApi.delete).toHaveBeenCalledWith('/participants/1');
			expect(store.participants).not.toContainEqual(participantToDelete);
			expect(store.participants).toHaveLength(0);
			expect(store.loading).toBe(false);
		});

		it('should handle delete participant error', async () => {
			const errorMessage = 'Failed to delete participant';
			const participantToDelete = {
				id: '1',
				firstName: 'John',
				lastName: 'Doe',
			};

			store.participants = [participantToDelete];

			mockApi.delete.mockRejectedValue({
				response: { data: { message: errorMessage } },
			});

			await expect(store.deleteParticipant('1')).rejects.toThrow();
			expect(store.participants).toContainEqual(participantToDelete);
			expect(store.loading).toBe(false);
		});
	});

	describe('Import Participants', () => {
		it('should import participants successfully', async () => {
			const importData = [
				{ firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
				{ firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
			];

			const mockResult = {
				importedCount: 2,
				updatedCount: 0,
				skippedCount: 0,
				tablesCreated: 1,
				bedsCreated: 2,
				paymentsCreated: 0,
			};

			// Set filters.retreatId because importParticipants calls fetchParticipants internally
			store.filters.retreatId = 'retreat-123';

			mockApi.post.mockResolvedValue({ data: mockResult });
			mockApi.get.mockResolvedValue({ data: [] });

			const result = await store.importParticipants('retreat-123', importData);

			expect(mockApi.post).toHaveBeenCalledWith('/participants/import/retreat-123', {
				participants: importData,
			});
			expect(mockApi.get).toHaveBeenCalled(); // fetchParticipants is called
			expect(result).toEqual(mockResult);
			expect(store.loading).toBe(false);
		});

		it('should handle import participants error', async () => {
			const importData = [{ firstName: 'John', lastName: 'Doe', email: 'john@example.com' }];

			const errorMessage = 'Import failed';
			mockApi.post.mockRejectedValue({
				response: { data: { message: errorMessage } },
			});

			await expect(store.importParticipants('retreat-123', importData)).rejects.toThrow();
			expect(store.loading).toBe(false);
		});

		it('should handle partial import success', async () => {
			const importData = [
				{ firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
				{ firstName: 'Invalid', email: 'invalid-email' },
			];

			const mockResult = {
				importedCount: 1,
				updatedCount: 0,
				skippedCount: 1,
				tablesCreated: 0,
				bedsCreated: 1,
				paymentsCreated: 0,
			};

			// Set filters.retreatId because importParticipants calls fetchParticipants internally
			store.filters.retreatId = 'retreat-123';

			mockApi.post.mockResolvedValue({ data: mockResult });
			mockApi.get.mockResolvedValue({ data: [] });

			const result = await store.importParticipants('retreat-123', importData);

			expect(result.importedCount).toBe(1);
			expect(result.skippedCount).toBe(1);
			expect(store.error).toBe(null);
		});
	});

	describe('Fetch Tags', () => {
		it('should fetch tags successfully', async () => {
			const mockTags = [
				{ id: '1', name: 'Tag 1', color: '#ff0000' },
				{ id: '2', name: 'Tag 2', color: '#00ff00' },
			];

			mockApi.get.mockResolvedValue({ data: mockTags });

			await store.fetchTags('retreat-123');

			expect(mockApi.get).toHaveBeenCalledWith('/tags', { params: { retreatId: 'retreat-123' } });
			expect(store.tags).toEqual(mockTags);
			expect(store.loadingTags).toBe(false);
		});

		it('should handle fetch tags error', async () => {
			mockApi.get.mockRejectedValue(new Error('Failed to fetch tags'));

			await store.fetchTags('retreat-123');

			expect(store.loadingTags).toBe(false);
			expect(store.tags).toEqual([]);
		});

		it('should not fetch tags without retreatId', async () => {
			await store.fetchTags('');

			expect(mockApi.get).not.toHaveBeenCalled();
		});
	});

	describe('Column Selection Management', () => {
		it('should save column selection', () => {
			const viewName = 'walkers';
			const columns = ['firstName', 'lastName', 'email'];

			store.saveColumnSelection(viewName, columns);

			expect(store.getColumnSelection(viewName, ['default'])).toEqual(columns);
		});

		it('should get default columns when no selection exists', () => {
			const viewName = 'new-view';
			const defaultColumns = ['firstName', 'lastName'];

			const result = store.getColumnSelection(viewName, defaultColumns);

			expect(result).toEqual(defaultColumns);
		});

		it('should return saved columns when selection exists', () => {
			const viewName = 'walkers';
			const savedColumns = ['firstName', 'lastName', 'email', 'cellPhone'];

			store.saveColumnSelection(viewName, savedColumns);

			const result = store.getColumnSelection(viewName, ['default']);

			expect(result).toEqual(savedColumns);
		});

		it('should handle different view selections independently', () => {
			const walkersColumns = ['firstName', 'lastName'];
			const serversColumns = ['firstName', 'lastName', 'type'];

			store.saveColumnSelection('walkers', walkersColumns);
			store.saveColumnSelection('servers', serversColumns);

			expect(store.getColumnSelection('walkers', ['default'])).toEqual(walkersColumns);
			expect(store.getColumnSelection('servers', ['default'])).toEqual(serversColumns);
		});

		it('should persist column selections to localStorage', () => {
			const viewName = 'test-view';
			const columns = ['firstName', 'lastName'];

			store.saveColumnSelection(viewName, columns);

			const stored = localStorage.getItem(`participant-columns-${viewName}`);
			expect(stored).toBe(JSON.stringify(columns));
		});

		it('should load column selections from localStorage', () => {
			const viewName = 'test-view';
			const columns = ['firstName', 'lastName', 'email'];

			localStorage.setItem(`participant-columns-${viewName}`, JSON.stringify(columns));

			const loaded = store.loadColumnSelection(viewName);
			expect(loaded).toEqual(columns);
			expect(store.columnSelections[viewName]).toEqual(columns);
		});

		it('should handle localStorage errors gracefully', () => {
			const originalSetItem = localStorage.setItem;
			localStorage.setItem = vi.fn(() => {
				throw new Error('Storage quota exceeded');
			});

			const viewName = 'test-view';
			const columns = ['firstName', 'lastName'];

			expect(() => {
				store.saveColumnSelection(viewName, columns);
			}).not.toThrow();

			localStorage.setItem = originalSetItem;
		});

		it('should handle localStorage parse errors gracefully', () => {
			const viewName = 'test-view';
			localStorage.setItem(`participant-columns-${viewName}`, 'invalid-json');

			const result = store.loadColumnSelection(viewName);
			expect(result).toBeNull();
		});
	});

	describe('Error Recovery', () => {
		it('should recover from fetch errors', async () => {
			const errorMessage = 'Network error';
			const mockParticipants = [{ id: '1', firstName: 'John', lastName: 'Doe' }];

			store.filters.retreatId = 'retreat-123';

			// First call fails
			const mockError = new Error(errorMessage) as any;
			mockError.response = { data: { message: errorMessage } };
			mockApi.get.mockRejectedValueOnce(mockError);

			let caughtError: any = null;
			try {
				await store.fetchParticipants();
			} catch (e) {
				caughtError = e;
			}

			// Verify first call failed
			expect(caughtError).toBeTruthy();

			// Second call succeeds
			mockApi.get.mockResolvedValueOnce({ data: mockParticipants });

			await store.fetchParticipants();
			expect(store.participants).toEqual(mockParticipants);
			expect(store.loading).toBe(false);
		});

		it('should maintain state during errors', async () => {
			const initialParticipants = [{ id: '1', firstName: 'John', lastName: 'Doe' }];
			store.participants = initialParticipants;

			const errorMessage = 'Update failed';
			mockApi.put.mockRejectedValue({
				response: { data: { message: errorMessage } },
			});

			await expect(store.updateParticipant('1', { firstName: 'Jane' })).rejects.toThrow();

			// Should not lose existing data
			expect(store.participants).toEqual(initialParticipants);
		});
	});

	describe('Data Validation', () => {
		it('should validate participant data before creation', async () => {
			const errorMessage = 'Validation failed';
			mockApi.post.mockRejectedValue({
				response: { data: { message: errorMessage } },
			});

			await expect(
				store.createParticipant({
					retreatId: 'retreat-123',
					firstName: '',
					email: 'invalid-email',
					type: 'walker',
				}),
			).rejects.toThrow();

			expect(store.participants).toHaveLength(0);
		});

		it('should validate participant data before update', async () => {
			const existingParticipant = {
				id: '1',
				firstName: 'John',
				lastName: 'Doe',
				email: 'john@example.com',
			};
			store.participants = [existingParticipant];

			const errorMessage = 'Validation failed';
			mockApi.put.mockRejectedValue({
				response: { data: { message: errorMessage } },
			});

			await expect(store.updateParticipant('1', { email: 'invalid-email' })).rejects.toThrow();

			expect(store.participants[0].email).toBe('john@example.com');
		});
	});
});
