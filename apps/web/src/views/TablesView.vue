<template>
  <div class="p-4 sm:p-6 lg:p-8">
    <div class="sm:flex sm:items-center sm:justify-between">
      <div class="sm:flex-auto">
        <h1 class="text-2xl font-bold leading-6 text-gray-900 dark:text-white">{{ $t('tables.title') }}</h1>
        <p class="mt-2 text-sm text-gray-700 dark:text-gray-300">{{ $t('tables.description') }}</p>
      </div>
      <div class="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
        <Button @click="handleRebalance">{{ $t('tables.rebalanceWalkers') }}</Button>
      </div>
    </div>

    <div class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Unassigned Servers -->
      <div>
        <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">{{ $t('tables.unassignedServers') }}</h3>
        <div
          @drop="onDropToUnassigned($event, 'server')"
          @dragover.prevent="onDragOverUnassigned($event, 'server')"
          @dragenter.prevent
          @dragleave="isOverUnassignedServer = false"
          class="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border min-h-[20px] max-h-60 overflow-y-auto flex flex-wrap gap-2 transition-colors"
          :class="{ 'border-primary bg-primary/10 border-dashed border-2': isOverUnassignedServer }"
        >
          <div
            v-for="server in unassignedServers"
            :key="server.id"
            draggable="true"
            @dragstart="startDrag($event, server)"
            class="px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full text-sm font-medium cursor-grab"
          >
            {{ server.firstName.split(' ')[0] }} {{ server.lastName.charAt(0) }}.
          </div>
        </div>
      </div>
      <!-- Unassigned Walkers -->
      <div>
        <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">{{ $t('tables.unassignedWalkers') }}</h3>
        <div
          @drop="onDropToUnassigned($event, 'walker')"
          @dragover.prevent="onDragOverUnassigned($event, 'walker')"
          @dragenter.prevent
          @dragleave="isOverUnassignedWalker = false"
          class="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border min-h-[20px] max-h-60 overflow-y-auto flex flex-wrap gap-2 transition-colors"
          :class="{ 'border-primary bg-primary/10 border-dashed border-2': isOverUnassignedWalker }"
        >
          <div
            v-for="walker in unassignedWalkers"
            :key="walker.id"
            draggable="true"
            @dragstart="startDrag($event, walker)"
            class="px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-sm font-medium cursor-grab"
          >
            {{ walker.firstName.split(' ')[0] }} {{ walker.lastName.charAt(0) }}.
          </div>
        </div>
      </div>
    </div>

    <div v-if="retreatStore.selectedRetreatId">
      <div v-if="tableMesaStore.isLoading" class="mt-8 text-center">
        <p>{{ $t('participants.loading') }}</p>
      </div>
      <div v-else-if="tableMesaStore.error" class="mt-8 text-center text-red-500">
        <p>{{ tableMesaStore.error }}</p>
      </div>
      <div v-else-if="tableMesaStore.tables.length === 0" class="mt-8 text-center">
        <p>{{ $t('tables.noTablesFound') }}</p>
      </div>
      <div v-else class="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <TableCard v-for="table in tableMesaStore.tables" :key="table.id" :table="table" />
      </div>
    </div>
    <div v-else class="mt-8 text-center">
      <p>{{ $t('participants.selectRetreatPrompt') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { useTableMesaStore } from '@/stores/tableMesaStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import TableCard from './TableCard.vue';
import { Button } from '@repo/ui/components/ui/button';
import type { Participant } from '@repo/types';

const tableMesaStore = useTableMesaStore();
const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();

const isOverUnassignedServer = ref(false);
const isOverUnassignedWalker = ref(false);

const unassignedServers = computed(() => {
  const assignedServerIds = new Set(
    tableMesaStore.tables.flatMap(t => [t.lider?.id, t.colider1?.id, t.colider2?.id].filter(Boolean))
  );
  return (participantStore.participants || []).filter(p => p.type === 'server' && !p.isCancelled && !assignedServerIds.has(p.id));
});

const unassignedWalkers = computed(() => {
  const assignedWalkerIds = new Set(
    tableMesaStore.tables.flatMap(t => (t.walkers || []).map(w => w.id))
  );
  return (participantStore.participants || []).filter(
    p => p.type === 'walker' && !p.isCancelled && !assignedWalkerIds.has(p.id)
  );
});

const startDrag = (event: DragEvent, participant: Participant) => {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify(participant));
  }
};

const onDragOverUnassigned = (event: DragEvent, type: 'server' | 'walker') => {
  const participantData = event.dataTransfer?.getData('application/json');
  if (!participantData) return;

  const participant = JSON.parse(participantData);

  if (type === 'server' && participant.type === 'server') {
    isOverUnassignedServer.value = true;
  } else if (type === 'walker' && participant.type === 'walker') {
    isOverUnassignedWalker.value = true;
  }
};

const onDropToUnassigned = (event: DragEvent, type: 'server' | 'walker') => {
  isOverUnassignedServer.value = false;
  isOverUnassignedWalker.value = false;

  const participantData = event.dataTransfer?.getData('application/json');
  if (!participantData) return;

  const participant = JSON.parse(participantData);

  // Only proceed if the participant was dragged from a table
  if (!participant.sourceTableId) return;

  if (type === 'server' && participant.type === 'server' && participant.sourceRole && participant.sourceRole !== 'walkers') {
    tableMesaStore.unassignLeader(participant.sourceTableId, participant.sourceRole);
  } else if (type === 'walker' && participant.type === 'walker' && participant.sourceRole === 'walkers') {
    tableMesaStore.unassignWalkerFromTable(participant.sourceTableId, participant.id);
  }
};

const handleRebalance = async () => {
  if (retreatStore.selectedRetreatId) {
    await tableMesaStore.rebalanceTables(retreatStore.selectedRetreatId);
  }
};

onMounted(() => {
  if (retreatStore.selectedRetreatId) {
    tableMesaStore.fetchTables();
    // Fetch all participants (walkers and servers)
    participantStore.filters = {};
    participantStore.filters.retreatId = retreatStore.selectedRetreatId;
    participantStore.filters.isCancelled = false;
    participantStore.fetchParticipants();
  }
});
</script>
