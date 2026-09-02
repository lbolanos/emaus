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

const panelBlocks = (wrapper: any, slot: string) =>
	wrapper
		.findAll(`ul[data-slot="${slot}"] li[data-block]`)
		.map((el: any) => el.attributes('data-block'));

describe('RetreatFlyerEditView', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('lists every block in its slot and previews the flyer', async () => {
		const wrapper = await mountEditor();

		expect(panelBlocks(wrapper, 'left')).toEqual(['intro', 'startTime', 'location', 'endTime']);
		expect(panelBlocks(wrapper, 'right')).toEqual(['registrationQr', 'contact', 'payment']);
		expect(panelBlocks(wrapper, 'wide')).toEqual(['whatToBring']);
		expect(previewBlocks(wrapper)).toHaveLength(8);
	});

	it('removes a block from the preview when it is hidden', async () => {
		const wrapper = await mountEditor();

		await wrapper.find('li[data-block="payment"] button').trigger('click');
		await nextTick();

		expect(previewBlocks(wrapper)).not.toContain('payment');
		// Still listed in the panel, marked as hidden, so it can be brought back
		expect(panelBlocks(wrapper, 'right')).toContain('payment');
	});

	it('moves a block across slots on drop, and the preview follows', async () => {
		const wrapper = await mountEditor();

		await wrapper.find('li[data-block="whatToBring"]').trigger('dragstart');
		await wrapper.find('li[data-block="intro"]').trigger('drop');
		await nextTick();

		expect(panelBlocks(wrapper, 'left')[0]).toBe('whatToBring');
		expect(panelBlocks(wrapper, 'wide')).toEqual([]);
		expect(previewBlocks(wrapper)[0]).toBe('whatToBring');
	});

	it('keeps Save disabled until something changes', async () => {
		const wrapper = await mountEditor();
		const store = useFlyerEditorStore();

		expect(store.isDirty).toBe(false);

		await wrapper.find('li[data-block="payment"] button').trigger('click');
		expect(store.isDirty).toBe(true);
	});

	it('discards changes back to what the retreat has stored', async () => {
		const wrapper = await mountEditor();
		const store = useFlyerEditorStore();

		await wrapper.find('li[data-block="payment"] button').trigger('click');
		expect(store.isDirty).toBe(true);

		const discard = wrapper
			.findAll('button')
			.find((b) => b.text().includes('retreatFlyerEditor.discard'));
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

		expect(panelBlocks(wrapper, 'left')[0]).toBe('whatToBring');
		expect(panelBlocks(wrapper, 'wide')[0]).toBe('intro');
	});

	it('feeds text overrides into the preview as they are typed', async () => {
		const wrapper = await mountEditor();
		const store = useFlyerEditorStore();

		store.setTextOverride('comeOverride', 'Anímate');
		await nextTick();

		expect(wrapper.find('#printable-area').text()).toContain('Anímate');
	});
});
