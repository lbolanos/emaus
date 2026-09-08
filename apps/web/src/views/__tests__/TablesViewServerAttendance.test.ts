/**
 * La asistencia a reuniones del equipo servidor en la vista de mesas.
 *
 * Lo que hay que fijar aquí:
 *   - Sin `retreat.communityId` no se llama al backend y no aparece badge: el
 *     dato es de la comunidad, y un retiro sin vincular no tiene métrica.
 *   - Con vínculo y la métrica encendida, cada servidor del padrón muestra su %.
 *   - Un servidor que NO está en el padrón se queda SIN badge, nunca con 0%:
 *     "no está en la lista" y "no viene nunca" son cosas distintas.
 *   - Ordenar por asistencia manda a los sin dato al final.
 *
 * `@repo/ui` y los íconos se mockean con un Proxy que responde a cualquier
 * export, igual que en TablesViewSearch.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises, VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

vi.mock('vue-router', () => ({
	useRoute: () => ({ params: {} }),
	useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@repo/ui', () => new Proxy(
	{},
	{
		get: (_t, name) => {
			const n = String(name);
			if (n === '__esModule') return false;
			if (n === 'useToast') return () => ({ toast: vi.fn() });
			if (n === 'toast') return vi.fn();
			if (n.startsWith('use')) return () => ({});
			return { name: n, template: '<div><slot /></div>' };
		},
		has: () => true,
	},
));

vi.mock('lucide-vue-next', () => new Proxy(
	{},
	{
		get: (_t, name) => (name === '__esModule' ? false : { name: String(name), template: '<svg />' }),
		has: () => true,
	},
));

const getServerAttendanceMock = vi.fn();
const getCommunitiesMock = vi.fn(async () => [{ id: 'comm-1', name: 'Buen despacho' }] as any[]);

vi.mock('@/services/api', () => ({
	getCancelledParticipants: vi.fn(async () => [] as any[]),
	exportTablesToDocx: vi.fn(),
	getRetreatServerAttendance: (...args: any[]) => getServerAttendanceMock(...args),
	getCommunities: (...args: any[]) => getCommunitiesMock(...args),
	api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const RETREAT_ID = 'retreat-1';
const COMMUNITY_ID = 'comm-1';

const server = (id: string, firstName: string) => ({
	id,
	firstName,
	lastName: 'Servidor',
	type: 'server',
	isCancelled: false,
	retreatId: RETREAT_ID,
});

const onRoster = server('s1', 'Rosa');
const alsoOnRoster = server('s2', 'Mario');
const offRoster = server('s3', 'Nuevo');

async function mountView(communityId: string | null): Promise<VueWrapper<any>> {
	setActivePinia(createPinia());

	const { useRetreatStore } = await import('@/stores/retreatStore');
	const { useParticipantStore } = await import('@/stores/participantStore');
	const { useTableMesaStore } = await import('@/stores/tableMesaStore');

	const retreatStore = useRetreatStore();
	(retreatStore as any).retreats = [{ id: RETREAT_ID, parish: 'Test', communityId }];
	retreatStore.selectedRetreatId = RETREAT_ID;

	const participantStore = useParticipantStore();
	participantStore.participants = [onRoster, alsoOnRoster, offRoster] as any;
	(participantStore as any).fetchParticipants = vi.fn();

	const tableMesaStore = useTableMesaStore();
	(tableMesaStore as any).fetchTables = vi.fn();
	tableMesaStore.tables = [] as any;

	const TablesView = (await import('@/views/TablesView.vue')).default;
	const wrapper = mount(TablesView, { global: { mocks: { $t: (k: string) => k } } });
	await flushPromises();
	await nextTick();
	return wrapper;
}

describe('TablesView — asistencia del equipo servidor', () => {
	beforeEach(() => {
		getServerAttendanceMock.mockReset();
		getServerAttendanceMock.mockResolvedValue({
			communityId: COMMUNITY_ID,
			retreatId: RETREAT_ID,
			meetingCount: 3,
			serverCount: 3,
			matchedCount: 2,
			unmatchedCount: 1,
			retreatLinkedMeetingCount: 7,
			entries: [
				{ participantId: 's1', memberId: 'm1', attended: 3, total: 3, ratePercent: 100, frequency: 'high' },
				{ participantId: 's2', memberId: 'm2', attended: 1, total: 3, ratePercent: 33.33, frequency: 'medium' },
			],
		});
	});

	it('sin comunidad vinculada no consulta la asistencia', async () => {
		const wrapper = await mountView(null);

		expect(wrapper.vm.attendanceIsLinked).toBe(false);
		expect(getServerAttendanceMock).not.toHaveBeenCalled();
		// El aviso ya no vive en la barra: la opción del menú "⋮" queda
		// deshabilitada y su `title` explica qué falta. Lo que se fija aquí es que
		// no se consulte nada y que la barra no ocupe espacio.
		expect(wrapper.text()).not.toContain('tables.attendance.scope');
	});

	it('con comunidad vinculada carga la asistencia al encenderla', async () => {
		const wrapper = await mountView(COMMUNITY_ID);
		expect(getServerAttendanceMock).not.toHaveBeenCalled();

		wrapper.vm.attendanceEnabled = true;
		await flushPromises();

		// Sin parámetros: el conjunto lo delimita el calendario del retiro.
		expect(getServerAttendanceMock).toHaveBeenCalledWith(COMMUNITY_ID, RETREAT_ID);
		expect(wrapper.vm.attendanceFor('s1')).toMatchObject({ ratePercent: 100, attended: 3 });
	});

	it('un servidor fuera del padrón se queda sin dato, no en 0%', async () => {
		const wrapper = await mountView(COMMUNITY_ID);
		wrapper.vm.attendanceEnabled = true;
		await flushPromises();

		expect(wrapper.vm.attendanceFor('s3')).toBeNull();
	});

	it('apagada la métrica, ningún servidor tiene badge', async () => {
		const wrapper = await mountView(COMMUNITY_ID);
		wrapper.vm.attendanceEnabled = true;
		await flushPromises();
		wrapper.vm.attendanceEnabled = false;
		await nextTick();

		expect(wrapper.vm.attendanceFor('s1')).toBeNull();
	});

	it('ordenar por asistencia deja a los sin dato al final', async () => {
		const wrapper = await mountView(COMMUNITY_ID);
		wrapper.vm.attendanceEnabled = true;
		await flushPromises();
		wrapper.vm.sortServersByAttendance = true;
		await nextTick();

		expect(wrapper.vm.unassignedServers.map((p: any) => p.id)).toEqual(['s1', 's2', 's3']);
	});

	it('sin preparaciones sincronizadas lo dice en vez de dejar las pastillas sin badge', async () => {
		getServerAttendanceMock.mockResolvedValue({
			communityId: COMMUNITY_ID,
			retreatId: RETREAT_ID,
			meetingCount: 0,
			serverCount: 3,
			matchedCount: 0,
			unmatchedCount: 3,
			retreatLinkedMeetingCount: 0,
			entries: [],
		});
		const wrapper = await mountView(COMMUNITY_ID);
		wrapper.vm.attendanceEnabled = true;
		await flushPromises();

		expect(wrapper.text()).toContain('tables.attendance.notSynced');
		expect(wrapper.vm.attendanceFor('s1')).toBeNull();
	});

});
