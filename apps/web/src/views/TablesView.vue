<template>
  <div class="p-2 sm:p-3 lg:p-4">
    <div class="sm:flex sm:items-center sm:justify-between">
      <div class="sm:flex-auto">
        <h1 class="text-2xl font-bold leading-6 text-gray-900 dark:text-white">{{ $t('tables.title') }}</h1>
        <p class="mt-2 text-sm text-gray-700 dark:text-gray-300">{{ $t('tables.description') }}</p>
      </div>
      <!-- Buttons actions -->
      <div class="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon">
              <MoreVertical class="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="isRebalanceDialogOpen = true">
              <RefreshCw class="mr-2 h-4 w-4" />
              {{ $t('tables.rebalanceWalkers') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="handleCreateTable">
              <Plus class="mr-2 h-4 w-4" />
              {{ $t('tables.addTable') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="handleExportTables" :disabled="isExporting">
              <Download v-if="!isExporting" class="mr-2 h-4 w-4" />
              <Loader2 v-else class="mr-2 h-4 w-4 animate-spin" />
              {{ isExporting ? $t('tables.exporting') : $t('tables.exportDocx') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
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
        <TableCard
          v-for="table in tableMesaStore.tables"
          :key="table.id"
          :table="table"
          @delete="handleDeleteTable"
        />
      </div>
    </div>
    <div v-else class="mt-8 text-center">
      <p>{{ $t('participants.selectRetreatPrompt') }}</p>
    </div>

    <!-- Rebalance Confirmation Dialog -->
    <Dialog :open="isRebalanceDialogOpen" @update:open="isRebalanceDialogOpen = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('tables.rebalanceConfirmation.title') }}</DialogTitle>
          <DialogDescription>{{ $t('tables.rebalanceConfirmation.description') }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="isRebalanceDialogOpen = false">{{ $t('common.cancel') }}</Button>
          <Button @click="confirmRebalance" :disabled="isRebalancing">
            <Loader2 v-if="isRebalancing" class="w-4 h-4 mr-2 animate-spin" />
            {{
              isRebalancing ? $t('tables.rebalanceConfirmation.rebalancing') : $t('tables.rebalanceConfirmation.confirm')
            }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Table Confirmation Dialog -->
    <Dialog :open="isDeleteDialogOpen" @update:open="isDeleteDialogOpen = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('tables.deleteTable.title') }}</DialogTitle>
          <DialogDescription>{{ $t('tables.deleteTable.description') }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="isDeleteDialogOpen = false">{{ $t('common.cancel') }}</Button>
          <Button variant="destructive" @click="confirmDeleteTable" :disabled="isDeleting">
            <Loader2 v-if="isDeleting" class="w-4 h-4 mr-2 animate-spin" />
            {{ $t('common.delete') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { useTableMesaStore } from '@/stores/tableMesaStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import TableCard from './TableCard.vue';
import { Button } from '@repo/ui';
import { useToast } from '@repo/ui';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@repo/ui';
import { Download, Loader2, MoreVertical, Plus, RefreshCw } from 'lucide-vue-next';
import type { Participant, TableMesa } from '@repo/types';
import { useI18n } from 'vue-i18n';
import { exportTablesToDocx } from '@/services/api';

const tableMesaStore = useTableMesaStore();
const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();
const { toast } = useToast();
const { t } = useI18n();

const isRebalancing = ref(false);
const isRebalanceDialogOpen = ref(false);
const isOverUnassignedServer = ref(false);
const isOverUnassignedWalker = ref(false);
const isDeleteDialogOpen = ref(false);
const isDeleting = ref(false);
const tableToDelete = ref<TableMesa | null>(null);
const isExporting = ref(false);

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

const handleCreateTable = () => {
  tableMesaStore.createTable();
};

const confirmRebalance = async () => {
  if (retreatStore.selectedRetreatId) {
    isRebalancing.value = true;
    try {
      await tableMesaStore.rebalanceTables(retreatStore.selectedRetreatId);
      isRebalanceDialogOpen.value = false;
      toast({
        title: t('tables.rebalanceConfirmation.successTitle'),
        description: t('tables.rebalanceConfirmation.successDescription'),
      });
    } catch (error) {
      toast({
        title: t('tables.rebalanceConfirmation.errorTitle'),
        description: t('tables.rebalanceConfirmation.errorDescription'),
        variant: 'destructive',
      });
    } finally {
      isRebalancing.value = false;
    }
  }
};

const handleDeleteTable = (table: TableMesa) => {
  tableToDelete.value = table;
  isDeleteDialogOpen.value = true;
};

const confirmDeleteTable = async () => {
  if (!tableToDelete.value) return;
  isDeleting.value = true;
  try {
    await tableMesaStore.deleteTable(tableToDelete.value.id);
  } finally {
    isDeleting.value = false;
    isDeleteDialogOpen.value = false;
  }
};

const handleExportTables = async () => {
  if (!retreatStore.selectedRetreatId) {
    toast({
      title: t('common.error'),
      description: 'Por favor, selecciona un retiro.',
      variant: 'destructive',
    });
    return;
  }

  isExporting.value = true;
  try {
    await exportTablesToDocx(retreatStore.selectedRetreatId);
    toast({
      title: t('tables.exportSuccess.title'),
      description: t('tables.exportSuccess.description'),
    });
  } catch (error) {
    console.error('Error exporting tables:', error);
    toast({
      title: t('tables.exportError.title'),
      description: t('tables.exportError.description'),
      variant: 'destructive',
    });
  } finally {
    isExporting.value = false;
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
