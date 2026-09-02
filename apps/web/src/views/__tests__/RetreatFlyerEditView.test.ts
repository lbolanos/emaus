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

vi.mock('vue-router', () => ({
	useRoute: () => ({ params: { id: 'retreat-1' } }),
	useRouter: () => ({ push: vi.fn() }),
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

		await wrapper.find('li[data-block="payment"] button[aria-label]').trigger('click');
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

		await wrapper.find('li[data-block="payment"] button[aria-label]').trigger('click');
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

		await wrapper.find('li[data-block="payment"] button[aria-label]').trigger('click');
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

	it('feeds text overrides into the preview as they are typed', async () => {
		const wrapper = await mountEditor();
		const store = useFlyerEditorStore();

		store.setTextOverride('comeOverride', 'Anímate');
		await nextTick();

		expect(wrapper.find('#printable-area').text()).toContain('Anímate');
	});
});
