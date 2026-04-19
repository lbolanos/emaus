<template>
  <TooltipProvider :delay-duration="300">
  <div class="h-full flex flex-col tables-view-root">
    <!-- Sticky Header -->
    <div class="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-1.5 sm:p-3 lg:p-4 border-b">
      <div class="sm:flex sm:items-center sm:justify-between gap-4">
        <div class="hidden sm:block sm:flex-auto">
          <h1 class="text-[20px] font-bold leading-6 text-gray-900 dark:text-white">{{ $t('tables.title') }}</h1>
          <p class="mt-2 text-[10px] text-gray-700 dark:text-gray-300">{{ $t('tables.description') }}</p>
        </div>

        <!-- Search and Actions -->
        <div class="flex items-center gap-2">
          <!-- Search Bar -->
          <div class="relative flex items-center flex-1 sm:flex-none">
            <Input
              v-model="searchQuery"
              :placeholder="$t('common.searchPlaceholder')"
              class="w-full sm:w-64 pr-20"
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

          <!-- Column Selector (hidden on mobile) -->
          <Select v-model="columnCount" class="hidden sm:inline-flex">
            <SelectTrigger class="w-[70px]">
              <LayoutGrid class="h-4 w-4 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
              <SelectItem value="4">4</SelectItem>
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
            <DropdownMenuItem @click="isClearAllDialogOpen = true">
              <UserX class="mr-2 h-4 w-4" />
              {{ $t('tables.clearAll') }}
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
            <DropdownMenuItem @click="handlePrintTablesSimple">
              <Printer class="mr-2 h-4 w-4" />
              {{ $t('tables.printTablesSimple') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="handlePrintTablesContacts">
              <Printer class="mr-2 h-4 w-4" />
              {{ $t('tables.printTablesContacts') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="handlePrintTablesContactsPerParticipant">
              <Printer class="mr-2 h-4 w-4" />
              {{ $t('tables.printTablesContactsPerParticipant') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="isLotteryCardsOpen = true">
              <Scissors class="mr-2 h-4 w-4" />
              {{ $t('tables.printLotteryCards') }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="isHelpOpen = true">
              <HelpCircle class="mr-2 h-4 w-4" />
              {{ $t('tables.help.menuItem') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>
    </div>

    <!-- Sticky Unassigned Areas -->
    <div class="sm:sticky sm:top-[80px] z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-2 sm:px-3 lg:px-4 py-2 border-b">

      <!-- Mobile: tab buttons (hidden on md+) -->
      <div class="flex gap-1 mb-2 md:hidden">
        <button
          @click="unassignedTab = 'server'"
          class="px-3 py-1 rounded-full text-xs font-medium transition-colors"
          :class="unassignedTab === 'server'
            ? 'bg-blue-600 text-white'
            : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800'"
        >
          {{ $t('tables.unassignedServers') }} ({{ unassignedServers.length }})
        </button>
        <button
          @click="unassignedTab = 'walker'"
          class="px-3 py-1 rounded-full text-xs font-medium transition-colors"
          :class="unassignedTab === 'walker'
            ? 'bg-green-600 text-white'
            : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800'"
        >
          {{ $t('tables.unassignedWalkers') }} ({{ unassignedWalkers.length }})
        </button>
      </div>

      <!-- Desktop: side-by-side grid (hidden on mobile) -->
      <div class="hidden md:grid md:grid-cols-2 gap-4">
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
            <ParticipantTooltip
              v-for="server in unassignedServers"
              :key="server.id"
              :participant="server"
            >
              <div
                draggable="true"
                @touchstart.passive="tapTouchStart"
                @touchend="tapTouchEnd($event, server)"
                @dragstart="startDrag($event, server)"
                @dragend="handleDragEnd"
                :data-participant-id="server.id"
                :data-is-unassigned="true"
                class="px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full text-xs font-medium cursor-pointer transition-all"
                :class="[getParticipantHighlightClass(server.id), { 'ring-2 ring-blue-500 ring-offset-1 scale-110': isTapSelected(server.id) }]"
              >
                {{ server.firstName.split(' ')[0] }} {{ server.lastName.charAt(0) }}.
              </div>
            </ParticipantTooltip>
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
            <ParticipantTooltip
              v-for="walker in unassignedWalkers"
              :key="walker.id"
              :participant="walker"
            >
              <div
                draggable="true"
                @touchstart.passive="tapTouchStart"
                @touchend="tapTouchEnd($event, walker)"
                @dragstart="startDrag($event, walker)"
                @dragend="handleDragEnd"
                :data-participant-id="walker.id"
                :data-is-unassigned="true"
                class="px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-xs font-medium cursor-pointer transition-all"
                :class="[getParticipantHighlightClass(walker.id), { 'ring-2 ring-green-500 ring-offset-1 scale-110': isTapSelected(walker.id) }]"
              >
                <span class="font-bold px-1 rounded" :style="walker.family_friend_color ? { backgroundColor: walker.family_friend_color, color: '#000' } : {}">{{ walker.id_on_retreat || '' }}</span> {{ walker.firstName.split(' ')[0] }} {{ walker.lastName.charAt(0) }}.
              </div>
            </ParticipantTooltip>
          </div>
        </div>
      </div>

      <!-- Mobile: tabbed content (hidden on md+) - NO tooltip wrapper, touch handlers on outer span -->
      <div class="md:hidden">
        <!-- Unassigned Servers -->
        <div v-show="unassignedTab === 'server'">
          <div class="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border min-h-[40px] max-h-24 overflow-y-auto flex flex-wrap gap-2">
            <span
              v-for="server in unassignedServers"
              :key="server.id"
              @touchstart.passive="tapTouchStart"
              @touchend="tapTouchEnd($event, server)"
              class="px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full text-xs font-medium cursor-pointer transition-all select-none"
              :class="{ 'ring-2 ring-blue-500 ring-offset-1 scale-110': isTapSelected(server.id) }"
            >
              {{ server.firstName.split(' ')[0] }} {{ server.lastName.charAt(0) }}.
            </span>
          </div>
        </div>
        <!-- Unassigned Walkers -->
        <div v-show="unassignedTab === 'walker'">
          <div class="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border min-h-[40px] max-h-24 overflow-y-auto flex flex-wrap gap-2">
            <span
              v-for="walker in unassignedWalkers"
              :key="walker.id"
              @touchstart.passive="tapTouchStart"
              @touchend="tapTouchEnd($event, walker)"
              class="px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-xs font-medium cursor-pointer transition-all select-none"
              :class="{ 'ring-2 ring-green-500 ring-offset-1 scale-110': isTapSelected(walker.id) }"
            >
              <span class="font-bold px-1 rounded" :style="walker.family_friend_color ? { backgroundColor: walker.family_friend_color, color: '#000' } : {}">{{ walker.id_on_retreat || '' }}</span> {{ walker.firstName.split(' ')[0] }} {{ walker.lastName.charAt(0) }}.
            </span>
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
      <div v-else class="mt-4 sm:mt-8 grid gap-4 sm:gap-6 card-container" :class="gridColumnsClass">
        <TableCard
          v-for="table in tableMesaStore.tables"
          :key="table.id"
          :table="table"
          :search-query="searchQuery"
          class="table-card"
          @delete="handleDeleteTable"
          @refresh="tableMesaStore.fetchTables()"
        />
      </div>
    </div>
    <div v-else class="mt-8 text-center">
      <p>{{ $t('participants.selectRetreatPrompt') }}</p>
    </div>
    </div>

  </div>
  </TooltipProvider>

  <!-- Rebalance Confirmation Dialog -->
  <Teleport to="body" v-if="isRebalanceDialogOpen">
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" @click.self="isRebalanceDialogOpen = false">
      <div class="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full">
        <div class="p-6">
          <h2 class="text-lg font-semibold">{{ $t('tables.rebalanceConfirmation.title') }}</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">{{ $t('tables.rebalanceConfirmation.description') }}</p>
        </div>
        <div class="flex items-center justify-end gap-2 p-6 border-t">
          <Button variant="outline" @click="isRebalanceDialogOpen = false">{{ $t('common.cancel') }}</Button>
          <Button @click="confirmRebalance" :disabled="isRebalancing">
            <Loader2 v-if="isRebalancing" class="w-4 h-4 mr-2 animate-spin" />
            {{ isRebalancing ? $t('tables.rebalanceConfirmation.rebalancing') : $t('tables.rebalanceConfirmation.confirm') }}
          </Button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Clear All Tables Confirmation Dialog -->
  <Teleport to="body" v-if="isClearAllDialogOpen">
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" @click.self="isClearAllDialogOpen = false">
      <div class="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full">
        <div class="p-6">
          <h2 class="text-lg font-semibold">{{ $t('tables.clearAllConfirmation.title') }}</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">{{ $t('tables.clearAllConfirmation.description') }}</p>
        </div>
        <div class="flex items-center justify-end gap-2 p-6 border-t">
          <Button variant="outline" @click="isClearAllDialogOpen = false">{{ $t('common.cancel') }}</Button>
          <Button variant="destructive" @click="confirmClearAll" :disabled="isClearingAll">
            <Loader2 v-if="isClearingAll" class="w-4 h-4 mr-2 animate-spin" />
            {{ isClearingAll ? $t('tables.clearAllConfirmation.clearing') : $t('tables.clearAllConfirmation.confirm') }}
          </Button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Delete Table Confirmation Dialog -->
  <Teleport to="body" v-if="isDeleteDialogOpen">
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" @click.self="isDeleteDialogOpen = false">
      <div class="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full">
        <div class="p-6">
          <h2 class="text-lg font-semibold">{{ $t('tables.deleteTable.title') }}</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">{{ $t('tables.deleteTable.description') }}</p>
        </div>
        <div class="flex items-center justify-end gap-2 p-6 border-t">
          <Button variant="outline" @click="isDeleteDialogOpen = false">{{ $t('common.cancel') }}</Button>
          <Button variant="destructive" @click="confirmDeleteTable" :disabled="isDeleting">
            <Loader2 v-if="isDeleting" class="w-4 h-4 mr-2 animate-spin" />
            {{ $t('common.delete') }}
          </Button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Lottery Cards Dialog -->
  <LotteryCardsDialog
    v-if="isLotteryCardsOpen"
    :open="isLotteryCardsOpen"
    :walkers="allWalkers"
    @close="isLotteryCardsOpen = false"
  />

  <TablesHelpDialog :open="isHelpOpen" @update:open="isHelpOpen = $event" />

  <!-- Floating unassign button — shown when an assigned participant is tap-selected -->
  <Teleport to="body">
    <div
      v-if="tappedParticipant && (tappedParticipant as any).sourceTableId"
      class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex gap-2 shadow-lg"
    >
      <Button size="sm" variant="destructive" @click="onTapUnassign">
        <X class="w-4 h-4 mr-1" />
        {{ $t('tables.tapUnassign') }}
      </Button>
      <Button size="sm" variant="outline" @click="clearTap">
        {{ $t('common.cancel') }}
      </Button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, computed, ref, watch } from 'vue';
import { useTableMesaStore } from '@/stores/tableMesaStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import TableCard from './TableCard.vue';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TooltipProvider } from '@repo/ui';
import ParticipantTooltip from '@/components/ParticipantTooltip.vue';
import LotteryCardsDialog from '@/components/LotteryCardsDialog.vue';
import TablesHelpDialog from '@/components/TablesHelpDialog.vue';
import { useToast } from '@repo/ui';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@repo/ui';
import { ChevronLeft, ChevronRight, Download, HelpCircle, LayoutGrid, Loader2, MoreVertical, Plus, Printer, RefreshCw, Scissors, UserX, X } from 'lucide-vue-next';
import type { Participant, TableMesa } from '@repo/types';
import { useI18n } from 'vue-i18n';
import { exportTablesToDocx } from '@/services/api';
import { useDragState } from '@/composables/useDragState';
import { useTapAssign } from '@/composables/useTapAssign';
import {
  buildSimplePrintHtml,
  buildContactsPrintHtml,
  buildContactsPerParticipantPrintHtml,
} from '@/utils/tablesPrint';

const tableMesaStore = useTableMesaStore();
const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();
const { toast } = useToast();
const { t } = useI18n();
const { draggedParticipantType, startDrag: startDragState, endDrag } = useDragState();
const { tappedParticipant, onTouchStart: tapTouchStart, onTouchEnd: tapTouchEnd, clearSelection: clearTap, isSelected: isTapSelected } = useTapAssign();

const onTapUnassign = () => {
	if (!tappedParticipant.value) return;
	const p = tappedParticipant.value as any;
	if (!p.sourceTableId) { clearTap(); return; }
	const isServer = p.type === 'server' || ['lider', 'colider1', 'colider2'].includes(p.sourceRole);
	if (isServer && p.sourceRole) {
		tableMesaStore.unassignLeader(p.sourceTableId, p.sourceRole);
	} else if (!isServer) {
		tableMesaStore.unassignWalkerFromTable(p.sourceTableId, p.id);
	}
	clearTap();
};

const isRebalancing = ref(false);
const isRebalanceDialogOpen = ref(false);
const isOverUnassignedServer = ref(false);
const isOverUnassignedWalker = ref(false);
const isDeleteDialogOpen = ref(false);
const isDeleting = ref(false);
const tableToDelete = ref<TableMesa | null>(null);
const isClearAllDialogOpen = ref(false);
const isClearingAll = ref(false);
const isExporting = ref(false);
const isLotteryCardsOpen = ref(false);
const isHelpOpen = ref(false);
const unassignedTab = ref<'server' | 'walker'>('walker');
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

const allWalkers = computed(() => {
  return (participantStore.participants || []).filter(p => p.type === 'walker' && !p.isCancelled);
});

const startDrag = (event: DragEvent, participant: Participant) => {

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify(participant));
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

const confirmClearAll = async () => {
  if (retreatStore.selectedRetreatId) {
    isClearingAll.value = true;
    try {
      await tableMesaStore.clearAllTables(retreatStore.selectedRetreatId);
      toast({
        title: t('tables.clearAllConfirmation.successTitle'),
        description: t('tables.clearAllConfirmation.successDescription'),
      });
    } catch (error) {
      toast({
        title: t('tables.clearAllConfirmation.errorTitle'),
        description: t('tables.clearAllConfirmation.errorDescription'),
        variant: 'destructive',
      });
    } finally {
      isClearingAll.value = false;
      isClearAllDialogOpen.value = false;
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

const escapeHtml = (unsafe: unknown): string => {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const formatPhones = (p: any): string => {
  const parts: string[] = [];
  if (p.cellPhone) parts.push(`📱 ${escapeHtml(p.cellPhone)}`);
  if (p.homePhone) parts.push(`🏠 ${escapeHtml(p.homePhone)}`);
  if (p.workPhone) parts.push(`🏢 ${escapeHtml(p.workPhone)}`);
  return parts.join('<br>');
};

const formatMedication = (p: any): string => {
  if (!p.hasMedication) return '—';
  const bits: string[] = [];
  if (p.medicationDetails) bits.push(`💊 ${escapeHtml(p.medicationDetails)}`);
  if (p.medicationSchedule) bits.push(`⏰ ${escapeHtml(p.medicationSchedule)}`);
  return bits.length ? bits.join('<br>') : '✅ Sí';
};

const formatFood = (p: any): string => {
  if (!p.hasDietaryRestrictions) return '—';
  return `⚠️ ${escapeHtml(p.dietaryRestrictionsDetails || 'Con restricciones')}`;
};

const formatDisability = (p: any): string => {
  if (!p.disabilitySupport) return '—';
  return `♿ ${escapeHtml(p.disabilitySupport)}`;
};

const formatEmergency = (p: any): string => {
  if (!p.emergencyContact1Name) return '—';
  const rel = p.emergencyContact1Relation ? `${escapeHtml(p.emergencyContact1Relation)}` : '';
  const phone = p.emergencyContact1CellPhone ? `📞 ${escapeHtml(p.emergencyContact1CellPhone)}` : '';
  return `🆘 ${escapeHtml(p.emergencyContact1Name)}${rel ? `<br>${rel}` : ''}${phone ? `<br>${phone}` : ''}`;
};

const renderLeadersTable = (table: any): string => {
  const leaders: Array<{ role: string; p: any }> = [];
  if (table.lider) leaders.push({ role: t('tables.roles.lider'), p: table.lider });
  if (table.colider1) leaders.push({ role: t('tables.roles.colider1'), p: table.colider1 });
  if (table.colider2) leaders.push({ role: t('tables.roles.colider2'), p: table.colider2 });
  if (leaders.length === 0) return '';

  const rows = leaders
    .map(({ role, p }) => {
      const name = `${escapeHtml(p.firstName || '')} ${escapeHtml(p.lastName || '')}`.trim();
      const email = p.email ? escapeHtml(p.email) : '—';
      return `<tr>
        <td class="cell-role">${escapeHtml(role)}</td>
        <td class="cell-name">${name}</td>
        <td>${formatPhones(p) || '—'}</td>
        <td>${email}</td>
      </tr>`;
    })
    .join('');

  return `<table class="leaders-table">
    <thead>
      <tr>
        <th>Rol</th>
        <th>Nombre</th>
        <th>Teléfonos</th>
        <th>Email</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
};

const renderWalkersTable = (table: any): string => {
  const walkers = table.walkers || [];
  if (walkers.length === 0) return `<p class="tc-empty">—</p>`;

  const rows = walkers
    .map((w: any) => {
      const idOnRetreat = w.id_on_retreat ?? w.idOnRetreat ?? '';
      const color = w.family_friend_color || w.familyFriendColor || '';
      const idBadge = idOnRetreat
        ? `<span class="w-id" style="${color ? `background-color:${escapeHtml(color)};color:#000;` : ''}">${escapeHtml(idOnRetreat)}</span>`
        : '';
      const name = `${escapeHtml(w.firstName || '')} ${escapeHtml(w.lastName || '')}`.trim();
      return `<tr>
        <td class="cell-id">${idBadge}</td>
        <td class="cell-name">${name}</td>
        <td>${formatPhones(w) || '—'}</td>
        <td class="${w.hasMedication ? 'flag-med' : ''}">${formatMedication(w)}</td>
        <td class="${w.hasDietaryRestrictions ? 'flag-food' : ''}">${formatFood(w)}</td>
        <td class="${w.disabilitySupport ? 'flag-dis' : ''}">${formatDisability(w)}</td>
        <td class="cell-emergency">${formatEmergency(w)}</td>
      </tr>`;
    })
    .join('');

  return `<table class="walkers-table">
    <thead>
      <tr>
        <th>ID</th>
        <th>Nombre</th>
        <th>Teléfonos</th>
        <th>Medicamentos</th>
        <th>Alimentación</th>
        <th>Apoyos</th>
        <th>Contacto emergencia</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
};

const buildPrintHtml = (): string => {
  const tables = tableMesaStore.tables || [];
  if (tables.length === 0) {
    return `<p>${escapeHtml(t('tables.noTablesFound'))}</p>`;
  }

  return tables
    .map((table: any) => {
      const count = (table.walkers || []).length;
      return `<section class="table-card">
        <header class="tc-head">
          <h2>${escapeHtml(table.name)}</h2>
          <span class="tc-count">${count} / 7 caminantes</span>
        </header>
        ${renderLeadersTable(table)}
        <h3 class="walkers-title">Caminantes</h3>
        ${renderWalkersTable(table)}
      </section>`;
    })
    .join('');
};

const handlePrintTables = () => {
  const body = buildPrintHtml();
  const win = window.open('', '_blank', 'width=1024,height=768');
  if (!win) {
    toast({
      title: t('common.error'),
      description: 'El navegador bloqueó la ventana emergente. Permite pop-ups para imprimir.',
      variant: 'destructive',
    });
    return;
  }

  const title = escapeHtml(t('tables.title'));
  const retreatLabel = retreatStore.retreats.find((r) => r.id === retreatStore.selectedRetreatId);
  const retreatName = retreatLabel ? escapeHtml(retreatLabel.parish || '') : '';

  const css = [
    '@page { size: A4 landscape; margin: 0.8cm; }',
    '* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    "html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }",
    'body { padding: 10px; font-size: 10px; }',
    'h1 { font-size: 16px; margin: 0 0 4px; }',
    '.header { margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }',
    '.table-card { border: 1px solid #cbd5e0; border-radius: 4px; padding: 8px; margin-bottom: 10px; break-inside: avoid-page; page-break-inside: avoid; }',
    '.tc-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }',
    '.tc-head h2 { font-size: 14px; margin: 0; color: #2b6cb0; }',
    '.tc-count { font-size: 10px; color: #4a5568; }',
    '.walkers-title { font-size: 11px; margin: 8px 0 4px; color: #2d3748; }',
    '.tc-empty { font-size: 10px; color: #a0aec0; font-style: italic; }',
    'table { width: 100%; border-collapse: collapse; font-size: 9px; }',
    'th, td { border: 1px solid #e2e8f0; padding: 3px 4px; vertical-align: top; text-align: left; }',
    'thead th { background: #edf2f7; color: #2d3748; font-weight: bold; font-size: 9px; }',
    '.leaders-table thead th { background: #bee3f8; }',
    '.walkers-table thead th { background: #c6f6d5; }',
    '.cell-role { font-weight: bold; color: #2b6cb0; white-space: nowrap; }',
    '.cell-name { font-weight: bold; }',
    '.cell-id { text-align: center; }',
    '.cell-emergency { color: #b91c1c; }',
    '.flag-med { color: #744210; font-weight: bold; }',
    '.flag-food { color: #c53030; font-weight: bold; }',
    '.flag-dis { color: #b7791f; font-weight: bold; }',
    '.w-id { display: inline-block; min-width: 22px; text-align: center; padding: 1px 4px; border-radius: 3px; font-weight: bold; background: #edf2f7; }',
    'tr { break-inside: avoid; page-break-inside: avoid; }',
    '@media print { body { padding: 0; } }',
  ].join(' ');

  const inlineScript =
    'window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},100);});';

  const scriptOpen = '<' + 'script>';
  const scriptClose = '<' + '/script>';

  const html =
    '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
    `<title>${title}</title>` +
    `<style>${css}</style>` +
    '</head><body>' +
    `<div class="header"><h1>${title}${retreatName ? ` — ${retreatName}` : ''}</h1></div>` +
    body +
    scriptOpen + inlineScript + scriptClose +
    '</body></html>';

  win.document.open();
  win.document.write(html);
  win.document.close();
};

const handlePrintTablesSimple = () => {
  const body = buildSimplePrintHtml((tableMesaStore.tables || []) as any, {
    lider: t('tables.roles.lider'),
    colider1: t('tables.roles.colider1'),
    colider2: t('tables.roles.colider2'),
    noTablesFound: t('tables.noTablesFound'),
    servidores: 'Servidores',
    caminantes: 'Caminantes',
  });
  const win = window.open('', '_blank', 'width=1024,height=768');
  if (!win) {
    toast({
      title: t('common.error'),
      description: 'El navegador bloqueó la ventana emergente. Permite pop-ups para imprimir.',
      variant: 'destructive',
    });
    return;
  }

  const title = escapeHtml(t('tables.title'));
  const retreatLabel = retreatStore.retreats.find((r) => r.id === retreatStore.selectedRetreatId);
  const retreatName = retreatLabel ? escapeHtml(retreatLabel.parish || '') : '';

  const css = [
    '@page { size: A4 portrait; margin: 1cm; }',
    '* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    "html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }",
    'body { padding: 10px; font-size: 11px; }',
    'h1 { font-size: 16px; margin: 0 0 4px; }',
    '.header { margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }',
    '.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }',
    '.table-card { border: 1px solid #cbd5e0; border-radius: 4px; padding: 8px; break-inside: avoid-page; page-break-inside: avoid; }',
    '.tc-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; padding-bottom: 3px; border-bottom: 1px solid #e2e8f0; }',
    '.tc-head h2 { font-size: 13px; margin: 0; color: #2b6cb0; }',
    '.tc-count { font-size: 10px; color: #4a5568; }',
    'h3 { font-size: 11px; margin: 6px 0 2px; color: #2d3748; }',
    'ul { list-style: none; margin: 0; padding: 0; }',
    'ul.leaders li { font-size: 11px; padding: 1px 0; }',
    'ul.walkers li { font-size: 11px; padding: 1px 0; }',
    '.role { font-weight: bold; color: #2b6cb0; }',
    '.tc-empty { font-size: 10px; color: #a0aec0; font-style: italic; margin: 0; }',
    '.w-id { display: inline-block; min-width: 20px; text-align: center; padding: 0 4px; border-radius: 3px; font-weight: bold; background: #edf2f7; font-size: 10px; }',
    '@media print { body { padding: 0; } }',
  ].join(' ');

  const inlineScript =
    'window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},100);});';

  const scriptOpen = '<' + 'script>';
  const scriptClose = '<' + '/script>';

  const html =
    '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
    `<title>${title}</title>` +
    `<style>${css}</style>` +
    '</head><body>' +
    `<div class="header"><h1>${title}${retreatName ? ` — ${retreatName}` : ''}</h1></div>` +
    `<div class="grid">${body}</div>` +
    scriptOpen + inlineScript + scriptClose +
    '</body></html>';

  win.document.open();
  win.document.write(html);
  win.document.close();
};


const contactsLabels = () => ({
  lider: t('tables.roles.lider'),
  colider1: t('tables.roles.colider1'),
  colider2: t('tables.roles.colider2'),
  caminante: 'Caminante',
  noTablesFound: t('tables.noTablesFound'),
  role: 'Rol',
  name: 'Nombre',
  phones: 'Teléfonos',
  email: 'Email',
  walkerCountSuffix: ' / 7 caminantes',
});

const handlePrintTablesContacts = () => {
  const tables = (tableMesaStore.tables || []) as any;
  const body = buildContactsPrintHtml(tables, contactsLabels());

  const win = window.open('', '_blank', 'width=1024,height=768');
  if (!win) {
    toast({
      title: t('common.error'),
      description: 'El navegador bloqueó la ventana emergente. Permite pop-ups para imprimir.',
      variant: 'destructive',
    });
    return;
  }

  const title = escapeHtml(t('tables.printTablesContacts'));
  const retreatLabel = retreatStore.retreats.find((r) => r.id === retreatStore.selectedRetreatId);
  const retreatName = retreatLabel ? escapeHtml(retreatLabel.parish || '') : '';

  const css = [
    '@page { size: A4 portrait; margin: 0.8cm; }',
    '* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    "html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }",
    'body { padding: 10px; font-size: 10px; }',
    'h1 { font-size: 16px; margin: 0 0 4px; }',
    '.header { margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }',
    '.table-card { border: 1px solid #cbd5e0; border-radius: 4px; padding: 8px; margin-bottom: 10px; break-inside: avoid-page; page-break-inside: avoid; }',
    '.tc-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }',
    '.tc-head h2 { font-size: 14px; margin: 0; color: #2b6cb0; }',
    '.tc-count { font-size: 10px; color: #4a5568; }',
    '.tc-empty { font-size: 10px; color: #a0aec0; font-style: italic; }',
    'table.contacts-table { width: 100%; border-collapse: collapse; font-size: 10px; }',
    'th, td { border: 1px solid #e2e8f0; padding: 4px 5px; vertical-align: top; text-align: left; }',
    'thead th { background: #edf2f7; color: #2d3748; font-weight: bold; font-size: 10px; }',
    '.row-leader { background: #ebf8ff; }',
    '.cell-role { font-weight: bold; color: #2b6cb0; white-space: nowrap; }',
    '.cell-name { font-weight: bold; }',
    '.cell-email { word-break: break-all; }',
    'tr { break-inside: avoid; page-break-inside: avoid; }',
    '@media print { body { padding: 0; } }',
  ].join(' ');

  const inlineScript =
    'window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},100);});';

  const scriptOpen = '<' + 'script>';
  const scriptClose = '<' + '/script>';

  const html =
    '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
    `<title>${title}</title>` +
    `<style>${css}</style>` +
    '</head><body>' +
    `<div class="header"><h1>${title}${retreatName ? ` — ${retreatName}` : ''}</h1></div>` +
    body +
    scriptOpen + inlineScript + scriptClose +
    '</body></html>';

  win.document.open();
  win.document.write(html);
  win.document.close();
};


const handlePrintTablesContactsPerParticipant = () => {
  const tables = (tableMesaStore.tables || []) as any;
  const body = buildContactsPerParticipantPrintHtml(tables, {
    ...contactsLabels(),
    forLabel: 'Para:',
    mesaLabel: 'Mesa:',
    intro: 'Contactos de tu mesa:',
  });

  const win = window.open('', '_blank', 'width=1024,height=768');
  if (!win) {
    toast({
      title: t('common.error'),
      description: 'El navegador bloqueó la ventana emergente. Permite pop-ups para imprimir.',
      variant: 'destructive',
    });
    return;
  }

  const title = escapeHtml(t('tables.printTablesContactsPerParticipant'));

  const css = [
    '@page { size: A4 portrait; margin: 0.8cm; }',
    '* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    "html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }",
    'body { padding: 8px; font-size: 10px; }',
    '.sheets-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }',
    '.contact-sheet { border: 1px dashed #94a3b8; border-radius: 4px; padding: 10px 12px; break-inside: avoid-page; page-break-inside: avoid; }',
    '.cs-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 8px; border-bottom: 1.5px solid #2b6cb0; padding-bottom: 4px; margin-bottom: 6px; }',
    '.cs-label { font-size: 9px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; display: block; }',
    '.cs-name { font-size: 14px; font-weight: bold; color: #1a202c; }',
    '.cs-mesa { text-align: right; }',
    '.cs-mesa-name { font-size: 12px; font-weight: bold; color: #2b6cb0; }',
    '.cs-intro { font-size: 10px; color: #4a5568; margin: 0 0 4px; }',
    'table.roster-table { width: 100%; border-collapse: collapse; font-size: 9px; }',
    'th, td { border: 1px solid #cbd5e0; padding: 3px 5px; vertical-align: top; text-align: left; }',
    'thead th { background: #edf2f7; color: #2d3748; font-weight: bold; font-size: 9px; }',
    '.row-leader { background: #ebf8ff; }',
    '.cell-role { font-weight: bold; color: #2b6cb0; white-space: nowrap; }',
    '.cell-name { font-weight: bold; }',
    '.cell-email { word-break: break-all; }',
    'tr { break-inside: avoid; page-break-inside: avoid; }',
  ].join(' ');

  const inlineScript =
    'window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},100);});';

  const scriptOpen = '<' + 'script>';
  const scriptClose = '<' + '/script>';

  const html =
    '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
    `<title>${title}</title>` +
    `<style>${css}</style>` +
    '</head><body>' +
    body +
    scriptOpen + inlineScript + scriptClose +
    '</body></html>';

  win.document.open();
  win.document.write(html);
  win.document.close();
};


// Single watcher handles both initial load and retreat changes
watch(
  () => [retreatStore.selectedRetreatId, retreatStore.retreats] as const,
  ([newRetreatId, retreats]) => {
    if (newRetreatId && retreats.length > 0) {
      participantStore.filters.retreatId = newRetreatId;
      participantStore.filters.isCancelled = false;
      participantStore.fetchParticipants();
      tableMesaStore.fetchTables();
    }
  },
  { immediate: true }
);
</script>

<style>
@media print {
  /* Ensure ancestors don't clip or constrain the printable content */
  html, body, #app-root {
    height: auto !important;
    overflow: visible !important;
    background: white !important;
  }

  /* Remove height/scroll constraints from TablesView wrappers */
  .tables-view-root,
  .tables-view-root > .flex-1 {
    display: block !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }

  /* Hide everything, then show only the print container */
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
