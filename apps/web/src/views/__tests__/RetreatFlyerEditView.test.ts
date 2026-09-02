import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

const updateRetreat = vi.fn();
const fetchRetreat = vi.fn();
const retreat = {
	id: 'retreat-1',
	parish: 'San Judas Tadeo',
	retreat_type: 'men',
	startDate: '2026-04-17',
	endDate: '2026-04-19',
	walkerArrivalTime: '17:00',
	cost: '2700',
	contactPhones: 'HORACIO: 55 60219193',
	thingsToBringNotes: 'Termo\nToalla',
	house: { name: 'Casa de los Teatinos', googleMapsUrl: 'https://maps.google.com/?cid=1' },
	flyer_options: undefined as Record<string, any> | undefined,
};

vi.mock('@/stores/retreatStore', () => ({
	useRetreatStore: () => ({
		selectedRetreat: retreat,
		walkerRegistrationLink: 'https://emaus.cc/sanjudas',
		fetchRetreat,
		updateRetreat,
	}),
}));

// onBeforeRouteLeave is captured so the tests can fire the guard by hand
let leaveGuard: (() => boolean) | null = null;
vi.mock('vue-router', () => ({
	useRoute: () => ({ params: { id: 'retreat-1' } }),
	useRouter: () => ({ push: vi.fn() }),
	onBeforeRouteLeave: (guard: () => boolean) => {
		leaveGuard = guard;
	},
	RouterLink: { name: 'RouterLink', template: '<a><slot /></a>', props: ['to'] },
}));

vi.mock('qrcode.vue', () => ({
	default: { name: 'QrcodeVue', template: '<canvas />', props: ['value', 'size'] },
}));

import RetreatFlyerEditView from '../RetreatFlyerEditView.vue';
import { useFlyerEditorStore } from '@/stores/flyerEditorStore';

async function mountEditor(flyerOptions?: Record<string, any>) {
	retreat.flyer_options = flyerOptions;
	setActivePinia(createPinia());
	updateRetreat.mockReset().mockResolvedValue(undefined);
	fetchRetreat.mockReset().mockResolvedValue(undefined);

	const wrapper = mount(RetreatFlyerEditView, {
		global: { stubs: { 'router-link': { template: '<a><slot /></a>', props: ['to'] } } },
	});
	// onMounted awaits the retreat fetch before it seeds the editor store
	await flushPromises();
	await nextTick();
	return wrapper;
}

/** Block ids as laid out in the live preview, in DOM order. */
const previewBlocks = (wrapper: any) =>
	wrapper.findAll('#printable-area [data-flyer-block]').map((el: any) =>
		el.attributes('data-flyer-block'),
	);

/** Block ids inside one slot of the preview, in DOM order. */
const slotBlocks = (wrapper: any, slot: string) =>
	wrapper
		.findAll(`[data-flyer-slot="${slot}"] [data-flyer-block]`)
		.map((el: any) => el.attributes('data-flyer-block'));

/** The design panel's list, which is the only place a hidden block still shows up. */
const panelBlocks = (wrapper: any) =>
	wrapper.findAll('li[data-block]').map((el: any) => el.attributes('data-block'));

/** Drags a block of the preview onto another one, the way a pointer would. */
async function dragOnFlyer(wrapper: any, fromId: string, toSelector: string) {
	await wrapper.find(`[data-flyer-block="${fromId}"]`).trigger('dragstart');
	await wrapper.find(toSelector).trigger('drop');
	await nextTick();
}

describe('RetreatFlyerEditView', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('lays every block out in its slot on the flyer', async () => {
		const wrapper = await mountEditor();

		expect(slotBlocks(wrapper, 'left')).toEqual(['intro', 'startTime', 'location', 'endTime']);
		expect(slotBlocks(wrapper, 'right')).toEqual(['registrationQr', 'contact', 'payment']);
		expect(slotBlocks(wrapper, 'wide')).toEqual(['whatToBring']);
		expect(previewBlocks(wrapper)).toHaveLength(8);
	});

	it('removes a block from the flyer when it is hidden', async () => {
		const wrapper = await mountEditor();

		await wrapper.find('[data-toggle-visibility="payment"]').trigger('click');
		await nextTick();

		expect(previewBlocks(wrapper)).not.toContain('payment');
		// Still in the panel list, which is the only way to bring it back
		expect(panelBlocks(wrapper)).toContain('payment');
	});

	it('moves a block across slots when dropped on the flyer itself', async () => {
		const wrapper = await mountEditor();

		await dragOnFlyer(wrapper, 'whatToBring', '[data-flyer-block="intro"]');

		expect(slotBlocks(wrapper, 'left')[0]).toBe('whatToBring');
		expect(slotBlocks(wrapper, 'wide')).toEqual([]);
	});

	it('appends when the drop lands on the column instead of a block', async () => {
		const wrapper = await mountEditor();

		await dragOnFlyer(wrapper, 'intro', '[data-flyer-slot="wide"]');

		expect(slotBlocks(wrapper, 'wide')).toEqual(['whatToBring', 'intro']);
		expect(slotBlocks(wrapper, 'left')).toEqual(['startTime', 'location', 'endTime']);
	});

	it('selects a block when it is clicked on the flyer', async () => {
		const wrapper = await mountEditor();
		const store = useFlyerEditorStore();

		await wrapper.find('[data-flyer-block="payment"]').trigger('click');
		await nextTick();

		expect(store.selectedBlockId).toBe('payment');
	});

	it('keeps Save disabled until something changes', async () => {
		const wrapper = await mountEditor();
		const store = useFlyerEditorStore();

		expect(store.isDirty).toBe(false);

		await wrapper.find('[data-toggle-visibility="payment"]').trigger('click');
		expect(store.isDirty).toBe(true);
	});

	it('marks the flyer dirty when the theme changes', async () => {
		const wrapper = await mountEditor();
		const store = useFlyerEditorStore();

		const poster = wrapper
			.findAll('button')
			.find((b: any) => b.text().includes('retreatFlyerEditor.design.preset.poster'));
		await poster!.trigger('click');
		await nextTick();

		expect(store.isDirty).toBe(true);
		expect(store.theme.textColor).toBe('#ffffff');
	});

	it('discards changes back to what the retreat has stored', async () => {
		const wrapper = await mountEditor();
		const store = useFlyerEditorStore();

		await wrapper.find('[data-toggle-visibility="payment"]').trigger('click');
		expect(store.isDirty).toBe(true);

		const discard = wrapper
			.findAll('button')
			.find((b: any) => b.text().includes('retreatFlyerEditor.discard'));
		await discard!.trigger('click');
		await nextTick();

		expect(store.isDirty).toBe(false);
		expect(previewBlocks(wrapper)).toContain('payment');
	});

	it('starts from the stored layout for a retreat that already has one', async () => {
		const wrapper = await mountEditor({
			layoutVersion: 2,
			blocks: [
				{ id: 'whatToBring', slot: 'left', order: 0, visible: true },
				{ id: 'intro', slot: 'wide', order: 0, visible: true },
			],
		});

		expect(slotBlocks(wrapper, 'left')[0]).toBe('whatToBring');
		expect(slotBlocks(wrapper, 'wide')[0]).toBe('intro');
	});

	// Dragging on the flyer is mouse-only, so the panel keeps a reachable way to reorder
	describe('reordering without a mouse', () => {
		it('moves a block down within its column', async () => {
			const wrapper = await mountEditor();

			await wrapper.find('[data-move-down="intro"]').trigger('click');
			await nextTick();

			expect(slotBlocks(wrapper, 'left')).toEqual([
				'startTime',
				'intro',
				'location',
				'endTime',
			]);
		});

		it('crosses into the next column at the edge', async () => {
			const wrapper = await mountEditor();

			// endTime is last in the left column; down takes it to the right one
			await wrapper.find('[data-move-down="endTime"]').trigger('click');
			await nextTick();

			expect(slotBlocks(wrapper, 'left')).toEqual(['intro', 'startTime', 'location']);
			expect(slotBlocks(wrapper, 'right')[0]).toBe('endTime');
		});

		it('cannot move the first block up or the last one down', async () => {
			const wrapper = await mountEditor();

			expect(wrapper.find('[data-move-up="intro"]').attributes('disabled')).toBeDefined();
			expect(wrapper.find('[data-move-down="whatToBring"]').attributes('disabled')).toBeDefined();
		});
	});

	describe('undo', () => {
		it('steps back the last change from the toolbar', async () => {
			const wrapper = await mountEditor();
			const store = useFlyerEditorStore();

			await wrapper.find('[data-toggle-visibility="payment"]').trigger('click');
			expect(previewBlocks(wrapper)).not.toContain('payment');

			const undo = wrapper
				.findAll('button')
				.find((b: any) => b.text().includes('retreatFlyerEditor.undo'));
			await undo!.trigger('click');
			await nextTick();

			expect(previewBlocks(wrapper)).toContain('payment');
			expect(store.canUndo).toBe(false);
		});

		it('offers nothing to undo on arrival', async () => {
			const wrapper = await mountEditor();
			const undo = wrapper
				.findAll('button')
				.find((b: any) => b.text().includes('retreatFlyerEditor.undo'));

			expect(undo!.attributes('disabled')).toBeDefined();
		});
	});

	describe('leaving with unsaved work', () => {
		it('lets you go when there is nothing to lose', async () => {
			await mountEditor();
			expect(leaveGuard?.()).toBe(true);
		});

		it('asks first when there are unsaved changes', async () => {
			const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
			const wrapper = await mountEditor();

			await wrapper.find('[data-toggle-visibility="payment"]').trigger('click');
			await nextTick();

			expect(leaveGuard?.()).toBe(false);
			expect(confirm).toHaveBeenCalled();
		});

		it('lets you go if you confirm', async () => {
			vi.spyOn(window, 'confirm').mockReturnValue(true);
			const wrapper = await mountEditor();

			await wrapper.find('[data-toggle-visibility="payment"]').trigger('click');
			await nextTick();

			expect(leaveGuard?.()).toBe(true);
		});
	});

	it('feeds text overrides into the preview as they are typed', async () => {
		const wrapper = await mountEditor();
		const store = useFlyerEditorStore();

		store.setTextOverride('comeOverride', 'Anímate');
		await nextTick();

		expect(wrapper.find('#printable-area').text()).toContain('Anímate');
	});
});
