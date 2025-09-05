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
        <div class="mt-2 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border min-h-[100px] max-h-60 overflow-y-auto">
          <div
            v-for="server in unassignedServers"
            :key="server.id"
            draggable="true"
            @dragstart="startDrag($event, server)"
            class="p-2 my-1 bg-white dark:bg-gray-700 rounded shadow-sm cursor-grab"
          >
            {{ server.firstName }} {{ server.lastName }}
          </div>
        </div>
      </div>
      <!-- Unassigned Walkers -->
      <div>
        <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">{{ $t('tables.unassignedWalkers') }}</h3>
        <div class="mt-2 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border min-h-[100px] max-h-60 overflow-y-auto">
          <div
            v-for="walker in unassignedWalkers"
            :key="walker.id"
            draggable="true"
            @dragstart="startDrag($event, walker)"
            class="p-2 my-1 bg-white dark:bg-gray-700 rounded shadow-sm cursor-grab"
          >
            {{ walker.firstName }} {{ walker.lastName }}
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
import { onMounted, computed } from 'vue';
import { useTableMesaStore } from '@/stores/tableMesaStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import TableCard from './TableCard.vue';
import { Button } from '@repo/ui/components/ui/button';
import type { Participant } from '@repo/types';

const tableMesaStore = useTableMesaStore();
const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();

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
  return (participantStore.participants || []).filter(p => p.type === 'walker' && !p.isCancelled && !assignedWalkerIds.has(p.id) && !p.tableId);
});

const startDrag = (event: DragEvent, participant: Participant) => {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify(participant));
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