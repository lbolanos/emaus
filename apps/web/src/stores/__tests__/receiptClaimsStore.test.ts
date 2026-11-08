import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const api = vi.hoisted(() => ({
	receiptClaimsApi: { list: vi.fn() },
}));
vi.mock('@/services/api', () => api);

import { useReceiptClaimsStore } from '../receiptClaimsStore';

describe('receiptClaimsStore (badge de «Pagos»)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
	});

	it('refreshPending cuenta los pendientes del retiro', async () => {
		api.receiptClaimsApi.list.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
		const store = useReceiptClaimsStore();
		await store.refreshPending('r1');
		expect(api.receiptClaimsApi.list).toHaveBeenCalledWith('r1', 'pending');
		expect(store.pendingCount).toBe(2);
	});

	it('sin permiso (o error) el badge queda vacío, no con un número viejo', async () => {
		const store = useReceiptClaimsStore();
		store.setPending(5);
		api.receiptClaimsApi.list.mockRejectedValue(new Error('403'));
		await store.refreshPending('r1');
		expect(store.pendingCount).toBeNull();
	});

	it('setPending: la bandeja lo baja al aplicar o descartar', () => {
		const store = useReceiptClaimsStore();
		store.setPending(3);
		store.setPending(2);
		expect(store.pendingCount).toBe(2);
	});
});
