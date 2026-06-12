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

	it('renderiza la acción vía i18n (key audit.actions.*) y el actor', async () => {
		const wrapper = mountView();
		await flushPromises();
		const text = wrapper.text();
		// El mock global de vue-i18n devuelve la key: verificamos la key correcta.
		expect(text).toContain('audit.actions.table.create');
		expect(text).toContain('Coordinadora Ana');
		// Sin actor → fallback
		expect(text).toContain('audit.ui.systemActor');
	});

	it('muestra el diff old→new de un update', async () => {
		const wrapper = mountView();
		await flushPromises();
		const text = wrapper.text();
		expect(text).toContain('audit.actions.payment.update');
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

	it('resuelve participant_debt.create a su key i18n (no el mapa hardcodeado)', async () => {
		mockGetDomainAuditLogs.mockResolvedValue({
			logs: [
				{
					id: 'log-debt',
					action: 'participant_debt.create',
					resourceType: 'participant_debt',
					resourceId: 'debt-1',
					retreatId: RETREAT_ID,
					actorUserId: 'u1',
					actor: { displayName: 'Tesorero', email: 'tesorero@example.com' },
					oldValues: null,
					newValues: { amount: 500, description: 'Hospedaje' },
					metadata: null,
					ipAddress: null,
					userAgent: null,
					createdAt: '2026-06-05T12:00:00.000Z',
				},
			],
			total: 1,
			limit: 50,
			offset: 0,
			hasMore: false,
		});

		const wrapper = mountView();
		await flushPromises();
		const text = wrapper.text();
		expect(text).toContain('audit.actions.participant_debt.create');
		expect(text).toContain('audit.resources.participant_debt');
	});

	it('reenvía el filtro de área Deudas (participant_debt) a la API', async () => {
		const wrapper = mountView();
		await flushPromises();
		mockGetDomainAuditLogs.mockClear();

		(wrapper.vm as any).resourceTypeFilter = 'participant_debt';
		await flushPromises();

		expect(mockGetDomainAuditLogs).toHaveBeenCalledWith(
			RETREAT_ID,
			expect.objectContaining({ resourceType: 'participant_debt', offset: 0 }),
		);
	});

	it('por defecto carga el último mes (startDate ~30 días antes de endDate)', async () => {
		mountView();
		await flushPromises();
		const opts = mockGetDomainAuditLogs.mock.calls[0][1];
		expect(typeof opts.startDate).toBe('string');
		expect(typeof opts.endDate).toBe('string');
		const days =
			(new Date(opts.endDate).getTime() - new Date(opts.startDate).getTime()) / 86_400_000;
		expect(days).toBeGreaterThanOrEqual(29);
		expect(days).toBeLessThanOrEqual(32);
	});

	it('un preset de rango rápido (1 semana) recarga con ~7 días y se resalta', async () => {
		const wrapper = mountView();
		await flushPromises();
		mockGetDomainAuditLogs.mockClear();

		(wrapper.vm as any).applyPreset({ key: '1w', days: 7 });
		await flushPromises();

		const opts = mockGetDomainAuditLogs.mock.calls[0][1];
		const days =
			(new Date(opts.endDate).getTime() - new Date(opts.startDate).getTime()) / 86_400_000;
		expect(days).toBeGreaterThanOrEqual(6);
		expect(days).toBeLessThanOrEqual(9);
		expect((wrapper.vm as any).activePreset).toBe('1w');
	});

	it('el preset "Todo" limpia el filtro de fecha (sin startDate/endDate)', async () => {
		const wrapper = mountView();
		await flushPromises();
		mockGetDomainAuditLogs.mockClear();

		(wrapper.vm as any).applyPreset({ key: 'all', days: null });
		await flushPromises();

		const opts = mockGetDomainAuditLogs.mock.calls[0][1];
		expect(opts.startDate).toBeUndefined();
		expect(opts.endDate).toBeUndefined();
		expect((wrapper.vm as any).activePreset).toBe('all');
	});

	it('editar una fecha a mano apaga el resaltado del preset', async () => {
		const wrapper = mountView();
		await flushPromises();
		expect((wrapper.vm as any).activePreset).toBe('1m'); // default

		(wrapper.vm as any).onStartInput('2026-01-01');
		await flushPromises();

		expect((wrapper.vm as any).activePreset).toBeNull();
	});
});
