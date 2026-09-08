/**
 * Sincronización del calendario de preparaciones con las reuniones de la
 * comunidad, y la asistencia que eso trae de vuelta.
 *
 * Lo que se fija aquí: que una sesión SIN sincronizar no muestre porcentaje, y
 * que una sincronizada pero AÚN NO CELEBRADA muestre "sin celebrar" en vez de
 * 0% — que se leería como "no fue nadie".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';

const mockList = vi.fn();
const mockSync = vi.fn();
const mockCreateOne = vi.fn();
vi.mock('@/services/api', () => ({
	retreatPreparationApi: {
		list: (...a: any[]) => mockList(...a),
		update: vi.fn(),
		generate: vi.fn(),
		resyncDefaultDocs: vi.fn(),
	},
	syncPreparationsToCommunity: (...a: any[]) => mockSync(...a),
	createPreparationCommunityMeeting: (...a: any[]) => mockCreateOne(...a),
	apiErrorMessage: (e: any) => String(e?.message ?? e),
}));

const retreatFixture = {
	id: 'retreat-1',
	parish: 'Buen Despacho',
	slug: 'delvalleii',
	isPublic: true,
	startDate: '2026-10-16',
	communityId: 'comm-1',
};

vi.mock('@/stores/retreatStore', () => ({
	useRetreatStore: () => ({
		selectedRetreatId: 'retreat-1',
		selectedRetreat: retreatFixture,
		retreats: [retreatFixture],
	}),
}));

vi.mock('vue-router', () => ({
	useRoute: () => ({ params: { id: 'retreat-1' }, query: {} }),
	useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/components/PreparationsHelpDialog.vue', () => ({
	default: { name: 'PreparationsHelpDialog', template: '<div />' },
}));
vi.mock('@/composables/usePrintableDocument', () => ({ printMarkdownDocument: vi.fn() }));
vi.mock('@/composables/usePreparationPdf', () => ({ downloadPreparationPdf: vi.fn() }));
vi.mock('@/composables/useMarkdown', () => ({ renderMarkdown: (m: string) => m }));

vi.mock('@repo/ui', () => new Proxy(
	{},
	{
		get: (_t, name) => {
			const n = String(name);
			if (n === '__esModule') return false;
			if (n === 'useToast') return () => ({ toast: vi.fn() });
			if (n.startsWith('use')) return () => ({});
			if (n === 'Input') {
				return { name: 'Input', template: '<input :value="modelValue" />', props: ['modelValue'] };
			}
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

import RetreatPreparationsView from '../RetreatPreparationsView.vue';

const prep = (overrides: Record<string, any> = {}) => ({
	id: crypto.randomUUID(),
	retreatId: 'retreat-1',
	type: 'session',
	weekNumber: 1,
	title: '1ª preparación',
	date: '2026-08-19',
	time: '20:00',
	sortOrder: 10,
	documents: [],
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: '2026-08-01T00:00:00.000Z',
	...overrides,
});

const factory = () =>
	mount(RetreatPreparationsView, {
		global: { mocks: { $t: (k: string) => k, t: (k: string) => k } },
	});

describe('RetreatPreparationsView — sincronización con la comunidad', () => {
	beforeEach(() => {
		mockList.mockReset();
		mockSync.mockReset();
		mockList.mockResolvedValue([prep()]);
		mockSync.mockResolvedValue({ created: 2, adopted: 1, mismatched: [], skipped: 1 });
		mockCreateOne.mockReset();
		mockCreateOne.mockResolvedValue({ preparationId: 'p1', meetingId: 'm1', outcome: 'created' });
	});

	it('una sesión sin sincronizar no muestra porcentaje', async () => {
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.text()).not.toContain('%');
		expect(wrapper.text()).not.toContain('preparations.attendancePending');
	});

	it('una sesión sincronizada y celebrada muestra su porcentaje', async () => {
		mockList.mockResolvedValue([
			prep({
				communityMeetingId: 'meeting-1',
				attendance: {
					meetingId: 'meeting-1',
					attended: 13,
					eligible: 20,
					ratePercent: 65,
					pending: false,
				},
			}),
		]);
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.text()).toContain('65%');
		expect(wrapper.text()).toContain('13/20');
	});

	it('una sesión aún no celebrada dice "sin celebrar", no 0%', async () => {
		mockList.mockResolvedValue([
			prep({
				date: '2026-12-01',
				communityMeetingId: 'meeting-2',
				attendance: {
					meetingId: 'meeting-2',
					attended: 0,
					eligible: 21,
					ratePercent: 0,
					pending: true,
				},
			}),
		]);
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.text()).toContain('preparations.attendancePending');
		expect(wrapper.text()).not.toContain('0%');
	});

	it('una sesión sin reunión ofrece el botón de crearla', async () => {
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.text()).toContain('preparations.createMeeting');
	});

	it('el botón crea la reunión de ESA sesión y refresca', async () => {
		const wrapper = factory();
		await flushPromises();
		mockList.mockClear();

		await wrapper.vm.createMeetingFor({ id: 'p1' });
		await flushPromises();

		expect(mockCreateOne).toHaveBeenCalledWith('p1');
		expect(mockList).toHaveBeenCalled();
	});

	it('una sesión ya sincronizada no ofrece el botón', async () => {
		mockList.mockResolvedValue([
			prep({
				communityMeetingId: 'meeting-1',
				attendance: {
					meetingId: 'meeting-1',
					attended: 13,
					eligible: 20,
					ratePercent: 65,
					pending: false,
				},
			}),
		]);
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.text()).not.toContain('preparations.createMeeting');
	});

	it('sin comunidad vinculada avisa en vez de ofrecer el botón', async () => {
		// El arreglo está en el retiro (Editar → General), no en esta pantalla.
		retreatFixture.communityId = undefined as never;
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.text()).toContain('preparations.noCommunity');
		expect(wrapper.text()).not.toContain('preparations.createMeeting');
		retreatFixture.communityId = 'comm-1';
	});

	it('sincronizar llama al endpoint y refresca el calendario', async () => {
		const wrapper = factory();
		await flushPromises();
		mockList.mockClear();

		await wrapper.vm.syncWithCommunity();
		await flushPromises();

		expect(mockSync).toHaveBeenCalledWith('retreat-1');
		expect(mockList).toHaveBeenCalled();
	});
});
