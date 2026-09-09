import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const upsertFollowUp = vi.fn();
const getFollowUps = vi.fn();
const getCrmTasks = vi.fn();

vi.mock('@/services/api', () => ({
	getFollowUps: (...a: any[]) => getFollowUps(...a),
	upsertFollowUp: (...a: any[]) => upsertFollowUp(...a),
	getCrmTasks: (...a: any[]) => getCrmTasks(...a),
	createCrmTask: vi.fn(),
	updateCrmTask: vi.fn(),
	deleteCrmTask: vi.fn(),
	getParticipantNotes: vi.fn(() => Promise.resolve([])),
	getParticipantTimeline: vi.fn(() => Promise.resolve([])),
	createParticipantNote: vi.fn(),
	updateParticipantNote: vi.fn(),
	deleteParticipantNote: vi.fn(),
}));

const fetchParticipants = vi.fn();
const participants = [
	{ id: 'p1', firstName: 'Omar', lastName: 'Ojeda', type: 'walker', palancasReceivedCount: 0 },
	{ id: 'p2', firstName: 'Luz Ma', lastName: 'Ibarra', type: 'walker', palancasReceivedCount: 4 },
	{ id: 'p3', firstName: 'Mario', lastName: 'Medina', type: 'server', palancasReceivedCount: 2 },
	// Ejerció el derecho de borrado: anonimizado, no contactable.
	{ id: 'p4', firstName: '(eliminado)', lastName: '', type: 'walker', dataDeletedAt: '2026-05-01T00:00:00.000Z' },
	{ id: 'p5', firstName: 'Cancelado', lastName: 'Pérez', type: 'walker', isCancelled: true },
];

// Con defineStore real el store es reactivo y storeToRefs funciona; con un
// objeto plano storeToRefs devuelve refs vacíos y la vista revienta.
vi.mock('@/stores/participantStore', async () => {
	const { defineStore } = await import('pinia');
	const { ref } = await import('vue');
	return {
		useParticipantStore: defineStore('participant-mock', () => ({
			participants: ref<any[]>(participants),
			filters: ref<any>({}),
			fetchParticipants,
		})),
	};
});

vi.mock('@/stores/retreatStore', async () => {
	const { defineStore } = await import('pinia');
	const { ref } = await import('vue');
	return {
		useRetreatStore: defineStore('retreat-mock', () => ({
			selectedRetreatId: ref('r1'),
			selectedRetreat: ref<any>({ id: 'r1', minPalancasPerWalker: 3 }),
		})),
	};
});

vi.mock('@/components/MessageDialog.vue', () => ({
	default: { name: 'MessageDialog', template: '<div />' },
}));

import FollowUpView from '../FollowUpView.vue';

describe('FollowUpView (tablero de seguimiento)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setActivePinia(createPinia());
		getFollowUps.mockResolvedValue([
			{ id: 'f1', participantId: 'p2', retreatId: 'r1', status: 'contacted' },
		]);
		getCrmTasks.mockResolvedValue([]);
		upsertFollowUp.mockResolvedValue({});
	});

	const mountView = async () => {
		const w = mount(FollowUpView);
		// La vista carga en onMounted async: con nextTick el DOM se queda en el
		// esqueleto y los selectores fallan con "empty DOMWrapper".
		await flushPromises();
		return w;
	};

	it('pone en Por contactar a quien no tiene fila de seguimiento', async () => {
		const w = await mountView();
		const columns = w.findAll('section');
		// Omar y Mario no tienen follow-up; Luz Ma está en Contactado.
		expect(columns[0].text()).toContain('Omar Ojeda');
		expect(columns[0].text()).toContain('Mario Medina');
		expect(columns[0].text()).not.toContain('Luz Ma');
		expect(columns[1].text()).toContain('Luz Ma Ibarra');
	});

	it('soltar una tarjeta en otra columna guarda la etapa nueva', async () => {
		const w = await mountView();
		const card = w.findAllComponents({ name: 'FollowUpCard' })[0];
		await card.trigger('dragstart');
		// Índice 2 = "Confirmó".
		await w.findAll('section')[2].trigger('drop');
		await flushPromises();

		expect(upsertFollowUp).toHaveBeenCalledWith(
			expect.objectContaining({ participantId: 'p1', retreatId: 'r1', status: 'confirmed' }),
		);
	});

	it('si el guardado falla, la tarjeta vuelve a su columna', async () => {
		upsertFollowUp.mockRejectedValueOnce(new Error('boom'));
		const w = await mountView();

		const card = w.findAllComponents({ name: 'FollowUpCard' })[0];
		await card.trigger('dragstart');
		await w.findAll('section')[2].trigger('drop');
		await flushPromises();

		// Omar sigue en Por contactar, no se quedó en Confirmó.
		const columns = w.findAll('section');
		expect(columns[0].text()).toContain('Omar Ojeda');
		expect(columns[2].text()).not.toContain('Omar Ojeda');
	});

	it('el filtro de cartas usa el umbral del retiro', async () => {
		const w = await mountView();
		const selects = w.findAll('select');
		// El segundo select es el de cartas.
		await selects[1].setValue('met');
		await flushPromises();

		const text = w.text();
		// Luz Ma tiene 4 de 3 → cumple. Mario tiene 2 → no.
		expect(text).toContain('Luz Ma Ibarra');
		expect(text).not.toContain('Mario Medina');
	});

	it('no lista a quien ejerció el derecho de borrado ni a los cancelados', async () => {
		const w = await mountView();
		expect(w.text()).not.toContain('(eliminado)');
		expect(w.text()).not.toContain('Cancelado Pérez');
		// Sólo los tres contactables.
		expect(w.findAllComponents({ name: 'FollowUpCard' })).toHaveLength(3);
	});

	it('el filtro por tipo separa caminantes de servidores', async () => {
		const w = await mountView();
		await w.findAll('select')[0].setValue('server');
		await flushPromises();

		expect(w.text()).toContain('Mario Medina');
		expect(w.text()).not.toContain('Omar Ojeda');
	});
});
