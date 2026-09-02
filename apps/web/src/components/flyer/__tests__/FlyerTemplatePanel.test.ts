import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const api = vi.hoisted(() => ({
	getFlyerTemplates: vi.fn(),
	createFlyerTemplate: vi.fn(),
	updateFlyerTemplate: vi.fn(),
	deleteFlyerTemplate: vi.fn(),
	getCommunities: vi.fn(),
}));

vi.mock('@/services/api', () => api);

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
	const wrapper = mount(FlyerTemplatePanel, { props: { layout: LAYOUT } });
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
		vi.spyOn(window, 'confirm').mockReturnValue(true);
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

	it('emits the stored design when a template is applied', async () => {
		const stored = { layoutVersion: 2, blocks: [], images: { logo: 'https://cdn/x.webp' } };
		api.getFlyerTemplates.mockResolvedValue([template({ layout: stored })]);
		const wrapper = await mountPanel();

		await buttonWith(wrapper, 'retreatFlyerEditor.templates.apply')!.trigger('click');

		expect(window.confirm).toHaveBeenCalled();
		expect(wrapper.emitted('apply')?.[0]).toEqual([stored]);
	});

	it('does not apply anything if the confirmation is dismissed', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(false);
		api.getFlyerTemplates.mockResolvedValue([template()]);
		const wrapper = await mountPanel();

		await buttonWith(wrapper, 'retreatFlyerEditor.templates.apply')!.trigger('click');

		expect(wrapper.emitted('apply')).toBeUndefined();
	});

	it('deletes after confirming', async () => {
		api.getFlyerTemplates.mockResolvedValue([template()]);
		api.deleteFlyerTemplate.mockResolvedValue(undefined);
		const wrapper = await mountPanel();

		await wrapper.find('li button[aria-label]').trigger('click');
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
