import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

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
}));

// Mock vue-router
vi.mock('vue-router', () => ({
	useRouter: () => ({
		push: vi.fn(),
	}),
}));

describe('MessageTemplateStore', () => {
	let store: any;
	let useMessageTemplateStore: any;
	let mockApi: any;

	beforeEach(async () => {
		setActivePinia(createPinia());
		// Import store after mocks are set up
		const messageTemplateStoreModule = await import('../messageTemplateStore');
		useMessageTemplateStore = messageTemplateStoreModule.useMessageTemplateStore;
		store = useMessageTemplateStore();
		mockApi = (await import('@/services/api')).api;
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Initial State', () => {
		it('should initialize with empty templates array', () => {
			expect(store.templates).toEqual([]);
		});

		it('should initialize with loading false', () => {
			expect(store.loading).toBe(false);
		});

		it('should initialize with error null', () => {
			expect(store.error).toBe(null);
		});
	});

	describe('fetchTemplates', () => {
		const mockTemplates = [
			{
				id: 'template-1',
				name: 'Welcome Message',
				subject: 'Welcome to the retreat',
				body: 'Dear {{name}}, welcome!',
				retreatId: 'retreat-1',
			},
			{
				id: 'template-2',
				name: 'Payment Reminder',
				subject: 'Payment due',
				body: 'Your payment is due soon.',
				retreatId: 'retreat-1',
			},
		];

		it('should fetch templates successfully', async () => {
			mockApi.get.mockResolvedValue({ data: mockTemplates });

			await store.fetchTemplates('retreat-1');

			expect(mockApi.get).toHaveBeenCalledWith('/message-templates?retreatId=retreat-1');
			expect(store.templates).toEqual(mockTemplates);
			expect(store.loading).toBe(false);
			expect(store.error).toBe(null);
		});

		it('should handle empty response', async () => {
			mockApi.get.mockResolvedValue({ data: [] });

			await store.fetchTemplates('retreat-1');

			expect(store.templates).toEqual([]);
			expect(store.loading).toBe(false);
			expect(store.error).toBe(null);
		});

		it('should handle API errors', async () => {
			const error = { response: { data: { message: 'Failed to fetch' } } };
			mockApi.get.mockRejectedValue(error);

			await store.fetchTemplates('retreat-1');

			expect(store.templates).toEqual([]);
			expect(store.loading).toBe(false);
			expect(store.error).toBe('Failed to fetch templates');
		});

		it('should set loading state during fetch', async () => {
			let resolveFetch: (value: any) => void;
			const fetchPromise = new Promise((resolve) => {
				resolveFetch = resolve;
			});
			mockApi.get.mockReturnValue(fetchPromise);

			const fetchOperation = store.fetchTemplates('retreat-1');
			expect(store.loading).toBe(true);

			resolveFetch!({ data: mockTemplates });
			await fetchOperation;

			expect(store.loading).toBe(false);
		});
	});

	describe('createTemplate', () => {
		const newTemplateData = {
			name: 'New Template',
			subject: 'New Subject',
			body: 'New body content',
			retreatId: 'retreat-1',
		};

		const createdTemplate = {
			id: 'template-3',
			...newTemplateData,
		};

		it('should create template successfully', async () => {
			mockApi.post.mockResolvedValue({ data: createdTemplate });

			await store.createTemplate(newTemplateData);

			expect(mockApi.post).toHaveBeenCalledWith('/message-templates', newTemplateData);
			expect(store.templates).toContainEqual(createdTemplate);
			expect(store.loading).toBe(false);
			expect(store.error).toBe(null);
		});

		it('should add new template to existing templates array', async () => {
			store.templates = [
				{
					id: 'template-1',
					name: 'Existing',
					subject: 'Subj',
					body: 'Body',
					retreatId: 'retreat-1',
				},
			];
			mockApi.post.mockResolvedValue({ data: createdTemplate });

			await store.createTemplate(newTemplateData);

			expect(store.templates).toHaveLength(2);
			expect(store.templates[1]).toEqual(createdTemplate);
		});

		it('should re-throw errors on create failure', async () => {
			const error = { response: { data: { message: 'Creation failed' } } };
			mockApi.post.mockRejectedValue(error);

			await expect(store.createTemplate(newTemplateData)).rejects.toEqual(error);
			expect(store.error).toBe('Failed to create template');
			expect(store.loading).toBe(false);
		});

		it('should set loading state during create', async () => {
			let resolveCreate: (value: any) => void;
			const createPromise = new Promise((resolve) => {
				resolveCreate = resolve;
			});
			mockApi.post.mockReturnValue(createPromise);

			const createOperation = store.createTemplate(newTemplateData);
			expect(store.loading).toBe(true);

			resolveCreate!({ data: createdTemplate });
			await createOperation;

			expect(store.loading).toBe(false);
		});
	});

	describe('updateTemplate', () => {
		const existingTemplate = {
			id: 'template-1',
			name: 'Old Name',
			subject: 'Old Subject',
			body: 'Old Body',
			retreatId: 'retreat-1',
		};

		const updatedTemplate = {
			...existingTemplate,
			name: 'Updated Name',
			subject: 'Updated Subject',
		};

		it('should update template successfully', async () => {
			store.templates = [existingTemplate];
			mockApi.put.mockResolvedValue({ data: updatedTemplate });

			await store.updateTemplate('template-1', {
				name: 'Updated Name',
				subject: 'Updated Subject',
			});

			expect(mockApi.put).toHaveBeenCalledWith('/message-templates/template-1', {
				name: 'Updated Name',
				subject: 'Updated Subject',
			});
			expect(store.templates[0]).toEqual(updatedTemplate);
			expect(store.loading).toBe(false);
			expect(store.error).toBe(null);
		});

		it('should handle template not found gracefully', async () => {
			store.templates = [existingTemplate];
			mockApi.put.mockResolvedValue({ data: updatedTemplate });

			await store.updateTemplate('nonexistent-id', { name: 'Updated Name' });

			// Should not modify the array
			expect(store.templates).toHaveLength(1);
			expect(store.templates[0]).toEqual(existingTemplate);
			expect(store.loading).toBe(false);
		});

		it('should re-throw errors on update failure', async () => {
			store.templates = [existingTemplate];
			const error = { response: { data: { message: 'Update failed' } } };
			mockApi.put.mockRejectedValue(error);

			await expect(store.updateTemplate('template-1', { name: 'Updated Name' })).rejects.toEqual(
				error,
			);
			expect(store.error).toBe('Failed to update template');
			expect(store.loading).toBe(false);
		});

		it('should update the correct template when multiple exist', async () => {
			store.templates = [
				existingTemplate,
				{
					id: 'template-2',
					name: 'Another',
					subject: 'Subj2',
					body: 'Body2',
					retreatId: 'retreat-1',
				},
			];
			const updated = { ...existingTemplate, name: 'Updated' };
			mockApi.put.mockResolvedValue({ data: updated });

			await store.updateTemplate('template-1', { name: 'Updated' });

			expect(store.templates[0]).toEqual(updated);
			expect(store.templates[1]).toEqual({
				id: 'template-2',
				name: 'Another',
				subject: 'Subj2',
				body: 'Body2',
				retreatId: 'retreat-1',
			});
		});

		it('should set loading state during update', async () => {
			store.templates = [existingTemplate];
			let resolveUpdate: (value: any) => void;
			const updatePromise = new Promise((resolve) => {
				resolveUpdate = resolve;
			});
			mockApi.put.mockReturnValue(updatePromise);

			const updateOperation = store.updateTemplate('template-1', { name: 'Updated' });
			expect(store.loading).toBe(true);

			resolveUpdate!({ data: updatedTemplate });
			await updateOperation;

			expect(store.loading).toBe(false);
		});
	});

	describe('deleteTemplate', () => {
		const existingTemplates = [
			{
				id: 'template-1',
				name: 'Template 1',
				subject: 'Subj1',
				body: 'Body1',
				retreatId: 'retreat-1',
			},
			{
				id: 'template-2',
				name: 'Template 2',
				subject: 'Subj2',
				body: 'Body2',
				retreatId: 'retreat-1',
			},
			{
				id: 'template-3',
				name: 'Template 3',
				subject: 'Subj3',
				body: 'Body3',
				retreatId: 'retreat-1',
			},
		];

		it('should delete template successfully', async () => {
			store.templates = [...existingTemplates];
			mockApi.delete.mockResolvedValue({});

			await store.deleteTemplate('template-2');

			expect(mockApi.delete).toHaveBeenCalledWith('/message-templates/template-2');
			expect(store.templates).toHaveLength(2);
			expect(store.templates.find((t: any) => t.id === 'template-2')).toBeUndefined();
			expect(store.loading).toBe(false);
			expect(store.error).toBe(null);
		});

		it('should handle deleting first template', async () => {
			store.templates = [...existingTemplates];
			mockApi.delete.mockResolvedValue({});

			await store.deleteTemplate('template-1');

			expect(store.templates).toHaveLength(2);
			expect(store.templates[0].id).toBe('template-2');
			expect(store.templates[1].id).toBe('template-3');
		});

		it('should handle deleting last template', async () => {
			store.templates = [...existingTemplates];
			mockApi.delete.mockResolvedValue({});

			await store.deleteTemplate('template-3');

			expect(store.templates).toHaveLength(2);
			expect(store.templates[0].id).toBe('template-1');
			expect(store.templates[1].id).toBe('template-2');
		});

		it('should handle API errors silently (no re-throw)', async () => {
			store.templates = [...existingTemplates];
			const error = { response: { data: { message: 'Delete failed' } } };
			mockApi.delete.mockRejectedValue(error);

			await store.deleteTemplate('template-1');

			expect(store.error).toBe('Failed to delete template');
			expect(store.loading).toBe(false);
			// Template should NOT be removed from array on error
			expect(store.templates).toHaveLength(3);
		});

		it('should set loading state during delete', async () => {
			store.templates = [...existingTemplates];
			let resolveDelete: (value: any) => void;
			const deletePromise = new Promise((resolve) => {
				resolveDelete = resolve;
			});
			mockApi.delete.mockReturnValue(deletePromise);

			const deleteOperation = store.deleteTemplate('template-1');
			expect(store.loading).toBe(true);

			resolveDelete!({});
			await deleteOperation;

			expect(store.loading).toBe(false);
		});
	});

	describe('Edge Cases', () => {
		it('should handle null retreatId in fetchTemplates', async () => {
			mockApi.get.mockResolvedValue({ data: [] });

			// The store doesn't validate retreatId, just passes it to the API
			await store.fetchTemplates(null as any);

			expect(mockApi.get).toHaveBeenCalledWith('/message-templates?retreatId=null');
			expect(store.loading).toBe(false);
		});

		it('should handle multiple rapid operations', async () => {
			const template1 = { id: 't1', name: 'T1', subject: 'S1', body: 'B1', retreatId: 'r1' };
			const template2 = { id: 't2', name: 'T2', subject: 'S2', body: 'B2', retreatId: 'r1' };

			mockApi.post.mockResolvedValue({ data: template1 });
			mockApi.post.mockResolvedValue({ data: template2 });

			// Fire multiple operations
			const op1 = store.createTemplate({ name: 'T1', subject: 'S1', body: 'B1', retreatId: 'r1' });
			const op2 = store.createTemplate({ name: 'T2', subject: 'S2', body: 'B2', retreatId: 'r1' });

			await Promise.all([op1, op2]);

			expect(store.templates.length).toBeGreaterThanOrEqual(2);
		});

		it('should clear error on next operation after error', async () => {
			const error = { message: 'First error' };
			mockApi.get.mockRejectedValue(error);

			await store.fetchTemplates('retreat-1');
			expect(store.error).toBe('First error');

			// Next successful operation should clear error
			mockApi.get.mockResolvedValue({ data: [] });
			await store.fetchTemplates('retreat-1');

			expect(store.error).toBe(null);
		});

		it('should handle error without message property', async () => {
			const error = {};
			mockApi.get.mockRejectedValue(error);

			await store.fetchTemplates('retreat-1');

			expect(store.error).toBe('Failed to fetch templates');
		});

		it('should handle error with undefined message', async () => {
			const error = { message: undefined };
			mockApi.get.mockRejectedValue(error);

			await store.fetchTemplates('retreat-1');

			expect(store.error).toBe('Failed to fetch templates');
		});
	});
});
