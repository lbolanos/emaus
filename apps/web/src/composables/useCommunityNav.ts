import { computed, toValue, type Component, type MaybeRefOrGetter } from 'vue';
import { useI18n } from 'vue-i18n';
import {
	Calendar,
	LayoutDashboard,
	MessageSquare,
	TrendingUp,
	UserCog,
	Users,
} from 'lucide-vue-next';
import { useCommunityStore } from '@/stores/communityStore';

export interface CommunityNavItem {
	routeName: string;
	label: string;
	icon: Component;
}

const MANAGING_ROLES = ['owner', 'admin', 'superadmin'];

/**
 * Pages of a community, shared by the in-page tabs (CommunityNav) and the
 * sidebar context section so both always list the same entries.
 *
 * The store keeps the last fetched community until the next fetch resolves,
 * so name and role are only trusted once `currentCommunity` is the requested
 * one: meanwhile the previous community's name or Admins entry never shows up.
 */
export function useCommunityNav(communityId: MaybeRefOrGetter<string>) {
	const { t } = useI18n();
	const communityStore = useCommunityStore();

	const community = computed(() => {
		const current = communityStore.currentCommunity;
		return current?.id === toValue(communityId) ? current : null;
	});

	const communityName = computed(
		() => community.value?.name ?? t('sidebar.sections.community'),
	);

	// Only community managers see the Admins entry (the route guard requires a
	// global role anyway).
	const canManageCommunity = computed(
		() => !!community.value && MANAGING_ROLES.includes(communityStore.viewerRole ?? ''),
	);

	const items = computed<CommunityNavItem[]>(() => {
		const list: CommunityNavItem[] = [
			{ routeName: 'community-dashboard', label: 'community.dashboard', icon: LayoutDashboard },
			{ routeName: 'community-members', label: 'community.membersLabel', icon: Users },
			{ routeName: 'community-meetings', label: 'community.meetings', icon: Calendar },
			{ routeName: 'community-attendance-stats', label: 'community.attendanceStats.title', icon: TrendingUp },
		];
		if (canManageCommunity.value) {
			list.push({ routeName: 'community-admins', label: 'community.adminsLabel', icon: UserCog });
		}
		list.push({ routeName: 'community-templates', label: 'community.templatesLabel', icon: MessageSquare });
		return list;
	});

	return { communityName, items };
}
