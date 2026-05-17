import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { createPinia, setActivePinia, defineStore } from 'pinia';
import { cleanupMocks } from '@/test/utils';

// Stub child modals so we don't pull their entire dependency tree
vi.mock('@/components/BaseMessageTemplateModal.vue', () => ({
	default: {
		name: 'BaseMessageTemplateModal',
		props: ['open', 'template', 'isGlobal', 'scope', 'participants'],
		emits: ['update:open', 'saved'],
		template: '<div data-test="modal-stub" v-if="open">{{ template?.name }}</div>',
	},
}));
vi.mock('@/components/CommunityTemplateImportModal.vue', () => ({
	default: {
		name: 'CommunityTemplateImportModal',
		props: ['open', 'communityId'],
		emits: ['update:open', 'complete'],
		template: '<div v-if="open">import-modal</div>',
	},
}));

// Hoisted mock state so vi.mock factories (also hoisted) can reference it.
const mocks = vi.hoisted(() => ({
	fetchTemplates: vi.fn(),
	createTemplate: vi.fn(),
	updateTemplate: vi.fn(),
	deleteTemplate: vi.fn(),
	fetchCommunity: vi.fn(),
	fetchMembers: vi.fn(),
	templates: [] as any[],
}));

// Use Pinia defineStore so the store is fully reactive and storeToRefs works.
vi.mock('@/stores/communityMessageTemplateStore', async () => {
	const { defineStore } = await import('pinia');
	const { ref } = await import('vue');
	return {
		useCommunityMessageTemplateStore: defineStore('community-message-template-mock', () => ({
			templates: ref<any[]>(mocks.templates),
			loading: ref(false),
			error: ref<string | null>(null),
			fetchTemplates: mocks.fetchTemplates,
			createTemplate: mocks.createTemplate,
			updateTemplate: mocks.updateTemplate,
			deleteTemplate: mocks.deleteTemplate,
		})),
	};
});

vi.mock('@/stores/communityStore', async () => {
	const { defineStore } = await import('pinia');
	const { ref } = await import('vue');
	return {
		useCommunityStore: defineStore('community-mock', () => ({
			currentCommunity: ref({ id: 'comm-1', name: 'Test Community' }),
			members: ref<any[]>([]),
			fetchCommunity: mocks.fetchCommunity,
			fetchMembers: mocks.fetchMembers,
		})),
	};
});

import CommunityMessageTemplatesView from '../CommunityMessageTemplatesView.vue';

describe('CommunityMessageTemplatesView', () => {
	let wrapper: VueWrapper<any>;
	let pinia: any;

	const globalTemplate = {
		id: 'global-1',
		name: 'Invitación global',
		type: 'COMMUNITY_MEETING_INVITATION',
		scope: 'community',
		message: 'Hola {{firstName}}, ven a la reunión',
		communityId: null, // ← marks as global
		retreatId: null,
		createdAt: new Date('2026-01-01'),
		updatedAt: new Date('2026-01-01'),
	};

	const specificTemplate = {
		id: 'spec-1',
		name: 'Mi invitación custom',
		type: 'COMMUNITY_MEETING_INVITATION',
		scope: 'community',
		message: 'Hola personalizado',
		communityId: 'comm-1',
		retreatId: null,
		createdAt: new Date('2026-02-01'),
		updatedAt: new Date('2026-02-01'),
	};

	beforeEach(async () => {
		pinia = createPinia();
		setActivePinia(pinia);
		mocks.templates = [];
		mocks.fetchTemplates.mockReset();
		mocks.deleteTemplate.mockReset();
		mocks.fetchCommunity.mockReset();
		mocks.fetchMembers.mockReset();
		vi.clearAllMocks();
	});

	afterEach(() => {
		wrapper?.unmount();
		cleanupMocks();
	});

	const mountView = async (templates: any[] = []) => {
		// Mutate the shared array reference so the store ref (which holds the
		// same array instance) sees the new content.
		mocks.templates.length = 0;
		mocks.templates.push(...templates);
		wrapper = mount(CommunityMessageTemplatesView, {
			props: { id: 'comm-1' },
			global: {
				plugins: [pinia],
				stubs: {
					'router-link': true,
					'router-view': true,
					teleport: true,
				},
				mocks: {
					$t: (key: string) => key,
				},
			},
		});
		await nextTick();
		await nextTick();
		return wrapper;
	};

	describe('isGlobalTemplate helper', () => {
		it('returns true when communityId is null', async () => {
			await mountView();
			expect(wrapper.vm.isGlobalTemplate(globalTemplate)).toBe(true);
		});

		it('returns true when communityId is undefined', async () => {
			await mountView();
			expect(wrapper.vm.isGlobalTemplate({ ...globalTemplate, communityId: undefined })).toBe(true);
		});

		it('returns false when communityId is set to the current community', async () => {
			await mountView();
			expect(wrapper.vm.isGlobalTemplate(specificTemplate)).toBe(false);
		});
	});

	describe('openOverrideDialog', () => {
		it('strips id and timestamps and scopes the copy to the current community', async () => {
			await mountView();
			wrapper.vm.openOverrideDialog(globalTemplate);
			await nextTick();

			expect(wrapper.vm.currentTemplate).toEqual({
				name: globalTemplate.name,
				type: globalTemplate.type,
				message: globalTemplate.message,
				scope: 'community',
				communityId: 'comm-1',
			});
			// No id => modal will create a new row instead of updating
			expect(wrapper.vm.currentTemplate.id).toBeUndefined();
			expect(wrapper.vm.isDialogOpen).toBe(true);
		});
	});

	describe('openEditDialog', () => {
		it('opens with full template copy for community-specific rows', async () => {
			await mountView();
			wrapper.vm.openEditDialog(specificTemplate);
			await nextTick();

			expect(wrapper.vm.currentTemplate.id).toBe('spec-1');
			expect(wrapper.vm.currentTemplate.communityId).toBe('comm-1');
			expect(wrapper.vm.isDialogOpen).toBe(true);
		});

		it('is a no-op on global templates (safety)', async () => {
			await mountView();
			wrapper.vm.openEditDialog(globalTemplate);
			await nextTick();
			expect(wrapper.vm.isDialogOpen).toBe(false);
		});
	});

	describe('handleDelete', () => {
		it('calls deleteTemplate for community-specific rows after confirm', async () => {
			await mountView();
			const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
			await wrapper.vm.handleDelete(specificTemplate);

			expect(confirmSpy).toHaveBeenCalled();
			expect(mocks.deleteTemplate).toHaveBeenCalledWith('comm-1', 'spec-1');
			confirmSpy.mockRestore();
		});

		it('does NOT delete when user cancels confirm', async () => {
			await mountView();
			const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
			await wrapper.vm.handleDelete(specificTemplate);
			expect(mocks.deleteTemplate).not.toHaveBeenCalled();
			confirmSpy.mockRestore();
		});

		it('is a no-op on global templates regardless of confirm', async () => {
			await mountView();
			const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
			await wrapper.vm.handleDelete(globalTemplate);
			expect(mocks.deleteTemplate).not.toHaveBeenCalled();
			confirmSpy.mockRestore();
		});
	});

	describe('rendering', () => {
		it('shows the Global badge on inherited rows', async () => {
			await mountView([globalTemplate]);
			expect(wrapper.text()).toContain('communityTemplates.globalBadge');
		});

		it('does NOT show the Global badge on community-specific rows', async () => {
			await mountView([specificTemplate]);
			expect(wrapper.text()).not.toContain('communityTemplates.globalBadge');
		});

		it('renders both globals and specifics when both are present', async () => {
			await mountView([specificTemplate, globalTemplate]);
			expect(wrapper.text()).toContain('Invitación global');
			expect(wrapper.text()).toContain('Mi invitación custom');
		});

		it('fetches templates and community on mount', async () => {
			await mountView();
			expect(mocks.fetchTemplates).toHaveBeenCalledWith('comm-1');
			expect(mocks.fetchCommunity).toHaveBeenCalledWith('comm-1');
		});
	});
});
