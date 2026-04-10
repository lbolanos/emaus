import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { nextTick } from 'vue';
import { createMockRetreat, createMockParticipant, cleanupMocks } from '@/test/utils';

// Mock the api service
vi.mock('@/services/api', () => ({
	api: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	},
}));

// Mock qrcode.vue
vi.mock('qrcode.vue', () => ({
	default: { name: 'QrcodeVue', template: '<div class="qrcode"></div>', props: ['value', 'size', 'level'] },
}));

// Mock InviteUsersModal
vi.mock('@/components/InviteUsersModal.vue', () => ({
	default: { name: 'InviteUsersModal', template: '<div class="invite-modal"></div>', props: ['isOpen', 'retreatId'] },
}));

// Mock @repo/utils
vi.mock('@repo/utils', () => ({
	formatDate: vi.fn((d: any) => `formatted-${d}`),
}));

// Mock useAuthPermissions
const mockCanRead = vi.fn(() => true);
vi.mock('@/composables/useAuthPermissions', () => ({
	useAuthPermissions: () => ({
		can: {
			read: mockCanRead,
		},
	}),
}));

// Mock navigator.clipboard
const mockClipboardWriteText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
	value: { writeText: mockClipboardWriteText },
	writable: true,
});

// Mock window.open
const mockWindowOpen = vi.fn();
Object.defineProperty(window, 'open', { value: mockWindowOpen, writable: true });

import RetreatDashboardView from '../RetreatDashboardView.vue';

const mockRetreat = createMockRetreat({
	id: 'retreat-1',
	parish: 'Parroquia San Juan',
	startDate: new Date('2026-06-15'),
	max_walkers: 50,
	max_servers: 20,
	openingNotes: 'Welcome notes',
	closingNotes: 'Goodbye notes',
	thingsToBringNotes: 'Bring a Bible',
	cost: '$100',
	paymentInfo: 'Pay by bank transfer',
	paymentMethods: 'Cash, Zelle',
	memoryPhotoUrl: 'https://example.com/photo.jpg',
	musicPlaylistUrl: 'https://example.com/playlist',
	slug: 'san-juan-2026',
});

const walkers = Array.from({ length: 30 }, (_, i) =>
	createMockParticipant({ id: `w-${i}`, type: 'walker', isCancelled: false }),
);
const servers = Array.from({ length: 10 }, (_, i) =>
	createMockParticipant({ id: `s-${i}`, type: 'server', isCancelled: false }),
);
const waiting = Array.from({ length: 3 }, (_, i) =>
	createMockParticipant({ id: `wt-${i}`, type: 'waiting', isCancelled: false }),
);
const partialServers = Array.from({ length: 2 }, (_, i) =>
	createMockParticipant({ id: `ps-${i}`, type: 'partial_server', isCancelled: false }),
);
const cancelledWalker = createMockParticipant({ id: 'c-1', type: 'walker', isCancelled: true });
const allParticipants = [...walkers, ...servers, ...waiting, ...partialServers, cancelledWalker];

const globalMountOptions = {
	global: {
		mocks: {
			$t: (key: string, params?: any) => {
				if (params) return `${key}`;
				return key;
			},
			$router: {
				push: vi.fn(),
			},
			$route: {
				params: { id: 'retreat-1' },
				path: '/app/retreats/retreat-1/dashboard',
				name: 'retreat-dashboard',
			},
		},
	},
};

async function flushAll() {
	// Flush microtasks and Vue reactivity
	for (let i = 0; i < 10; i++) {
		await nextTick();
		await new Promise(r => setTimeout(r, 0));
	}
}

async function mountDashboard() {
	const { api } = await import('@/services/api');
	(api.get as any).mockImplementation(async (url: string) => {
		if (url.includes('/retreats/')) return { data: mockRetreat };
		if (url.includes('/participants')) return { data: allParticipants };
		if (url.includes('/inventory')) return { data: [] };
		return { data: {} };
	});

	const pinia = createPinia();
	setActivePinia(pinia);

	const { useRetreatStore } = await import('@/stores/retreatStore');
	const { useParticipantStore } = await import('@/stores/participantStore');
	const retreatStore = useRetreatStore();
	const participantStore = useParticipantStore();

	// Pre-populate stores
	retreatStore.retreats = [mockRetreat as any];
	retreatStore.selectRetreat('retreat-1');
	participantStore.participants = allParticipants as any;

	const wrapper = mount(RetreatDashboardView, {
		...globalMountOptions,
		global: {
			...globalMountOptions.global,
			plugins: [pinia],
		},
	});

	// Wait for loadRetreatData to complete
	await flushAll();

	return { wrapper, retreatStore, participantStore };
}

describe('RetreatDashboardView', () => {
	beforeEach(() => {
		(window.localStorage as any)?._reset?.();
		setActivePinia(createPinia());
		vi.clearAllMocks();
		mockCanRead.mockReturnValue(true);
	});

	afterEach(() => {
		cleanupMocks();
	});

	describe('Rendering', () => {
		it('shows no retreat message when none selected', () => {
			const pinia = createPinia();
			setActivePinia(pinia);
			const wrapper = mount(RetreatDashboardView, {
				...globalMountOptions,
				global: { ...globalMountOptions.global, plugins: [pinia] },
			});
			expect(wrapper.text()).toContain('retreatDashboard.noRetreatSelected');
			wrapper.unmount();
		});

		it('renders hero header with parish name', async () => {
			const { wrapper } = await mountDashboard();
			expect(wrapper.text()).toContain('Parroquia San Juan');
			wrapper.unmount();
		});

		it('renders days until retreat badge', async () => {
			const { wrapper } = await mountDashboard();
			// The retreat is in the future, so it should show "days until retreat"
			expect(wrapper.text()).toContain('retreatDashboard.daysUntilRetreat');
			wrapper.unmount();
		});

		it('renders 4 stat cards', async () => {
			const { wrapper } = await mountDashboard();
			const text = wrapper.text();
			expect(text).toContain('retreatDashboard.walkersCount');
			expect(text).toContain('retreatDashboard.serversCount');
			expect(text).toContain('retreatDashboard.waitingCount');
			expect(text).toContain('sidebar.partialServers');
			wrapper.unmount();
		});

		it('shows correct walker count excluding cancelled', async () => {
			const { wrapper } = await mountDashboard();
			// 30 walkers, 1 cancelled walker should not be counted
			// The text should contain "30" as the walker count
			const text = wrapper.text();
			expect(text).toContain('30');
			wrapper.unmount();
		});

		it('shows correct server count', async () => {
			const { wrapper } = await mountDashboard();
			expect(wrapper.text()).toContain('10');
			wrapper.unmount();
		});

		it('shows waiting count', async () => {
			const { wrapper } = await mountDashboard();
			expect(wrapper.text()).toContain('3');
			wrapper.unmount();
		});

		it('shows partial servers count', async () => {
			const { wrapper } = await mountDashboard();
			expect(wrapper.text()).toContain('2');
			wrapper.unmount();
		});

		it('renders registration links section', async () => {
			const { wrapper } = await mountDashboard();
			expect(wrapper.text()).toContain('retreatDashboard.registrationLinks');
			expect(wrapper.text()).toContain('retreatDashboard.walkerRegistrationLink');
			expect(wrapper.text()).toContain('retreatDashboard.serverRegistrationLink');
			wrapper.unmount();
		});

		it('renders opening notes when present', async () => {
			const { wrapper } = await mountDashboard();
			expect(wrapper.text()).toContain('Welcome notes');
			wrapper.unmount();
		});

		it('renders closing notes when present', async () => {
			const { wrapper } = await mountDashboard();
			expect(wrapper.text()).toContain('Goodbye notes');
			wrapper.unmount();
		});

		it('renders things to bring notes', async () => {
			const { wrapper } = await mountDashboard();
			expect(wrapper.text()).toContain('Bring a Bible');
			wrapper.unmount();
		});

		it('renders payment information', async () => {
			const { wrapper } = await mountDashboard();
			const text = wrapper.text();
			expect(text).toContain('$100');
			expect(text).toContain('Pay by bank transfer');
			expect(text).toContain('Cash, Zelle');
			wrapper.unmount();
		});

		it('renders memory photo when URL is present', async () => {
			const { wrapper } = await mountDashboard();
			const img = wrapper.find('img');
			expect(img.exists()).toBe(true);
			expect(img.attributes('src')).toBe('https://example.com/photo.jpg');
			wrapper.unmount();
		});

		it('renders music playlist link when URL is present', async () => {
			const { wrapper } = await mountDashboard();
			const musicLink = wrapper.find('a[href="https://example.com/playlist"]');
			expect(musicLink.exists()).toBe(true);
			expect(musicLink.text()).toContain('retreatDashboard.listenMusic');
			wrapper.unmount();
		});
	});

	describe('Capacity calculations', () => {
		it('calculates walker percentage correctly', async () => {
			const { wrapper } = await mountDashboard();
			// 30/50 = 60%
			expect(wrapper.text()).toContain('60%');
			wrapper.unmount();
		});

		it('calculates server percentage correctly', async () => {
			const { wrapper } = await mountDashboard();
			// 10/20 = 50%
			expect(wrapper.text()).toContain('50%');
			wrapper.unmount();
		});

		it('shows capacity fraction in badge', async () => {
			const { wrapper } = await mountDashboard();
			expect(wrapper.text()).toContain('30/50');
			expect(wrapper.text()).toContain('10/20');
			wrapper.unmount();
		});
	});

	describe('Days until retreat', () => {
		it('shows positive days for future retreat', async () => {
			const { wrapper } = await mountDashboard();
			// mockRetreat startDate is 2026-06-15, today is 2026-04-09
			// Should show positive number
			expect(wrapper.text()).toContain('retreatDashboard.daysUntilRetreat');
			wrapper.unmount();
		});
	});

	describe('Interactions', () => {
		it('copies link to clipboard via copyLink', async () => {
			const { wrapper } = await mountDashboard();
			// Call the component's copyLink method directly
			await (wrapper.vm as any).copyLink('https://example.com/register');
			expect(mockClipboardWriteText).toHaveBeenCalledWith('https://example.com/register');
			wrapper.unmount();
		});

		it('opens link in new tab via openLink', async () => {
			const { wrapper } = await mountDashboard();
			(wrapper.vm as any).openLink('https://example.com/register');
			expect(mockWindowOpen).toHaveBeenCalledWith('https://example.com/register', '_blank');
			wrapper.unmount();
		});

		it('opens invite modal on button click', async () => {
			const { wrapper } = await mountDashboard();
			// Find the invite button by its text
			const inviteBtn = wrapper.findAll('button').find(b =>
				b.text().includes('retreatDashboard.inviteSomeone')
			);
			expect(inviteBtn).toBeDefined();
			if (inviteBtn) {
				await inviteBtn.trigger('click');
				await nextTick();
				// The invite modal component should now have isOpen=true
				const modal = wrapper.findComponent({ name: 'InviteUsersModal' });
				expect(modal.exists()).toBe(true);
			}
			wrapper.unmount();
		});
	});

	describe('Inventory alerts', () => {
		it('does not show inventory section when no alerts', async () => {
			const { wrapper } = await mountDashboard();
			// No inventory alerts were set, so the section should be hidden
			expect(wrapper.text()).not.toContain('retreatDashboard.inventoryAlerts');
			wrapper.unmount();
		});

		it('does not show inventory when user lacks permission', async () => {
			mockCanRead.mockReturnValue(false);
			const { wrapper } = await mountDashboard();
			expect(wrapper.text()).not.toContain('retreatDashboard.inventoryAlerts');
			wrapper.unmount();
		});
	});

	describe('Conditional rendering', () => {
		it('does not render notes sections when data is absent', async () => {
			const emptyRetreat = createMockRetreat({
				id: 'retreat-empty',
				parish: 'Empty Parish',
				startDate: new Date('2026-07-01'),
				openingNotes: null,
				closingNotes: null,
				thingsToBringNotes: null,
				cost: null,
				paymentInfo: null,
				paymentMethods: null,
				memoryPhotoUrl: null,
				musicPlaylistUrl: null,
			});

			const { api } = await import('@/services/api');
			(api.get as any).mockResolvedValue({ data: emptyRetreat });

			const pinia = createPinia();
			setActivePinia(pinia);

			const { useRetreatStore } = await import('@/stores/retreatStore');
			const { useParticipantStore } = await import('@/stores/participantStore');

			const retreatStore = useRetreatStore();
			retreatStore.retreats = [emptyRetreat as any];
			retreatStore.selectRetreat('retreat-empty');

			const participantStore = useParticipantStore();
			participantStore.participants = [] as any;

			const wrapper = mount(RetreatDashboardView, {
				...globalMountOptions,
				global: { ...globalMountOptions.global, plugins: [pinia] },
			});

			await nextTick();
			await nextTick();

			const text = wrapper.text();
			expect(text).not.toContain('Welcome notes');
			expect(text).not.toContain('Goodbye notes');
			expect(text).not.toContain('Bring a Bible');
			expect(text).not.toContain('retreatDashboard.paymentInformation');
			expect(text).not.toContain('retreatDashboard.retreatMemories');
			wrapper.unmount();
		});
	});
});
