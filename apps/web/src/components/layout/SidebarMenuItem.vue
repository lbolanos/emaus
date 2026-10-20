<template>
  <TooltipProvider :delay-duration="100">
    <Tooltip>
      <TooltipTrigger as-child>
        <div
          v-if="item.routeName && routeWithParams"
          ref="rowRef"
          class="flex items-center ml-2"
          @mouseenter="enterRow"
          @mouseleave="leaveRow"
          @click="closeMenu()"
          @touchstart.passive="startTouchHold"
          @touchmove.passive="moveTouchHold"
          @touchend="endTouchHold"
          @contextmenu="preventTouchContextMenu"
        >
          <component
            :is="'router-link'"
            :to="routeWithParams"
            v-slot="{ href, navigate, isActive }"
            custom
          >
            <a
              :href="href"
              @click="navigate"
              @mouseenter="$emit('mouseenter')"
              @mouseleave="$emit('mouseleave')"
              @focus="handleAnchorFocus"
              @blur="leaveRow"
              :data-menu-item-index="globalIndex"
              class="flex flex-1 min-w-0 items-center px-2 py-2 text-sm font-medium rounded-md transition-all duration-200 ease-in-out transform hover:scale-105 group select-none [-webkit-touch-callout:none]"
              :class="[
                isActive ? 'bg-gray-900 text-white shadow-lg ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-800' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                { 'justify-center': isCollapsedView },
                { 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-800': isFocused && !isActive }
              ]"
            >
              <component :is="item.icon" class="w-5 h-5 flex-shrink-0 transition-colors duration-200" :class="{ 'mr-3': !isCollapsedView, 'text-blue-400 group-hover:text-blue-300': isActive, 'text-gray-400 group-hover:text-gray-200': !isActive }" />
              <span v-if="!isCollapsedView" class="truncate transition-colors duration-200" :class="{ 'text-white': isActive, 'text-gray-300 group-hover:text-gray-200': !isActive }">{{ $t(item.label) }}</span>
              <span
                v-if="!isCollapsedView && badge"
                class="ml-auto shrink-0 rounded-full text-white text-xs font-bold leading-none flex items-center justify-center"
                :class="[badgeColor, badge > 99 ? 'px-1.5 h-5' : 'w-5 h-5']"
              >{{ badge > 99 ? '99+' : badge }}</span>
              <span v-else-if="!isCollapsedView && isFocused" class="ml-auto transition-opacity duration-200 opacity-70 group-hover:opacity-100">
                <ArrowRight class="w-4 h-4" />
              </span>
            </a>
          </component>
        </div>
        <a
          v-else-if="item.routeName && !routeWithParams"
          href="#"
          :data-menu-item-index="globalIndex"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-500 cursor-not-allowed ml-2 group"
          :class="{ 'justify-center': isCollapsedView }"
          :title="$t('sidebar.selectRetreatFirst')"
          @mouseenter="$emit('mouseenter')"
          @mouseleave="$emit('mouseleave')"
          @focus="$emit('focus')"
          @click.prevent
        >
          <component :is="item.icon" class="w-5 h-5 flex-shrink-0 transition-colors duration-200 text-gray-500" :class="{ 'mr-3': !isCollapsedView }" />
          <span v-if="!isCollapsedView" class="truncate transition-colors duration-200 text-gray-500">{{ $t(item.label) }}</span>
          <span v-if="!isCollapsedView" class="ml-auto">
            <Lock class="w-4 h-4 text-gray-400" />
          </span>
        </a>
        <a
          v-else
          :href="item.href || '#'"
          :data-menu-item-index="globalIndex"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-300 hover:bg-gray-700 hover:text-white transition-all duration-200 ease-in-out transform hover:scale-105 ml-2 group"
          :class="{ 'justify-center': isCollapsedView, 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-800': isFocused }"
          @click="item.onClick"
          @mouseenter="$emit('mouseenter')"
          @mouseleave="$emit('mouseleave')"
          @focus="$emit('focus')"
        >
          <component :is="item.icon" class="w-5 h-5 flex-shrink-0 transition-colors duration-200 text-gray-400 group-hover:text-gray-200" :class="{ 'mr-3': !isCollapsedView }" />
          <span v-if="!isCollapsedView" class="truncate transition-colors duration-200 text-gray-300 group-hover:text-gray-200">{{ $t(item.label) }}</span>
          <span v-if="!isCollapsedView && isFocused" class="ml-auto transition-opacity duration-200 opacity-70 group-hover:opacity-100">
            <ArrowRight class="w-4 h-4" />
          </span>
        </a>
      </TooltipTrigger>
      <TooltipContent v-if="isCollapsedView" side="right">
        <p>{{ $t(item.label) }}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
  <!-- Favorite toggle: no star on the row — a small menu unfolds after
       dwelling on it (hover ~1s, touch long-press 500ms, keyboard focus
       dwell). Manually positioned + portaled to body so nothing hijacks the
       row's own click (navigation). Disabled in rail mode, where the tooltip
       already owns the hover. -->
  <Teleport to="body">
    <div
      v-if="menuOpen"
      ref="menuRef"
      role="menu"
      data-testid="favorite-item-menu"
      class="fixed z-[2000] w-56 p-1 rounded-md border bg-popover text-popover-foreground shadow-md"
      :style="menuStyle"
      @mouseenter="cancelClose"
      @mouseleave="leaveRow"
    >
      <button
        type="button"
        role="menuitem"
        data-testid="favorite-item-toggle"
        class="w-full flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200"
        :class="isFavorite
          ? 'text-amber-400 hover:bg-gray-700'
          : 'text-gray-300 hover:bg-gray-700 hover:text-white'"
        @click="toggleFromMenu"
      >
        <Star
          class="w-4 h-4 mr-3 shrink-0"
          :class="isFavorite ? 'fill-amber-400 text-amber-400' : 'text-gray-400'"
        />
        <span class="truncate">{{ isFavorite ? $t('sidebar.removeFavorite') : $t('sidebar.addFavorite') }}</span>
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { ArrowRight, Lock, Star } from 'lucide-vue-next';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@repo/ui';

interface MenuItem {
  name: string;
  routeName: string;
  icon: any;
  label: string;
  href?: string;
  onClick?: () => void;
}

const props = withDefaults(defineProps<{
  item: MenuItem;
  isCollapsedView: boolean;
  isFocused: boolean;
  globalIndex: number;
  routeWithParams: any;
  badge?: number | null;
  badgeColor?: string;
  isFavorite?: boolean;
}>(), {
  isFavorite: false,
});

const emit = defineEmits<{
  mouseenter: [];
  mouseleave: [];
  focus: [];
  toggleFavorite: [];
}>();

// --- Favorite menu state -------------------------------------------------

const HOVER_OPEN_MS = 1000; // mouse dwell ("leave the mouse over the item a second")
const TOUCH_OPEN_MS = 500; // long-press: the touch counterpart of the dwell
const CLOSE_GRACE_MS = 250; // time to cross from the row into the portaled menu

const rowRef = ref<HTMLElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const menuOpen = ref(false);
const menuStyle = ref<Record<string, string>>({});
let openTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let touchTimer: ReturnType<typeof setTimeout> | null = null;
let touchHoldFired = false;
let touchStartX = 0;
let touchStartY = 0;
let lastTouchAt = 0;

function clearAllTimers() {
  if (openTimer) clearTimeout(openTimer);
  if (closeTimer) clearTimeout(closeTimer);
  if (touchTimer) clearTimeout(touchTimer);
  openTimer = closeTimer = touchTimer = null;
}

function menuAvailable(): boolean {
  // Rail mode: the tooltip already owns hover; there is no room for a menu.
  return !!props.item.routeName && !props.isCollapsedView;
}

function enterRow() {
  // Tap on touch devices fires mouseenter too; a 1s "hover" opening after a
  // tap that already navigated would be a surprise menu.
  if (Date.now() - lastTouchAt < 800) return;
  if (!menuAvailable()) return;
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  if (menuOpen.value || openTimer) return;
  openTimer = setTimeout(() => {
    openTimer = null;
    openMenu();
  }, HOVER_OPEN_MS);
}

function leaveRow() {
  if (openTimer) { clearTimeout(openTimer); openTimer = null; }
  if (!menuOpen.value || closeTimer) return;
  closeTimer = setTimeout(() => closeMenu(), CLOSE_GRACE_MS);
}

function cancelClose() {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
}

function openMenu() {
  const rect = rowRef.value?.getBoundingClientRect();
  if (!rect) return;
  // Clamp inside the viewport: on the mobile drawer the row already sits near
  // the right edge and the menu would unfold off-screen (menu is w-56 = 224px).
  const MENU_WIDTH = 224;
  const MARGIN = 8;
  const left = Math.min(
    rect.right + MARGIN,
    Math.max(MARGIN, window.innerWidth - MENU_WIDTH - MARGIN),
  );
  // Vertical clamp keeps the centered menu on screen when the row is at the
  // very bottom (single-action menu ≈46px tall; 40 covers it with margin).
  const top = Math.min(Math.max(rect.top + rect.height / 2, 40), Math.max(40, window.innerHeight - 40));
  menuStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    transform: 'translateY(-50%)',
  };
  menuOpen.value = true;
  document.addEventListener('click', onDocInteract, true);
  document.addEventListener('keydown', onDocInteract, true);
  window.addEventListener('scroll', onScrollAway, true);
}

function closeMenu(returnFocus = false) {
  clearAllTimers();
  if (!menuOpen.value) return;
  menuOpen.value = false;
  document.removeEventListener('click', onDocInteract, true);
  document.removeEventListener('keydown', onDocInteract, true);
  window.removeEventListener('scroll', onScrollAway, true);
  if (returnFocus) rowRef.value?.querySelector('a')?.focus();
}

function onDocInteract(event: Event) {
  if (event.type === 'keydown') {
    if ((event as KeyboardEvent).key === 'Escape') closeMenu(true);
    return;
  }
  const target = event.target as Node;
  if (menuRef.value?.contains(target) || rowRef.value?.contains(target)) return;
  closeMenu();
}

function onScrollAway() {
  closeMenu();
}

function toggleFromMenu() {
  emit('toggleFavorite');
  closeMenu(true);
}

// --- Touch: long-press opens the same menu --------------------------------

function startTouchHold(event: TouchEvent) {
  lastTouchAt = Date.now();
  if (!menuAvailable()) return;
  touchHoldFired = false;
  const t = event.touches?.[0];
  touchStartX = t?.clientX ?? 0;
  touchStartY = t?.clientY ?? 0;
  if (touchTimer) clearTimeout(touchTimer);
  touchTimer = setTimeout(() => {
    touchTimer = null;
    touchHoldFired = true;
    openMenu();
  }, TOUCH_OPEN_MS);
}

function moveTouchHold(event: TouchEvent) {
  // A deliberate scroll (not a finger jiggle) cancels the hold.
  if (!touchTimer) return;
  const t = event.touches?.[0];
  if (!t) return;
  const moved = Math.hypot(t.clientX - touchStartX, t.clientY - touchStartY);
  if (moved > 10) {
    clearTimeout(touchTimer);
    touchTimer = null;
  }
}

function endTouchHold(event: TouchEvent) {
  if (touchHoldFired) {
    // Block the synthetic click so the touch that opened the menu doesn't
    // also navigate.
    touchHoldFired = false;
    event.preventDefault();
  }
  if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
}

function preventTouchContextMenu(event: MouseEvent) {
  // Mobile long-press summons the system context menu / link callout; suppress
  // it only while a touch hold is in progress (desktop right-click is free).
  if (touchHoldFired || touchTimer) event.preventDefault();
}

function handleAnchorFocus() {
  emit('focus');
  // Keyboard dwell opens the same menu, so favoriting stays reachable without
  // a pointer (quick tabbing through items never reaches the 1s dwell).
  if (!menuAvailable()) return;
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  if (menuOpen.value || openTimer) return;
  openTimer = setTimeout(() => {
    openTimer = null;
    openMenu();
  }, HOVER_OPEN_MS);
}

onBeforeUnmount(() => {
  clearAllTimers();
  if (menuOpen.value) {
    document.removeEventListener('click', onDocInteract, true);
    document.removeEventListener('keydown', onDocInteract, true);
    window.removeEventListener('scroll', onScrollAway, true);
  }
});
</script>
