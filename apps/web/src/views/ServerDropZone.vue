<template>
  <div
    @drop.prevent="$emit('drop', $event)"
    @dragover.prevent="$emit('dragover', $event)"
    @dragleave.prevent="$emit('dragleave', $event)"
    class="p-2 border-2 border-dashed rounded-md transition-colors flex-1"
    :class="{
      'border-primary bg-primary/10': isOver,
      'border-red-500 shake': isInvalid,
    }"
  >
    <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ title }}</h4>
    <div class="mt-2 min-h-[20px]">
      <transition name="list-item" mode="out-in">
        <div
          v-if="participant"
          :key="participant.id"
          draggable="true"
          @dragstart.stop="$emit('dragstart', $event, participant)"
          :title="`${participant.firstName} ${participant.lastName}`"
          class="px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full text-sm font-medium inline-block cursor-grab"
        >
          {{ participant.firstName.split(' ')[0] }} {{ participant.lastName.charAt(0) }}.
        </div>
        <span v-else :key="`empty-${role}`" class="text-gray-400 text-sm">{{ $t('tables.unassigned') }}</span>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue';
import type { Participant } from '@repo/types';

defineProps({
  title: {
    type: String,
    required: true,
  },
  participant: {
    type: Object as PropType<Participant | null>,
    default: null,
  },
  role: {
    type: String as PropType<'lider' | 'colider1' | 'colider2'>,
    required: true,
  },
  isOver: {
    type: Boolean,
    default: false,
  },
  isInvalid: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['drop', 'dragover', 'dragleave', 'dragstart']);
</script>
