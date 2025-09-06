<template>
  <Card class="flex flex-col" :class="{ 'opacity-50 pointer-events-none': !table.id }">
    <!-- Card Header -->
    <CardHeader class="flex-row items-center justify-between">
      <CardTitle class="flex items-center justify-between">
        {{ table.name }}
      </CardTitle>
      <div class="flex items-center gap-2">
        <span class="text-sm font-normal text-gray-500 dark:text-gray-400"> {{ table.walkers?.length || 0 }} / 7 </span>
        <Button
          variant="destructive"
          size="icon"
          @click="confirmDelete"
          :disabled="hasWalkers"
          :title="hasWalkers ? $t('tables.deleteTable.disabledTooltip') : $t('common.delete')"
        >
          <Trash2 class="w-4 h-4" />
        </Button>
      </div>
    </CardHeader>

    <!-- Card Content -->
    <CardContent class="flex-grow">
      <div class="space-y-4">
        <!-- Server Drop Zones -->
        <div class="flex gap-2">
          <ServerDropZone
            :title="$t('tables.leader')"
            :participant="table.lider"
            role="lider"
            :is-over="isOverServer && dragOverRole === 'lider'"
            :is-invalid="isDropInvalid && dragOverRole === 'lider'"
            @drop="onDrop($event, 'lider')"
            @dragover="onDragOver($event, 'server', 'lider')"
            @dragleave="onDragLeave('server')"
            @dragstart="startDragFromTable"
          />
          <ServerDropZone
            :title="$t('tables.coLeader1')"
            :participant="table.colider1"
            role="colider1"
            :is-over="isOverServer && dragOverRole === 'colider1'"
            :is-invalid="isDropInvalid && dragOverRole === 'colider1'"
            @drop="onDrop($event, 'colider1')"
            @dragover="onDragOver($event, 'server', 'colider1')"
            @dragleave="onDragLeave('server')"
            @dragstart="startDragFromTable"
          />
          <ServerDropZone
            :title="$t('tables.coLeader2')"
            :participant="table.colider2"
            role="colider2"
            :is-over="isOverServer && dragOverRole === 'colider2'"
            :is-invalid="isDropInvalid && dragOverRole === 'colider2'"
            @drop="onDrop($event, 'colider2')"
            @dragover="onDragOver($event, 'server', 'colider2')"
            @dragleave="onDragLeave('server')"
            @dragstart="startDragFromTable"
          />
        </div>

        <!-- Walkers Drop Zone -->
        <div
          @drop="onDrop($event, 'walkers')"
          @dragover.prevent="onDragOver($event, 'walker')"
          @dragleave.prevent="onDragLeave('walker')"
          class="p-2 border-2 border-dashed rounded-md transition-colors min-h-[100px]"
          :class="{ 'border-primary bg-primary/10': isOverWalker }"
        >
          <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ $t('tables.walkers') }} ({{ table.walkers?.length || 0 }})</h4>
          <transition-group v-if="table.walkers && table.walkers.length > 0" tag="div" name="list-item" class="mt-2 flex flex-wrap gap-2 min-h-[34px]">
            <div
              v-for="walker in table.walkers"
              :key="walker.id"
              draggable="true"
              @dragstart="startDragFromTable($event, walker, 'walkers')"
              :title="`${walker.firstName} ${walker.lastName}\n${$t('tables.invitedBy')}: ${walker.invitedBy || $t('common.unknown')}`"
              class="px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-sm font-medium cursor-grab"
            >
              {{ walker.firstName.split(' ')[0] }} {{ walker.lastName.charAt(0) }}.
            </div>
          </transition-group>
          <span v-else class="text-gray-400 text-sm mt-2 block">{{ $t('tables.unassigned') }}</span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<style scoped>
.list-item-enter-active,
.list-item-leave-active {
  transition-delay: 0.1s;
  transition: all 0.5s ease;
}
.list-item-enter-from,
.list-item-leave-to {
  opacity: 0;
  transform: scale(0.8);
}
</style>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { PropType } from 'vue';
import type { Participant, TableMesa, ServerRole } from '@repo/types';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card';
import { useTableMesaStore } from '@/stores/tableMesaStore';
import { useI18n } from 'vue-i18n';
import ServerDropZone from './ServerDropZone.vue';

import { Button } from '@repo/ui/components/ui/button';
import { Trash2 } from 'lucide-vue-next';

const props = defineProps({
  table: {
    type: Object as PropType<TableMesa>,
    required: true,
  },
});

const emit = defineEmits(['delete']);

const { t } = useI18n();
const tableMesaStore = useTableMesaStore();

const isOverServer = ref(false);
const isOverWalker = ref(false);
const dragOverRole = ref<ServerRole | null>(null);
const isDropInvalid = ref(false);

const hasWalkers = computed(() => (props.table.walkers?.length || 0) > 0);

const confirmDelete = () => {
  emit('delete', props.table);
};

const startDragFromTable = (event: DragEvent, participant: Participant, role?: ServerRole | 'walkers') => {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
    event.dataTransfer.effectAllowed = 'move';

    // Find the role of the participant being dragged from this table
    let sourceRole: ServerRole | 'walkers' | undefined = role;
    if (!sourceRole) {
      if (props.table.lider?.id === participant.id) sourceRole = 'lider';
      else if (props.table.colider1?.id === participant.id) sourceRole = 'colider1';
      else if (props.table.colider2?.id === participant.id) sourceRole = 'colider2';
    }

    const payload = {
      ...participant,
      sourceTableId: props.table.id,
      sourceRole: sourceRole,
    };
    event.dataTransfer.setData('application/json', JSON.stringify(payload));
  }
};

const onDrop = (event: DragEvent, role: ServerRole | 'walkers') => {
  // Prevent drop if table is not saved yet
  if (!props.table.id) return;

  isOverServer.value = false;
  isOverWalker.value = false;
  dragOverRole.value = null;
  isDropInvalid.value = false; // Also reset the invalid state on drop
  const participantData = event.dataTransfer?.getData('application/json');
  if (!participantData) return;

  const participant: Participant & { sourceTableId?: string; sourceRole?: ServerRole | 'walkers' } = JSON.parse(participantData);

  // Ensure table ID is valid before proceeding
  if (!props.table.id) {
    console.error('Cannot assign participant: table ID is undefined');
    return;
  }

  if (role === 'walkers' && participant.type === 'walker') {
    tableMesaStore.assignWalkerToTable(props.table.id, participant.id, participant.sourceTableId);
  } else if (role !== 'walkers' && participant.type === 'server') {
    tableMesaStore.assignLeader(props.table.id, participant.id, role as ServerRole);
  }
};

const onDragOver = (event: DragEvent, type: 'server' | 'walker', role: ServerRole | null = null) => {
  // Prevent drag over if table is not saved yet
  if (!props.table.id) return;

  const participantData = event.dataTransfer?.getData('application/json');
  if (!participantData) return;
  const participant: Participant = JSON.parse(participantData);

  const isCompatible = participant.type === type;

  if (type === 'server') {
    // Dragging over a SERVER zone.
    isOverWalker.value = false; // Deactivate walker zone.
    if (isCompatible) {
      isOverServer.value = true;
      dragOverRole.value = role;
      // Check if the spot is occupied
      if (role && (props.table as any)[role] && (props.table as any)[role]?.id !== participant.id) {
        isDropInvalid.value = true;
      } else {
        isDropInvalid.value = false;
      }
    } else {
      isOverServer.value = false; // Not compatible, ensure it's not highlighted.
      dragOverRole.value = null;
      isDropInvalid.value = false;
    }
  } else if (type === 'walker') {
    // Dragging over a WALKER zone.
    isOverServer.value = false; // Deactivate server zones.
    dragOverRole.value = null;
    isDropInvalid.value = false;
    if (isCompatible) {
      isOverWalker.value = true;
    } else {
      isOverWalker.value = false; // Not compatible.
    }
  }
};

const onDragLeave = (type: 'server' | 'walker') => {
  if (type === 'server') {
    isOverServer.value = false;
    dragOverRole.value = null;
    isDropInvalid.value = false;
  } else {
    isOverWalker.value = false;
  }
};
</script>
