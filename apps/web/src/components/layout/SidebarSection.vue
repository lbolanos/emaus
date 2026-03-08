<template>
  <div>
    <!-- Section Header -->
    <div class="px-2 py-1">
      <TooltipProvider :delay-duration="100">
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              @click="$emit('toggle')"
              @keydown.enter="$emit('toggle')"
              @keydown.space.prevent="$emit('toggle')"
              class="w-full flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-300 transition-all duration-200 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 group"
              :class="{ 'justify-center': isCollapsedView }"
              :aria-expanded="!isSectionCollapsed"
              :aria-controls="`section-${section.category}`"
            >
              <span v-if="!isCollapsedView" class="group-hover:text-gray-200 transition-colors duration-200">{{ $t(`sidebar.sections.${section.category}`) }}</span>
              <div v-else class="w-4 h-4 rounded-sm flex items-center justify-center transition-colors duration-200"
                   :class="{
                     'bg-blue-600 group-hover:bg-blue-500': !isSectionCollapsed,
                     'bg-gray-600 group-hover:bg-gray-500': isSectionCollapsed
                   }">
                <span class="text-xs font-bold transition-colors duration-200"
                      :class="{
                        'text-blue-200': !isSectionCollapsed,
                        'text-gray-300': isSectionCollapsed
                      }">{{ $t(`sidebar.sections.${section.category}`).charAt(0).toUpperCase() }}</span>
              </div>
              <ChevronDown
                v-if="!isCollapsedView"
                class="w-4 h-4 transition-all duration-200 text-gray-500 group-hover:text-gray-300 group-hover:scale-110"
                :class="{ 'rotate-180': isSectionCollapsed }"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent v-if="isCollapsedView" side="right">
            <p>{{ $t(`sidebar.sections.${section.category}`) }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <!-- Section Content -->
    <div
      :id="`section-${section.category}`"
      class="overflow-hidden transition-all duration-300 ease-in-out"
      :class="{
        'max-h-0 opacity-0 py-0': isSectionCollapsed,
        'max-h-96 opacity-100 py-1': !isSectionCollapsed
      }"
    >
      <div class="space-y-1 transform transition-transform duration-200 ease-in-out"
           :class="{ 'translate-y-0': !isSectionCollapsed, '-translate-y-2': isSectionCollapsed }">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@repo/ui';

interface MenuSection {
  category: string;
  items: any[];
  position: 'top' | 'bottom';
}

defineProps<{
  section: MenuSection;
  isCollapsedView: boolean;
  isSectionCollapsed: boolean;
}>();

defineEmits<{
  toggle: [];
}>();
</script>
