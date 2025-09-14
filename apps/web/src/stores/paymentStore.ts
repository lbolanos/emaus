import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
	createPayment,
	getPayments,
	getPaymentById,
	updatePayment,
	deletePayment,
	getPaymentsByParticipant,
	getPaymentsByRetreat,
	getPaymentSummaryByRetreat,
} from '@/services/api';
import type { Payment, CreatePayment, UpdatePayment } from '@repo/types';
import { useToast } from '@repo/ui';

export const usePaymentStore = defineStore('payment', () => {
	const payments = ref<Payment[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);
	const { toast } = useToast();

	// Getters
	const getPaymentsByRetreatId = computed(() => {
		return (retreatId: string) => payments.value.filter((p) => p.retreatId === retreatId);
	});

	const getPaymentsByParticipantId = computed(() => {
		return (participantId: string) =>
			payments.value.filter((p) => p.participantId === participantId);
	});

	const getTotalPaidByRetreat = computed(() => {
		return (retreatId: string) => {
			return payments.value
				.filter((p) => p.retreatId === retreatId)
				.reduce((total, payment) => total + Number(payment.amount), 0);
		};
	});

	const getTotalPaidByParticipant = computed(() => {
		return (participantId: string) => {
			return payments.value
				.filter((p) => p.participantId === participantId)
				.reduce((total, payment) => total + Number(payment.amount), 0);
		};
	});

	// Actions
	const fetchPayments = async (filters?: {
		retreatId?: string;
		participantId?: string;
		startDate?: string;
		endDate?: string;
		paymentMethod?: string;
	}) => {
		try {
			loading.value = true;
			error.value = null;
			const data = await getPayments(filters);
			payments.value = data;
		} catch (err) {
			error.value = err instanceof Error ? err.message : 'Error al cargar pagos';
			toast({
				title: 'Error',
				description: error.value,
				variant: 'destructive',
			});
		} finally {
			loading.value = false;
		}
	};

	const fetchPaymentsByRetreat = async (retreatId: string) => {
		try {
			loading.value = true;
			error.value = null;
			const data = await getPaymentsByRetreat(retreatId);
			// Update existing payments or add new ones
			data.forEach((payment: any) => {
				const index = payments.value.findIndex((p) => p.id === payment.id);
				if (index >= 0) {
					payments.value[index] = payment;
				} else {
					payments.value.push(payment);
				}
			});
		} catch (err) {
			error.value = err instanceof Error ? err.message : 'Error al cargar pagos del retiro';
			toast({
				title: 'Error',
				description: error.value,
				variant: 'destructive',
			});
		} finally {
			loading.value = false;
		}
	};

	const fetchPaymentsByParticipant = async (participantId: string) => {
		try {
			loading.value = true;
			error.value = null;
			const data = await getPaymentsByParticipant(participantId);
			// Update existing payments or add new ones
			data.forEach((payment: any) => {
				const index = payments.value.findIndex((p) => p.id === payment.id);
				if (index >= 0) {
					payments.value[index] = payment;
				} else {
					payments.value.push(payment);
				}
			});
		} catch (err) {
			error.value = err instanceof Error ? err.message : 'Error al cargar pagos del participante';
			toast({
				title: 'Error',
				description: error.value,
				variant: 'destructive',
			});
		} finally {
			loading.value = false;
		}
	};

	const addPayment = async (paymentData: any) => {
		try {
			loading.value = true;
			error.value = null;
			const newPayment = await createPayment(paymentData);
			payments.value.push(newPayment);
			toast({
				title: 'Éxito',
				description: 'Pago registrado correctamente',
				variant: 'default',
			});
			return newPayment;
		} catch (err) {
			error.value = err instanceof Error ? err.message : 'Error al crear pago';
			toast({
				title: 'Error',
				description: error.value,
				variant: 'destructive',
			});
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const updatePaymentById = async (paymentId: string, paymentData: any) => {
		try {
			loading.value = true;
			error.value = null;
			const updatedPayment = await updatePayment(paymentId, paymentData);
			const index = payments.value.findIndex((p) => p.id === paymentId);
			if (index >= 0) {
				payments.value[index] = updatedPayment;
			}
			toast({
				title: 'Éxito',
				description: 'Pago actualizado correctamente',
				variant: 'default',
			});
			return updatedPayment;
		} catch (err) {
			error.value = err instanceof Error ? err.message : 'Error al actualizar pago';
			toast({
				title: 'Error',
				description: error.value,
				variant: 'destructive',
			});
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const removePayment = async (paymentId: string) => {
		try {
			loading.value = true;
			error.value = null;
			await deletePayment(paymentId);
			payments.value = payments.value.filter((p) => p.id !== paymentId);
			toast({
				title: 'Éxito',
				description: 'Pago eliminado correctamente',
				variant: 'default',
			});
		} catch (err) {
			error.value = err instanceof Error ? err.message : 'Error al eliminar pago';
			toast({
				title: 'Error',
				description: error.value,
				variant: 'destructive',
			});
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const getPaymentSummary = async (retreatId: string) => {
		try {
			loading.value = true;
			error.value = null;
			const summary = await getPaymentSummaryByRetreat(retreatId);
			return summary;
		} catch (err) {
			error.value = err instanceof Error ? err.message : 'Error al obtener resumen de pagos';
			toast({
				title: 'Error',
				description: error.value,
				variant: 'destructive',
			});
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const clearError = () => {
		error.value = null;
	};

	return {
		// State
		payments,
		loading,
		error,

		// Getters
		getPaymentsByRetreatId,
		getPaymentsByParticipantId,
		getTotalPaidByRetreat,
		getTotalPaidByParticipant,

		// Actions
		fetchPayments,
		fetchPaymentsByRetreat,
		fetchPaymentsByParticipant,
		addPayment,
		updatePaymentById,
		removePayment,
		getPaymentSummary,
		clearError,
	};
});
