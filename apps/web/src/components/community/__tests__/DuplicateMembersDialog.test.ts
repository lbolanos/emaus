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
vi.mock('@/services/api', () => ({
	getCommunityDuplicates: (...a: any[]) => mockGet(...a),
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

describe('DuplicateMembersDialog', () => {
	beforeEach(() => {
		mockGet.mockReset(); mockPreview.mockReset(); mockMerge.mockReset();
		mockGet.mockResolvedValue([pair()]);
		mockPreview.mockResolvedValue(cleanPreview);
		mockMerge.mockResolvedValue({ ...cleanPreview, merged: true });
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

		expect(mockMerge).toHaveBeenCalledWith('comm-1', 'p-keep', 'p-merge');
		expect(mockGet).toHaveBeenCalled();
	});

	it('sin duplicados lo dice', async () => {
		mockGet.mockResolvedValue([]);
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.text()).toContain('community.duplicates.none');
	});
});
