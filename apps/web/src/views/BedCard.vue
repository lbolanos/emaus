<template>
  <div
    @drop="onDrop"
    @dragover.prevent="onDragOver"
    @dragenter.prevent
    @dragleave="onDragLeave"
    class="relative bg-white dark:bg-gray-800 rounded-lg border-2 transition-all duration-200 hover:shadow-md"
    :class="{
      'border-primary bg-primary/5 shadow-sm': isOver,
      'border-gray-200 dark:border-gray-700': !isOver && !isHighlighted,
      'ring-2 ring-green-500 border-green-500': bed.participant && !bed.participant.snores && !isHighlighted,
      'ring-2 ring-red-500 border-red-500': bed.participant && bed.participant.snores && !isHighlighted,
      'ring-2 ring-yellow-400 border-yellow-400 shadow-md': isHighlighted,
      'opacity-60': bed.type === 'colchon',
      'border-dashed': !bed.participant && !isHighlighted
    }"
  >
    <!-- Card Header -->
    <div class="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-t-lg">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <BedDouble v-if="bed.type === 'normal'" class="w-4 h-4 text-gray-600 dark:text-gray-400" />
          <Layers v-else-if="bed.type === 'litera_abajo' || bed.type === 'litera_arriba'" class="w-4 h-4 text-gray-600 dark:text-gray-400" />
          <Square v-else class="w-4 h-4 text-gray-600 dark:text-gray-400" />
          <span class="text-sm font-medium text-gray-900 dark:text-white">
            {{ bed.roomNumber }}-{{ bed.bedNumber }}
          </span>
        </div>
        <div class="flex items-center gap-1">
          <span
            v-if="bed.defaultUsage"
            class="px-2 py-1 text-xs font-medium rounded-full"
            :class="{
              'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200': bed.defaultUsage === 'caminante',
              'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200': bed.defaultUsage === 'servidor'
            }"
          >
            {{ bed.defaultUsage === 'caminante' ? $t('bedAssignments.walker') : $t('bedAssignments.server') }}
          </span>
        </div>
      </div>
    </div>

    <!-- Card Content -->
    <div class="p-3">
      <div
        v-if="bed.participant"
        class="space-y-2"
      >
        <!-- Assigned Participant -->
        <div
          draggable="true"
          @dragstart="startDrag"
          :title="`${bed.participant.firstName} ${bed.participant.lastName}\n${$t('bedAssignments.age')}: ${calculateAge(bed.participant.birthDate)}\n${$t('bedAssignments.snores')}: ${bed.participant.snores ? $t('common.yes') : $t('common.no')}\n${$t('bedAssignments.idOnRetreat')}: ${bed.participant.id_on_retreat || 'N/A'}`"
          :style="{ borderColor: bed.participant.family_friend_color || '#ccc' }"
          class="p-2 rounded-lg border-2 cursor-grab transition-all duration-200 hover:shadow-sm"
          :class="{
            'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800': bed.participant.type === 'walker',
            'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800': bed.participant.type === 'server',
            'ring-2 ring-red-500': bed.participant.snores,
            'ring-2 ring-green-500': !bed.participant.snores
          }"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span
                  class="w-2 h-2 rounded-full flex-shrink-0"
                  :class="bed.participant.snores ? 'bg-red-500' : 'bg-green-500'"
                ></span>
                <span class="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {{ bed.participant.firstName }} {{ bed.participant.lastName }}
                </span>
              </div>
              <div class="mt-1 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <span v-if="bed.participant.id_on_retreat" class="font-medium">
                  #{{ bed.participant.id_on_retreat }}
                </span>
                <span>•</span>
                <span>{{ calculateAge(bed.participant.birthDate) }}{{ $t('bedAssignments.yearsOld') }}</span>
              </div>
              <div v-if="bed.participant.type === 'walker'" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ $t('bedAssignments.walkers') }}
              </div>
              <div v-else class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ $t('bedAssignments.servers') }}
              </div>
            </div>
            <button
              @click="$emit('unassign', bed.id)"
              class="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 transition-colors"
              :title="$t('bedAssignments.unassign')"
            >
              <X class="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else
        class="flex flex-col items-center justify-center py-6 text-gray-400 dark:text-gray-500 min-h-[80px] border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg transition-colors"
        :class="{ 'border-primary bg-primary/5': isOver }"
      >
        <BedDouble class="w-8 h-8 mb-2" />
        <span class="text-sm">{{ $t('bedAssignments.emptyBed') }}</span>
        <span class="text-xs mt-1">{{ $t('bedAssignments.dragParticipant') }}</span>
      </div>
    </div>

    <!-- Card Footer -->
    <div class="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-lg">
      <div class="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
        <div class="flex items-center gap-1">
          <Home class="w-3 h-3" />
          <span>{{ $t('bedAssignments.floor') }} {{ bed.floor || 0 }}</span>
        </div>
        <div class="flex items-center gap-1">
          <span v-if="bed.type === 'normal'">{{ $t('bedAssignments.normalBed') }}</span>
          <span v-else-if="bed.type === 'litera_abajo'">{{ $t('bedAssignments.bottomBunk') }}</span>
          <span v-else-if="bed.type === 'litera_arriba'">{{ $t('bedAssignments.topBunk') }}</span>
          <span v-else>{{ $t('bedAssignments.mattress') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { BedDouble, Layers, Square, Home, X } from 'lucide-vue-next';
import type { RetreatBed, Participant } from '@repo/types';

const props = defineProps<{
  bed: RetreatBed;
  isOver?: boolean;
  highlighted?: boolean;
}>();

const emit = defineEmits<{
  drop: [event: DragEvent, bedId: string];
  dragover: [event: DragEvent, bedId: string];
  dragleave: [];
  assign: [bedId: string, participantId: string];
  unassign: [bedId: string];
}>();

const { t } = useI18n();

const isOver = computed(() => props.isOver);
const isHighlighted = computed(() => props.highlighted);

const calculateAge = (birthDate: string | Date): number | null => {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
};

const onDrop = (event: DragEvent) => {
  emit('drop', event, props.bed.id);
};

const onDragOver = (event: DragEvent) => {
  emit('dragover', event, props.bed.id);
};

const onDragLeave = () => {
  emit('dragleave');
};

const startDrag = (event: DragEvent) => {
  if (event.dataTransfer && props.bed.participant) {
    event.dataTransfer.dropEffect = 'move';
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify({
      ...props.bed.participant,
      sourceBedId: props.bed.id
    }));
  }
};
</script>