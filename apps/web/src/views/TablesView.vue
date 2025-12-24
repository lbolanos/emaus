<template>
  <div class="h-full flex flex-col">
    <!-- Sticky Header -->
    <div class="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-2 sm:p-3 lg:p-4 border-b">
      <div class="sm:flex sm:items-center sm:justify-between gap-4">
        <div class="sm:flex-auto">
          <h1 class="text-[20px] font-bold leading-6 text-gray-900 dark:text-white">{{ $t('tables.title') }}</h1>
          <p class="mt-2 text-[10px] text-gray-700 dark:text-gray-300">{{ $t('tables.description') }}</p>
        </div>

        <!-- Search and Actions -->
        <div class="flex items-center gap-2 mt-4 sm:mt-0">
          <!-- Search Bar -->
          <div class="relative flex items-center">
            <Input
              v-model="searchQuery"
              :placeholder="$t('common.searchPlaceholder')"
              class="w-64 pr-20"
            />
            <div v-if="totalMatches > 0" class="absolute right-1 flex items-center bg-background rounded-md border">
              <span class="text-xs px-2">{{ currentMatchIndex + 1 }} / {{ totalMatches }}</span>
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7"
                :disabled="currentMatchIndex === 0"
                @click="goToPreviousMatch"
              >
                <ChevronLeft class="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7"
                :disabled="currentMatchIndex === totalMatches - 1"
                @click="goToNextMatch"
              >
                <ChevronRight class="h-4 w-4" />
              </Button>
            </div>
          </div>

          <!-- Column Selector -->
          <Select v-model="columnCount">
            <SelectTrigger class="w-[140px]">
              <LayoutGrid class="h-4 w-4 mr-2" />
              <SelectValue :placeholder="$t('tables.columns')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 {{ $t('tables.column') }}</SelectItem>
              <SelectItem value="2">2 {{ $t('tables.columns') }}</SelectItem>
              <SelectItem value="3">3 {{ $t('tables.columns') }}</SelectItem>
              <SelectItem value="4">4 {{ $t('tables.columns') }}</SelectItem>
            </SelectContent>
          </Select>

          <!-- Actions Dropdown -->
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
            <DropdownMenuItem @click="handlePrintTables">
              <Printer class="mr-2 h-4 w-4" />
              {{ $t('tables.printTables') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>
    </div>

    <!-- Sticky Unassigned Areas -->
    <div class="sticky top-[80px] z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-2 sm:px-3 lg:px-4 py-2 border-b">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Unassigned Servers -->
        <div>
          <h3 class="text-sm font-medium leading-5 text-gray-900 dark:text-white">{{ $t('tables.unassignedServers') }}</h3>
          <div
            @drop="onDropToUnassigned($event, 'server')"
            @dragover.prevent="onDragOverUnassigned($event, 'server')"
            @dragenter.prevent
            @dragleave="onDragLeaveUnassigned($event, 'server')"
            class="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border min-h-[40px] max-h-32 overflow-y-auto flex flex-wrap gap-2 transition-colors"
            :class="{ 'border-primary bg-primary/10 border-dashed border-2': isOverUnassignedServer }"
          >
            <div
              v-for="server in unassignedServers"
              :key="server.id"
              draggable="true"
              @dragstart="startDrag($event, server)"
              @dragend="handleDragEnd"
              :data-participant-id="server.id"
              :data-is-unassigned="true"
              class="px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full text-xs font-medium cursor-grab transition-all"
              :class="getParticipantHighlightClass(server.id)"
            >
              {{ server.firstName.split(' ')[0] }} {{ server.lastName.charAt(0) }}.
            </div>
          </div>
        </div>
        <!-- Unassigned Walkers -->
        <div>
          <h3 class="text-sm font-medium leading-5 text-gray-900 dark:text-white">{{ $t('tables.unassignedWalkers') }}</h3>
          <div
            @drop="onDropToUnassigned($event, 'walker')"
            @dragover.prevent="onDragOverUnassigned($event, 'walker')"
            @dragenter.prevent
            @dragleave="onDragLeaveUnassigned($event, 'walker')"
            class="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border min-h-[40px] max-h-32 overflow-y-auto flex flex-wrap gap-2 transition-colors"
            :class="{ 'border-primary bg-primary/10 border-dashed border-2': isOverUnassignedWalker }"
          >
            <div
              v-for="walker in unassignedWalkers"
              :key="walker.id"
              draggable="true"
              @dragstart="startDrag($event, walker)"
              @dragend="handleDragEnd"
              :data-participant-id="walker.id"
              :data-is-unassigned="true"
              class="px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-xs font-medium cursor-grab transition-all"
              :class="getParticipantHighlightClass(walker.id)"
            >
              {{ walker.firstName.split(' ')[0] }} {{ walker.lastName.charAt(0) }}.
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto p-2 sm:p-3 lg:p-4">
    <div v-if="retreatStore.selectedRetreatId" class="print-container">
      <div v-if="tableMesaStore.isLoading" class="mt-8 text-center">
        <p>{{ $t('participants.loading') }}</p>
      </div>
      <div v-else-if="tableMesaStore.error" class="mt-8 text-center text-red-500">
        <p>{{ tableMesaStore.error }}</p>
      </div>
      <div v-else-if="tableMesaStore.tables.length === 0" class="mt-8 text-center">
        <p>{{ $t('tables.noTablesFound') }}</p>
      </div>
      <div v-else class="mt-8 grid gap-6 card-container" :class="gridColumnsClass">
        <TableCard
          v-for="table in tableMesaStore.tables"
          :key="table.id"
          :table="table"
          :search-query="searchQuery"
          class="table-card"
          @delete="handleDeleteTable"
        />
      </div>
    </div>
    <div v-else class="mt-8 text-center">
      <p>{{ $t('participants.selectRetreatPrompt') }}</p>
    </div>
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
import { nextTick, onMounted, computed, ref, watch } from 'vue';
import { useTableMesaStore } from '@/stores/tableMesaStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import TableCard from './TableCard.vue';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';
import { useToast } from '@repo/ui';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@repo/ui';
import { ChevronLeft, ChevronRight, Download, LayoutGrid, Loader2, MoreVertical, Plus, Printer, RefreshCw } from 'lucide-vue-next';
import type { Participant, TableMesa } from '@repo/types';
import { useI18n } from 'vue-i18n';
import { exportTablesToDocx } from '@/services/api';
import { useDragState } from '@/composables/useDragState';

const tableMesaStore = useTableMesaStore();
const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();
const { toast } = useToast();
const { t } = useI18n();
const { draggedParticipantType, startDrag: startDragState, endDrag } = useDragState();

const isRebalancing = ref(false);
const isRebalanceDialogOpen = ref(false);
const isOverUnassignedServer = ref(false);
const isOverUnassignedWalker = ref(false);
const isDeleteDialogOpen = ref(false);
const isDeleting = ref(false);
const tableToDelete = ref<TableMesa | null>(null);
const isExporting = ref(false);
const columnCount = ref(localStorage.getItem('tables_column_count') || '3');

// Persist column count to local storage
watch(columnCount, (newValue) => {
  localStorage.setItem('tables_column_count', newValue);
});

// Grid columns class based on selection
const gridColumnsClass = computed(() => {
  switch (columnCount.value) {
    case '1': return 'grid-cols-1';
    case '2': return 'grid-cols-1 sm:grid-cols-2';
    case '3': return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    case '4': return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
    default: return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  }
});

// Search functionality
const searchQuery = ref('');
const currentMatchIndex = ref(0);

// Collect all participants from tables and unassigned areas
const allParticipants = computed(() => {
  const participants: Array<{ participant: Participant; source: string; tableId?: string; role?: string }> = [];

  // Add unassigned servers
  unassignedServers.value.forEach(p => {
    participants.push({ participant: p, source: 'unassigned-server' });
  });

  // Add unassigned walkers
  unassignedWalkers.value.forEach(p => {
    participants.push({ participant: p, source: 'unassigned-walker' });
  });

  // Add assigned participants from tables
  tableMesaStore.tables.forEach(table => {
    if (table.lider) {
      participants.push({ participant: table.lider, source: 'table', tableId: table.id, role: 'lider' });
    }
    if (table.colider1) {
      participants.push({ participant: table.colider1, source: 'table', tableId: table.id, role: 'colider1' });
    }
    if (table.colider2) {
      participants.push({ participant: table.colider2, source: 'table', tableId: table.id, role: 'colider2' });
    }
    (table.walkers || []).forEach(walker => {
      participants.push({ participant: walker, source: 'table', tableId: table.id, role: 'walker' });
    });
  });

  return participants;
});

// Normalize text: remove accents and convert to lowercase
const normalizeText = (text: string): string => {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
};

// Get matching participants based on search query
const matchingParticipants = computed(() => {
  if (!searchQuery.value.trim()) return [];

  const normalizedQuery = normalizeText(searchQuery.value.trim());
  return allParticipants.value.filter(({ participant }) => {
    return (
      (participant.firstName && normalizeText(participant.firstName).includes(normalizedQuery)) ||
      (participant.lastName && normalizeText(participant.lastName).includes(normalizedQuery)) ||
      (participant.nickname && normalizeText(participant.nickname).includes(normalizedQuery)) ||
      (participant.id_on_retreat && participant.id_on_retreat.toString().includes(normalizedQuery))
    );
  });
});

const totalMatches = computed(() => matchingParticipants.value.length);

// Get highlight class for a participant
const getParticipantHighlightClass = (participantId: string) => {
  if (!searchQuery.value.trim() || totalMatches.value === 0) return '';

  const matchIndex = matchingParticipants.value.findIndex(m => m.participant.id === participantId);

  if (matchIndex === -1) return '';

  if (matchIndex === currentMatchIndex.value) {
    // Current match - prominent highlight with ring
    return 'ring-2 ring-yellow-500 ring-offset-2 bg-yellow-200 dark:bg-yellow-700 scale-110';
  } else {
    // Other matches - subtle highlight
    return 'bg-yellow-100 dark:bg-yellow-800/50';
  }
};

// Navigate between matches
const goToPreviousMatch = () => {
  if (currentMatchIndex.value > 0) {
    currentMatchIndex.value--;
    updateCurrentMatchIndex();
    scrollToCurrentMatch();
  }
};

const goToNextMatch = () => {
  if (currentMatchIndex.value < totalMatches.value - 1) {
    currentMatchIndex.value++;
    updateCurrentMatchIndex();
    scrollToCurrentMatch();
  }
};

// Update the global current match index on window object
const updateCurrentMatchIndex = () => {
  (window as any).__currentMatchIndex = currentMatchIndex.value;
  // Trigger a re-render in TableCard components
  window.dispatchEvent(new CustomEvent('search-index-changed'));
};

// Scroll to the current match
const scrollToCurrentMatch = () => {
  if (totalMatches.value === 0) return;

  const currentMatch = matchingParticipants.value[currentMatchIndex.value];
  if (!currentMatch) return;

  // Try to find the element in the unassigned areas first
  const unassignedElement = document.querySelector(`[data-participant-id="${currentMatch.participant.id}"][data-is-unassigned="true"]`);

  if (unassignedElement) {
    unassignedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // If not in unassigned areas, it might be in a table - we'll emit an event or use a different approach
  // For now, we'll just emit a custom event that TableCard can listen to
  window.dispatchEvent(new CustomEvent('scroll-to-participant', {
    detail: { participantId: currentMatch.participant.id }
  }));
};

// Watch for search query changes to reset current match index
watch(searchQuery, () => {
  currentMatchIndex.value = 0;
  updateCurrentMatchIndex();
  if (totalMatches.value > 0) {
    nextTick(() => {
      scrollToCurrentMatch();
    });
  }
});

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
    // Only start drag state for valid types (walker or server)
    if (participant.type === 'walker' || participant.type === 'server') {
      startDragState(participant.type);
    }
  }
};

const handleDragEnd = () => {
  endDrag();
  isOverUnassignedServer.value = false;
  isOverUnassignedWalker.value = false;
};

const onDragOverUnassigned = (event: DragEvent, type: 'server' | 'walker') => {
  // Use the global drag state instead of dataTransfer.getData()
  // which doesn't work in dragover events due to security restrictions
  if (draggedParticipantType.value) {
    if (type === 'server' && draggedParticipantType.value === 'server') {
      isOverUnassignedServer.value = true;
    } else if (type === 'walker' && draggedParticipantType.value === 'walker') {
      isOverUnassignedWalker.value = true;
    }
  }
};

const onDragLeaveUnassigned = (event: DragEvent, type: 'server' | 'walker') => {
  // Only hide highlight if actually leaving the drop zone (not entering a child element)
  const target = event.currentTarget as HTMLElement;
  const relatedTarget = event.relatedTarget as HTMLElement;

  // If relatedTarget is null or not a descendant of the drop zone, we're actually leaving
  if (!relatedTarget || !target.contains(relatedTarget)) {
    if (type === 'server') {
      isOverUnassignedServer.value = false;
    } else {
      isOverUnassignedWalker.value = false;
    }
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

const handlePrintTables = () => {
  window.print();
};

// Watch for retreat changes to fetch participants
watch(
  () => [retreatStore.selectedRetreatId, retreatStore.retreats] as const,
  ([newRetreatId, retreats]) => {
    if (newRetreatId && retreats.length > 0) {
      participantStore.filters.retreatId = newRetreatId;
      participantStore.filters.isCancelled = false;
      participantStore.fetchParticipants();
    }
  },
  { immediate: true }
);

onMounted(() => {
  if (retreatStore.selectedRetreatId) {
    tableMesaStore.fetchTables();
  }
});
</script>

<style>
@media print {
  /* Hide everything except print container */
  body * {
    visibility: hidden;
  }
  .print-container, .print-container * {
    visibility: visible;
  }
  .print-container {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }

  /* Hide non-printable elements */
  .no-print,
  .sticky,
  button,
  input {
    display: none !important;
  }

  /* Optimize grid layout for print - 4 tables per page */
  .card-container {
    display: grid !important;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }

  @page {
    size: A4;
    margin: 1cm;
  }

  /* Prevent page breaks within table cards */
  .table-card {
    break-inside: avoid-page;
    page-break-inside: avoid;
    display: block;
    height: auto;
    border: 1px solid #ccc;
    margin-bottom: 1rem;
  }

  /* Optimize colors for print */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
</style>
