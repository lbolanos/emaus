/**
 * "Enviar info a líderes" de Mesas (specs/ux-mam-responsabilidades, D7): una
 * opción del ⋮ que abre un diálogo con cada líder y colíder, su mesa, la marca
 * de envío del historial (TABLE_LEADER_BRIEFING) y "Enviar". Enviar cierra la
 * lista, abre el MessageDialog, y al cerrarlo la lista vuelve (dos Dialog de
 * reka-ui a la vez congelan la página). La lista en sí la cubre
 * BriefingSendList.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, VueWrapper, enableAutoUnmount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

const openSpy = vi.fn();
const latestSendsSpy = vi.fn();
vi.mock('@/composables/useParticipantMessageDialog', async () => {
	const { ref } = await import('vue');
	const isOpen = ref(false);
	return {
		useParticipantMessageDialog: () => ({ open: openSpy, isOpen, participant: ref(null), tableData: ref(null), templateType: ref(null) }),
		__dialogOpen: isOpen,
	};
});

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

vi.mock('@/services/api', () => ({
	getCancelledParticipants: vi.fn(async () => []),
	exportTablesToDocx: vi.fn(),
	getLatestSendsByTemplateType: (...args: unknown[]) => latestSendsSpy(...args),
	api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/components/MessageDialog.vue', () => ({
	default: { name: 'MessageDialog', template: '<div />' },
}));

const RETREAT_ID = 'retreat-1';

const person = (id: string, firstName: string, lastName: string, extra: Record<string, unknown> = {}) => ({
	id,
	firstName,
	lastName,
	type: 'server',
	isCancelled: false,
	retreatId: RETREAT_ID,
	...extra,
});
const juan = person('l1', 'Juan', 'Pérez');
const rosa = person('c1', 'Rosa', 'Mena');
const pedro = person('l2', 'Pedro', 'Ruiz');
const walker = person('w1', 'Ana', 'Caminante', { type: 'walker' });

async function mountView(): Promise<VueWrapper<any>> {
	setActivePinia(createPinia());
	const { useRetreatStore } = await import('@/stores/retreatStore');
	const { useParticipantStore } = await import('@/stores/participantStore');
	const { useTableMesaStore } = await import('@/stores/tableMesaStore');

	const retreatStore = useRetreatStore();
	(retreatStore as any).retreats = [{ id: RETREAT_ID, parish: 'Test' }];
	retreatStore.selectedRetreatId = RETREAT_ID;

	const participantStore = useParticipantStore();
	// El store trae la ficha completa (teléfono) que el payload de mesas no.
	participantStore.participants = [{ ...juan, cellPhone: '555' }, rosa, pedro, walker] as any;
	(participantStore as any).fetchParticipants = vi.fn();

	const tableMesaStore = useTableMesaStore();
	(tableMesaStore as any).fetchTables = vi.fn();
	tableMesaStore.tables = [
		{ id: 't1', name: 'Mesa 1', retreatId: RETREAT_ID, lider: juan, colider1: rosa, colider2: null, walkers: [walker] },
		{ id: 't2', name: 'Mesa 2', retreatId: RETREAT_ID, lider: pedro, colider1: null, colider2: null, walkers: [] },
	] as any;

	const TablesView = (await import('@/views/TablesView.vue')).default;
	const wrapper = mount(TablesView, { global: { mocks: { $t: (k: string) => k } } });
	await flushPromises();
	await nextTick();
	return wrapper;
}

// deferOpen espera 80 ms antes de abrir (bug reka-ui pointer-events).
const waitDeferOpen = async () => {
	await new Promise((r) => setTimeout(r, 120));
	await flushPromises();
};

const setMessageDialog = async (open: boolean) => {
	const dialogMod: any = await import('@/composables/useParticipantMessageDialog');
	dialogMod.__dialogOpen.value = open;
	await flushPromises();
};

// Cada vista montada escucha el MessageDialog compartido: sin desmontar, las de
// pruebas anteriores también reaccionarían a sus cambios.
enableAutoUnmount(afterEach);

describe('TablesView - Enviar info a líderes', () => {
	beforeEach(async () => {
		openSpy.mockReset();
		latestSendsSpy.mockReset();
		latestSendsSpy.mockResolvedValue({});
		await setMessageDialog(false);
	});

	it('la opción del ⋮ abre el diálogo (diferida)', async () => {
		const w = await mountView();
		expect(w.vm.leadersDialogOpen).toBe(false);
		await w.find('[data-testid="leaders-briefing-item"]').trigger('select');
		await waitDeferOpen();
		expect(w.vm.leadersDialogOpen).toBe(true);
	});

	it('arma una fila por líder o colíder con su mesa, su rol y sus caminantes', async () => {
		const w = await mountView();
		expect(w.vm.leaderRows.map((r: any) => [r.key, r.participant.id, r.lines])).toEqual([
			['t1-lider', 'l1', ['Mesa 1 · tables.roles.lider', 'tables.byLeader.walkersCount']],
			['t1-colider1', 'c1', ['Mesa 1 · tables.roles.colider1', 'tables.byLeader.walkersCount']],
			['t2-lider', 'l2', ['Mesa 2 · tables.roles.lider', 'tables.byLeader.walkersCount']],
		]);
	});

	it('la búsqueda del diálogo filtra por líder o por mesa', async () => {
		const w = await mountView();
		w.vm.leaderSearch = 'rosa';
		await nextTick();
		expect(w.vm.leaderRows.map((r: any) => r.key)).toEqual(['t1-colider1']);
		w.vm.leaderSearch = 'mesa 2';
		await nextTick();
		expect(w.vm.leaderRows.map((r: any) => r.key)).toEqual(['t2-lider']);
	});

	it('"Enviar" cierra la lista, abre el briefing de su mesa y vuelve a la lista al cerrar el mensaje', async () => {
		const w = await mountView();
		w.vm.openLeadersDialog();
		w.vm.leaderSearch = 'mesa 1';
		await flushPromises();
		const list = w.findComponent({ name: 'BriefingSendList' });
		list.vm.$emit('send', list.props('rows')[0]);
		await nextTick();
		expect(w.vm.leadersDialogOpen).toBe(false);

		await waitDeferOpen();
		expect(openSpy).toHaveBeenCalledTimes(1);
		const [participant, opts] = openSpy.mock.calls[0];
		expect(participant).toMatchObject({ id: 'l1', cellPhone: '555' });
		expect(opts.templateType).toBe('TABLE_LEADER_BRIEFING');
		expect(opts.tableData.name).toBe('Mesa 1');

		await setMessageDialog(true);
		await setMessageDialog(false);
		await waitDeferOpen();
		expect(w.vm.leadersDialogOpen).toBe(true);
		// El ida y vuelta conserva la búsqueda.
		expect(w.vm.leaderSearch).toBe('mesa 1');
	});

	it('un mensaje que no salió de la lista no la abre al cerrarse', async () => {
		const w = await mountView();
		await setMessageDialog(true);
		await setMessageDialog(false);
		await waitDeferOpen();
		expect(w.vm.leadersDialogOpen).toBe(false);
	});

	it('cerrar la lista a mano limpia búsqueda y filtro', async () => {
		const w = await mountView();
		w.vm.openLeadersDialog();
		w.vm.leaderSearch = 'rosa';
		w.vm.leaderFilter = 'pending';
		w.vm.onLeadersDialogUpdate(false);
		expect(w.vm.leadersDialogOpen).toBe(false);
		expect(w.vm.leaderSearch).toBe('');
		expect(w.vm.leaderFilter).toBe('all');
	});

	it('carga las marcas del briefing de mesa y las recarga al cerrar el MessageDialog', async () => {
		const sent = { l1: { sentAt: '2026-10-15T20:15:00.000Z', messageType: 'whatsapp' } };
		latestSendsSpy.mockResolvedValue(sent);
		const w = await mountView();
		expect(latestSendsSpy).toHaveBeenCalledWith(RETREAT_ID, 'TABLE_LEADER_BRIEFING');
		expect(w.findComponent({ name: 'BriefingSendList' }).props('sent')).toEqual(sent);

		latestSendsSpy.mockClear();
		await setMessageDialog(true);
		await setMessageDialog(false);
		expect(latestSendsSpy).toHaveBeenCalledTimes(1);
	});

	it('si falla la carga de marcas la lista lo avisa y sigue', async () => {
		latestSendsSpy.mockRejectedValue(new Error('500'));
		const w = await mountView();
		const list = w.findComponent({ name: 'BriefingSendList' });
		expect(list.props('sentFailed')).toBe(true);
		expect(list.props('rows')).toHaveLength(3);
	});
});
