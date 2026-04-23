<template>
  <TooltipProvider :delay-duration="100">
    <Tooltip>
      <TooltipTrigger as-child>
        <component
          :is="item.routeName && routeWithParams ? 'router-link' : 'a'"
          v-if="item.routeName && routeWithParams"
          :to="routeWithParams"
          v-slot="{ href, navigate, isActive }"
          custom
        >
          <a
            :href="href"
            @click="navigate"
            @mouseenter="$emit('mouseenter')"
            @focus="$emit('focus')"
            :data-menu-item-index="globalIndex"
            class="flex items-center px-2 py-2 text-sm font-medium rounded-md transition-all duration-200 ease-in-out transform hover:scale-105 ml-2 group"
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
        <a
          v-else-if="item.routeName && !routeWithParams"
          href="#"
          :data-menu-item-index="globalIndex"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-500 cursor-not-allowed ml-2 group"
          :class="{ 'justify-center': isCollapsedView }"
          :title="$t('sidebar.selectRetreatFirst')"
          @mouseenter="$emit('mouseenter')"
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
</template>

<script setup lang="ts">
import { ArrowRight, Lock } from 'lucide-vue-next';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@repo/ui';

interface MenuItem {
  name: string;
  routeName: string;
  icon: any;
  label: string;
  href?: string;
  onClick?: () => void;
}

defineProps<{
  item: MenuItem;
  isCollapsedView: boolean;
  isFocused: boolean;
  globalIndex: number;
  routeWithParams: any;
  badge?: number | null;
  badgeColor?: string;
}>();

defineEmits<{
  mouseenter: [];
  focus: [];
}>();
</script>
