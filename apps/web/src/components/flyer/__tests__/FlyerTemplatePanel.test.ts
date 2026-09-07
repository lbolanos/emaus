import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

const api = vi.hoisted(() => ({
	getFlyerTemplates: vi.fn(),
	createFlyerTemplate: vi.fn(),
	updateFlyerTemplate: vi.fn(),
	deleteFlyerTemplate: vi.fn(),
	getCommunities: vi.fn(),
}));

vi.mock('@/services/api', () => api);

vi.mock('qrcode.vue', () => ({
	default: { name: 'QrcodeVue', template: '<canvas />', props: ['value', 'size'] },
}));

import FlyerTemplatePanel from '../editor/FlyerTemplatePanel.vue';

const LAYOUT = { layoutVersion: 2, blocks: [{ id: 'intro', slot: 'left', order: 0, visible: true }] };

const template = (over: Record<string, any> = {}) => ({
	id: 't1',
	name: 'Diseño guardado',
	scope: 'personal',
	communityId: null,
	createdBy: 'u1',
	layout: LAYOUT,
	createdAt: new Date(),
	updatedAt: new Date(),
	...over,
});

async function mountPanel() {
	setActivePinia(createPinia());
	const wrapper = mount(FlyerTemplatePanel, {
		props: {
			layout: LAYOUT,
			retreat: { id: 'r1', parish: 'San Judas Tadeo', retreat_type: 'men' },
		},
	});
	await flushPromises();
	return wrapper;
}

const buttonWith = (wrapper: any, text: string) =>
	wrapper.findAll('button').find((b: any) => b.text().includes(text));

describe('FlyerTemplatePanel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		api.getFlyerTemplates.mockResolvedValue([]);
		api.getCommunities.mockResolvedValue([]);
	});

	it('says so when there are no templates yet', async () => {
		const wrapper = await mountPanel();
		expect(wrapper.text()).toContain('retreatFlyerEditor.templates.empty');
	});

	it('saves the current design under a name', async () => {
		api.createFlyerTemplate.mockResolvedValue(template());
		const wrapper = await mountPanel();

		await wrapper.find('#flyer-template-name').setValue('Mi diseño');
		await buttonWith(wrapper, 'retreatFlyerEditor.templates.saveAsNew')!.trigger('click');
		await flushPromises();

		expect(api.createFlyerTemplate).toHaveBeenCalledWith({
			name: 'Mi diseño',
			scope: 'personal',
			communityId: null,
			layout: LAYOUT,
		});
	});

	it('will not save without a name', async () => {
		const wrapper = await mountPanel();
		await buttonWith(wrapper, 'retreatFlyerEditor.templates.saveAsNew')!.trigger('click');
		await flushPromises();

		expect(api.createFlyerTemplate).not.toHaveBeenCalled();
	});

	it('offers the community scope only when the user administers one', async () => {
		expect((await mountPanel()).findAll('input[type="radio"]')).toHaveLength(0);

		api.getCommunities.mockResolvedValue([{ id: 'c1', name: 'Del Valle' }]);
		const wrapper = await mountPanel();
		expect(wrapper.findAll('input[type="radio"]')).toHaveLength(2);
	});

	// Applying replaces the whole design, so it asks first — with the app's own dialog,
	// not the browser's.
	it('asks before applying, and only then emits the stored design', async () => {
		const stored = { layoutVersion: 2, blocks: [], images: { logo: 'https://cdn/x.webp' } };
		api.getFlyerTemplates.mockResolvedValue([template({ layout: stored })]);
		const wrapper = await mountPanel();

		await wrapper.find('[data-apply="t1"]').trigger('click');
		await nextTick();
		expect(wrapper.emitted('apply')).toBeUndefined();

		await wrapper.find('[data-confirm-apply]').trigger('click');
		expect(wrapper.emitted('apply')?.[0]).toEqual([stored]);
	});

	it('applies nothing while the confirmation is still open', async () => {
		api.getFlyerTemplates.mockResolvedValue([template()]);
		const wrapper = await mountPanel();

		await wrapper.find('[data-apply="t1"]').trigger('click');
		await nextTick();

		const cancel = buttonWith(wrapper, 'common.cancel');
		await cancel!.trigger('click');
		await nextTick();

		expect(wrapper.emitted('apply')).toBeUndefined();
		expect(wrapper.find('[data-confirm-apply]').exists()).toBe(false);
	});

	it('shows the flyer as it would look before applying', async () => {
		const stored = {
			layoutVersion: 2,
			blocks: [{ id: 'intro', slot: 'wide', order: 0, visible: true }],
		};
		api.getFlyerTemplates.mockResolvedValue([template({ layout: stored })]);
		const wrapper = await mountPanel();

		await wrapper.find('[data-preview="t1"]').trigger('click');
		await nextTick();

		// The real canvas, drawn with the template's layout
		expect(wrapper.find('.print-optimized').exists()).toBe(true);
		expect(wrapper.find('[data-flyer-slot="wide"] [data-flyer-block="intro"]').exists()).toBe(
			true,
		);
		// …but it must not claim the id that print, copy and PDF export target
		expect(wrapper.find('#printable-area').exists()).toBe(false);
	});

	it('can apply straight from the preview, without asking twice', async () => {
		const stored = { layoutVersion: 2, blocks: [] };
		api.getFlyerTemplates.mockResolvedValue([template({ layout: stored })]);
		const wrapper = await mountPanel();

		await wrapper.find('[data-preview="t1"]').trigger('click');
		await nextTick();

		const applyInDialog = wrapper
			.findAll('button')
			.filter((b) => b.text().includes('retreatFlyerEditor.templates.apply'));
		await applyInDialog[applyInDialog.length - 1].trigger('click');

		expect(wrapper.emitted('apply')?.[0]).toEqual([stored]);
	});

	it('asks before deleting', async () => {
		api.getFlyerTemplates.mockResolvedValue([template()]);
		api.deleteFlyerTemplate.mockResolvedValue(undefined);
		const wrapper = await mountPanel();

		await wrapper.find('[data-delete="t1"]').trigger('click');
		await nextTick();
		expect(api.deleteFlyerTemplate).not.toHaveBeenCalled();

		await wrapper.find('[data-confirm-delete]').trigger('click');
		await flushPromises();

		expect(api.deleteFlyerTemplate).toHaveBeenCalledWith('t1');
	});

	// The panel is mounted with the editor, so a failing list must not take it down
	it('stays usable when the list cannot be loaded', async () => {
		api.getFlyerTemplates.mockRejectedValue({
			response: { data: { message: 'No tienes permiso' } },
		});
		const wrapper = await mountPanel();

		expect(wrapper.text()).toContain('No tienes permiso');
		expect(wrapper.find('#flyer-template-name').exists()).toBe(true);
	});
});
