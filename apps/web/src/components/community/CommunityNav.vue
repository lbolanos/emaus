<template>
  <div class="space-y-3">
    <!-- Breadcrumb: Communities › {name} -->
    <div class="flex items-center text-sm text-muted-foreground">
      <router-link
        :to="{ name: 'communities' }"
        class="hover:underline hover:text-foreground transition-colors"
      >
        {{ t('community.title') }}
      </router-link>
      <ChevronRight class="w-4 h-4 mx-1 shrink-0" />
      <span class="truncate">{{ communityName }}</span>
    </div>

    <!-- Sub-navigation: pills styled like @repo/ui's TabsList, but built from
         router-links: this navigates between pages, it doesn't switch panels
         within one page. -->
    <nav :aria-label="t('community.title')" class="w-full">
      <div
        class="flex w-full items-center gap-[3px] overflow-x-auto rounded-lg bg-muted p-[3px] text-muted-foreground"
      >
        <router-link
          v-for="item in navItems"
          :key="item.routeName"
          :to="{ name: item.routeName, params: { id: communityId } }"
          :aria-current="isActive(item) ? 'page' : undefined"
          class="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-3 py-1 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring"
          :class="
            isActive(item)
              ? 'bg-background text-foreground shadow-sm'
              : 'text-foreground hover:text-foreground hover:bg-background/50'
          "
        >
          <component :is="item.icon" class="h-4 w-4 shrink-0" />
          {{ t(item.label) }}
        </router-link>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ChevronRight } from 'lucide-vue-next';
import { useCommunityNav, type CommunityNavItem } from '@/composables/useCommunityNav';

const props = defineProps<{
	communityId: string;
}>();

const route = useRoute();
const { t } = useI18n();
const { communityName, items: navItems } = useCommunityNav(() => props.communityId);

const isActive = (item: CommunityNavItem) => route.name === item.routeName;
</script>
