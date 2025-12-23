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
          variant="outline"
          size="icon"
          @click="isDialogOpen = true"
          :title="$t('tables.viewWalkers')"
        >
          <Eye class="w-4 h-4" />
        </Button>
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
            @dragend="handleDragEnd"
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
            @dragend="handleDragEnd"
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
            @dragend="handleDragEnd"
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
              :key="`${walker.id}-${searchIndexKey}`"
              draggable="true"
              @dragstart="startDragFromTable($event, walker, 'walkers')"
              @dragend="handleDragEnd"
              :title="`${$t('tables.tableCard.retreatId')}: ${walker.id_on_retreat || $t('tables.tableCard.notAvailable')}\n${walker.firstName} ${walker.lastName}\n${$t('tables.invitedBy')}: ${walker.invitedBy || $t('common.unknown')}\n${$t('tables.tableCard.bedLocation')}: ${getBedLocation(walker) || $t('tables.tableCard.notAvailable')}`"
              :style="{ borderColor: walker.family_friend_color }"
              :data-participant-id="walker.id"
              :data-table-id="table.id"
              class="px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-sm font-medium cursor-grab border-2 transition-all"
              :class="getParticipantHighlightClass(walker)"
            >
              {{ walker.id_on_retreat || '?' }} {{ walker.firstName.split(' ')[0] }} {{ walker.lastName.charAt(0) }}.
            </div>
          </transition-group>
          <span v-else class="text-gray-400 text-sm mt-2 block">{{ $t('tables.unassigned') }}</span>
        </div>
      </div>
    </CardContent>
  </Card>

  <Dialog v-model:open="isDialogOpen">
    <DialogContent class="max-w-4xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ $t('tables.tableCard.dialogTitle') }}</DialogTitle>
      </DialogHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{{ $t('tables.tableCard.retreatId') }}</TableHead>
            <TableHead>{{ $t('tables.tableCard.walkerName') }}</TableHead>
            <TableHead>{{ $t('tables.tableCard.invitedBy') }}</TableHead>
            <TableHead>{{ $t('tables.tableCard.bedLocation') }}</TableHead>
            <TableHead>{{ $t('tables.tableCard.parish') }}</TableHead>
            <TableHead>{{ $t('tables.tableCard.phones') }}</TableHead>
            <TableHead>{{ $t('tables.tableCard.emausMember') }}</TableHead>
            <!-- <TableHead>Home Phone</TableHead> -->
            <!-- <TableHead>Work Phone</TableHead>
            <TableHead>Cell Phone</TableHead>-->
            <TableHead>{{ $t('tables.tableCard.email') }}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="walker in table.walkers" :key="walker.id">
            <TableCell>{{ walker.id_on_retreat || $t('tables.tableCard.notAvailable') }}</TableCell>
            <TableCell>{{ walker.firstName }} {{ walker.lastName }}</TableCell>
            <TableCell>{{ walker.invitedBy || $t('tables.tableCard.notAvailable') }}</TableCell>
            <TableCell>{{ getBedLocation(walker.retreatBed) || $t('tables.tableCard.notAvailable') }}</TableCell>
            <TableCell>{{ walker.parish || $t('tables.tableCard.notAvailable') }}</TableCell>
            <TableCell>{{ getPhones(walker) || $t('tables.tableCard.notAvailable') }}</TableCell>
            <TableCell>{{ walker.isInvitedByEmausMember ? $t('common.yes') : $t('common.no') }}</TableCell>
            <!--TableCell>{{ walker.inviterHomePhone || 'N/A' }}</TableCell>
            <TableCell>{{ walker.inviterWorkPhone || 'N/A' }}</TableCell>
            <TableCell>{{ walker.cellPhone || 'N/A' }}</TableCell-->
            <TableCell>{{ walker.email || $t('tables.tableCard.notAvailable') }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </DialogContent>
  </Dialog>
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { PropType } from 'vue';
import type { Participant, TableMesa } from '@repo/types';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { useTableMesaStore } from '@/stores/tableMesaStore';
import { useI18n } from 'vue-i18n';
import ServerDropZone from './ServerDropZone.vue';
import { useToast } from '@repo/ui';
import { useDragState } from '@/composables/useDragState';

import { Button } from '@repo/ui';
import { Trash2, Eye } from 'lucide-vue-next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@repo/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui';

const props = defineProps({
  table: {
    type: Object as PropType<TableMesa>,
    required: true,
  },
  searchQuery: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['delete']);

const { t } = useI18n();
const tableMesaStore = useTableMesaStore();
const { toast } = useToast();
const { draggedParticipantType, startDrag: startDragState, endDrag } = useDragState();

const isOverServer = ref(false);
const isOverWalker = ref(false);
const dragOverRole = ref<'lider' | 'colider1' | 'colider2' | null>(null);
const isDropInvalid = ref(false);
const isDialogOpen = ref(false);

// Force re-render when search index changes
const searchIndexKey = ref(0);

const handleSearchIndexChanged = () => {
  searchIndexKey.value++;
};

const hasWalkers = computed(() => (props.table.walkers?.length || 0) > 0);

// Normalize text: remove accents and convert to lowercase
const normalizeText = (text: string): string => {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
};

// Check if a participant matches the search query
const participantMatches = (participant: Participant | null | undefined): boolean => {
  if (!participant || !props.searchQuery?.trim()) return false;

  const normalizedQuery = normalizeText(props.searchQuery.trim());
  return Boolean(
    (participant.firstName && normalizeText(participant.firstName).includes(normalizedQuery)) ||
    (participant.lastName && normalizeText(participant.lastName).includes(normalizedQuery)) ||
    (participant.nickname && normalizeText(participant.nickname).includes(normalizedQuery)) ||
    (participant.id_on_retreat && participant.id_on_retreat.toString().includes(normalizedQuery))
  );
};

// Get highlight class for a participant
const getParticipantHighlightClass = (participant: Participant | null | undefined): string => {
  if (!participant || !participantMatches(participant)) return '';

  // Get current match index from parent (via window event or computed)
  const allMatchingIds = getAllMatchingParticipantIds();
  const matchIndex = allMatchingIds.indexOf(participant.id);

  if (matchIndex === -1) return '';

  // Get the global current match index from window
  const currentMatchIndex = (window as any).__currentMatchIndex ?? 0;

  if (matchIndex === currentMatchIndex) {
    // Current match - prominent highlight with ring
    return 'ring-2 ring-yellow-500 ring-offset-2 bg-yellow-200 dark:bg-yellow-700 scale-110';
  } else {
    // Other matches - subtle highlight
    return 'bg-yellow-100 dark:bg-yellow-800/50';
  }
};

// Get all matching participant IDs for this table
const getAllMatchingParticipantIds = (): string[] => {
  const ids: string[] = [];
  const query = props.searchQuery?.toLowerCase().trim();
  if (!query) return ids;

  const checkParticipant = (p: Participant | null | undefined) => {
    if (p && participantMatches(p)) {
      ids.push(p.id);
    }
  };

  checkParticipant(props.table.lider);
  checkParticipant(props.table.colider1);
  checkParticipant(props.table.colider2);
  props.table.walkers?.forEach(checkParticipant);

  return ids;
};

// Listen for scroll-to-participant events
const handleScrollToParticipant = (event: Event) => {
  const customEvent = event as CustomEvent;
  const participantId = customEvent.detail?.participantId as string | undefined;
  if (!participantId) return;

  // Check if this table contains the participant
  const participantIds = getAllMatchingParticipantIds();
  if (!participantIds.includes(participantId)) return;

  // Scroll to the participant element
  const element = document.querySelector(`[data-participant-id="${participantId}"][data-table-id="${props.table.id}"]`);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};

onMounted(() => {
  window.addEventListener('scroll-to-participant', handleScrollToParticipant);
  window.addEventListener('search-index-changed', handleSearchIndexChanged);
});

onUnmounted(() => {
  window.removeEventListener('scroll-to-participant', handleScrollToParticipant);
  window.removeEventListener('search-index-changed', handleSearchIndexChanged);
});

const confirmDelete = () => {
  emit('delete', props.table);
};

const startDragFromTable = (event: DragEvent, participant: Participant, role?: 'lider' | 'colider1' | 'colider2' | 'walkers') => {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
    event.dataTransfer.effectAllowed = 'move';

    // Find the role of the participant being dragged from this table
    let sourceRole: 'lider' | 'colider1' | 'colider2' | 'walkers' | undefined = role;
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
    startDragState(participant.type);
  }
};

const handleDragEnd = () => {
  endDrag();
  isOverServer.value = false;
  isOverWalker.value = false;
  dragOverRole.value = null;
};

const onDrop = (event: DragEvent, role: 'lider' | 'colider1' | 'colider2' | 'walkers') => {
  // Prevent drop if table is not saved yet
  if (!props.table.id) return;

  isOverServer.value = false;
  isOverWalker.value = false;
  dragOverRole.value = null;
  isDropInvalid.value = false; // Also reset the invalid state on drop
  const participantData = event.dataTransfer?.getData('application/json');
  if (!participantData) return;

  const participant: Participant & { sourceTableId?: string; sourceRole?: 'lider' | 'colider1' | 'colider2' | 'walkers' } = JSON.parse(participantData);

  // Ensure table ID is valid before proceeding
  if (!props.table.id) {
    console.error('Cannot assign participant: table ID is undefined');
    return;
  }

  // Get ALL participants at the table (leaders + walkers)
  const allParticipants = [
    props.table.lider,
    props.table.colider1,
    props.table.colider2,
    ...(props.table.walkers || [])
  ].filter(Boolean);

  // Check tag conflicts with ALL participants
  if (participant.tags && participant.tags.length > 0) {
    const newParticipantTagIds = new Set(participant.tags.map((t: any) => t.tag?.id).filter(Boolean) as string[]);

    for (const existingParticipant of allParticipants) {
      // Skip if it's the same participant (moving within the table)
      if (existingParticipant.id === participant.id) continue;

      if (existingParticipant.tags) {
        const existingTagIds = new Set(existingParticipant.tags.map((t: any) => t.tag?.id).filter(Boolean) as string[]);
        const hasConflict = [...newParticipantTagIds].some((id) => existingTagIds.has(id));
        if (hasConflict) {
          const conflictingTags = participant.tags
            .filter((t: any) => t.tag && existingTagIds.has(t.tag.id))
            .map((t: any) => t.tag?.name)
            .filter(Boolean);
          toast({
            title: 'Conflicto de etiquetas',
            description: `Ya existe un participante con las etiquetas: ${conflictingTags.join(', ')}`,
            variant: 'destructive',
          });
          return;
        }
      }
    }
  }

  if (role === 'walkers' && participant.type === 'walker') {
    // Check family/friend color conflicts (walker-walker)
    if (participant.family_friend_color) {
      const hasConflict = props.table.walkers?.some(
        (w) => w.family_friend_color === participant.family_friend_color
      );
      if (hasConflict) {
        toast({
          title: t('tables.errors.familyFriendConflict'),
          variant: 'destructive',
        });
        return;
      }
    }

    tableMesaStore.assignWalkerToTable(props.table.id, participant.id, participant.sourceTableId);
  } else if (role !== 'walkers' && participant.type === 'server') {
    tableMesaStore.assignLeader(props.table.id, participant.id, role, participant.sourceTableId, participant.sourceRole as 'lider' | 'colider1' | 'colider2' | undefined);
  }
};

const onDragOver = (event: DragEvent, type: 'server' | 'walker', role: 'lider' | 'colider1' | 'colider2' | null = null) => {
  // Prevent drag over if table is not saved yet
  if (!props.table.id) return;

  // Use the global drag state instead of dataTransfer.getData()
  // which doesn't work in dragover events due to security restrictions
  if (!draggedParticipantType.value) return;

  const isCompatible = draggedParticipantType.value === type;

  if (type === 'server') {
    // Dragging over a SERVER zone.
    isOverWalker.value = false; // Deactivate walker zone.
    if (isCompatible) {
      isOverServer.value = true;
      dragOverRole.value = role;
      // Check if the spot is occupied (we can't get participant.id here, so check if any participant exists)
      if (role && (props.table as any)[role]) {
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

const getBedLocation = (retreatBed: any) => {
  if (!retreatBed) return null;

  const floor = retreatBed.floor !== undefined && retreatBed.floor !== null ? retreatBed.floor : '-';
  const room = retreatBed.roomNumber || '-';
  const bed = retreatBed.bedNumber || '-';

  return `${floor}-${room}-${bed}`;
};

const getPhones = (walker: any) => {
  const phones = [];

  if (walker.homePhone) {
    phones.push(`H: ${walker.homePhone}`);
  }
  if (walker.workPhone) {
    phones.push(`W: ${walker.workPhone}`);
  }
  if (walker.cellPhone) {
    phones.push(`C: ${walker.cellPhone}`);
  }

  return phones.length > 0 ? phones.join(', ') : null;
};
</script>
