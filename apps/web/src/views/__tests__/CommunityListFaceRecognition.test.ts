import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive, ref } from 'vue';

const mockCommunities = ref<any[]>([]);
const mockSetFaceRecognition = vi.fn();
const mockToast = vi.fn();

vi.mock('@/stores/communityStore', () => ({
	useCommunityStore: () => ({
		communities: mockCommunities,
		loading: ref(false),
		fetchCommunities: vi.fn().mockResolvedValue(undefined),
		updateCommunity: vi.fn(),
		createCommunity: vi.fn(),
		deleteCommunity: vi.fn(),
	}),
}));

vi.mock('@/services/api', () => ({
	setCommunityFaceRecognition: (...args: any[]) => mockSetFaceRecognition(...args),
}));

vi.mock('@repo/ui', async (importOriginal) => ({
	...(await importOriginal<typeof import('@repo/ui')>()),
	useToast: () => ({ toast: mockToast }),
}));

vi.mock('lucide-vue-next', async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>();
	const stub = (name: string) => ({ name, template: '<svg></svg>' });
	return {
		...actual,
		...Object.fromEntries(
			['Plus', 'Users', 'MoreHorizontal', 'Edit', 'Trash2', 'ChevronRight', 'Loader2', 'Search', 'ExternalLink', 'FileText'].map(
				(n) => [n, stub(n)],
			),
		),
	};
});

import CommunityListView from '../CommunityListView.vue';

const mountView = () =>
	mount(CommunityListView, { attachTo: document.body, global: { mocks: { $t: (k: string) => k } } });
const section = () => document.body.querySelector('[data-testid="face-recognition-section"]');

describe('CommunityListView face recognition toggle', () => {
	beforeEach(() => {
		mockSetFaceRecognition.mockReset();
		mockToast.mockReset();
		mockCommunities.value = [];
	});

	afterEach(() => {
		document.body.innerHTML = '';
	});

	const openFor = async (community: any) => {
		const wrapper = mountView();
		await flushPromises();
		(wrapper.vm as any).openEditModal(community);
		await flushPromises();
		return wrapper;
	};

	it('hides the section from non-owners', async () => {
		const wrapper = await openFor(reactive({ id: 'c1', name: 'A', viewerRole: 'admin' }));
		expect(section()).toBeNull();
		wrapper.unmount();
	});

	it('hides the section when creating a new community', async () => {
		const wrapper = mountView();
		await flushPromises();
		(wrapper.vm as any).openCreateModal?.();
		await flushPromises();
		expect(section()).toBeNull();
		wrapper.unmount();
	});

	it('asks for confirmation before enabling and only then calls the API', async () => {
		const community = reactive<any>({ id: 'c1', name: 'A', viewerRole: 'owner', faceRecognitionEnabled: false });
		mockCommunities.value = [community];
		mockSetFaceRecognition.mockResolvedValue({ id: 'c1', faceRecognitionEnabled: true });
		const wrapper = await openFor(community);

		expect(section()).not.toBeNull();
		(section()!.querySelector('[role="switch"]') as HTMLElement).click();
		await flushPromises();

		expect(mockSetFaceRecognition).not.toHaveBeenCalled();
		const confirm = document.body.querySelector('[data-testid="face-recognition-confirm"]')!;
		expect(confirm.textContent).toContain('Google Gemini');

		(document.body.querySelector('[data-testid="face-recognition-confirm-button"]') as HTMLElement).click();
		await flushPromises();

		expect(mockSetFaceRecognition).toHaveBeenCalledWith('c1', true);
		expect(community.faceRecognitionEnabled).toBe(true);
		expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Reconocimiento facial activado' }));
		expect(document.body.querySelector('[data-testid="face-recognition-confirm"]')).toBeNull();
		wrapper.unmount();
	});

	it('asks for confirmation before disabling too', async () => {
		const community = reactive<any>({ id: 'c1', name: 'A', viewerRole: 'superadmin', faceRecognitionEnabled: true });
		mockCommunities.value = [community];
		mockSetFaceRecognition.mockResolvedValue({ id: 'c1', faceRecognitionEnabled: false });
		const wrapper = await openFor(community);

		(section()!.querySelector('[role="switch"]') as HTMLElement).click();
		await flushPromises();
		expect(mockSetFaceRecognition).not.toHaveBeenCalled();

		(document.body.querySelector('[data-testid="face-recognition-confirm-button"]') as HTMLElement).click();
		await flushPromises();

		expect(mockSetFaceRecognition).toHaveBeenCalledWith('c1', false);
		expect(community.faceRecognitionEnabled).toBe(false);
		wrapper.unmount();
	});

	it('keeps the previous value and toasts an error when the API fails', async () => {
		const community = reactive<any>({ id: 'c1', name: 'A', viewerRole: 'owner', faceRecognitionEnabled: false });
		mockCommunities.value = [community];
		mockSetFaceRecognition.mockRejectedValue(new Error('boom'));
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const wrapper = await openFor(community);

		(section()!.querySelector('[role="switch"]') as HTMLElement).click();
		await flushPromises();
		(document.body.querySelector('[data-testid="face-recognition-confirm-button"]') as HTMLElement).click();
		await flushPromises();

		expect(community.faceRecognitionEnabled).toBe(false);
		expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
		errSpy.mockRestore();
		wrapper.unmount();
	});
});
