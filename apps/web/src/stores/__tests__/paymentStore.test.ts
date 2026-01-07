import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock the individual API functions
vi.mock('@/services/api', () => ({
	createPayment: vi.fn(),
	getPayments: vi.fn(),
	getPaymentById: vi.fn(),
	updatePayment: vi.fn(),
	deletePayment: vi.fn(),
	getPaymentsByParticipant: vi.fn(),
	getPaymentsByRetreat: vi.fn(),
	getPaymentSummaryByRetreat: vi.fn(),
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

describe('PaymentStore', () => {
	let store: any;

	beforeEach(async () => {
		toastSpy.mockClear();
		setActivePinia(createPinia());
		// Import store after mocks are set up
		const { usePaymentStore: usePaymentStoreImport } = await import('../paymentStore');
		store = usePaymentStoreImport();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Initial State', () => {
		it('should initialize with empty payments array', () => {
			expect(store.payments).toEqual([]);
		});

		it('should initialize with loading false', () => {
			expect(store.loading).toBe(false);
		});

		it('should initialize with error null', () => {
			expect(store.error).toBe(null);
		});
	});

	describe('Computed Properties - IMPORTANT', () => {
		const mockPayments = [
			{ id: 'pay-1', retreatId: 'retreat-1', participantId: 'part-1', amount: 100 },
			{ id: 'pay-2', retreatId: 'retreat-1', participantId: 'part-2', amount: 200 },
			{ id: 'pay-3', retreatId: 'retreat-2', participantId: 'part-1', amount: 150 },
		];

		beforeEach(() => {
			store.payments = mockPayments;
		});

		it('getPaymentsByRetreatId should filter by retreat correctly', () => {
			const result = store.getPaymentsByRetreatId('retreat-1');
			expect(result).toHaveLength(2);
			expect(result[0].id).toBe('pay-1');
			expect(result[1].id).toBe('pay-2');
		});

		it('getPaymentsByParticipantId should filter by participant correctly', () => {
			const result = store.getPaymentsByParticipantId('part-1');
			expect(result).toHaveLength(2);
			expect(result[0].id).toBe('pay-1');
			expect(result[1].id).toBe('pay-3');
		});

		it('getTotalPaidByRetreat should sum amounts with Number() conversion', () => {
			const result = store.getTotalPaidByRetreat('retreat-1');
			expect(result).toBe(300); // 100 + 200
		});

		it('getTotalPaidByRetreat should return 0 for empty amounts', () => {
			store.payments = [
				{ id: 'pay-1', retreatId: 'retreat-1', participantId: 'part-1', amount: null },
			];
			const result = store.getTotalPaidByRetreat('retreat-1');
			expect(result).toBe(0); // Number(null) = 0
		});

		it('getTotalPaidByRetreat should handle undefined amounts', () => {
			store.payments = [
				{ id: 'pay-1', retreatId: 'retreat-1', participantId: 'part-1', amount: undefined },
			];
			const result = store.getTotalPaidByRetreat('retreat-1');
			expect(result).toBeNaN(); // Number(undefined) = NaN
		});

		it('getTotalPaidByParticipant should sum amounts correctly', () => {
			const result = store.getTotalPaidByParticipant('part-1');
			expect(result).toBe(250); // 100 + 150
		});

		it('getTotalPaidByParticipant should handle empty participant', () => {
			const result = store.getTotalPaidByParticipant('nonexistent');
			expect(result).toBe(0);
		});

		it('getTotalPaidByRetreat should handle multiple retreats', () => {
			const result1 = store.getTotalPaidByRetreat('retreat-1');
			const result2 = store.getTotalPaidByRetreat('retreat-2');
			expect(result1).toBe(300);
			expect(result2).toBe(150);
		});

		it('getTotalPaidByParticipant should handle multiple participants', () => {
			const result1 = store.getTotalPaidByParticipant('part-1');
			const result2 = store.getTotalPaidByParticipant('part-2');
			expect(result1).toBe(250);
			expect(result2).toBe(200);
		});
	});

	describe('fetchPayments', () => {
		const mockPayments = [
			{ id: 'pay-1', retreatId: 'retreat-1', participantId: 'part-1', amount: 100 },
		];

		it('should fetch payments with no filters', async () => {
			const { getPayments } = await import('@/services/api');
			(getPayments as any).mockResolvedValue(mockPayments);

			await store.fetchPayments();

			expect(getPayments).toHaveBeenCalledWith(undefined);
			expect(store.payments).toEqual(mockPayments);
			expect(store.loading).toBe(false);
		});

		it('should fetch payments with filters', async () => {
			const { getPayments } = await import('@/services/api');
			const filters = { retreatId: 'retreat-1', participantId: 'part-1' };
			(getPayments as any).mockResolvedValue(mockPayments);

			await store.fetchPayments(filters);

			expect(getPayments).toHaveBeenCalledWith(filters);
			expect(store.payments).toEqual(mockPayments);
		});

		it('should handle API errors', async () => {
			const { getPayments } = await import('@/services/api');
			const error = new Error('Failed to fetch');
			(getPayments as any).mockRejectedValue(error);

			await store.fetchPayments();

			expect(store.error).toBe('Failed to fetch');
			expect(store.loading).toBe(false);
			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Failed to fetch',
				variant: 'destructive',
			});
		});

		it('should set loading state during fetch', async () => {
			const { getPayments } = await import('@/services/api');
			let resolveFetch: (value: any) => void;
			const fetchPromise = new Promise((resolve) => {
				resolveFetch = resolve;
			});
			(getPayments as any).mockReturnValue(fetchPromise);

			const fetchOperation = store.fetchPayments();
			expect(store.loading).toBe(true);

			resolveFetch!(mockPayments);
			await fetchOperation;

			expect(store.loading).toBe(false);
		});
	});

	describe('fetchPaymentsByRetreat - DATA MERGE LOGIC', () => {
		const mockRetreatPayments = [
			{ id: 'pay-1', retreatId: 'retreat-1', participantId: 'part-1', amount: 100 },
			{ id: 'pay-2', retreatId: 'retreat-1', participantId: 'part-2', amount: 200 },
		];

		it('should add new payments to array', async () => {
			const { getPaymentsByRetreat } = await import('@/services/api');
			(getPaymentsByRetreat as any).mockResolvedValue(mockRetreatPayments);

			await store.fetchPaymentsByRetreat('retreat-1');

			expect(store.payments).toHaveLength(2);
			expect(store.payments[0]).toEqual(mockRetreatPayments[0]);
		});

		it('should update existing payments in array', async () => {
			const { getPaymentsByRetreat } = await import('@/services/api');
			store.payments = [
				{ id: 'pay-1', retreatId: 'retreat-1', participantId: 'part-1', amount: 50 }, // Old amount
			];
			(getPaymentsByRetreat as any).mockResolvedValue(mockRetreatPayments);

			await store.fetchPaymentsByRetreat('retreat-1');

			expect(store.payments).toHaveLength(2);
			expect(store.payments[0].amount).toBe(100); // Updated
			expect(store.payments[1]).toEqual(mockRetreatPayments[1]); // Added
		});

		it('should handle merge with duplicates correctly', async () => {
			const { getPaymentsByRetreat } = await import('@/services/api');
			store.payments = [
				{ id: 'pay-1', retreatId: 'retreat-1', participantId: 'part-1', amount: 50 },
				{ id: 'pay-3', retreatId: 'retreat-2', participantId: 'part-3', amount: 300 }, // Different retreat
			];
			(getPaymentsByRetreat as any).mockResolvedValue(mockRetreatPayments);

			await store.fetchPaymentsByRetreat('retreat-1');

			expect(store.payments).toHaveLength(3);
			expect(store.payments[0].amount).toBe(100); // Updated pay-1
			expect(store.payments[1].amount).toBe(300); // Untouched pay-3
			expect(store.payments[2]).toEqual(mockRetreatPayments[1]); // Added pay-2
		});

		it('should handle API errors', async () => {
			const { getPaymentsByRetreat } = await import('@/services/api');
			const error = new Error('Failed to fetch retreat payments');
			(getPaymentsByRetreat as any).mockRejectedValue(error);

			await store.fetchPaymentsByRetreat('retreat-1');

			expect(store.error).toBe('Failed to fetch retreat payments');
			expect(store.loading).toBe(false);
			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Failed to fetch retreat payments',
				variant: 'destructive',
			});
		});

		it('should set loading state', async () => {
			const { getPaymentsByRetreat } = await import('@/services/api');
			let resolveFetch: (value: any) => void;
			const fetchPromise = new Promise((resolve) => {
				resolveFetch = resolve;
			});
			(getPaymentsByRetreat as any).mockReturnValue(fetchPromise);

			const fetchOperation = store.fetchPaymentsByRetreat('retreat-1');
			expect(store.loading).toBe(true);

			resolveFetch!(mockRetreatPayments);
			await fetchOperation;

			expect(store.loading).toBe(false);
		});
	});

	describe('fetchPaymentsByParticipant', () => {
		const mockParticipantPayments = [
			{ id: 'pay-1', retreatId: 'retreat-1', participantId: 'part-1', amount: 100 },
		];

		it('should add participant payments to array', async () => {
			const { getPaymentsByParticipant } = await import('@/services/api');
			(getPaymentsByParticipant as any).mockResolvedValue(mockParticipantPayments);

			await store.fetchPaymentsByParticipant('part-1');

			expect(store.payments).toHaveLength(1);
			expect(store.payments[0]).toEqual(mockParticipantPayments[0]);
		});

		it('should update existing participant payments', async () => {
			const { getPaymentsByParticipant } = await import('@/services/api');
			store.payments = [
				{ id: 'pay-1', retreatId: 'retreat-1', participantId: 'part-1', amount: 50 },
			];
			(getPaymentsByParticipant as any).mockResolvedValue(mockParticipantPayments);

			await store.fetchPaymentsByParticipant('part-1');

			expect(store.payments[0].amount).toBe(100); // Updated
		});

		it('should handle API errors', async () => {
			const { getPaymentsByParticipant } = await import('@/services/api');
			const error = new Error('Failed to fetch participant payments');
			(getPaymentsByParticipant as any).mockRejectedValue(error);

			await store.fetchPaymentsByParticipant('part-1');

			expect(store.error).toBe('Failed to fetch participant payments');
			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Failed to fetch participant payments',
				variant: 'destructive',
			});
		});
	});

	describe('addPayment', () => {
		const newPaymentData = {
			retreatId: 'retreat-1',
			participantId: 'part-1',
			amount: 150,
			paymentMethod: 'cash',
		};

		const createdPayment = {
			id: 'pay-new',
			...newPaymentData,
		};

		it('should create payment successfully', async () => {
			const { createPayment } = await import('@/services/api');
			(createPayment as any).mockResolvedValue(createdPayment);

			const result = await store.addPayment(newPaymentData);

			expect(createPayment).toHaveBeenCalledWith(newPaymentData);
			expect(store.payments).toContainEqual(createdPayment);
			expect(result).toEqual(createdPayment);
			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Éxito',
				description: 'Pago registrado correctamente',
				variant: 'default',
			});
		});

		it('should handle validation errors', async () => {
			const { createPayment } = await import('@/services/api');
			const error = new Error('Validation failed');
			(createPayment as any).mockRejectedValue(error);

			await expect(store.addPayment(newPaymentData)).rejects.toThrow(error);
			expect(store.error).toBe('Validation failed');
			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Validation failed',
				variant: 'destructive',
			});
		});
	});

	describe('updatePaymentById', () => {
		const existingPayment = {
			id: 'pay-1',
			retreatId: 'retreat-1',
			participantId: 'part-1',
			amount: 100,
		};

		const updatedPayment = {
			...existingPayment,
			amount: 200,
		};

		it('should update payment successfully', async () => {
			const { updatePayment } = await import('@/services/api');
			store.payments = [existingPayment];
			(updatePayment as any).mockResolvedValue(updatedPayment);

			const result = await store.updatePaymentById('pay-1', { amount: 200 });

			expect(updatePayment).toHaveBeenCalledWith('pay-1', { amount: 200 });
			expect(store.payments[0]).toEqual(updatedPayment);
			expect(result).toEqual(updatedPayment);
			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Éxito',
				description: 'Pago actualizado correctamente',
				variant: 'default',
			});
		});

		it('should handle payment not found', async () => {
			const { updatePayment } = await import('@/services/api');
			store.payments = [existingPayment];
			(updatePayment as any).mockResolvedValue(updatedPayment);

			await store.updatePaymentById('nonexistent', { amount: 200 });

			// Should not modify the array
			expect(store.payments).toHaveLength(1);
			expect(store.payments[0]).toEqual(existingPayment);
		});

		it('should handle API errors', async () => {
			const { updatePayment } = await import('@/services/api');
			const error = new Error('Update failed');
			(updatePayment as any).mockRejectedValue(error);

			await expect(store.updatePaymentById('pay-1', { amount: 200 })).rejects.toThrow(error);
			expect(store.error).toBe('Update failed');
			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Update failed',
				variant: 'destructive',
			});
		});
	});

	describe('removePayment', () => {
		const existingPayments = [
			{ id: 'pay-1', retreatId: 'retreat-1', participantId: 'part-1', amount: 100 },
			{ id: 'pay-2', retreatId: 'retreat-1', participantId: 'part-2', amount: 200 },
			{ id: 'pay-3', retreatId: 'retreat-2', participantId: 'part-3', amount: 300 },
		];

		it('should delete payment successfully', async () => {
			const { deletePayment } = await import('@/services/api');
			store.payments = [...existingPayments];
			(deletePayment as any).mockResolvedValue({});

			await store.removePayment('pay-2');

			expect(deletePayment).toHaveBeenCalledWith('pay-2');
			expect(store.payments).toHaveLength(2);
			expect(store.payments.find((p: any) => p.id === 'pay-2')).toBeUndefined();
			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Éxito',
				description: 'Pago eliminado correctamente',
				variant: 'default',
			});
		});

		it('should handle API errors', async () => {
			const { deletePayment } = await import('@/services/api');
			const error = new Error('Delete failed');
			store.payments = [...existingPayments];
			(deletePayment as any).mockRejectedValue(error);

			await expect(store.removePayment('pay-1')).rejects.toThrow(error);
			expect(store.error).toBe('Delete failed');
			// Payment should NOT be removed on error
			expect(store.payments).toHaveLength(3);
			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Delete failed',
				variant: 'destructive',
			});
		});
	});

	describe('getPaymentSummary', () => {
		it('should fetch payment summary successfully', async () => {
			const { getPaymentSummaryByRetreat } = await import('@/services/api');
			const mockSummary = {
				totalCollected: 1000,
				totalPending: 500,
				participantCount: 10,
			};
			(getPaymentSummaryByRetreat as any).mockResolvedValue(mockSummary);

			const result = await store.getPaymentSummary('retreat-1');

			expect(getPaymentSummaryByRetreat).toHaveBeenCalledWith('retreat-1');
			expect(result).toEqual(mockSummary);
		});

		it('should handle API errors', async () => {
			const { getPaymentSummaryByRetreat } = await import('@/services/api');
			const error = new Error('Summary failed');
			(getPaymentSummaryByRetreat as any).mockRejectedValue(error);

			await expect(store.getPaymentSummary('retreat-1')).rejects.toThrow(error);
			expect(store.error).toBe('Summary failed');
			expect(toastSpy).toHaveBeenCalledWith({
				title: 'Error',
				description: 'Summary failed',
				variant: 'destructive',
			});
		});
	});

	describe('clearError', () => {
		it('should clear error state', () => {
			store.error = 'Some error';
			store.clearError();
			expect(store.error).toBe(null);
		});
	});
});
