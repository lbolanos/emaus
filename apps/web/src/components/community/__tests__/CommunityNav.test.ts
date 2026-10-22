import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import CommunityNav from '../CommunityNav.vue';
import { useCommunityStore } from '@/stores/communityStore';

// The component highlights the active tab against route.name, so the mocked
// route must be mutable. Hoisted: referenced from the vi.mock factory.
const { mockRoute } = vi.hoisted(() => ({
	mockRoute: {
		name: 'community-dashboard',
		params: { id: 'community-1' },
		path: '/communities/community-1',
		query: {},
		fullPath: '/communities/community-1',
		meta: {},
		matched: [],
		hash: '',
	},
}));

vi.mock('vue-router', () => ({
	useRoute: () => mockRoute,
	useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// Deterministic stub: exposes the `to` target so assertions don't depend on
// VTU's default stub internals (props must be declared, see troubleshooting #26).
const RouterLinkStub = {
	props: ['to'],
	template: '<a :data-to="JSON.stringify(to)" data-testid="nav-link"><slot /></a>',
};

describe('CommunityNav', () => {
	let wrapper: VueWrapper<any>;

	const mountNav = () =>
		mount(CommunityNav, {
			props: { communityId: 'community-1' },
			global: {
				stubs: { 'router-link': RouterLinkStub },
			},
		});

	const setCommunity = (viewerRole: string | null) => {
		const communityStore = useCommunityStore();
		communityStore.currentCommunity = {
			id: 'community-1',
			name: 'Emaús del Valle',
			viewerRole,
		} as never;
	};

	const linkTargets = () =>
		wrapper.findAll('[data-testid="nav-link"]').map(l => l.attributes('data-to'));

	beforeEach(() => {
		setActivePinia(createPinia());
		mockRoute.name = 'community-dashboard';
		mockRoute.params = { id: 'community-1' };
	});

	afterEach(() => {
		wrapper?.unmount();
	});

	it('renders one link per community sub-page with the community id', () => {
		setCommunity('owner');
		wrapper = mountNav();

		const targets = linkTargets();
		expect(targets).toContain(JSON.stringify({ name: 'community-dashboard', params: { id: 'community-1' } }));
		expect(targets).toContain(JSON.stringify({ name: 'community-members', params: { id: 'community-1' } }));
		expect(targets).toContain(JSON.stringify({ name: 'community-meetings', params: { id: 'community-1' } }));
		expect(targets).toContain(JSON.stringify({ name: 'community-attendance-stats', params: { id: 'community-1' } }));
		expect(targets).toContain(JSON.stringify({ name: 'community-admins', params: { id: 'community-1' } }));
		expect(targets).toContain(JSON.stringify({ name: 'community-templates', params: { id: 'community-1' } }));
	});

	it('hides the admins link from members without a managing role', () => {
		setCommunity('member');
		wrapper = mountNav();

		const targets = linkTargets();
		expect(targets).not.toContain(JSON.stringify({ name: 'community-admins', params: { id: 'community-1' } }));
		expect(targets).toContain(JSON.stringify({ name: 'community-templates', params: { id: 'community-1' } }));
	});

	it('hides the admins link while the community is still loading', () => {
		// No fetchCommunity yet: currentCommunity null, viewerRole undefined.
		wrapper = mountNav();

		expect(linkTargets()).not.toContain(JSON.stringify({ name: 'community-admins', params: { id: 'community-1' } }));
	});

	it('marks the current page link as active', async () => {
		setCommunity('owner');
		mockRoute.name = 'community-members';
		wrapper = mountNav();
		await nextTick();

		const active = wrapper.findAll('[data-testid="nav-link"]').filter(l =>
			l.attributes('aria-current') === 'page',
		);
		expect(active).toHaveLength(1);
		expect(active[0].attributes('data-to')).toContain('community-members');
	});

	it('shows the community name in the breadcrumb once loaded', async () => {
		wrapper = mountNav();
		expect(wrapper.text()).not.toContain('Emaús del Valle');

		setCommunity('owner');
		await nextTick();
		expect(wrapper.text()).toContain('Emaús del Valle');
	});
});
