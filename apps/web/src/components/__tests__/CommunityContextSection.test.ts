import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CommunityContextSection from '../layout/CommunityContextSection.vue';
import { useCommunityStore } from '@/stores/communityStore';

// Same stub approach as Sidebar.test.ts: mirrors the props the real
// SidebarMenuItem receives, exposing the resolved route for assertions.
vi.mock('@/components/layout/SidebarMenuItem.vue', () => ({
	default: {
		name: 'SidebarMenuItemStub',
		props: {
			item: Object,
			isCollapsedView: Boolean,
			isFocused: Boolean,
			globalIndex: Number,
			routeWithParams: null,
			badge: Number,
			badgeColor: String,
			isFavorite: Boolean,
		},
		template: `
			<div
				class="menu-item-stub"
				:data-route="item?.routeName"
				:data-params="JSON.stringify(routeWithParams)"
				:data-index="globalIndex"
			/>`,
	},
}));

describe('CommunityContextSection', () => {
	let wrapper: VueWrapper<any>;

	const mountSection = () =>
		mount(CommunityContextSection, {
			props: { communityId: 'community-1', isCollapsedView: false },
		});

	const setCommunity = (viewerRole: string | null) => {
		const communityStore = useCommunityStore();
		communityStore.currentCommunity = {
			id: 'community-1',
			name: 'Emaús del Valle',
			viewerRole,
		} as never;
	};

	const stubRoutes = () =>
		wrapper.findAll('.menu-item-stub').map(s => s.attributes('data-route'));

	beforeEach(() => {
		setActivePinia(createPinia());
	});

	afterEach(() => {
		wrapper?.unmount();
	});

	it('renders one item per community sub-page targeting the community id', () => {
		setCommunity('owner');
		wrapper = mountSection();

		const stubs = wrapper.findAll('.menu-item-stub');
		const routes = stubRoutes();
		expect(routes).toEqual([
			// Back link to the list, on top of the section.
			'communities',
			'community-dashboard',
			'community-members',
			'community-meetings',
			'community-attendance-stats',
			'community-admins',
			'community-templates',
		]);
		// The back link targets the list, without a community id.
		expect(stubs[0].attributes('data-params')).not.toContain('"id"');
		// Every sub-page item carries the community id as its route param.
		for (const stub of stubs.slice(1)) {
			expect(stub.attributes('data-params')).toContain('"id":"community-1"');
		}
		// Outside the keyboard flow, like the favorites rows.
		expect(stubs.every(s => s.attributes('data-index') === '-1')).toBe(true);
	});

	it('shows the community name as header', () => {
		setCommunity('admin');
		wrapper = mountSection();

		expect(wrapper.text()).toContain('Emaús del Valle');
	});

	it('falls back to the generic community label while loading', () => {
		wrapper = mountSection();

		expect(wrapper.text()).toContain('sidebar.sections.community');
	});

	it('ignores a previously loaded community until the requested one arrives', () => {
		const communityStore = useCommunityStore();
		communityStore.currentCommunity = {
			id: 'other-community',
			name: 'Otra comunidad',
			viewerRole: 'owner',
		} as never;
		wrapper = mountSection();

		expect(wrapper.text()).not.toContain('Otra comunidad');
		expect(wrapper.text()).toContain('sidebar.sections.community');
		expect(stubRoutes()).not.toContain('community-admins');
	});

	it('hides the admins item from members without a managing role', () => {
		setCommunity('member');
		wrapper = mountSection();

		expect(stubRoutes()).not.toContain('community-admins');
		expect(stubRoutes()).toContain('community-dashboard');
	});
});
