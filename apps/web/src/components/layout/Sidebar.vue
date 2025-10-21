<template>
  <aside
    ref="sidebarRef"
    class="bg-gray-800 text-white flex flex-col dark transition-all duration-300 ease-in-out focus:outline-none shadow-xl"
    :class="isSidebarCollapsed ? 'w-20' : 'w-64'"
    tabindex="0"
    @keydown.up.prevent="navigateUp"
    @keydown.down.prevent="navigateDown"
    @keydown.enter.prevent="activateCurrentItem"
    @keydown.space.prevent="activateCurrentItem"
    @keydown.esc.prevent="handleEscape"
  >
    <div class="h-16 flex items-center justify-center relative">
      <span v-if="!isSidebarCollapsed" class="text-2xl font-bold">EMAUS</span>
       <!-- Show initials when collapsed -->
      <span v-else class="text-2xl font-bold">E</span>
      <button
        @click="uiStore.toggleSidebar"
        class="absolute right-0 top-1/2 transform -translate-y-1/2 translate-x-1/2 bg-gray-700 hover:bg-gray-600 rounded-full p-1 z-10 transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500"
        :title="isSidebarCollapsed ? 'Expandir sidebar' : 'Contraer sidebar'"
      >
        <ChevronLeft class="w-5 h-5 transition-transform duration-300" :class="{ 'rotate-180': isSidebarCollapsed }" />
      </button>
    </div>

    <div class="px-4 py-2 border-t border-b border-gray-700">
      <div v-if="auth.isAuthenticated && auth.user" class="flex items-center gap-4" :class="{ 'justify-center': isSidebarCollapsed }">
        <span v-if="!isSidebarCollapsed">{{ auth.user.displayName }}</span>
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                @click="handleLogout"
                variant="ghost"
                size="icon"
                class="transition-all duration-200 hover:scale-110 hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
                :title="$t('sidebar.logout')"
              >
                <LogOut class="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.logout') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>

    <!-- Search Bar -->
    <div v-if="!isSidebarCollapsed" class="px-4 py-2 border-b border-gray-700">
      <div class="relative">
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="text"
          :placeholder="$t('sidebar.searchPlaceholder') || 'Buscar...'"
          class="w-full px-3 py-2 bg-gray-700 text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
          @input="handleSearch"
          @keydown.down.prevent="handleSearchKeydown"
          @keydown.esc.prevent="handleEscape"
        />
        <Search v-if="!searchQuery" class="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
        <button
          v-else
          @click="clearSearch"
          class="absolute right-3 top-2.5 text-gray-400 hover:text-white transition-colors duration-200"
          title="Limpiar búsqueda"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
      <div v-if="searchQuery" class="mt-2 text-xs text-gray-400">
        {{ allMenuItems.length }} resultado{{ allMenuItems.length !== 1 ? 's' : '' }}
      </div>
    </div>

    <!-- Collapsed Search Indicator -->
    <div v-if="isSidebarCollapsed" class="px-4 py-2 border-b border-gray-700">
      <TooltipProvider :delay-duration="100">
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              @click="uiStore.toggleSidebar"
              class="w-full flex items-center justify-center p-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-all duration-200 hover:scale-105"
              title="Buscar (Ctrl + F)"
            >
              <Search class="w-4 h-4 text-gray-400" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Buscar (Ctrl + F)</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <nav class="flex flex-col flex-1">
      <!-- Top Sections -->
      <div class="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        <template v-for="(section, sectionIndex) in filteredMenuSections.filter(s => s.position === 'top')" :key="section.category">
        <!-- Section Header -->
        <div class="px-2 py-2">
          <button
            @click="toggleSection(section.category)"
            @keydown.enter="toggleSection(section.category)"
            @keydown.space.prevent="toggleSection(section.category)"
            class="w-full flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-300 transition-all duration-200 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 group"
            :class="{ 'justify-center': isSidebarCollapsed }"
            :title="isSidebarCollapsed ? $t(getCategoryTitle(section.category)) : ''"
            :aria-expanded="!isSectionCollapsed(section.category)"
            :aria-controls="`section-${section.category}`"
          >
            <span v-if="!isSidebarCollapsed" class="group-hover:text-gray-200 transition-colors duration-200">{{ $t(getCategoryTitle(section.category)) }}</span>
            <ChevronDown
              v-if="!isSidebarCollapsed"
              class="w-4 h-4 transition-all duration-200 text-gray-500 group-hover:text-gray-300 group-hover:scale-110"
              :class="{ 'rotate-180': isSectionCollapsed(section.category) }"
            />
          </button>
        </div>

        <!-- Section Content -->
        <div
          :id="`section-${section.category}`"
          class="overflow-hidden transition-all duration-300 ease-in-out"
          :class="{ 'max-h-0 opacity-0 py-0': isSectionCollapsed(section.category), 'max-h-96 opacity-100 py-1': !isSectionCollapsed(section.category) }"
        >
          <div class="space-y-1 transform transition-transform duration-200 ease-in-out"
               :class="{ 'translate-y-0': !isSectionCollapsed(section.category), '-translate-y-2': isSectionCollapsed(section.category) }">
            <template v-for="(item, itemIndex) in section.items" :key="item.name">
              <TooltipProvider :delay-duration="100">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <component
                      :is="item.routeName && getRouteWithParams(item) ? 'router-link' : 'a'"
                      v-if="item.routeName && getRouteWithParams(item)"
                      :to="getRouteWithParams(item)"
                      v-slot="{ href, navigate, isActive }"
                      custom
                    >
                      <a
                        :href="href"
                        @click="navigate"
                        @mouseenter="setFocusedIndex(item)"
                        @focus="setFocusedIndex(item)"
                        :data-menu-item-index="getGlobalItemIndex(item)"
                        class="flex items-center px-2 py-2 text-sm font-medium rounded-md transition-all duration-200 ease-in-out transform hover:scale-105 ml-2 group"
                        :class="[
                          isActive ? 'bg-gray-900 text-white shadow-lg ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-800' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                          { 'justify-center': isSidebarCollapsed },
                          { 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-800': isItemFocused(item) && !isActive }
                        ]"
                      >
                        <component :is="item.icon" class="w-5 h-5 flex-shrink-0 transition-colors duration-200" :class="{ 'mr-3': !isSidebarCollapsed, 'text-blue-400 group-hover:text-blue-300': isActive, 'text-gray-400 group-hover:text-gray-200': !isActive }" />
                        <span v-if="!isSidebarCollapsed" class="truncate transition-colors duration-200" :class="{ 'text-white': isActive, 'text-gray-300 group-hover:text-gray-200': !isActive }">{{ $t(item.label) }}</span>
                        <span v-if="!isSidebarCollapsed && isItemFocused(item)" class="ml-auto transition-opacity duration-200 opacity-70 group-hover:opacity-100">
                          <ArrowRight class="w-4 h-4" />
                        </span>
                      </a>
                    </component>
                    <a
                      v-else-if="item.routeName && !getRouteWithParams(item)"
                      :href="'#'"
                      :data-menu-item-index="getGlobalItemIndex(item)"
                      class="flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-500 cursor-not-allowed ml-2 group"
                      :class="{ 'justify-center': isSidebarCollapsed }"
                      :title="$t('sidebar.selectRetreatFirst')"
                      @mouseenter="setFocusedIndex(item)"
                      @focus="setFocusedIndex(item)"
                      @click.prevent
                    >
                      <component :is="item.icon" class="w-5 h-5 flex-shrink-0 transition-colors duration-200 text-gray-500" :class="{ 'mr-3': !isSidebarCollapsed }" />
                      <span v-if="!isSidebarCollapsed" class="truncate transition-colors duration-200 text-gray-500">{{ $t(item.label) }}</span>
                      <span v-if="!isSidebarCollapsed" class="ml-auto">
                        <Lock class="w-4 h-4 text-gray-400" />
                      </span>
                    </a>
                    <a
                        v-else
                        :href="item.href || '#'"
                        :data-menu-item-index="getGlobalItemIndex(item)"
                        class="flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-300 hover:bg-gray-700 hover:text-white transition-all duration-200 ease-in-out transform hover:scale-105 ml-2 group"
                        :class="{ 'justify-center': isSidebarCollapsed, 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-800': isItemFocused(item) }"
                        @click="item.onClick"
                        @mouseenter="setFocusedIndex(item)"
                        @focus="setFocusedIndex(item)"
                      >
                      <component :is="item.icon" class="w-5 h-5 flex-shrink-0 transition-colors duration-200 text-gray-400 group-hover:text-gray-200" :class="{ 'mr-3': !isSidebarCollapsed }" />
                      <span v-if="!isSidebarCollapsed" class="truncate transition-colors duration-200 text-gray-300 group-hover:text-gray-200">{{ $t(item.label) }}</span>
                      <span v-if="!isSidebarCollapsed && isItemFocused(item)" class="ml-auto transition-opacity duration-200 opacity-70 group-hover:opacity-100">
                        <ArrowRight class="w-4 h-4" />
                      </span>
                    </a>
                  </TooltipTrigger>
                  <TooltipContent v-if="isSidebarCollapsed" side="right">
                    <p>{{ $t(item.label) }}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </template>
          </div>
        </div>
      </template>
      </div>

      <!-- Bottom Sections -->
      <div class="px-2 py-4 border-t border-gray-700">
        <template v-for="(section, sectionIndex) in filteredMenuSections.filter(s => s.position === 'bottom')" :key="section.category">
          <!-- Section Header -->
          <div class="px-2 py-2">
            <button
              @click="toggleSection(section.category)"
              @keydown.enter="toggleSection(section.category)"
              @keydown.space.prevent="toggleSection(section.category)"
              class="w-full flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-300 transition-all duration-200 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 group"
              :class="{ 'justify-center': isSidebarCollapsed }"
              :title="isSidebarCollapsed ? $t(getCategoryTitle(section.category)) : ''"
              :aria-expanded="!isSectionCollapsed(section.category)"
              :aria-controls="`section-${section.category}`"
            >
              <span v-if="!isSidebarCollapsed" class="group-hover:text-gray-200 transition-colors duration-200">{{ $t(getCategoryTitle(section.category)) }}</span>
              <ChevronDown
                v-if="!isSidebarCollapsed"
                class="w-4 h-4 transition-all duration-200 text-gray-500 group-hover:text-gray-300 group-hover:scale-110"
                :class="{ 'rotate-180': isSectionCollapsed(section.category) }"
              />
            </button>
          </div>

          <!-- Section Content -->
          <div
            :id="`section-${section.category}`"
            class="overflow-hidden transition-all duration-300 ease-in-out"
            :class="{ 'max-h-0 opacity-0 py-0': isSectionCollapsed(section.category), 'max-h-96 opacity-100 py-1': !isSectionCollapsed(section.category) }"
          >
            <div class="space-y-1 transform transition-transform duration-200 ease-in-out"
                 :class="{ 'translate-y-0': !isSectionCollapsed(section.category), '-translate-y-2': isSectionCollapsed(section.category) }">
              <template v-for="(item, itemIndex) in section.items" :key="item.name">
                <TooltipProvider :delay-duration="100">
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <component
                        :is="item.routeName && getRouteWithParams(item) ? 'router-link' : 'a'"
                        v-if="item.routeName && getRouteWithParams(item)"
                        :to="getRouteWithParams(item)"
                        v-slot="{ href, navigate, isActive }"
                        custom
                      >
                        <a
                          :href="href"
                          @click="navigate"
                          @mouseenter="setFocusedIndex(item)"
                          @focus="setFocusedIndex(item)"
                          :data-menu-item-index="getGlobalItemIndex(item)"
                          class="flex items-center px-2 py-2 text-sm font-medium rounded-md transition-all duration-200 ease-in-out transform hover:scale-105 ml-2 group"
                          :class="[
                            isActive ? 'bg-gray-900 text-white shadow-lg ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-800' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                            { 'justify-center': isSidebarCollapsed },
                            { 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-800': isItemFocused(item) && !isActive }
                          ]"
                        >
                          <component :is="item.icon" class="w-5 h-5 flex-shrink-0 transition-colors duration-200" :class="{ 'mr-3': !isSidebarCollapsed, 'text-blue-400 group-hover:text-blue-300': isActive, 'text-gray-400 group-hover:text-gray-200': !isActive }" />
                          <span v-if="!isSidebarCollapsed" class="truncate transition-colors duration-200" :class="{ 'text-white': isActive, 'text-gray-300 group-hover:text-gray-200': !isActive }">{{ $t(item.label) }}</span>
                          <span v-if="!isSidebarCollapsed && isItemFocused(item)" class="ml-auto transition-opacity duration-200 opacity-70 group-hover:opacity-100">
                            <ArrowRight class="w-4 h-4" />
                          </span>
                        </a>
                      </component>
                      <a
                        v-else-if="item.routeName && !getRouteWithParams(item)"
                        :href="'#'"
                        :data-menu-item-index="getGlobalItemIndex(item)"
                        class="flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-500 cursor-not-allowed ml-2 group"
                        :class="{ 'justify-center': isSidebarCollapsed }"
                        :title="$t('sidebar.selectRetreatFirst')"
                        @mouseenter="setFocusedIndex(item)"
                        @focus="setFocusedIndex(item)"
                        @click.prevent
                      >
                        <component :is="item.icon" class="w-5 h-5 flex-shrink-0 transition-colors duration-200 text-gray-500" :class="{ 'mr-3': !isSidebarCollapsed }" />
                        <span v-if="!isSidebarCollapsed" class="truncate transition-colors duration-200 text-gray-500">{{ $t(item.label) }}</span>
                        <span v-if="!isSidebarCollapsed" class="ml-auto">
                          <Lock class="w-4 h-4 text-gray-400" />
                        </span>
                      </a>
                      <a
                        v-else
                        :href="item.href || '#'"
                        :data-menu-item-index="getGlobalItemIndex(item)"
                        class="flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-300 hover:bg-gray-700 hover:text-white transition-all duration-200 ease-in-out transform hover:scale-105 ml-2 group"
                        :class="{ 'justify-center': isSidebarCollapsed, 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-800': isItemFocused(item) }"
                        @click="item.onClick"
                        @mouseenter="setFocusedIndex(item)"
                        @focus="setFocusedIndex(item)"
                      >
                        <component :is="item.icon" class="w-5 h-5 flex-shrink-0 transition-colors duration-200 text-gray-400 group-hover:text-gray-200" :class="{ 'mr-3': !isSidebarCollapsed }" />
                        <span v-if="!isSidebarCollapsed" class="truncate transition-colors duration-200 text-gray-300 group-hover:text-gray-200">{{ $t(item.label) }}</span>
                        <span v-if="!isSidebarCollapsed && isItemFocused(item)" class="ml-auto transition-opacity duration-200 opacity-70 group-hover:opacity-100">
                          <ArrowRight class="w-4 h-4" />
                        </span>
                      </a>
                    </TooltipTrigger>
                    <TooltipContent v-if="isSidebarCollapsed" side="right">
                      <p>{{ $t(item.label) }}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </template>
            </div>
          </div>
        </template>
      </div>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { ref, computed, nextTick, onMounted } from 'vue';
import { LogOut, Users, UtensilsCrossed, LayoutDashboard, ChevronLeft, Home, Ban, Bed, HandHeart, DollarSign, NotebookPen, Building, UsersRound, Salad, FileX, UserCheck, ShoppingBag, Pill, UserCog, Table, Settings, Package, Globe, Briefcase, Search, X, ArrowRight, ChevronDown, Lock } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'vue-router';
import { Button } from '@repo/ui';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@repo/ui';
import { useRetreatStore } from '@/stores/retreatStore';
import { useUIStore } from '@/stores/ui';
import { useAuthPermissions } from '@/composables/useAuthPermissions';

type PermissionType = 'retreat' | 'participant' | 'table' | 'house' | 'user' | 'retreatInventory' | 'inventoryItem' | 'payment' | 'responsability' | 'messageTemplate' | 'superadmin';

interface MenuItem {
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

interface MenuSection {
  category: string;
  items: MenuItem[];
  isCollapsed?: boolean;
  position: 'top' | 'bottom';
}

const auth = useAuthStore();
const router = useRouter();
const retreatStore = useRetreatStore();
const uiStore = useUIStore();
const { isSidebarCollapsed } = storeToRefs(uiStore);
const { can } = useAuthPermissions();

const sidebarRef = ref<HTMLElement>();
const searchInput = ref<HTMLInputElement>();
const searchQuery = ref('');
const focusedIndex = ref(-1);
const isSearchFocused = ref(false);
const collapsedSections = ref<Record<string, boolean>>({});

// Load collapsed state from localStorage
const loadCollapsedState = () => {
  try {
    const saved = localStorage.getItem('sidebar-collapsed-sections');
    if (saved) {
      collapsedSections.value = JSON.parse(saved);
    } else {
      // Initialize all sections as collapsed on first load
      menuSections.forEach(section => {
        collapsedSections.value[section.category] = true;
      });
      saveCollapsedState();
    }
  } catch (error) {
    console.error('Failed to load collapsed state:', error);
    // Fallback: initialize all as collapsed
    menuSections.forEach(section => {
      collapsedSections.value[section.category] = true;
    });
  }
};

// Save collapsed state to localStorage
const saveCollapsedState = () => {
  try {
    localStorage.setItem('sidebar-collapsed-sections', JSON.stringify(collapsedSections.value));
  } catch (error) {
    console.error('Failed to save collapsed state:', error);
  }
};

const menuSections: MenuSection[] = [
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
        name: 'rooms',
        routeName: 'rooms',
        icon: Building,
        permission: 'house',
        requiresRetreat: true,
        label: 'sidebar.rooms'
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
        name: 'medicines-report',
        routeName: 'medicines-report',
        icon: Pill,
        requiresRetreat: true,
        label: 'sidebar.medicinesReport'
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
        //permission: 'user',
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
    position: 'bottom'
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

      // Special case for role management - requires user:manage permission
      if (item.name === 'role-management') {
        const hasUserManage = can.manage('user');
        if (!hasUserManage) return false;
      }

      // Standard permission check for other items
      if (item.permission && item.permission !== 'superadmin' && item.name !== 'role-management') {
        const hasPermission = can.read(item.permission);
        if (!hasPermission) return false;
      }

      if (searchQuery.value.trim()) {
        const query = searchQuery.value.toLowerCase();
        const label = typeof item.label === 'string' ? item.label : '';
        return label.toLowerCase().includes(query) || item.name.toLowerCase().includes(query);
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

const allMenuItems = computed(() => {
  return filteredMenuSections.value.flatMap(section => section.items);
});

const isSectionCollapsed = (category: string) => {
  return collapsedSections.value[category] ?? false;
};

const toggleSection = (category: string) => {
  // Ensure the category exists in collapsedSections
  if (collapsedSections.value[category] === undefined) {
    collapsedSections.value[category] = true;
  }

  const isCurrentlyCollapsed = collapsedSections.value[category];

  // If we're opening a section (it was collapsed), close all others first
  if (isCurrentlyCollapsed) {
    Object.keys(collapsedSections.value).forEach(key => {
      collapsedSections.value[key] = true;
    });
  }

  // Toggle the current section (set to false to open, true to close)
  collapsedSections.value[category] = !isCurrentlyCollapsed;
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

  // Skip collapsed section items
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

  // Skip collapsed section items
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
    // Routes that require 'id' parameter based on router configuration
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
  nextTick(() => {
    searchInput.value?.focus();
  });
};

const scrollFocusedItemIntoView = () => {
  nextTick(() => {
    const focusedElement = document.querySelector(`[data-menu-item-index="${focusedIndex.value}"]`);
    if (focusedElement) {
      focusedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
};

// Helper functions for menu rendering

const getCategoryTitle = (category?: string) => {
  if (!category) return '';
  return `sidebar.sections.${category}`;
};

const getRouteWithParams = (item: MenuItem) => {
  const route: any = { name: item.routeName };

  // Routes that require 'id' parameter based on router configuration
  const routesRequiringId = [
    'retreat-dashboard',
    'bed-assignments',
    'responsibilities',
    'inventory',
    'role-management'
  ];

  if (item.routeName && routesRequiringId.includes(item.routeName)) {
    if (!retreatStore.selectedRetreatId) {
      // If no retreat is selected, don't navigate
      return null;
    }
    route.params = { id: retreatStore.selectedRetreatId };
  }

  return route;
};

onMounted(() => {
  // Load collapsed state from localStorage
  loadCollapsedState();

  // Global keyboard shortcuts
  const handleKeyDown = (event: KeyboardEvent) => {
    // Ctrl/Cmd + F to focus search
    if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
      event.preventDefault();
      if (isSidebarCollapsed.value) {
        uiStore.toggleSidebar();
        nextTick(() => {
          searchInput.value?.focus();
        });
      } else {
        searchInput.value?.focus();
      }
    }

    // Ctrl/Cmd + B to toggle sidebar
    if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
      event.preventDefault();
      uiStore.toggleSidebar();
    }
  };

  document.addEventListener('keydown', handleKeyDown);

  // Initial focus
  if (!isSidebarCollapsed.value) {
    nextTick(() => {
      searchInput.value?.focus();
    });
  }

  // Cleanup
  return () => {
    document.removeEventListener('keydown', handleKeyDown);
  };
});
</script>
