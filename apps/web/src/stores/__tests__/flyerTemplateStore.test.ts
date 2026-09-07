import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const api = vi.hoisted(() => ({
	getFlyerTemplates: vi.fn(),
	createFlyerTemplate: vi.fn(),
	updateFlyerTemplate: vi.fn(),
	deleteFlyerTemplate: vi.fn(),
	getCommunities: vi.fn(),
}));

vi.mock('@/services/api', () => api);

import { useFlyerTemplateStore } from '../flyerTemplateStore';

const template = (over: Record<string, any> = {}) => ({
	id: 't1',
	name: 'Diseño',
	scope: 'personal',
	communityId: null,
	createdBy: 'u1',
	layout: { layoutVersion: 2, blocks: [] },
	createdAt: new Date(),
	updatedAt: new Date(),
	...over,
});

describe('flyerTemplateStore', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
		api.getFlyerTemplates.mockResolvedValue([]);
		api.getCommunities.mockResolvedValue([]);
	});

	it('loads templates and the communities they can be shared with', async () => {
		api.getFlyerTemplates.mockResolvedValue([template()]);
		api.getCommunities.mockResolvedValue([{ id: 'c1', name: 'Del Valle' }]);

		const store = useFlyerTemplateStore();
		await store.load();

		expect(store.templates).toHaveLength(1);
		expect(store.canShareWithCommunity).toBe(true);
		expect(store.communityName('c1')).toBe('Del Valle');
	});

	it('offers no community scope when the user administers none', async () => {
		const store = useFlyerTemplateStore();
		await store.load();

		expect(store.canShareWithCommunity).toBe(false);
	});

	// A failing community lookup must not hide the templates themselves
	it('still lists templates when the community lookup fails', async () => {
		api.getFlyerTemplates.mockResolvedValue([template()]);
		api.getCommunities.mockRejectedValue(new Error('403'));

		const store = useFlyerTemplateStore();
		await store.load();

		expect(store.templates).toHaveLength(1);
		expect(store.communities).toEqual([]);
	});

	it('puts a newly created template at the top of the list', async () => {
		api.getFlyerTemplates.mockResolvedValue([template({ id: 'old', name: 'Vieja' })]);
		api.createFlyerTemplate.mockResolvedValue(template({ id: 'new', name: 'Nueva' }));

		const store = useFlyerTemplateStore();
		await store.load();
		await store.create({ name: 'Nueva', scope: 'personal', layout: { layoutVersion: 2 } });

		expect(store.templates.map((t) => t.name)).toEqual(['Nueva', 'Vieja']);
	});

	it('replaces the edited template in place when renaming', async () => {
		api.getFlyerTemplates.mockResolvedValue([template()]);
		api.updateFlyerTemplate.mockResolvedValue(template({ name: 'Renombrada' }));

		const store = useFlyerTemplateStore();
		await store.load();
		await store.rename('t1', 'Renombrada');

		expect(store.templates[0].name).toBe('Renombrada');
		expect(api.updateFlyerTemplate).toHaveBeenCalledWith('t1', { name: 'Renombrada' });
	});

	it('overwrites only the layout', async () => {
		api.getFlyerTemplates.mockResolvedValue([template()]);
		api.updateFlyerTemplate.mockResolvedValue(template({ layout: { layoutVersion: 2, blocks: [1] } }));

		const store = useFlyerTemplateStore();
		await store.load();
		await store.overwrite('t1', { layoutVersion: 2, blocks: [1] });

		expect(api.updateFlyerTemplate).toHaveBeenCalledWith('t1', {
			layout: { layoutVersion: 2, blocks: [1] },
		});
	});

	it('drops a deleted template from the list', async () => {
		api.getFlyerTemplates.mockResolvedValue([template(), template({ id: 't2' })]);
		api.deleteFlyerTemplate.mockResolvedValue(undefined);

		const store = useFlyerTemplateStore();
		await store.load();
		await store.remove('t1');

		expect(store.templates.map((t) => t.id)).toEqual(['t2']);
	});

	it('keeps the template when deleting fails', async () => {
		api.getFlyerTemplates.mockResolvedValue([template()]);
		api.deleteFlyerTemplate.mockRejectedValue(new Error('403'));

		const store = useFlyerTemplateStore();
		await store.load();

		await expect(store.remove('t1')).rejects.toThrow('403');
		expect(store.templates).toHaveLength(1);
	});
});
