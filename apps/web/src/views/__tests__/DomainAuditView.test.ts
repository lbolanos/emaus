import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import DomainAuditView from '@/views/DomainAuditView.vue';
import { useRetreatStore } from '@/stores/retreatStore';

const { mockGetDomainAuditLogs } = vi.hoisted(() => ({
	mockGetDomainAuditLogs: vi.fn(),
}));

vi.mock('@/services/api', () => ({
	getDomainAuditLogs: (...args: any[]) => mockGetDomainAuditLogs(...args),
}));

const RETREAT_ID = 'retreat-123';

function sampleResponse() {
	return {
		logs: [
			{
				id: 'log-1',
				action: 'table.create',
				resourceType: 'table',
				resourceId: 't1',
				retreatId: RETREAT_ID,
				actorUserId: 'u1',
				actor: { displayName: 'Coordinadora Ana', email: 'ana@example.com' },
				oldValues: null,
				newValues: { name: 'Mesa 1' },
				metadata: null,
				ipAddress: '10.0.0.1',
				userAgent: 'jest',
				createdAt: '2026-06-05T10:00:00.000Z',
			},
			{
				id: 'log-2',
				action: 'payment.update',
				resourceType: 'payment',
				resourceId: 'pay1',
				retreatId: RETREAT_ID,
				actorUserId: 'u2',
				actor: null,
				oldValues: { amount: 100 },
				newValues: { amount: 250 },
				metadata: null,
				ipAddress: null,
				userAgent: null,
				createdAt: '2026-06-05T11:00:00.000Z',
			},
		],
		total: 2,
		limit: 50,
		offset: 0,
		hasMore: false,
	};
}

function mountView() {
	const pinia = createPinia();
	setActivePinia(pinia);
	const retreatStore = useRetreatStore(pinia);
	retreatStore.selectedRetreatId = RETREAT_ID;
	return mount(DomainAuditView, { global: { plugins: [pinia] } });
}

describe('DomainAuditView', () => {
	beforeEach(() => {
		mockGetDomainAuditLogs.mockReset();
		mockGetDomainAuditLogs.mockResolvedValue(sampleResponse());
	});

	it('carga los logs del retiro seleccionado al montar', async () => {
		mountView();
		await flushPromises();
		expect(mockGetDomainAuditLogs).toHaveBeenCalledWith(
			RETREAT_ID,
			expect.objectContaining({ limit: 50, offset: 0 }),
		);
	});

	it('renderiza la acción con etiqueta en español y el actor', async () => {
		const wrapper = mountView();
		await flushPromises();
		const text = wrapper.text();
		expect(text).toContain('Mesa creada');
		expect(text).toContain('Coordinadora Ana');
		// Sin actor → fallback
		expect(text).toContain('Sistema / sin sesión');
	});

	it('muestra el diff old→new de un update', async () => {
		const wrapper = mountView();
		await flushPromises();
		const text = wrapper.text();
		expect(text).toContain('Pago editado');
		expect(text).toContain('100');
		expect(text).toContain('250');
	});

	it('no llama a la API si no hay retiro seleccionado', async () => {
		const pinia = createPinia();
		setActivePinia(pinia);
		const retreatStore = useRetreatStore(pinia);
		retreatStore.selectedRetreatId = null;
		mount(DomainAuditView, { global: { plugins: [pinia] } });
		await flushPromises();
		expect(mockGetDomainAuditLogs).not.toHaveBeenCalled();
	});

	it('reenvía el filtro de área a la API', async () => {
		const wrapper = mountView();
		await flushPromises();
		mockGetDomainAuditLogs.mockClear();

		// Cambiar el filtro de resourceType dispara una recarga (watcher).
		(wrapper.vm as any).resourceTypeFilter = 'payment';
		await flushPromises();

		expect(mockGetDomainAuditLogs).toHaveBeenCalledWith(
			RETREAT_ID,
			expect.objectContaining({ resourceType: 'payment', offset: 0 }),
		);
	});
});
