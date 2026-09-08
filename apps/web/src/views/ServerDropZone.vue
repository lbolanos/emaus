<template>
  <div
    @drop.prevent="$emit('drop', $event)"
    @dragover.prevent="$emit('dragover', $event)"
    @dragleave.prevent="$emit('dragleave', $event)"
    class="p-2 border-2 border-dashed rounded-md transition-colors flex-1"
    :class="{
      'border-primary bg-primary/10': isOver,
      'border-red-500 shake': isInvalid,
      'border-blue-400 bg-blue-50 dark:bg-blue-900/20': isTapTarget,
    }"
  >
    <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ title }}</h4>
    <div class="mt-2 min-h-[20px]">
      <transition name="list-item" mode="out-in">
        <span
          v-if="participant"
          :key="participant.id"
          class="inline-flex items-center cursor-pointer"
          @touchstart.passive="onTouchStart"
          @touchend.stop="(e: TouchEvent) => participant && onTouchEnd(e, participant, tableId, role)"
          @click.stop
        >
          <ParticipantInfoPopover :participant="participant" :attendance="attendance">
            <ParticipantTooltip :participant="participant">
              <div
                draggable="true"
                @dragstart.stop="$emit('dragstart', $event, participant)"
                @dragend.stop="$emit('dragend', $event)"
                @dblclick.stop="$emit('unassign')"
                :data-participant-id="participant.id"
                :data-table-id="tableId"
                class="px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full text-sm font-medium inline-block cursor-pointer transition-all"
                :class="[highlightClass, { 'ring-2 ring-blue-500 ring-offset-1 scale-110': participant && isSelected(participant.id) }]"
              >
                {{ participant.firstName.split(' ')[0] }} {{ participant.lastName.charAt(0) }}.
                <span
                  v-if="attendance"
                  class="ml-1 px-1 rounded-sm text-[10px] font-semibold align-middle"
                  :class="attendanceClass"
                >{{ Math.round(attendance.ratePercent) }}%</span>
              </div>
            </ParticipantTooltip>
          </ParticipantInfoPopover>
        </span>
        <span v-else :key="`empty-${role}`" class="text-gray-400 text-sm">{{ $t('tables.unassigned') }}</span>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue';
import type { Participant } from '@repo/types';
import ParticipantTooltip from '@/components/ParticipantTooltip.vue';
import ParticipantInfoPopover from '@/components/ParticipantInfoPopover.vue';
import { useTapAssign } from '@/composables/useTapAssign';
import type { ServerAttendanceState } from '@/composables/useServerAttendance';

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
  tableId: {
    type: String,
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
  isTapTarget: {
    type: Boolean,
    default: false,
  },
  /** Search highlight, computed by the view that owns the search. */
  highlightClass: {
    type: String,
    default: '',
  },
  /**
   * Asistencia a reuniones de este servidor, si la hay. `null` significa "sin
   * dato" (no está en el padrón de la comunidad, o la métrica está apagada) y
   * NO se pinta: sería indistinguible de un 0% real.
   */
  attendance: {
    type: Object as PropType<ServerAttendanceState | null>,
    default: null,
  },
  /** Clases del badge, calculadas por la vista dueña de la métrica. */
  attendanceClass: {
    type: String,
    default: '',
  },
});

const { onTouchStart, onTouchEnd, isSelected } = useTapAssign();

defineEmits(['drop', 'dragover', 'dragleave', 'dragstart', 'dragend', 'unassign']);
</script>
