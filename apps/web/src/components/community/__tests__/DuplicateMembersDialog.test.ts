/**
 * Diálogo de fusión de duplicados.
 *
 * Lo que hay que fijar: que no se pueda fusionar sin haber visto antes qué se
 * mueve, que un bloqueo lo impida, y que cambiar de superviviente invalide el
 * preview anterior — si no, se fusionaría en la dirección equivocada con la
 * confirmación de la otra.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';

const mockGet = vi.fn();
const mockPreview = vi.fn();
const mockMerge = vi.fn();
const mockDismiss = vi.fn();
const mockListDismissals = vi.fn();
const mockUndo = vi.fn();
vi.mock('@/services/api', () => ({
	getCommunityDuplicates: (...a: any[]) => mockGet(...a),
	previewParticipantMerge: (...a: any[]) => mockPreview(...a),
	mergeParticipantDuplicates: (...a: any[]) => mockMerge(...a),
	dismissCommunityDuplicatePair: (...a: any[]) => mockDismiss(...a),
	getCommunityDuplicateDismissals: (...a: any[]) => mockListDismissals(...a),
	undoCommunityDuplicateDismissal: (...a: any[]) => mockUndo(...a),
	apiErrorMessage: (e: any) => String(e?.message ?? e),
}));

vi.mock('@repo/ui', () => new Proxy(
	{},
	{
		get: (_t, name) => {
			const n = String(name);
			if (n === '__esModule') return false;
			if (n === 'useToast') return () => ({ toast: vi.fn() });
			if (n.startsWith('use')) return () => ({});
			if (n === 'Dialog') {
				return { name: 'Dialog', template: '<div v-if="open"><slot /></div>', props: ['open'] };
			}
			if (n === 'Button') {
				// Sin re-emitir el click: el Button real (Primitive de radix) sólo
				// expone el onclick del padre por fallthrough. Un mock que además
				// haga $emit('click') dispara el handler DOS veces por click, y una
				// confirmación en dos pasos se ejecuta en uno.
				return {
					name: 'Button',
					template: `<button :disabled="disabled"><slot /></button>`,
					props: ['variant', 'size', 'disabled'],
				};
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

import DuplicateMembersDialog from '../DuplicateMembersDialog.vue';

const pair = () => ({
	matchedBy: 'phone',
	participants: [
		{ id: 'p-keep', firstName: 'Pedro', lastName: 'Arroyo', email: null, cellPhone: '5511', references: 8, hasUser: false, isCommunityMember: false },
		{ id: 'p-merge', firstName: 'Pedro', lastName: 'Arroyo', email: null, cellPhone: '5511', references: 2, hasUser: false, isCommunityMember: true },
	],
});

const cleanPreview = {
	keepId: 'p-keep', mergeId: 'p-merge', keepLabel: 'Pedro Arroyo', mergeLabel: 'Pedro Arroyo',
	moves: [{ table: 'community_member', column: 'participantId', rows: 1, discarded: 0 }],
	blockers: [], attendanceMoved: 0, attendanceMerged: 0,
};

const factory = () =>
	mount(DuplicateMembersDialog, {
		props: { open: true, communityId: 'comm-1' },
		global: { mocks: { $t: (k: string) => k } },
	});

const dismissal = () => ({
	id: 'd-1',
	participantA: { id: 'p-keep', firstName: 'Pedro', lastName: 'Arroyo' },
	participantB: { id: 'p-merge', firstName: 'Pedro', lastName: 'Arroyo' },
	createdAt: new Date('2026-10-09T00:00:00Z'),
});

const dismissButton = (wrapper: ReturnType<typeof mount>) =>
	wrapper.findAll('button').find((b) => b.text() === 'community.duplicates.notSame');

describe('DuplicateMembersDialog', () => {
	beforeEach(() => {
		mockGet.mockReset(); mockPreview.mockReset(); mockMerge.mockReset();
		mockDismiss.mockReset(); mockListDismissals.mockReset(); mockUndo.mockReset();
		mockGet.mockResolvedValue([pair()]);
		mockPreview.mockResolvedValue(cleanPreview);
		mockMerge.mockResolvedValue({ ...cleanPreview, merged: true });
		mockDismiss.mockResolvedValue({});
		mockListDismissals.mockResolvedValue([]);
		mockUndo.mockResolvedValue(undefined);
	});

	it('sugiere conservar la ficha con más datos', async () => {
		const wrapper = factory();
		await flushPromises();

		expect(wrapper.vm.keepBy[0]).toBe('p-keep');
	});

	it('no permite fusionar sin haber visto el preview', async () => {
		const wrapper = factory();
		await flushPromises();

		expect(wrapper.vm.canMerge(0)).toBe(false);

		await wrapper.vm.loadPreview(0);
		await flushPromises();
		expect(wrapper.vm.canMerge(0)).toBe(true);
	});

	it('un bloqueo impide fusionar', async () => {
		mockPreview.mockResolvedValue({
			...cleanPreview,
			blockers: [{ table: 'retreat_participants', column: 'participantId', reason: 'mismo retiro' }],
		});
		const wrapper = factory();
		await flushPromises();

		await wrapper.vm.loadPreview(0);
		await flushPromises();

		expect(wrapper.vm.canMerge(0)).toBe(false);
	});

	it('cambiar de superviviente invalida el preview', async () => {
		// Sin esto se fusionaría en la dirección contraria con la confirmación de
		// la otra: se perderían los datos de la ficha equivocada.
		const wrapper = factory();
		await flushPromises();
		await wrapper.vm.loadPreview(0);
		await flushPromises();
		expect(wrapper.vm.canMerge(0)).toBe(true);

		wrapper.vm.keepBy[0] = 'p-merge';
		await nextTick();

		expect(wrapper.vm.previews[0]).toBeNull();
		expect(wrapper.vm.canMerge(0)).toBe(false);
	});

	it('fusiona en la dirección elegida y recarga', async () => {
		const wrapper = factory();
		await flushPromises();
		await wrapper.vm.loadPreview(0);
		await flushPromises();
		mockGet.mockClear();

		await wrapper.vm.doMerge(0);
		await flushPromises();

		// El cuarto argumento es la huella del par: alimenta el audit log del merge.
		expect(mockMerge).toHaveBeenCalledWith('comm-1', 'p-keep', 'p-merge', 'phone');
		expect(mockGet).toHaveBeenCalled();
	});

	it('sin duplicados lo dice', async () => {
		mockGet.mockResolvedValue([]);
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.text()).toContain('community.duplicates.none');
	});

	it('descarta el par en dos pasos, recarga la lista y emite dismissed', async () => {
		const wrapper = factory();
		await flushPromises();
		mockGet.mockClear(); mockListDismissals.mockClear();

		await dismissButton(wrapper)!.trigger('click');
		await nextTick();
		// Paso 1: sólo arma la confirmación.
		expect(mockDismiss).not.toHaveBeenCalled();

		// Paso 2: el botón ahora pide confirmación — ese es el que ejecuta.
		const confirmButton = wrapper.findAll('button').find(
			(b) => b.text() === 'community.duplicates.notSameConfirm',
		)!;
		await confirmButton.trigger('click');
		await flushPromises();

		expect(mockDismiss).toHaveBeenCalledWith('comm-1', 'p-keep', 'p-merge');
		expect(wrapper.emitted('dismissed')).toHaveLength(1);
		// El par sale del listado y la sección de descartados se refresca.
		expect(mockGet).toHaveBeenCalled();
		expect(mockListDismissals).toHaveBeenCalled();
	});

	it('un grupo de 3+ no ofrece el descarte', async () => {
		mockGet.mockResolvedValue([{
			...pair(),
			participants: [
				...pair().participants,
				{ id: 'p-third', firstName: 'Pedro', lastName: 'Arroyo', email: null, cellPhone: '5511', references: 1, hasUser: false, isCommunityMember: false },
			],
		}]);
		const wrapper = factory();
		await flushPromises();

		expect(dismissButton(wrapper)).toBeUndefined();
	});

	it('la sección de descartados lista los pares y el undo revive y emite', async () => {
		mockListDismissals.mockResolvedValue([dismissal()]);
		const wrapper = factory();
		await flushPromises();

		// Colapsada por defecto: el conteo se ve, el detalle no.
		expect(wrapper.text()).toContain('community.duplicates.dismissedSection');

		wrapper.vm.dismissedOpen = true;
		await nextTick();
		expect(wrapper.text()).toContain('community.duplicates.undo');

		mockGet.mockClear(); mockListDismissals.mockClear();
		await wrapper.findAll('button').find((b) => b.text() === 'community.duplicates.undo')!.trigger('click');
		await flushPromises();

		expect(mockUndo).toHaveBeenCalledWith('comm-1', 'd-1');
		expect(wrapper.emitted('dismissed')).toHaveLength(1);
		expect(mockGet).toHaveBeenCalled();
		expect(mockListDismissals).toHaveBeenCalled();
	});

	it('si falla el listado de descartados, la sección lo dice en vez de mentir vacía', async () => {
		mockListDismissals.mockRejectedValue(new Error('boom'));
		const wrapper = factory();
		await flushPromises();

		wrapper.vm.dismissedOpen = true;
		await nextTick();

		expect(wrapper.text()).toContain('boom');
		expect(wrapper.text()).not.toContain('community.duplicates.dismissedEmpty');
	});

	it('si falla el listado de candidatos, la sección de descartados (y su undo) sigue accesible', async () => {
		mockGet.mockRejectedValue(new Error('candidatos caídos'));
		mockListDismissals.mockResolvedValue([dismissal()]);
		const wrapper = factory();
		await flushPromises();

		// El error de candidatos se ve arriba; la sección de descartados depende
		// de otro endpoint y no debe caer con él — el undo es la red de seguridad
		// del misclick.
		expect(wrapper.text()).toContain('candidatos caídos');

		wrapper.vm.dismissedOpen = true;
		await nextTick();
		expect(wrapper.text()).toContain('community.duplicates.undo');
	});
});
