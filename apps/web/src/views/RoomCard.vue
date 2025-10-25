<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
    <!-- Room Header -->
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <Home class="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h3 class="text-lg font-bold text-gray-900 dark:text-white">
            {{ $t('bedAssignments.room') }} {{ roomNumber }}
          </h3>
          <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span class="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded-full">
              {{ beds.length }} {{ $t('bedAssignments.beds') }}
            </span>
            <span class="px-2 py-1 bg-green-200 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full">
              {{ occupiedBeds }} {{ $t('bedAssignments.occupied') }}
            </span>
          </div>
        </div>
        <div class="flex items-center gap-2 text-sm">
          <span v-if="snoringCount > 0" class="flex items-center text-red-600 dark:text-red-400">
            <span class="w-2 h-2 bg-red-500 rounded-full mr-1"></span>
            {{ snoringCount }} {{ $t('bedAssignments.snores') }}
          </span>
          <span v-if="nonSnoringCount > 0" class="flex items-center text-green-600 dark:text-green-400">
            <span class="w-2 h-2 bg-green-500 rounded-full mr-1"></span>
            {{ nonSnoringCount }} {{ $t('bedAssignments.doesNotSnore') }}
          </span>
        </div>
      </div>
    </div>

    <!-- Beds Grid -->
    <div class="p-6">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <CompactBedCard
          v-for="bed in beds"
          :key="bed.id"
          :bed="bed"
          :is-over="isOverBed === bed.id"
          :highlighted="shouldHighlightBed(bed)"
          @drop="onDropToBed"
          @dragover="onDragOverBed"
          @dragleave="onDragLeaveBed"
          @assign="assignParticipant"
          @unassign="unassignParticipant"
        />
      </div>

      <!-- Empty State -->
      <div v-if="beds.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
        <Home class="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>{{ $t('bedAssignments.noBedsInRoom') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Home } from 'lucide-vue-next';
import type { RetreatBed } from '@repo/types';
import CompactBedCard from './CompactBedCard.vue';

const props = defineProps<{
  roomNumber: string;
  beds: RetreatBed[];
  isOverBed?: string | null;
  searchQuery?: string;
}>();

const emit = defineEmits<{
  drop: [event: DragEvent, bedId: string];
  dragover: [event: DragEvent, bedId: string];
  dragleave: [];
  assign: [bedId: string, participantId: string];
  unassign: [bedId: string];
}>();

const { t } = useI18n();

const occupiedBeds = computed(() => props.beds.filter(b => b.participant).length);

const snoringCount = computed(() =>
  props.beds.filter(b => b.participant?.snores === true).length
);

const nonSnoringCount = computed(() =>
  props.beds.filter(b => b.participant?.snores === false).length
);

const shouldHighlightBed = (bed: RetreatBed) => {
  if (!props.searchQuery?.trim()) return false;

  const query = props.searchQuery.toLowerCase().trim();
  if (bed.participant) {
    return (
      bed.participant.firstName.toLowerCase().includes(query) ||
      bed.participant.lastName.toLowerCase().includes(query) ||
      (bed.participant.id_on_retreat && bed.participant.id_on_retreat.toString().includes(query))
    );
  }

  return (
    bed.roomNumber.toLowerCase().includes(query) ||
    bed.bedNumber.toLowerCase().includes(query) ||
    (bed.floor && bed.floor.toString().includes(query))
  );
};

const onDropToBed = (event: DragEvent, bedId: string) => {
  emit('drop', event, bedId);
};

const onDragOverBed = (event: DragEvent, bedId: string) => {
  emit('dragover', event, bedId);
};

const onDragLeaveBed = () => {
  emit('dragleave');
};

const assignParticipant = (bedId: string, participantId: string) => {
  emit('assign', bedId, participantId);
};

const unassignParticipant = (bedId: string) => {
  emit('unassign', bedId);
};
</script>