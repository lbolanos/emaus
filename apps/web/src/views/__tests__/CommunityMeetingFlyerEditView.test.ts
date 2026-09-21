import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

const fetchCommunity = vi.fn();
const fetchMeetings = vi.fn();
const setFlyerOptions = vi.fn();
const clearFlyerOptions = vi.fn();

const community = {
	id: 'community-1',
	name: 'buen despacho',
	address1: 'Parroquia El Señor del Buen Despacho',
	city: 'Ciudad de México',
	state: 'CDMX',
	country: 'México',
	googleMapsUrl: 'https://maps.google.com/?cid=123',
	flyerBackgroundUrl: null as string | null,
	flyerOptions: undefined as Record<string, any> | undefined,
};

const meetings = [
	{
		id: 'meeting-1',
		title: 'Convivencia de Adviento',
		description: 'Una tarde para compartir',
		startDate: '2026-12-05T18:00:00.000Z',
		durationMinutes: 120,
		isAnnouncement: false,
		flyerTemplate: '',
	},
];

vi.mock('@/stores/communityStore', () => ({
	useCommunityStore: () => ({
		currentCommunity: community,
		meetings,
		fetchCommunity,
		fetchMeetings,
		setFlyerOptions,
		clearFlyerOptions,
	}),
}));

// onBeforeRouteLeave is captured so the tests can fire the guard by hand
let leaveGuard: (() => boolean) | null = null;
vi.mock('vue-router', () => ({
	useRoute: () => ({ params: { id: 'community-1', meetingId: 'meeting-1' } }),
	useRouter: () => ({ push: vi.fn() }),
	onBeforeRouteLeave: (guard: () => boolean) => {
		leaveGuard = guard;
	},
	RouterLink: { name: 'RouterLink', template: '<a><slot /></a>', props: ['to'] },
}));

vi.mock('qrcode.vue', () => ({
	default: { name: 'QrcodeVue', template: '<canvas />', props: ['value', 'size'] },
}));

import CommunityMeetingFlyerEditView from '../CommunityMeetingFlyerEditView.vue';
import { useMeetingFlyerEditorStore } from '@/stores/meetingFlyerEditorStore';

async function mountEditor(
	flyerOptions?: Record<string, any>,
	extraCommunity: Record<string, any> = {},
) {
	community.flyerOptions = flyerOptions;
	Object.assign(community, extraCommunity);
	setActivePinia(createPinia());
	fetchCommunity.mockReset().mockResolvedValue(undefined);
	fetchMeetings.mockReset().mockResolvedValue(undefined);
	setFlyerOptions.mockReset().mockResolvedValue(undefined);
	clearFlyerOptions.mockReset().mockResolvedValue(undefined);

	const wrapper = mount(CommunityMeetingFlyerEditView, {
		global: { stubs: { 'router-link': { template: '<a><slot /></a>', props: ['to'] } } },
	});
	// onMounted awaits the community and meetings fetches before seeding the store
	await flushPromises();
	await nextTick();
	return wrapper;
}

/** Block ids as laid out in the live preview (not printable: no #printable-area here). */
const previewBlocks = (wrapper: any) =>
	wrapper.findAll('[data-flyer-block]').map((el: any) => el.attributes('data-flyer-block'));

/** Block ids inside one slot of the preview, in DOM order. */
const slotBlocks = (wrapper: any, slot: string) =>
	wrapper
		.findAll(`[data-flyer-slot="${slot}"] [data-flyer-block]`)
		.map((el: any) => el.attributes('data-flyer-block'));

/** The design panel's list, which is the only place a hidden block still shows up. */
const panelBlocks = (wrapper: any) =>
	wrapper.findAll('li[data-block]').map((el: any) => el.attributes('data-block'));

const buttonByText = (wrapper: any, text: string) =>
	wrapper.findAll('button').find((b: any) => b.text().includes(text));

/** Drags a block of the preview onto another one, the way a pointer would. */
async function dragOnFlyer(wrapper: any, fromId: string, toSelector: string) {
	await wrapper.find(`[data-flyer-block="${fromId}"]`).trigger('dragstart');
	await wrapper.find(toSelector).trigger('drop');
	await nextTick();
}

describe('CommunityMeetingFlyerEditView', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		community.flyerBackgroundUrl = null;
		community.flyerOptions = undefined;
	});

	it('lays every block out in its slot on the preview', async () => {
		const wrapper = await mountEditor();

		expect(slotBlocks(wrapper, 'left')).toEqual(['dateTime', 'description']);
		expect(slotBlocks(wrapper, 'right')).toEqual(['location', 'locationQr']);
		expect(slotBlocks(wrapper, 'wide')).toEqual(['community']);
		expect(previewBlocks(wrapper)).toHaveLength(5);
	});

	it("seeds the community's saved background when there is no design yet", async () => {
		const wrapper = await mountEditor(undefined, { flyerBackgroundUrl: '/jesus_bg.png' });

		expect(wrapper.html()).toContain('/jesus_bg.png');
	});

	it('removes a block from the preview when it is hidden', async () => {
		const wrapper = await mountEditor();

		await wrapper.find('[data-toggle-visibility="description"]').trigger('click');
		await nextTick();

		expect(previewBlocks(wrapper)).not.toContain('description');
		// Still in the panel list, which is the only way to bring it back
		expect(panelBlocks(wrapper)).toContain('description');
	});

	it('moves a block across slots when dropped on the preview itself', async () => {
		const wrapper = await mountEditor();

		await dragOnFlyer(wrapper, 'community', '[data-flyer-block="dateTime"]');

		expect(slotBlocks(wrapper, 'left')[0]).toBe('community');
		expect(slotBlocks(wrapper, 'wide')).toEqual([]);
	});

	it('selects a block when it is clicked on the preview', async () => {
		const wrapper = await mountEditor();
		const store = useMeetingFlyerEditorStore();

		await wrapper.find('[data-flyer-block="location"]').trigger('click');
		await nextTick();

		expect(store.selectedBlockId).toBe('location');
	});

	it('keeps Save disabled until something changes', async () => {
		const wrapper = await mountEditor();
		const store = useMeetingFlyerEditorStore();

		expect(store.isDirty).toBe(false);
		expect(buttonByText(wrapper, 'meetingFlyerEditor.save')!.attributes('disabled')).toBeDefined();

		await wrapper.find('[data-toggle-visibility="description"]').trigger('click');
		await nextTick();

		expect(store.isDirty).toBe(true);
		expect(
			buttonByText(wrapper, 'meetingFlyerEditor.save')!.attributes('disabled'),
		).toBeUndefined();
	});

	it('marks the design dirty when a look is applied, and ships the box reset', async () => {
		const wrapper = await mountEditor();
		const store = useMeetingFlyerEditorStore();

		// 'poster' is a light-on-photo look: its recipe also clears any SAVED
		// card, or a card left from an earlier design turns the date invisible.
		const poster = buttonByText(wrapper, 'meetingFlyerEditor.design.preset.poster');
		await poster!.trigger('click');
		await nextTick();

		expect(store.isDirty).toBe(true);
		expect(store.theme.textColor).toBe('#ffffff');
		expect(store.blockStyles.dateTime).toMatchObject({ backgroundOpacity: 0 });
	});

	it('discards changes back to what the community has stored', async () => {
		const wrapper = await mountEditor();
		const store = useMeetingFlyerEditorStore();

		await wrapper.find('[data-toggle-visibility="description"]').trigger('click');
		expect(store.isDirty).toBe(true);

		const discard = buttonByText(wrapper, 'meetingFlyerEditor.discard');
		await discard!.trigger('click');
		await nextTick();

		expect(store.isDirty).toBe(false);
		expect(previewBlocks(wrapper)).toContain('description');
	});

	it('starts from the stored layout for a community that already has one', async () => {
		const wrapper = await mountEditor({
			layoutVersion: 2,
			blocks: [
				{ id: 'community', slot: 'left', order: 0, visible: true },
				{ id: 'dateTime', slot: 'wide', order: 0, visible: true },
			],
		});

		expect(slotBlocks(wrapper, 'left')[0]).toBe('community');
		expect(slotBlocks(wrapper, 'wide')[0]).toBe('dateTime');
	});

	it('saves the whole design to the community', async () => {
		const wrapper = await mountEditor();
		const store = useMeetingFlyerEditorStore();

		store.setTextOverride('titleOverride', '¡Nos vemos!');
		await nextTick();

		const save = buttonByText(wrapper, 'meetingFlyerEditor.save');
		await save!.trigger('click');
		await flushPromises();

		expect(setFlyerOptions).toHaveBeenCalledTimes(1);
		const [communityId, options] = setFlyerOptions.mock.calls[0];
		expect(communityId).toBe('community-1');
		expect(options.titleOverride).toBe('¡Nos vemos!');
		expect(options.layoutVersion).toBe(2);
		expect(options.blocks).toHaveLength(5);
	});

	// Dragging on the flyer is mouse-only, so the panel keeps a reachable way to reorder
	describe('reordering without a mouse', () => {
		it('moves a block down within its column', async () => {
			const wrapper = await mountEditor();

			await wrapper.find('[data-move-down="dateTime"]').trigger('click');
			await nextTick();

			expect(slotBlocks(wrapper, 'left')).toEqual(['description', 'dateTime']);
		});

		it('crosses into the next column at the edge', async () => {
			const wrapper = await mountEditor();

			// description is last in the left column; down takes it to the right one
			await wrapper.find('[data-move-down="description"]').trigger('click');
			await nextTick();

			expect(slotBlocks(wrapper, 'left')).toEqual(['dateTime']);
			expect(slotBlocks(wrapper, 'right')).toEqual(['description', 'location', 'locationQr']);
		});

		it('cannot move the first block up or the last one down', async () => {
			const wrapper = await mountEditor();

			expect(wrapper.find('[data-move-up="dateTime"]').attributes('disabled')).toBeDefined();
			expect(wrapper.find('[data-move-down="community"]').attributes('disabled')).toBeDefined();
		});
	});

	describe('undo', () => {
		it('steps back the last change from the toolbar', async () => {
			const wrapper = await mountEditor();
			const store = useMeetingFlyerEditorStore();

			await wrapper.find('[data-toggle-visibility="description"]').trigger('click');
			expect(previewBlocks(wrapper)).not.toContain('description');

			const undo = buttonByText(wrapper, 'meetingFlyerEditor.undo');
			await undo!.trigger('click');
			await nextTick();

			expect(previewBlocks(wrapper)).toContain('description');
			expect(store.canUndo).toBe(false);
		});

		it('offers nothing to undo on arrival', async () => {
			const wrapper = await mountEditor();
			const undo = buttonByText(wrapper, 'meetingFlyerEditor.undo');

			expect(undo!.attributes('disabled')).toBeDefined();
		});
	});

	describe('clearing the design', () => {
		it('stays disabled until the community has a saved design', async () => {
			const wrapper = await mountEditor();

			const clear = buttonByText(wrapper, 'meetingFlyerEditor.clearDesign');
			expect(clear!.attributes('disabled')).toBeDefined();
			expect(clearFlyerOptions).not.toHaveBeenCalled();
		});

		it('asks for confirmation and reloads from the cleared community', async () => {
			const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
			const wrapper = await mountEditor({
				layoutVersion: 2,
				blocks: [{ id: 'dateTime', slot: 'right', order: 0, visible: true }],
			});
			const store = useMeetingFlyerEditorStore();

			const clear = buttonByText(wrapper, 'meetingFlyerEditor.clearDesign');
			await clear!.trigger('click');
			await flushPromises();

			expect(confirm).toHaveBeenCalled();
			expect(clearFlyerOptions).toHaveBeenCalledWith('community-1');
			// The cleared community has no design: back to the default arrangement
			expect(slotBlocks(wrapper, 'left')).toEqual(['dateTime', 'description']);
			expect(store.isDirty).toBe(false);
		});

		it('keeps the design when confirmation is declined', async () => {
			vi.spyOn(window, 'confirm').mockReturnValue(false);
			const wrapper = await mountEditor({
				layoutVersion: 2,
				blocks: [{ id: 'dateTime', slot: 'right', order: 0, visible: true }],
			});

			const clear = buttonByText(wrapper, 'meetingFlyerEditor.clearDesign');
			await clear!.trigger('click');
			await flushPromises();

			expect(clearFlyerOptions).not.toHaveBeenCalled();
			expect(slotBlocks(wrapper, 'right')[0]).toBe('dateTime');
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

			await wrapper.find('[data-toggle-visibility="description"]').trigger('click');
			await nextTick();

			expect(leaveGuard?.()).toBe(false);
			expect(confirm).toHaveBeenCalled();
		});

		it('lets you go if you confirm', async () => {
			vi.spyOn(window, 'confirm').mockReturnValue(true);
			const wrapper = await mountEditor();

			await wrapper.find('[data-toggle-visibility="description"]').trigger('click');
			await nextTick();

			expect(leaveGuard?.()).toBe(true);
		});
	});

	it('feeds text overrides into the preview as they are typed', async () => {
		const wrapper = await mountEditor();
		const store = useMeetingFlyerEditorStore();

		store.setTextOverride('titleOverride', '¡Nos vemos!');
		await nextTick();

		expect(wrapper.text()).toContain('¡Nos vemos!');
	});
});
