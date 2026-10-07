import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const upsertFollowUp = vi.fn();
const getFollowUps = vi.fn();
const getCrmTasks = vi.fn();
const palanqueroOptionsMock = vi.fn();

vi.mock('@/services/api', () => ({
	getFollowUps: (...a: any[]) => getFollowUps(...a),
	upsertFollowUp: (...a: any[]) => upsertFollowUp(...a),
	getCrmTasks: (...a: any[]) => getCrmTasks(...a),
	getPalanqueroOptions: (...a: any[]) => palanqueroOptionsMock(...a),
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
	{ id: 'p1', firstName: 'Omar', lastName: 'Ojeda', type: 'walker', palancasReceivedCount: 0, palancasCoordinator: 'Palanquero 1' },
	{ id: 'p2', firstName: 'Luz Ma', lastName: 'Ibarra', type: 'walker', palancasReceivedCount: 4, palancasCoordinator: 'Palanquero 2' },
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
		palanqueroOptionsMock.mockResolvedValue([
			{ value: 'Palanquero 1', label: 'Palanquero 1 (Jorge Ruiz)' },
			{ value: 'Palanquero 2', label: 'Palanquero 2' },
		]);
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
		// Con "Todos": el default caminantes excluiría a Mario (server).
		await w.findAll('select')[0].setValue('all');
		await flushPromises();
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
		await w.findAll('select')[0].setValue('all');
		await flushPromises();
		expect(w.text()).not.toContain('(eliminado)');
		expect(w.text()).not.toContain('Cancelado Pérez');
		// Los tres contactables: Omar y Mario en Por contactar, y Luz Ma DOS
		// veces — su etapa (Contactado) y el cubo «Con sus cartas» (4 de 3).
		expect(w.findAllComponents({ name: 'FollowUpCard' })).toHaveLength(4);
	});

	it('abre filtrado a caminantes por defecto', async () => {
		const w = await mountView();
		expect((w.findAll('select')[0].element as HTMLSelectElement).value).toBe('walker');
		expect(w.text()).toContain('Omar Ojeda');
		// Mario es servidor: no aparece hasta que se cambie el filtro.
		expect(w.text()).not.toContain('Mario Medina');
	});

	it('«Con sus cartas» es un cubo derivado: duplica a quien cumple y no acepta arrastre', async () => {
		const w = await mountView();
		const sections = w.findAll('section');
		// Cinco etapas + el cubo derivado al final.
		expect(sections).toHaveLength(6);
		const metColumn = sections[5];

		// Luz Ma (4 de 3) entra al cubo Y sigue en su etapa Contactado;
		// Omar (0 cartas) no entra.
		expect(metColumn.text()).toContain('Luz Ma Ibarra');
		expect(metColumn.text()).not.toContain('Omar Ojeda');
		expect(sections[1].text()).toContain('Luz Ma Ibarra');

		// Soltar una tarjeta sobre el cubo no guarda etapa: no es zona de drop.
		const card = w.findAllComponents({ name: 'FollowUpCard' })[0];
		await card.trigger('dragstart');
		await metColumn.trigger('drop');
		await flushPromises();
		expect(upsertFollowUp).not.toHaveBeenCalled();

		// La tarjeta del cubo abre el panel de historial como cualquier otra.
		await metColumn.findComponent({ name: 'FollowUpCard' }).trigger('click');
		expect(w.findComponent({ name: 'ParticipantTimelinePanel' }).props('open')).toBe(true);
	});

	it('tocar una tarjeta abre su historial y la etapa se cambia desde ahí', async () => {
		const w = await mountView();
		// Antes el tap-assign se comía el click en el teléfono y el panel nunca abría.
		await w.findAll('section')[0].findComponent({ name: 'FollowUpCard' }).trigger('click');
		await flushPromises();
		expect(w.findComponent({ name: 'ParticipantTimelinePanel' }).props('open')).toBe(true);

		// Omar no tiene fila: su etapa actual es Por contactar.
		expect(w.get('[data-testid="stage-chip-pending"]').attributes('aria-pressed')).toBe('true');
		// En el celular el botón es sólo el ícono (el mismo de la barra); el
		// nombre queda en aria-label/title y reaparece desde md.
		const chip = w.get('[data-testid="stage-chip-pending"]');
		expect(chip.find('svg').exists()).toBe(true);
		expect(chip.find('span').classes()).toEqual(expect.arrayContaining(['hidden', 'md:inline']));
		await w.get('[data-testid="stage-chip-contacted"]').trigger('click');
		await flushPromises();

		expect(upsertFollowUp).toHaveBeenCalledWith(
			expect.objectContaining({ participantId: 'p1', retreatId: 'r1', status: 'contacted' }),
		);
		// El panel sigue abierto para anotar lo que dijo.
		expect(w.findComponent({ name: 'ParticipantTimelinePanel' }).props('open')).toBe(true);
	});

	it('la barra de etapas elige la columna que se ve en el celular', async () => {
		const w = await mountView();
		expect(w.get('#stage-pending').classes()).not.toContain('hidden');
		expect(w.get('#stage-contacted').classes()).toContain('hidden');
		// Con su conteo: Luz Ma está en Contactado.
		expect(w.get('[data-testid="stage-nav-contacted"]').text()).toContain('1');

		await w.get('[data-testid="stage-nav-contacted"]').trigger('click');

		expect(w.get('#stage-contacted').classes()).not.toContain('hidden');
		expect(w.get('#stage-pending').classes()).toContain('hidden');
		// Desde lg todas se ven: lo oculto es sólo bajo `lg`.
		expect(w.get('#stage-pending').classes()).toContain('lg:flex');

		// En el celular la pastilla es ícono + conteo, sin el nombre.
		const pill = w.get('[data-testid="stage-nav-contacted"]');
		expect(pill.find('svg').exists()).toBe(true);
		expect(pill.find('span').classes()).toEqual(expect.arrayContaining(['hidden', 'lg:inline']));

		// Las seis caben sin scroll en el teléfono: grid de 6 abajo de lg.
		expect(w.get('nav').classes()).toEqual(expect.arrayContaining(['grid', 'grid-cols-6']));
	});

	it('si los filtros no dejan a nadie lo dice, sin fingir un retiro vacío', async () => {
		const w = await mountView();
		await w.findComponent({ name: 'Input' }).setValue('zzz');
		await flushPromises();

		expect(w.text()).toContain('followUp.noMatches');
		expect(w.text()).not.toContain('followUp.noParticipants');
		expect(w.findAll('section')).toHaveLength(0);

		await w.get('[data-testid="clear-filters"]').trigger('click');
		await flushPromises();
		// Limpiar abre todos los tipos: Mario (servidor) vuelve a aparecer.
		expect(w.text()).toContain('Omar Ojeda');
		expect(w.text()).toContain('Mario Medina');
	});

	it('el filtro por tipo separa caminantes de servidores', async () => {
		const w = await mountView();
		await w.findAll('select')[0].setValue('server');
		await flushPromises();

		expect(w.text()).toContain('Mario Medina');
		expect(w.text()).not.toContain('Omar Ojeda');
	});

	it('filtra por el palanquero asignado a cada caminante', async () => {
		const w = await mountView();
		await w.findAll('select')[0].setValue('all'); // ver también servidores
		await flushPromises();
		expect(w.text()).toContain('Mario Medina');

		// El tercer select es el de palanquero; la opción trae a quién lo tiene.
		const palanqueroSelect = w.findAll('select')[2];
		const optionTexts = [...palanqueroSelect.element.options].map((o) => o.text);
		expect(optionTexts).toContain('Palanquero 1 (Jorge Ruiz)');

		await palanqueroSelect.setValue('Palanquero 1');
		await flushPromises();
		// Omar es de Palanquero 1; Luz Ma del 2 y Mario no tiene.
		expect(w.text()).toContain('Omar Ojeda');
		expect(w.text()).not.toContain('Luz Ma Ibarra');
		expect(w.text()).not.toContain('Mario Medina');

		// «Sin asignar»: quién todavía no tiene palanquero.
		await palanqueroSelect.setValue('none');
		await flushPromises();
		expect(w.text()).toContain('Mario Medina');
		expect(w.text()).not.toContain('Omar Ojeda');
	});
});
