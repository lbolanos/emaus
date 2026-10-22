<template>
  <div class="mt-1">
    <!-- Way back to the community list, on top: the flat section is hidden
         while in context, so without this item the list is unreachable from
         the sidebar (only the in-page breadcrumb offers an exit). -->
    <SidebarMenuItem
      :item="backToListItem"
      :is-collapsed-view="isCollapsedView"
      :is-focused="false"
      :global-index="-1"
      :route-with-params="{ name: 'communities' }"
    />

    <!-- Header: community name. Always expanded (no accordion), unlike the
         flat sections: it only shows up once you're inside the community, so
         collapsing it by default makes no sense. -->
    <div class="px-2 py-1">
      <TooltipProvider :delay-duration="100">
        <Tooltip>
          <TooltipTrigger as-child>
            <div
              class="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider"
              :class="{ 'justify-center': isCollapsedView }"
            >
              <UsersRound class="w-4 h-4 shrink-0 text-blue-400" />
              <span v-if="!isCollapsedView" class="truncate normal-case">{{ communityName }}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent v-if="isCollapsedView" side="right">
            <p>{{ communityName }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <div class="space-y-1">
      <SidebarMenuItem
        v-for="item in items"
        :key="item.name"
        :item="item"
        :is-collapsed-view="isCollapsedView"
        :is-focused="false"
        :global-index="-1"
        :route-with-params="{ name: item.routeName, params: { id: communityId } }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
	ArrowLeft,
	Calendar,
	LayoutDashboard,
	MessageSquare,
	TrendingUp,
	UserCog,
	Users,
	UsersRound,
} from 'lucide-vue-next';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@repo/ui';
import SidebarMenuItem from '@/components/layout/SidebarMenuItem.vue';
import { useCommunityStore } from '@/stores/communityStore';

const props = defineProps<{
	communityId: string;
	isCollapsedView: boolean;
}>();

const { t } = useI18n();
const communityStore = useCommunityStore();

const communityName = computed(
	() => communityStore.currentCommunity?.name ?? t('sidebar.sections.community'),
);

// Same gating as CommunityNav: Admins only for community managers.
const canManageCommunity = computed(() =>
	['owner', 'admin', 'superadmin'].includes(communityStore.viewerRole ?? ''),
);

interface ContextMenuItem {
	name: string;
	routeName: string;
	icon: unknown;
	label: string;
}

const items = computed<ContextMenuItem[]>(() => {
	const base: ContextMenuItem[] = [
		{ name: 'community-context-dashboard', routeName: 'community-dashboard', icon: LayoutDashboard, label: 'community.dashboard' },
		{ name: 'community-context-members', routeName: 'community-members', icon: Users, label: 'community.membersLabel' },
		{ name: 'community-context-meetings', routeName: 'community-meetings', icon: Calendar, label: 'community.meetings' },
		{ name: 'community-context-attendance', routeName: 'community-attendance-stats', icon: TrendingUp, label: 'community.attendanceStats.title' },
	];
	if (canManageCommunity.value) {
		base.push({ name: 'community-context-admins', routeName: 'community-admins', icon: UserCog, label: 'community.adminsLabel' });
	}
	base.push({ name: 'community-context-templates', routeName: 'community-templates', icon: MessageSquare, label: 'community.templatesLabel' });
	return base;
});

// Exit link above the header: goes to the list, so it carries no community id.
const backToListItem = {
	name: 'community-context-back-to-list',
	routeName: 'communities',
	icon: ArrowLeft,
	label: 'sidebar.communities',
};
</script>
