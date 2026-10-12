import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import PalancasAssignmentSummary from '../PalancasAssignmentSummary.vue';
import { useParticipantStore } from '../../stores/participantStore';
import { useRetreatStore } from '../../stores/retreatStore';
import { getPalanqueroOptions } from '../../services/api';
import { cleanupMocks } from '../../test/utils';

vi.mock('../../services/api', () => ({
	getPalanqueroOptions: vi.fn(async () => [
		{ value: 'Palanquero 1', label: 'Palanquero 1 (Ana García)' },
		{ value: 'Palanquero 2', label: 'Palanquero 2' },
		{ value: 'Palanquero 3', label: 'Palanquero 3' },
	]),
}));

const walker = (id: string, palancasCoordinator?: string | null) =>
	({ id, type: 'walker', palancasCoordinator }) as any;

// La vista palancas cuenta walkers: servers y lista de espera quedan fuera.
const participants = [
	walker('w1', 'Palanquero 1'),
	walker('w2', 'Palanquero 1'),
	walker('w3', 'Palanquero 2'),
	walker('w4', null),
	walker('w5', ''),
	// Valor huérfano: existió una responsabilidad con ese nombre y ya no está
	// en las options; el tile igual tiene que aparecer para que el total cuadre.
	walker('w6', 'Palanquero 9'),
	{ id: 's1', type: 'server', palancasCoordinator: 'Palanquero 1' },
	{ id: 'q1', type: 'waiting', palancasCoordinator: null },
] as any[];

// El pinia de beforeEach: configurar los stores en una instancia y montar el
// componente con otra dejaría el resumen mirando stores vacíos.
const mountSummary = (pinia: any) => mount(PalancasAssignmentSummary, {
	global: {
		plugins: [pinia],
		mocks: { $t: (key: string) => key },
	},
});

describe('PalancasAssignmentSummary', () => {
	let pinia: any;

	beforeEach(() => {
		vi.clearAllMocks();
		pinia = createPinia();
		setActivePinia(pinia);
		cleanupMocks();
	});

	afterEach(() => {
		cleanupMocks();
	});

	it('cuenta los walkers asignados a cada palanquero, los sin asignar y el total', async () => {
		const retreatStore = useRetreatStore();
		retreatStore.selectedRetreatId = 'retreat-1';
		const participantStore = useParticipantStore();
		participantStore.participants = participants;
		participantStore.loading = false;

		const wrapper = await mountSummary(pinia);
		await flushPromises();

		const tile = (title: string) => {
			const el = wrapper.find(`[title="${title}"]`);
			expect(el.exists()).toBe(true);
			return el.text();
		};

		// Tres palanqueros del retiro, siempre presentes (aunque estén en 0).
		expect(tile('Palanquero 1')).toContain('2');
		expect(tile('Palanquero 2')).toContain('1');
		expect(tile('Palanquero 3')).toContain('0');
		// El huérfano entra con su valor crudo.
		expect(tile('Palanquero 9')).toContain('1');

		expect(wrapper.text()).toContain('palancasDashboard.unassigned');
		// 6 walkers, 4 asignados → 2 sin asignar (null y '' cuentan igual).
		expect(wrapper.findAll('.text-2xl').map(n => n.text())).toEqual(['2', '1', '0', '1', '2', '6']);

		// El nombre del responsable sale del label de la opción.
		expect(tile('Palanquero 1')).toContain('Ana García');
		expect(tile('Palanquero 2')).not.toContain('(');
	});

	it('se recalcula cuando la tabla de abajo edita la asignación', async () => {
		const retreatStore = useRetreatStore();
		retreatStore.selectedRetreatId = 'retreat-1';
		const participantStore = useParticipantStore();
		participantStore.participants = [walker('w1', null), walker('w2', 'Palanquero 2')];
		participantStore.loading = false;

		const wrapper = await mountSummary(pinia);
		await flushPromises();
		expect(wrapper.find('[title="Palanquero 2"]').text()).toContain('1');

		// La edición inline reemplaza la fila del store: el resumen sigue solo.
		participantStore.participants[0].palancasCoordinator = 'Palanquero 2';
		await nextTick();

		expect(wrapper.find('[title="Palanquero 2"]').text()).toContain('2');
		expect(wrapper.findAll('.text-2xl').map(n => n.text())).toEqual(['0', '2', '0', '0', '2']);
	});

	it('recarga las opciones al cambiar de retiro', async () => {
		const retreatStore = useRetreatStore();
		retreatStore.selectedRetreatId = 'retreat-1';
		const participantStore = useParticipantStore();
		participantStore.participants = [walker('w1', 'Palanquero 1')];
		participantStore.loading = false;

		const wrapper = await mountSummary(pinia);
		await flushPromises();
		expect(vi.mocked(getPalanqueroOptions)).toHaveBeenCalledWith('retreat-1');

		retreatStore.selectedRetreatId = 'retreat-2';
		await flushPromises();

		expect(vi.mocked(getPalanqueroOptions)).toHaveBeenCalledWith('retreat-2');
		// Mismo conteo sobre el nuevo retiro, sin tiles huérfanos del anterior.
		expect(wrapper.find('[title="Palanquero 1"]').text()).toContain('1');
	});

	it('no muestra la tarjeta mientras no hay walkers que contar', async () => {
		const retreatStore = useRetreatStore();
		retreatStore.selectedRetreatId = 'retreat-1';
		const participantStore = useParticipantStore();
		participantStore.participants = [];
		participantStore.loading = false;

		const wrapper = await mountSummary(pinia);
		await flushPromises();

		expect(wrapper.find('.card').exists()).toBe(false);
	});
});
