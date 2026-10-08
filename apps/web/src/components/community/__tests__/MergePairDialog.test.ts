/**
 * Diálogo de fusión de UN par (el que abre el hint "Posible duplicado" de la
 * vista de attendance stats).
 *
 * Lo que hay que fijar: que no se pueda fusionar sin haber visto antes qué se
 * mueve, que un bloqueo lo impida, y que cambiar de superviviente invalide el
 * preview anterior — si no, se fusionaría en la dirección equivocada con la
 * confirmación de la otra. Además: al llegar un par nuevo, el estado del
 * anterior (preview, elección) no puede filtrarse.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';

const mockPreview = vi.fn();
const mockMerge = vi.fn();
vi.mock('@/services/api', () => ({
	previewParticipantMerge: (...a: any[]) => mockPreview(...a),
	mergeParticipantDuplicates: (...a: any[]) => mockMerge(...a),
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
				return {
					name: 'Button',
					template: `<button :disabled="disabled" @click="$emit('click', $event)"><slot /></button>`,
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

import MergePairDialog from '../MergePairDialog.vue';

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

const mergeButton = (wrapper: ReturnType<typeof mount>) =>
	wrapper.findAll('button').find((b) => b.text() === 'community.duplicates.merge');

const factory = (props: Record<string, unknown> = {}) =>
	mount(MergePairDialog, {
		props: { open: true, communityId: 'comm-1', pair: pair(), ...props },
		global: { mocks: { $t: (k: string) => k } },
	});

describe('MergePairDialog', () => {
	beforeEach(() => {
		mockPreview.mockReset(); mockMerge.mockReset();
		mockPreview.mockResolvedValue(cleanPreview);
		mockMerge.mockResolvedValue({ ...cleanPreview, merged: true });
	});

	it('sugiere conservar la ficha con más datos y no permite fusionar sin preview', async () => {
		const wrapper = factory();
		await flushPromises();

		expect(wrapper.vm.keepId).toBe('p-keep');
		expect(wrapper.vm.canMerge).toBe(false);
		expect(mergeButton(wrapper)!.attributes('disabled')).toBeDefined();
	});

	it('un bloqueo impide fusionar', async () => {
		mockPreview.mockResolvedValue({
			...cleanPreview,
			blockers: [{ table: 'retreat_participants', column: 'participantId', reason: 'mismo retiro' }],
		});
		const wrapper = factory();
		await flushPromises();

		await wrapper.vm.loadPreview();
		await flushPromises();

		expect(wrapper.vm.canMerge).toBe(false);
		expect(mergeButton(wrapper)!.attributes('disabled')).toBeDefined();
	});

	it('cambiar de superviviente invalida el preview', async () => {
		// Sin esto se fusionaría en la dirección contraria con la confirmación de
		// la otra: se perderían los datos de la ficha equivocada.
		const wrapper = factory();
		await flushPromises();
		await wrapper.vm.loadPreview();
		await flushPromises();
		expect(wrapper.vm.canMerge).toBe(true);

		// Click en la segunda ficha ("en el padrón" sólo lo pinta ella), como
		// haría el usuario.
		const otherCard = wrapper.findAll('button').find((b) =>
			b.text().includes('community.duplicates.inRoster'));
		expect(otherCard).toBeTruthy();
		await otherCard!.trigger('click');
		await nextTick();

		expect(wrapper.vm.keepId).toBe('p-merge');
		expect(wrapper.vm.preview).toBeNull();
		expect(wrapper.vm.canMerge).toBe(false);
	});

	it('fusiona en la dirección elegida, emite merged y cierra', async () => {
		const wrapper = factory();
		await flushPromises();
		await wrapper.vm.loadPreview();
		await flushPromises();

		await wrapper.vm.doMerge();
		await flushPromises();

		expect(mockMerge).toHaveBeenCalledWith('comm-1', 'p-keep', 'p-merge');
		expect(wrapper.emitted('merged')).toHaveLength(1);
		expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false]);
	});

	it('al llegar un par nuevo se resetean elección y preview', async () => {
		const wrapper = factory();
		await flushPromises();
		await wrapper.vm.loadPreview();
		await flushPromises();
		expect(wrapper.vm.preview).not.toBeNull();

		await wrapper.setProps({ pair: { ...pair(), matchedBy: 'email' } });
		await nextTick();

		expect(wrapper.vm.keepId).toBe('p-keep');
		expect(wrapper.vm.preview).toBeNull();
		expect(wrapper.vm.canMerge).toBe(false);
	});
});
