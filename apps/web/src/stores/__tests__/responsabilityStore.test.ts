import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock the API service - define it first
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

describe('ResponsabilityStore', () => {
	let store: any;

	beforeEach(async () => {
		vi.clearAllMocks();
		// Create a fresh Pinia instance for each test
		const pinia = createPinia();
		setActivePinia(pinia);
		// Import store after mocks are set up
		const { useResponsabilityStore: useResponsabilityStoreImport } = await import(
			'../responsabilityStore'
		);
		store = useResponsabilityStoreImport();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Initial State', () => {
		it('should initialize with empty responsibilities array', () => {
			expect(store.responsibilities).toEqual([]);
		});

		it('should initialize with loading false', () => {
			expect(store.loading).toBe(false);
		});

		it('should initialize with error null', () => {
			expect(store.error).toBe(null);
		});
	});

	describe('fetchResponsibilities', () => {
		const mockResponsibilities = [
			{
				id: 'resp-1',
				name: 'Kitchen Duty',
				retreatId: 'retreat-1',
				participantId: 'participant-1',
			},
			{
				id: 'resp-2',
				name: 'Cleaning',
				retreatId: 'retreat-1',
				participantId: null,
			},
		];

		it('should fetch responsibilities successfully', async () => {
			mockApi.get.mockResolvedValue({ data: mockResponsibilities });

			await store.fetchResponsibilities('retreat-1');

			expect(mockApi.get).toHaveBeenCalledWith('/responsibilities', {
				params: { retreatId: 'retreat-1' },
			});
			expect(store.responsibilities).toEqual(mockResponsibilities);
			expect(store.loading).toBe(false);
			expect(store.error).toBe(null);
		});

		it('should handle empty response', async () => {
			mockApi.get.mockResolvedValue({ data: [] });

			await store.fetchResponsibilities('retreat-1');

			expect(store.responsibilities).toEqual([]);
			expect(store.loading).toBe(false);
			expect(store.error).toBe(null);
		});

		it('should handle API errors with toast', async () => {
			const error = new Error('Network error');
			mockApi.get.mockRejectedValue(error);

			await store.fetchResponsibilities('retreat-1');

			expect(store.loading).toBe(false);
			expect(store.error).toBe('Failed to fetch responsibilities.');
			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Failed to fetch responsibilities.',
				variant: 'destructive',
			});
		});

		it('should set loading state during fetch', async () => {
			let resolveFetch: (value: any) => void;
			const fetchPromise = new Promise((resolve) => {
				resolveFetch = resolve;
			});
			mockApi.get.mockReturnValue(fetchPromise);

			const fetchOperation = store.fetchResponsibilities('retreat-1');
			expect(store.loading).toBe(true);

			resolveFetch!({ data: mockResponsibilities });
			await fetchOperation;

			expect(store.loading).toBe(false);
		});
	});

	describe('createResponsability', () => {
		const newResponsabilityData = {
			name: 'Security Duty',
			retreatId: 'retreat-1',
		};

		const createdResponsability = {
			id: 'resp-3',
			...newResponsabilityData,
			participantId: null,
		};

		it('should create responsibility successfully', async () => {
			mockApi.post.mockResolvedValue({ data: createdResponsability });

			await store.createResponsability(newResponsabilityData);

			expect(mockApi.post).toHaveBeenCalledWith('/responsibilities', newResponsabilityData);
			expect(store.responsibilities).toContainEqual(createdResponsability);
			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Success',
				description: 'Responsability created successfully.',
			});
		});

		it('should add new responsibility to existing responsibilities array', async () => {
			store.responsibilities = [
				{ id: 'resp-1', name: 'Existing', retreatId: 'retreat-1', participantId: null },
			];
			mockApi.post.mockResolvedValue({ data: createdResponsability });

			await store.createResponsability(newResponsabilityData);

			expect(store.responsibilities).toHaveLength(2);
			expect(store.responsibilities[1]).toEqual(createdResponsability);
		});

		it('should handle validation errors with toast', async () => {
			const error = { response: { data: { message: 'Validation failed' } } };
			mockApi.post.mockRejectedValue(error);

			await store.createResponsability(newResponsabilityData);

			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Failed to create responsability.',
				variant: 'destructive',
			});
		});

		it('should handle network errors with toast', async () => {
			const error = new Error('Network error');
			mockApi.post.mockRejectedValue(error);

			await store.createResponsability(newResponsabilityData);

			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Failed to create responsability.',
				variant: 'destructive',
			});
		});
	});

	describe('updateResponsability', () => {
		const existingResponsability = {
			id: 'resp-1',
			name: 'Old Name',
			retreatId: 'retreat-1',
			participantId: null,
		};

		const updatedResponsability = {
			...existingResponsability,
			name: 'Updated Name',
		};

		it('should update responsibility successfully', async () => {
			store.responsibilities = [existingResponsability];
			mockApi.put.mockResolvedValue({ data: updatedResponsability });

			await store.updateResponsability('resp-1', { name: 'Updated Name' });

			expect(mockApi.put).toHaveBeenCalledWith('/responsibilities/resp-1', {
				name: 'Updated Name',
			});
			expect(store.responsibilities[0]).toEqual(updatedResponsability);
			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Success',
				description: 'Responsability updated successfully.',
			});
		});

		it('should handle responsibility not found gracefully', async () => {
			store.responsibilities = [existingResponsability];
			mockApi.put.mockResolvedValue({ data: updatedResponsability });

			await store.updateResponsability('nonexistent-id', { name: 'Updated Name' });

			// Should not modify the array
			expect(store.responsibilities).toHaveLength(1);
			expect(store.responsibilities[0]).toEqual(existingResponsability);
		});

		it('should handle API errors with toast', async () => {
			store.responsibilities = [existingResponsability];
			const error = new Error('Update failed');
			mockApi.put.mockRejectedValue(error);

			await store.updateResponsability('resp-1', { name: 'Updated Name' });

			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Failed to update responsability.',
				variant: 'destructive',
			});
		});

		it('should update the correct responsibility when multiple exist', async () => {
			store.responsibilities = [
				existingResponsability,
				{ id: 'resp-2', name: 'Another', retreatId: 'retreat-1', participantId: 'p1' },
			];
			const updated = { ...existingResponsability, name: 'Updated' };
			mockApi.put.mockResolvedValue({ data: updated });

			await store.updateResponsability('resp-1', { name: 'Updated' });

			expect(store.responsibilities[0]).toEqual(updated);
			expect(store.responsibilities[1]).toEqual({
				id: 'resp-2',
				name: 'Another',
				retreatId: 'retreat-1',
				participantId: 'p1',
			});
		});
	});

	describe('deleteResponsability', () => {
		const existingResponsibilities = [
			{ id: 'resp-1', name: 'Resp 1', retreatId: 'retreat-1', participantId: null },
			{ id: 'resp-2', name: 'Resp 2', retreatId: 'retreat-1', participantId: 'p1' },
			{ id: 'resp-3', name: 'Resp 3', retreatId: 'retreat-1', participantId: null },
		];

		it('should delete responsibility successfully', async () => {
			store.responsibilities = [...existingResponsibilities];
			mockApi.delete.mockResolvedValue({});

			await store.deleteResponsability('resp-2');

			expect(mockApi.delete).toHaveBeenCalledWith('/responsibilities/resp-2');
			expect(store.responsibilities).toHaveLength(2);
			expect(store.responsibilities.find((r: any) => r.id === 'resp-2')).toBeUndefined();
			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Success',
				description: 'Responsability deleted successfully.',
			});
		});

		it('should handle deleting first responsibility', async () => {
			store.responsibilities = [...existingResponsibilities];
			mockApi.delete.mockResolvedValue({});

			await store.deleteResponsability('resp-1');

			expect(store.responsibilities).toHaveLength(2);
			expect(store.responsibilities[0].id).toBe('resp-2');
			expect(store.responsibilities[1].id).toBe('resp-3');
		});

		it('should handle deleting last responsibility', async () => {
			store.responsibilities = [...existingResponsibilities];
			mockApi.delete.mockResolvedValue({});

			await store.deleteResponsability('resp-3');

			expect(store.responsibilities).toHaveLength(2);
			expect(store.responsibilities[0].id).toBe('resp-1');
			expect(store.responsibilities[1].id).toBe('resp-2');
		});

		it('should handle API errors with toast', async () => {
			store.responsibilities = [...existingResponsibilities];
			const error = new Error('Delete failed');
			mockApi.delete.mockRejectedValue(error);

			await store.deleteResponsability('resp-1');

			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Failed to delete responsability.',
				variant: 'destructive',
			});
			// Responsibility should NOT be removed from array on error
			expect(store.responsibilities).toHaveLength(3);
		});
	});

	describe('assignParticipant - COMPLEX', () => {
		const baseResponsibility = {
			id: 'resp-1',
			name: 'Kitchen Duty',
			retreatId: 'retreat-1',
			participantId: null,
		};

		it('should assign participant to responsibility', async () => {
			store.responsibilities = [baseResponsibility];
			const updated = { ...baseResponsibility, participantId: 'participant-1' };
			mockApi.post.mockResolvedValue({ data: updated });

			await store.assignParticipant('resp-1', 'participant-1');

			expect(mockApi.post).toHaveBeenCalledWith('/responsibilities/resp-1/assign', {
				participantId: 'participant-1',
			});
			expect(store.responsibilities[0]).toEqual(updated);
			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Success',
				description: 'Participant assigned successfully.',
			});
		});

		it('should unassign participant when participantId is null', async () => {
			store.responsibilities = [{ ...baseResponsibility, participantId: 'participant-1' }];
			const updated = baseResponsibility; // participantId becomes null
			mockApi.delete.mockResolvedValue({ data: updated });

			await store.assignParticipant('resp-1', null);

			expect(mockApi.delete).toHaveBeenCalledWith('/responsibilities/resp-1/assign/participant-1');
			expect(store.responsibilities[0]).toEqual(updated);
		});

		it('should return early if unassigning when already unassigned', async () => {
			store.responsibilities = [baseResponsibility]; // participantId is already null

			await store.assignParticipant('resp-1', null);

			// Should not make any API call
			expect(mockApi.delete).not.toHaveBeenCalled();
			expect(mockApi.post).not.toHaveBeenCalled();
		});

		it('should get current responsibility before unassignment', async () => {
			store.responsibilities = [
				{ id: 'resp-1', name: 'Duty', retreatId: 'retreat-1', participantId: 'participant-5' },
			];
			const updated = { id: 'resp-1', name: 'Duty', retreatId: 'retreat-1', participantId: null };
			mockApi.delete.mockResolvedValue({ data: updated });

			await store.assignParticipant('resp-1', null);

			// Should use participantId from the found responsibility
			expect(mockApi.delete).toHaveBeenCalledWith('/responsibilities/resp-1/assign/participant-5');
		});

		it('should update local state after API call for assignment', async () => {
			store.responsibilities = [baseResponsibility];
			const updated = { ...baseResponsibility, participantId: 'participant-2' };
			mockApi.post.mockResolvedValue({ data: updated });

			await store.assignParticipant('resp-1', 'participant-2');

			expect(store.responsibilities[0].participantId).toBe('participant-2');
		});

		it('should update local state after API call for unassignment', async () => {
			store.responsibilities = [{ ...baseResponsibility, participantId: 'participant-3' }];
			const updated = baseResponsibility;
			mockApi.delete.mockResolvedValue({ data: updated });

			await store.assignParticipant('resp-1', null);

			expect(store.responsibilities[0].participantId).toBeNull();
		});

		it('should handle API errors for assignment with toast', async () => {
			store.responsibilities = [baseResponsibility];
			const error = new Error('Assignment failed');
			mockApi.post.mockRejectedValue(error);

			await store.assignParticipant('resp-1', 'participant-1');

			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Failed to assign participant.',
				variant: 'destructive',
			});
		});

		it('should handle API errors for unassignment with toast', async () => {
			store.responsibilities = [{ ...baseResponsibility, participantId: 'participant-1' }];
			const error = new Error('Unassignment failed');
			mockApi.delete.mockRejectedValue(error);

			await store.assignParticipant('resp-1', null);

			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Failed to assign participant.',
				variant: 'destructive',
			});
		});
	});

	describe('Edge Cases', () => {
		it('should handle null retreatId in fetchResponsibilities', async () => {
			mockApi.get.mockResolvedValue({ data: [] });

			// The store doesn't validate retreatId, just passes it to the API
			await store.fetchResponsibilities(null as any);

			expect(mockApi.get).toHaveBeenCalledWith('/responsibilities', {
				params: { retreatId: null },
			});
			expect(store.loading).toBe(false);
		});

		it('should maintain state consistency after multiple operations', async () => {
			mockApi.post.mockResolvedValue({
				data: { id: 'resp-1', name: 'Duty', retreatId: 'retreat-1', participantId: null },
			});
			mockApi.put.mockResolvedValue({
				data: { id: 'resp-1', name: 'Updated Duty', retreatId: 'retreat-1', participantId: null },
			});
			mockApi.post.mockResolvedValue({
				data: { id: 'resp-1', name: 'Updated Duty', retreatId: 'retreat-1', participantId: 'p1' },
			});

			await store.createResponsability({ name: 'Duty', retreatId: 'retreat-1' });
			await store.updateResponsability('resp-1', { name: 'Updated Duty' });
			await store.assignParticipant('resp-1', 'p1');

			expect(store.responsibilities).toHaveLength(1);
			expect(store.responsibilities[0].name).toBe('Updated Duty');
			expect(store.responsibilities[0].participantId).toBe('p1');
		});
	});
});
