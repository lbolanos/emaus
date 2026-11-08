import { defineStore } from 'pinia';
import { ref } from 'vue';
import { receiptClaimsApi } from '@/services/api';

/**
 * Comprobantes pendientes de aplicar (badge de «Pagos» en el sidebar).
 * Compartido entre el sidebar, que lo pide al cambiar de retiro, y la
 * bandeja de comprobantes, que lo actualiza al aplicar o descartar: antes el
 * badge solo se refrescaba al cambiar de retiro y mostraba pendientes que ya
 * no lo estaban.
 */
export const useReceiptClaimsStore = defineStore('receiptClaims', () => {
	const pendingCount = ref<number | null>(null);

	const refreshPending = async (retreatId: string) => {
		try {
			const claims = await receiptClaimsApi.list(retreatId, 'pending');
			pendingCount.value = claims.length;
		} catch {
			// Sin permiso payment:read (o error) → sin badge.
			pendingCount.value = null;
		}
	};

	const setPending = (count: number) => {
		pendingCount.value = count;
	};

	return { pendingCount, refreshPending, setPending };
});
