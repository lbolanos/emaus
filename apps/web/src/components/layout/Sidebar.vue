<template>
  <aside
    ref="sidebarRef"
    class="bg-gray-800 text-white flex flex-col dark transition-all duration-300 ease-in-out focus:outline-none shadow-xl h-full"
    :class="isMobile ? 'w-64' : (isSidebarCollapsed ? 'w-20' : 'w-64')"
    tabindex="0"
    @keydown.up.prevent="navigateUp"
    @keydown.down.prevent="navigateDown"
    @keydown.enter.prevent="activateCurrentItem"
    @keydown.space.prevent="activateCurrentItem"
    @keydown.esc.prevent="handleEscape"
  >
    <!-- Logo + collapse button -->
    <div class="h-14 flex items-center justify-center relative px-3">
      <router-link to="/" class="flex items-center gap-2">
        <img src="/crossRoseButtT.png" alt="Emmaus Rose" class="w-8 h-8" />
        <span v-if="!isCollapsedView" class="text-xl font-light tracking-widest uppercase">{{ $t('landing.emmaus') }}</span>
      </router-link>
      <button
        v-if="!isMobile"
        @click="uiStore.toggleSidebar"
        class="absolute right-0 top-1/2 transform -translate-y-1/2 translate-x-1/2 bg-gray-700 hover:bg-gray-600 rounded-full p-1 z-10 transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500"
        :title="isSidebarCollapsed ? 'Expandir sidebar' : 'Contraer sidebar'"
      >
        <ChevronLeft class="w-5 h-5 transition-transform duration-300" :class="{ 'rotate-180': isSidebarCollapsed }" />
      </button>
    </div>

    <!-- User dropdown -->
    <div class="px-3 py-2 border-t border-gray-700">
      <div v-if="auth.isAuthenticated && auth.user">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button
              class="w-full flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-gray-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              :class="{ 'justify-center': isCollapsedView }"
            >
              <div class="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center shrink-0">
                <UserIcon class="w-4 h-4 text-gray-300" />
              </div>
              <div v-if="!isCollapsedView" class="flex-1 min-w-0 text-left">
                <div class="text-sm font-medium truncate">{{ auth.user.displayName }}</div>
                <template v-if="isRetreatSection">
                  <div v-if="currentRetreatRole" class="text-xs text-blue-400 truncate">
                    {{ currentRetreatRole.name }}
                  </div>
                  <div v-else-if="retreatStore.selectedRetreatId" class="text-xs text-gray-500">
                    No role
                  </div>
                </template>
              </div>
              <ChevronDown v-if="!isCollapsedView" class="w-4 h-4 text-gray-400 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent :side="isCollapsedView ? 'right' : 'bottom'" :align="isCollapsedView ? 'start' : 'start'" class="w-56">
            <DropdownMenuLabel>
              <div>{{ auth.user.displayName }}</div>
              <div v-if="isRetreatSection && currentRetreatRole" class="text-xs font-normal text-muted-foreground">
                {{ currentRetreatRole.name }}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <!-- Language sub-menu -->
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Languages class="w-4 h-4 mr-2" />
                {{ $t('language.label') || 'Idioma' }}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem @click="setLocale('en')">
                  {{ $t('language.english') }}
                  <span v-if="locale === 'en'" class="ml-auto text-blue-500">✓</span>
                </DropdownMenuItem>
                <DropdownMenuItem @click="setLocale('es')">
                  {{ $t('language.spanish') }}
                  <span v-if="locale === 'es'" class="ml-auto text-blue-500">✓</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem @click="isHelpPanelOpen = true">
              <HelpCircle class="w-4 h-4 mr-2" />
              {{ $t('help.button.tooltip') }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="handleLogout" class="text-red-400 focus:text-red-400">
              <LogOut class="w-4 h-4 mr-2" />
              {{ $t('sidebar.logout') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <!-- Search: toggle button + input -->
    <div class="px-3 py-1.5 border-t border-gray-700">
      <div v-if="!isSearchOpen" class="flex justify-center">
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                @click="openSearch"
                class="flex items-center gap-2 px-2 py-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-all duration-200"
                :class="{ 'w-full justify-center': isCollapsedView }"
              >
                <Search class="w-4 h-4" />
                <span v-if="!isCollapsedView" class="text-sm">{{ $t('sidebar.searchPlaceholder') || 'Buscar...' }}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent v-if="isCollapsedView" side="right">
              <p>{{ $t('sidebar.searchPlaceholder') || 'Buscar...' }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div v-else>
        <div class="relative">
          <input
            ref="searchInput"
            id="sidebar-search"
            v-model="searchQuery"
            type="search"
            autocomplete="off"
            :aria-label="$t('sidebar.searchPlaceholder') || 'Search'"
            :placeholder="$t('sidebar.searchPlaceholder') || 'Buscar...'"
            class="w-full px-3 py-2 bg-gray-700 text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
            @input="handleSearch"
            @keydown.down.prevent="handleSearchKeydown"
            @keydown.esc.prevent="closeSearch"
          />
          <button
            @click="closeSearch"
            class="absolute right-3 top-2.5 text-gray-400 hover:text-white transition-colors duration-200"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
        <div v-if="searchQuery" class="mt-2 text-xs text-gray-400">
          {{ allMenuItems.length }} {{ allMenuItems.length === 1 ? $t('sidebar.searchResult') : $t('sidebar.searchResultPlural') }}
        </div>
      </div>
    </div>

    <nav class="flex flex-col flex-1 min-h-0">
      <div class="flex-1 px-2 py-1 space-y-0 overflow-y-auto min-h-0">

        <!-- Non-retreat top sections (community, social) -->
        <template v-for="section in topNonRetreatSections" :key="section.category">
          <SidebarSection
            :section="section"
            :is-collapsed-view="isCollapsedView"
            :is-section-collapsed="isSectionCollapsed(section.category)"
            @toggle="toggleSection(section.category)"
          >
            <template v-for="item in section.items" :key="item.name">
              <SidebarMenuItem
                :item="item"
                :is-collapsed-view="isCollapsedView"
                :is-focused="isItemFocused(item)"
                :global-index="getGlobalItemIndex(item)"
                :route-with-params="getRouteWithParams(item)"
                @mouseenter="setFocusedIndex(item)"
                @focus="setFocusedIndex(item)"
              />
            </template>
          </SidebarSection>
        </template>

        <!-- ===== RETIRO PARENT GROUP ===== -->
        <div v-if="(topRetreatSections.length > 0 || !isCollapsedView) && (!searchQuery.trim() || topRetreatSections.length > 0)" class="mt-1">
          <!-- Retiro parent header -->
          <div class="px-2 py-2">
            <TooltipProvider :delay-duration="100">
              <Tooltip>
                <TooltipTrigger as-child>
                  <button
                    @click="toggleRetreatGroup"
                    class="w-full flex items-center justify-between text-xs font-bold text-amber-400 uppercase tracking-wider hover:text-amber-300 transition-all duration-200 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 rounded px-2 py-1.5 group"
                    :class="{ 'justify-center': isCollapsedView }"
                    :aria-expanded="!isRetreatGroupCollapsed"
                  >
                    <div class="flex items-center gap-2">
                      <Cross class="w-4 h-4" />
                      <span v-if="!isCollapsedView">{{ $t('sidebar.sections.retreat') || 'Retiro' }}</span>
                    </div>
                    <ChevronDown
                      v-if="!isCollapsedView"
                      class="w-4 h-4 transition-all duration-200 text-amber-500 group-hover:text-amber-300"
                      :class="{ 'rotate-180': isRetreatGroupCollapsed }"
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent v-if="isCollapsedView" side="right">
                  <p>{{ $t('sidebar.sections.retreat') || 'Retiro' }}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <!-- Retiro group content (retreat selector + all retreat sections) -->
          <div
            class="overflow-hidden transition-all duration-300 ease-in-out"
            :class="{
              'max-h-0 opacity-0': isRetreatGroupCollapsed && !searchQuery.trim(),
              'max-h-[2000px] opacity-100': !isRetreatGroupCollapsed || searchQuery.trim()
            }"
          >
            <!-- Retreat Selector (inside retreat parent) -->
            <div v-if="!isCollapsedView" class="px-3 py-2 mx-2 mb-2 bg-gray-750 rounded-md border border-gray-700">
              <div v-if="retreatStore.loading" class="text-sm text-gray-400">{{ $t('sidebar.loadingRetreats') }}</div>
              <div v-else-if="retreatStore.retreats.length === 0" class="text-center">
                <p class="text-sm text-gray-400 mb-2">{{ $t('sidebar.noRetreatsFound') }}</p>
                <Button @click="isAddModalOpen = true" class="w-full" size="sm" :title="$t('sidebar.addRetreat')">
                  <Plus class="w-4 h-4 mr-2" />
                  {{ $t('sidebar.addRetreat') }}
                </Button>
              </div>
              <div v-else class="space-y-2">
                <Select v-model="retreatStore.selectedRetreatId as string">
                  <SelectTrigger id="retreat-selector" class="bg-gray-700 border-gray-600 text-white text-sm">
                    <SelectValue :placeholder="$t('sidebar.selectRetreat')" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem v-for="retreat in retreatStore.retreats" :key="retreat.id" :value="retreat.id">
                        {{ retreat.parish }} - {{ formatDate(retreat.startDate) }}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <div class="flex items-center gap-2">
                  <Button @click="isAddModalOpen = true" variant="outline" size="icon" class="border-gray-600 text-gray-300 hover:text-white hover:bg-gray-700" :title="$t('sidebar.addRetreat')">
                    <Plus class="w-4 h-4" />
                  </Button>
                  <Button
                    v-if="retreatStore.selectedRetreatId"
                    @click="isEditModalOpen = true"
                    variant="outline"
                    size="icon"
                    class="border-gray-600 text-gray-300 hover:text-white hover:bg-gray-700"
                    :title="$t('common.edit')"
                  >
                    <EditIcon class="w-4 h-4" />
                  </Button>
                </div>
                <!-- Permission refresh indicator -->
                <div v-if="authStore.refreshingProfile" class="flex items-center text-xs text-blue-400">
                  <svg class="animate-spin mr-2 h-3 w-3 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Updating permissions...
                </div>
              </div>
            </div>

            <!-- Retreat sub-sections -->
            <div class="pl-1">
              <template v-for="section in topRetreatSections" :key="section.category">
                <SidebarSection
                  :section="section"
                  :is-collapsed-view="isCollapsedView"
                  :is-section-collapsed="isSectionCollapsed(section.category)"
                  @toggle="toggleSection(section.category)"
                >
                  <template v-for="item in section.items" :key="item.name">
                    <SidebarMenuItem
                      :item="item"
                      :is-collapsed-view="isCollapsedView"
                      :is-focused="isItemFocused(item)"
                      :global-index="getGlobalItemIndex(item)"
                      :route-with-params="getRouteWithParams(item)"
                      @mouseenter="setFocusedIndex(item)"
                      @focus="setFocusedIndex(item)"
                    />
                  </template>
                </SidebarSection>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Sections -->
      <div class="px-2 py-4 border-t border-gray-700">
        <template v-for="section in filteredMenuSections.filter(s => s.position === 'bottom')" :key="section.category">
          <SidebarSection
            :section="section"
            :is-collapsed-view="isCollapsedView"
            :is-section-collapsed="isSectionCollapsed(section.category)"
            @toggle="toggleSection(section.category)"
          >
            <template v-for="item in section.items" :key="item.name">
              <SidebarMenuItem
                :item="item"
                :is-collapsed-view="isCollapsedView"
                :is-focused="isItemFocused(item)"
                :global-index="getGlobalItemIndex(item)"
                :route-with-params="getRouteWithParams(item)"
                @mouseenter="setFocusedIndex(item)"
                @focus="setFocusedIndex(item)"
              />
            </template>
          </SidebarSection>
        </template>
      </div>
    </nav>
  </aside>

  <!-- Modals & Panels (teleported) -->
  <RetreatModal
    :open="isAddModalOpen"
    mode="add"
    @update:open="isAddModalOpen = $event"
    @submit="handleAddRetreat"
  />
  <RetreatModal
    :open="isEditModalOpen"
    mode="edit"
    :retreat="retreatStore.selectedRetreat"
    @update:open="isEditModalOpen = $event"
    @update="handleEditRetreat"
  />
  <HelpPanel :open="isHelpPanelOpen" @close="isHelpPanelOpen = false" />
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { ref, computed, nextTick, onMounted, watch } from 'vue';
import { LogOut, Users, UtensilsCrossed, LayoutDashboard, ChevronLeft, Home, Ban, Bed, HandHeart, DollarSign, NotebookPen, Building, UsersRound, Salad, FileX, UserCheck, ShoppingBag, Pill, UserCog, Table, Settings, Package, Globe, Briefcase, Search, X, ArrowRight, ChevronDown, Lock, CreditCard, Activity, KeyRound, Heart, UserPlus, UserCircle, MessageSquare, Clock, Plus, Edit as EditIcon, HelpCircle, Cross, User as UserIcon, Languages } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/authStore';
import { useRouter, useRoute } from 'vue-router';
import { Button } from '@repo/ui';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@repo/ui';
import { useRetreatStore } from '@/stores/retreatStore';
import { useUIStore } from '@/stores/ui';
import { useAuthPermissions } from '@/composables/useAuthPermissions';
import { useCommunityStore } from '@/stores/communityStore';
import { useRouteContext } from '@/composables/useRouteContext';
import { formatDate } from '@repo/utils';
import type { CreateRetreat, Retreat } from '@repo/types';
import RetreatModal from '@/components/RetreatModal.vue';
import HelpPanel from '@/components/HelpPanel.vue';
import SidebarSection from '@/components/layout/SidebarSection.vue';
import { useI18n } from 'vue-i18n';
import { storeLocale } from '@/i18n';
import SidebarMenuItem from '@/components/layout/SidebarMenuItem.vue';

type PermissionType = 'retreat' | 'participant' | 'table' | 'house' | 'user' | 'retreatInventory' | 'inventoryItem' | 'payment' | 'responsability' | 'messageTemplate' | 'superadmin';

export interface MenuItem {
  name: string;
  routeName: string;
  icon: any;
  permission?: PermissionType;
  requiresRetreat?: boolean;
  label: string;
  category?: string;
  href?: string;
  onClick?: () => void;
}

export interface MenuSection {
  category: string;
  items: MenuItem[];
  isCollapsed?: boolean;
  position: 'top' | 'bottom';
}

const RETREAT_CATEGORIES = ['main', 'people', 'assignments', 'financial', 'reports', 'services', 'administration'];

const auth = useAuthStore();
const authStore = useAuthStore();
const router = useRouter();
const retreatStore = useRetreatStore();
const communityStore = useCommunityStore();
const uiStore = useUIStore();
const { isSidebarCollapsed, isMobile } = storeToRefs(uiStore);
const { can, currentRetreatRole } = useAuthPermissions();
const route = useRoute();
const { isRetreatSection, currentSectionTitle } = useRouteContext();
const { locale, t } = useI18n();

const setLocale = (lang: string) => {
  locale.value = lang;
  storeLocale(lang);
};

// Computed: in mobile we never show collapsed view (always expanded in drawer)
const isCollapsedView = computed(() => !isMobile.value && isSidebarCollapsed.value);

const sidebarRef = ref<HTMLElement>();
const searchInput = ref<HTMLInputElement>();
const searchQuery = ref('');
const focusedIndex = ref(-1);
const isSearchFocused = ref(false);
const isSearchOpen = ref(false);
const collapsedSections = ref<Record<string, boolean>>({});
const expandedWhenCollapsed = ref<string | null>(null);

// Retreat parent group state
const isRetreatGroupCollapsed = ref(
  JSON.parse(localStorage.getItem('sidebar-retreat-group-collapsed') || 'false')
);

watch(isRetreatGroupCollapsed, (val) => {
  localStorage.setItem('sidebar-retreat-group-collapsed', JSON.stringify(val));
});

const toggleRetreatGroup = () => {
  const wasCollapsed = isRetreatGroupCollapsed.value;
  if (wasCollapsed) {
    // Opening retreat group: collapse all other sections
    Object.keys(collapsedSections.value).forEach(key => {
      collapsedSections.value[key] = true;
    });
    saveCollapsedState();
  }
  isRetreatGroupCollapsed.value = !wasCollapsed;
};

// Header-absorbed state
const isAddModalOpen = ref(false);
const isEditModalOpen = ref(false);
const isHelpPanelOpen = ref(false);

// Auto-close mobile menu on navigation
watch(() => route.fullPath, () => {
  if (isMobile.value) uiStore.closeMobileMenu();
});

// Watch retreat selection to refresh permissions (moved from Header)
watch(
  () => retreatStore.selectedRetreatId,
  async (newId, oldId) => {
    if (newId && newId !== oldId) {
      await authStore.refreshUserProfile();
    }
  },
);

// Load collapsed state from localStorage
const loadCollapsedState = () => {
  try {
    const saved = localStorage.getItem('sidebar-collapsed-sections');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Ensure only one section is open (accordion)
      const openKeys = Object.keys(parsed).filter(k => !parsed[k]);
      if (openKeys.length > 1) {
        Object.keys(parsed).forEach(k => { parsed[k] = true; });
        parsed[openKeys[0]] = false;
      }
      collapsedSections.value = parsed;
    } else {
      menuSections.forEach(section => {
        collapsedSections.value[section.category] = true;
      });
      saveCollapsedState();
    }
  } catch (error) {
    console.error('Failed to load collapsed state:', error);
    menuSections.forEach(section => {
      collapsedSections.value[section.category] = true;
    });
  }
};

const saveCollapsedState = () => {
  try {
    localStorage.setItem('sidebar-collapsed-sections', JSON.stringify(collapsedSections.value));
  } catch (error) {
    console.error('Failed to save collapsed state:', error);
  }
};

const menuSections: MenuSection[] = [
  {
    category: 'community',
    items: [
      {
        name: 'communities',
        routeName: 'communities',
        icon: UsersRound,
        requiresRetreat: false,
        label: 'sidebar.communities'
      }
    ],
    position: 'top'
  },
  {
    category: 'social',
    items: [
      {
        name: 'my-profile',
        routeName: 'profile',
        icon: UserCircle,
        requiresRetreat: false,
        label: 'sidebar.myProfile'
      },
      {
        name: 'search-users',
        routeName: 'search-users',
        icon: Search,
        requiresRetreat: false,
        label: 'sidebar.searchUsers'
      },
      {
        name: 'friends',
        routeName: 'friends',
        icon: Heart,
        requiresRetreat: false,
        label: 'sidebar.friends'
      },
      {
        name: 'followers',
        routeName: 'followers',
        icon: UserPlus,
        requiresRetreat: false,
        label: 'sidebar.followers'
      },
      {
        name: 'testimonials',
        routeName: 'testimonials',
        icon: MessageSquare,
        requiresRetreat: false,
        label: 'sidebar.testimonials'
      },
      {
        name: 'my-retreats',
        routeName: 'my-retreats',
        icon: Clock,
        requiresRetreat: false,
        label: 'sidebar.myRetreats'
      }
    ],
    position: 'top'
  },
  {
    category: 'main',
    items: [
      {
        name: 'dashboard',
        routeName: 'retreat-dashboard',
        icon: LayoutDashboard,
        requiresRetreat: true,
        label: 'sidebar.retreatDashboard'
      }
    ],
    position: 'top'
  },
  {
    category: 'people',
    items: [
      {
        name: 'walkers',
        routeName: 'walkers',
        icon: Users,
        permission: 'participant',
        requiresRetreat: true,
        label: 'sidebar.walkers'
      },
      {
        name: 'servers',
        routeName: 'servers',
        icon: UtensilsCrossed,
        permission: 'participant',
        requiresRetreat: true,
        label: 'sidebar.servers'
      },
      {
        name: 'partial-servers',
        routeName: 'partial-servers',
        icon: Users,
        permission: 'participant',
        requiresRetreat: true,
        label: 'sidebar.partialServers'
      },
      {
        name: 'waiting-list',
        routeName: 'waiting-list',
        icon: UserCheck,
        requiresRetreat: true,
        label: 'sidebar.waitingList'
      },
      {
        name: 'canceled',
        routeName: 'canceled',
        icon: Ban,
        requiresRetreat: true,
        label: 'sidebar.canceled'
      }
    ],
    position: 'top'
  },
  {
    category: 'assignments',
    items: [
      {
        name: 'tables',
        routeName: 'tables',
        icon: Table,
        permission: 'table',
        requiresRetreat: true,
        label: 'sidebar.tables'
      },
      {
        name: 'responsibilities',
        routeName: 'responsibilities',
        icon: Briefcase,
        permission: 'responsability',
        requiresRetreat: true,
        label: 'sidebar.responsibilities'
      },
      {
        name: 'inventory',
        routeName: 'inventory',
        icon: Package,
        permission: 'retreatInventory',
        requiresRetreat: true,
        label: 'sidebar.inventory'
      },
      {
        name: 'palancas',
        routeName: 'palancas',
        icon: HandHeart,
        requiresRetreat: true,
        label: 'sidebar.palancas'
      },
      {
        name: 'user-type-table',
        routeName: 'user-type-and-table',
        icon: UsersRound,
        requiresRetreat: true,
        label: 'sidebar.userTypeAndTable'
      },
      {
        name: 'bed-assignments',
        routeName: 'bed-assignments',
        icon: Bed,
        requiresRetreat: true,
        label: 'sidebar.bedAssignments'
      }
    ],
    position: 'top'
  },
  {
    category: 'financial',
    items: [
      {
        name: 'payments',
        routeName: 'payments',
        icon: DollarSign,
        permission: 'payment',
        requiresRetreat: true,
        label: 'sidebar.payments'
      }
    ],
    position: 'top'
  },
  {
    category: 'reports',
    items: [
      {
        name: 'notes',
        routeName: 'notes-and-meeting-points',
        icon: NotebookPen,
        requiresRetreat: true,
        label: 'sidebar.notesAndMeetingPoints'
      },
      {
        name: 'cancellations',
        routeName: 'cancellation-and-notes',
        icon: FileX,
        requiresRetreat: true,
        label: 'sidebar.cancellationAndNotes'
      },
      {
        name: 'bags-report',
        routeName: 'bags-report',
        icon: ShoppingBag,
        requiresRetreat: true,
        label: 'sidebar.bagsReport'
      },
      {
        name: 'walker-badges',
        routeName: 'walker-badges',
        icon: CreditCard,
        permission: 'participant',
        requiresRetreat: true,
        label: 'sidebar.walkerBadges'
      },
      {
        name: 'medicines-report',
        routeName: 'medicines-report',
        icon: Pill,
        requiresRetreat: true,
        label: 'sidebar.medicinesReport'
      },
      {
        name: 'rooms',
        routeName: 'rooms',
        icon: Building,
        permission: 'house',
        requiresRetreat: true,
        label: 'sidebar.rooms'
      }
    ],
    position: 'top'
  },
  {
    category: 'services',
    items: [
      {
        name: 'food',
        routeName: 'food',
        icon: Salad,
        requiresRetreat: true,
        label: 'sidebar.food'
      }
    ],
    position: 'top'
  },
  {
    category: 'administration',
    items: [
      {
        name: 'role-management',
        routeName: 'role-management',
        icon: UserCog,
        requiresRetreat: true,
        label: 'sidebar.roleManagement'
      },
      {
        name: 'message-templates',
        routeName: 'message-templates',
        icon: Settings,
        permission: 'messageTemplate',
        requiresRetreat: true,
        label: 'sidebar.settings.messageTemplates'
      },
    ],
    position: 'top'
  },
  {
    category: 'settings',
    items: [
      {
        name: 'global-message-templates',
        routeName: 'global-message-templates',
        icon: Globe,
        label: 'sidebar.settings.globalMessageTemplates',
        requiresRetreat: false,
        permission: 'superadmin'
      },
      {
        name: 'inventory-items',
        routeName: 'inventory-items',
        icon: Package,
        permission: 'inventoryItem',
        requiresRetreat: false,
        label: 'sidebar.settings.inventoryItems'
      },
      {
        name: 'houses',
        routeName: 'houses',
        icon: Home,
        permission: 'house',
        requiresRetreat: false,
        label: 'sidebar.houses'
      },
      {
        name: 'telemetry',
        routeName: 'telemetry',
        icon: Activity,
        label: 'sidebar.telemetry',
        requiresRetreat: false,
        permission: 'superadmin'
      },
      {
        name: 'change-password',
        routeName: 'change-password',
        icon: KeyRound,
        requiresRetreat: false,
        label: 'sidebar.settings.changePassword'
      }
    ],
    position: 'bottom'
  }
];

const filteredMenuSections = computed(() => {
  return menuSections.map(section => {
    const filteredItems = section.items.filter(item => {
      if (item.requiresRetreat && !retreatStore.selectedRetreatId) return false;
      if (item.permission === 'superadmin' && !auth.userProfile?.roles?.some(role => role.role.name === 'superadmin')) return false;

      if (item.name === 'communities') {
        const isSuperadmin = auth.userProfile?.roles?.some(role => role.role.name === 'superadmin');
        const hasCommunities = communityStore.communities.length > 0;
        if (!isSuperadmin && !hasCommunities) return false;
      }

      if (item.name === 'role-management') {
        const hasUserManage = can.manage('user');
        if (!hasUserManage) return false;
      }

      if (item.permission && item.permission !== 'superadmin' && item.name !== 'role-management' && item.name !== 'communities') {
        const hasPermission = can.read(item.permission);
        if (!hasPermission) return false;
      }

      if (searchQuery.value.trim()) {
        const query = searchQuery.value.toLowerCase();
        const translatedLabel = t(item.label).toLowerCase();
        return translatedLabel.includes(query) || item.name.toLowerCase().includes(query);
      }

      return true;
    });

    return {
      ...section,
      items: filteredItems,
      isVisible: filteredItems.length > 0
    };
  }).filter(section => section.isVisible);
});

// Split top sections into retreat vs non-retreat
const topNonRetreatSections = computed(() =>
  filteredMenuSections.value.filter(s => s.position === 'top' && !RETREAT_CATEGORIES.includes(s.category))
);

const topRetreatSections = computed(() =>
  filteredMenuSections.value.filter(s => s.position === 'top' && RETREAT_CATEGORIES.includes(s.category))
);

const allMenuItems = computed(() => {
  return filteredMenuSections.value.flatMap(section => section.items);
});

const currentActiveSection = computed(() => {
  const currentRouteName = route.name as string;
  return filteredMenuSections.value.find(section =>
    section.items.some(item => item.routeName === currentRouteName)
  )?.category;
});

// Auto-expand retreat group when navigating to a retreat route
watch(currentActiveSection, (section) => {
  if (section && RETREAT_CATEGORIES.includes(section) && isRetreatGroupCollapsed.value) {
    isRetreatGroupCollapsed.value = false;
  }
});

const isSectionCollapsed = (category: string) => {
  // When searching, always show all sections expanded
  if (searchQuery.value.trim()) return false;

  if (isCollapsedView.value) {
    if (expandedWhenCollapsed.value === category) return false;
    if (currentActiveSection.value === category) return false;
    return true;
  }
  return collapsedSections.value[category] ?? false;
};

const toggleSection = (category: string) => {
  if (isCollapsedView.value) {
    if (expandedWhenCollapsed.value === category) {
      expandedWhenCollapsed.value = null;
    } else {
      expandedWhenCollapsed.value = category;
    }
    return;
  }

  const isCurrentlyCollapsed = collapsedSections.value[category] ?? false;
  const isOpening = isCurrentlyCollapsed;

  // Accordion: collapse all sections first
  Object.keys(collapsedSections.value).forEach(key => {
    collapsedSections.value[key] = true;
  });

  // Toggle the clicked section
  collapsedSections.value[category] = !isCurrentlyCollapsed;

  // If opening a non-retreat section, collapse the retreat group
  // If opening a retreat sub-section, collapse non-retreat sections (already done above)
  if (isOpening && !RETREAT_CATEGORIES.includes(category)) {
    isRetreatGroupCollapsed.value = true;
  }

  saveCollapsedState();
};

const getGlobalItemIndex = (item: MenuItem) => {
  return allMenuItems.value.findIndex(menuItem => menuItem.name === item.name);
};

const setFocusedIndex = (item: MenuItem) => {
  const index = getGlobalItemIndex(item);
  if (index !== -1) {
    focusedIndex.value = index;
  }
};

const isItemFocused = (item: MenuItem) => {
  return focusedIndex.value === getGlobalItemIndex(item);
};

const focusedMenuItem = computed(() => {
  if (focusedIndex.value >= 0 && focusedIndex.value < allMenuItems.value.length) {
    return allMenuItems.value[focusedIndex.value];
  }
  return null;
});

const handleLogout = async () => {
  await auth.logout();
  router.push('/login');
};

const openSearch = () => {
  isSearchOpen.value = true;
  if (isCollapsedView.value) {
    uiStore.toggleSidebar();
  }
  nextTick(() => {
    searchInput.value?.focus();
  });
};

const closeSearch = () => {
  searchQuery.value = '';
  focusedIndex.value = -1;
  isSearchOpen.value = false;
};

const clearSearch = () => {
  searchQuery.value = '';
  focusedIndex.value = -1;
  nextTick(() => {
    searchInput.value?.focus();
  });
};

const handleSearch = () => {
  focusedIndex.value = searchQuery.value.trim() ? 0 : -1;
};

const handleSearchKeydown = () => {
  if (allMenuItems.value.length > 0) {
    focusedIndex.value = 0;
    isSearchFocused.value = false;
    sidebarRef.value?.focus();
  }
};

const navigateUp = () => {
  if (allMenuItems.value.length === 0) return;
  let newIndex = focusedIndex.value <= 0 ? allMenuItems.value.length - 1 : focusedIndex.value - 1;
  let attempts = 0;
  while (attempts < allMenuItems.value.length) {
    const item = allMenuItems.value[newIndex];
    const section = filteredMenuSections.value.find(s => s.items.some(i => i.name === item.name));
    if (section && !isSectionCollapsed(section.category)) {
      focusedIndex.value = newIndex;
      scrollFocusedItemIntoView();
      return;
    }
    newIndex = newIndex <= 0 ? allMenuItems.value.length - 1 : newIndex - 1;
    attempts++;
  }
};

const navigateDown = () => {
  if (allMenuItems.value.length === 0) return;
  let newIndex = focusedIndex.value >= allMenuItems.value.length - 1 ? 0 : focusedIndex.value + 1;
  let attempts = 0;
  while (attempts < allMenuItems.value.length) {
    const item = allMenuItems.value[newIndex];
    const section = filteredMenuSections.value.find(s => s.items.some(i => i.name === item.name));
    if (section && !isSectionCollapsed(section.category)) {
      focusedIndex.value = newIndex;
      scrollFocusedItemIntoView();
      return;
    }
    newIndex = newIndex >= allMenuItems.value.length - 1 ? 0 : newIndex + 1;
    attempts++;
  }
};

const activateCurrentItem = () => {
  if (focusedMenuItem.value) {
    const routesRequiringId = [
      'retreat-dashboard',
      'bed-assignments',
      'responsibilities',
      'inventory',
      'role-management'
    ];
    const params = routesRequiringId.includes(focusedMenuItem.value.routeName)
      ? { id: retreatStore.selectedRetreatId }
      : undefined;
    router.push({
      name: focusedMenuItem.value.routeName,
      params
    });
  }
};

const handleEscape = () => {
  focusedIndex.value = -1;
  searchQuery.value = '';
  isSearchOpen.value = false;
};

const scrollFocusedItemIntoView = () => {
  nextTick(() => {
    const focusedElement = document.querySelector(`[data-menu-item-index="${focusedIndex.value}"]`);
    if (focusedElement) {
      focusedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
};

const getCategoryTitle = (category?: string) => {
  if (!category) return '';
  return `sidebar.sections.${category}`;
};

const getRouteWithParams = (item: MenuItem) => {
  const route: any = { name: item.routeName };
  const routesRequiringId = [
    'retreat-dashboard',
    'bed-assignments',
    'responsibilities',
    'inventory',
    'role-management'
  ];
  if (item.routeName && routesRequiringId.includes(item.routeName)) {
    if (!retreatStore.selectedRetreatId) return null;
    route.params = { id: retreatStore.selectedRetreatId };
  }
  return route;
};

// Header-absorbed handlers
const handleAddRetreat = async (retreatData: CreateRetreat) => {
  try {
    await retreatStore.createRetreat(retreatData);
    isAddModalOpen.value = false;
  } catch (err) {
    console.error('Failed to create retreat:', err);
  }
};

const handleEditRetreat = async (retreatData: Partial<Retreat> & { id: string; _refreshBeds?: boolean }) => {
  try {
    const { _refreshBeds, ...data } = retreatData;
    await retreatStore.updateRetreat(data as Retreat, _refreshBeds);
    isEditModalOpen.value = false;
  } catch (err) {
    console.error('Failed to update retreat:', err);
  }
};

watch(isSidebarCollapsed, (isCollapsed) => {
  if (!isCollapsed) {
    expandedWhenCollapsed.value = null;
  }
});

onMounted(() => {
  loadCollapsedState();

  // Fetch retreats (moved from Header)
  retreatStore.fetchRetreats();

  if (auth.isAuthenticated) {
    communityStore.fetchCommunities().catch(err => {
      console.error('Failed to fetch communities for sidebar:', err);
    });
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
      event.preventDefault();
      openSearch();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
      event.preventDefault();
      uiStore.toggleSidebar();
    }
  };

  document.addEventListener('keydown', handleKeyDown);

  return () => {
    document.removeEventListener('keydown', handleKeyDown);
  };
});
</script>

<style scoped>
.header-fade-enter-active,
.header-fade-leave-active {
  transition: opacity 0.2s ease;
}
.header-fade-enter-from,
.header-fade-leave-to {
  opacity: 0;
}
</style>
