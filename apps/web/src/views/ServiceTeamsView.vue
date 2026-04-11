<template>
  <div class="h-full flex flex-col">
    <!-- Sticky Header -->
    <div class="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-2 sm:p-3 lg:p-4 border-b">
      <div class="sm:flex sm:items-center sm:justify-between gap-4">
        <div class="sm:flex-auto">
          <h1 class="text-[20px] font-bold leading-6 text-gray-900 dark:text-white">{{ $t('serviceTeams.title') }}</h1>
          <p class="mt-2 text-[10px] text-gray-700 dark:text-gray-300">{{ $t('serviceTeams.description') }}</p>
        </div>

        <div class="flex items-center gap-2 mt-4 sm:mt-0">
          <!-- Team/Service Search -->
          <Input
            v-model="teamSearchQuery"
            :placeholder="$t('serviceTeams.searchTeamPlaceholder')"
            class="w-64"
          />

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

          <!-- Actions -->
          <Button variant="outline" size="sm" @click="handleCreateTeam">
            <Plus class="h-4 w-4 mr-1" />
            {{ $t('serviceTeams.addTeam') }}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="icon">
                <MoreVertical class="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem @click="handleExportTeams" :disabled="isExporting">
                <Download v-if="!isExporting" class="mr-2 h-4 w-4" />
                <Loader2 v-else class="mr-2 h-4 w-4 animate-spin" />
                {{ isExporting ? $t('serviceTeams.exporting') : $t('serviceTeams.exportDocx') }}
              </DropdownMenuItem>
              <DropdownMenuItem @click="handlePrint">
                <Printer class="mr-2 h-4 w-4" />
                {{ $t('serviceTeams.print') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>

    <!-- Sticky Server Lists -->
    <div class="sticky top-[80px] z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-2 sm:px-3 lg:px-4 py-2 border-b space-y-2">
      <!-- Server Search -->
      <Input
        v-model="serverSearchQuery"
        :placeholder="$t('serviceTeams.searchServerPlaceholder')"
        class="w-full max-w-sm"
      />
      <!-- Servers without team -->
      <div>
        <h3 class="text-sm font-medium leading-5 text-gray-900 dark:text-white">{{ $t('serviceTeams.serversWithoutTeam') }} ({{ serversWithoutTeam.length }})</h3>
        <div
          @drop.prevent="onDropToUnassigned($event)"
          @dragover.prevent="onDragOverUnassigned($event)"
          @dragenter.prevent
          @dragleave="onDragLeaveUnassigned($event)"
          class="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border min-h-[40px] max-h-32 overflow-y-auto flex flex-wrap gap-2 transition-colors"
          :class="{ 'border-primary bg-primary/10 border-dashed border-2': isOverUnassigned }"
        >
          <div
            v-for="server in filteredServersWithoutTeam"
            :key="server.id"
            draggable="true"
            @dragstart="startDrag($event, server)"
            @dragend="handleDragEnd"
            :data-participant-id="server.id"
            :data-is-unassigned="true"
            class="px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full text-xs font-medium cursor-grab transition-all"
          >
            {{ server.firstName.split(' ')[0] }} {{ server.lastName.charAt(0) }}.
          </div>
          <span v-if="filteredServersWithoutTeam.length === 0" class="text-gray-400 text-sm">
            {{ $t('serviceTeams.allAssigned') }}
          </span>
        </div>
      </div>

      <!-- Servers with team -->
      <div v-if="serversWithTeam.length > 0">
        <h3 class="text-sm font-medium leading-5 text-gray-900 dark:text-white">{{ $t('serviceTeams.serversWithTeam') }} ({{ serversWithTeam.length }})</h3>
        <div
          class="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border min-h-[40px] max-h-32 overflow-y-auto flex flex-wrap gap-2"
        >
          <div
            v-for="server in filteredServersWithTeam"
            :key="server.id"
            draggable="true"
            @dragstart="startDrag($event, server)"
            @dragend="handleDragEnd"
            :data-participant-id="server.id"
            class="px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-xs font-medium cursor-grab transition-all"
          >
            {{ server.firstName.split(' ')[0] }} {{ server.lastName.charAt(0) }}.
          </div>
        </div>
      </div>
    </div>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto p-2 sm:p-3 lg:p-4">
      <div v-if="retreatStore.selectedRetreatId" class="print-container">
        <div v-if="serviceTeamStore.isLoading" class="mt-8 text-center">
          <p>{{ $t('participants.loading') }}</p>
        </div>
        <div v-else-if="serviceTeamStore.error" class="mt-8 text-center text-red-500">
          <p>{{ serviceTeamStore.error }}</p>
        </div>
        <div v-else-if="serviceTeamStore.teams.length === 0" class="mt-8 text-center space-y-4">
          <p>{{ $t('serviceTeams.noTeamsFound') }}</p>
          <Button @click="serviceTeamStore.initializeDefaults()" :disabled="serviceTeamStore.isLoading">
            <Plus class="h-4 w-4 mr-2" />
            {{ $t('serviceTeams.createDefaults') }}
          </Button>
        </div>
        <div v-else class="mt-8 grid gap-6 card-container" :class="gridColumnsClass">
          <ServiceTeamCard
            v-for="team in filteredTeams"
            :key="team.id"
            :team="team"
            :search-query="teamSearchQuery"
            class="team-card"
            @delete="handleDeleteTeam"
            @show-instructions="showInstructions"
          />
        </div>
      </div>
      <div v-else class="mt-8 text-center">
        <p>{{ $t('participants.selectRetreatPrompt') }}</p>
      </div>
    </div>

    <!-- Create Team Dialog -->
    <Dialog :open="isCreateDialogOpen" @update:open="isCreateDialogOpen = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('serviceTeams.createTeam') }}</DialogTitle>
          <DialogDescription class="sr-only">{{ $t('serviceTeams.createTeam') }}</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div>
            <label class="text-sm font-medium">{{ $t('serviceTeams.teamType') }}</label>
            <Select v-model="newTeamType">
              <SelectTrigger>
                <SelectValue :placeholder="$t('serviceTeams.selectType')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="type in teamTypes" :key="type.value" :value="type.value">
                  {{ type.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label class="text-sm font-medium">{{ $t('serviceTeams.teamName') }}</label>
            <Input v-model="newTeamName" :placeholder="$t('serviceTeams.teamNamePlaceholder')" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="isCreateDialogOpen = false">{{ $t('common.cancel') }}</Button>
          <Button @click="confirmCreateTeam" :disabled="!newTeamName || !newTeamType">
            {{ $t('common.create') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Team Confirmation Dialog -->
    <Dialog :open="isDeleteDialogOpen" @update:open="isDeleteDialogOpen = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('serviceTeams.deleteTeam') }}</DialogTitle>
          <DialogDescription>{{ $t('serviceTeams.deleteConfirmation') }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="isDeleteDialogOpen = false">{{ $t('common.cancel') }}</Button>
          <Button variant="destructive" @click="confirmDeleteTeam" :disabled="isDeleting">
            <Loader2 v-if="isDeleting" class="w-4 h-4 mr-2 animate-spin" />
            {{ $t('common.delete') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Instructions Modal -->
    <DynamicInstructionsModal
      :open="isInstructionsOpen"
      :team="instructionsTeam"
      @update:open="isInstructionsOpen = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, ref, watch } from 'vue';
import { useServiceTeamStore } from '@/stores/serviceTeamStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import ServiceTeamCard from './ServiceTeamCard.vue';
import DynamicInstructionsModal from './DynamicInstructionsModal.vue';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';
import { useToast } from '@repo/ui';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@repo/ui';
import { Download, LayoutGrid, Loader2, MoreVertical, Plus, Printer } from 'lucide-vue-next';
import type { Participant, ServiceTeam } from '@repo/types';
import { ServiceTeamType } from '@repo/types';
import { useI18n } from 'vue-i18n';
import { exportServiceTeamsToDocx } from '@/services/api';
import { useDragState } from '@/composables/useDragState';

const serviceTeamStore = useServiceTeamStore();
const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();
const { toast } = useToast();
const { t } = useI18n();
const { startDrag: startDragState, endDrag } = useDragState();

const isOverUnassigned = ref(false);
const isExporting = ref(false);
const isCreateDialogOpen = ref(false);
const isDeleteDialogOpen = ref(false);
const isDeleting = ref(false);
const teamToDelete = ref<ServiceTeam | null>(null);
const isInstructionsOpen = ref(false);
const instructionsTeam = ref<ServiceTeam | null>(null);
const newTeamName = ref('');
const newTeamType = ref('');
const serverSearchQuery = ref('');
const teamSearchQuery = ref('');
const columnCount = ref(localStorage.getItem('service_teams_column_count') || '3');

const defaultTeamNames: Record<string, string> = {
  [ServiceTeamType.COCINA]: 'Cocina / Comedor',
  [ServiceTeamType.MUSICA]: 'Música y Alabanza',
  [ServiceTeamType.PALANCAS]: 'Palancas',
  [ServiceTeamType.LOGISTICA]: 'Logística',
  [ServiceTeamType.LIMPIEZA]: 'Limpieza y Orden',
  [ServiceTeamType.ORACION]: 'Intercesión / Oración',
  [ServiceTeamType.LITURGIA]: 'Liturgia',
  [ServiceTeamType.BIENVENIDA]: 'Bienvenida / Registro',
  [ServiceTeamType.REGISTRO]: 'Registro',
  [ServiceTeamType.COMEDOR]: 'Comedor',
  [ServiceTeamType.SALON]: 'Salón',
  [ServiceTeamType.CUARTOS]: 'Cuartos',
  [ServiceTeamType.TRANSPORTE]: 'Transporte',
  [ServiceTeamType.COMPRAS]: 'Compras',
  [ServiceTeamType.SNACKS]: 'Snacks',
  [ServiceTeamType.CONTINUA]: 'Oración Continua',
  [ServiceTeamType.DINAMICA]: 'Dinámica',
  [ServiceTeamType.OTRO]: 'Otro',
};

const teamTypes = Object.values(ServiceTeamType).map(v => ({
  value: v,
  label: defaultTeamNames[v] || v.charAt(0).toUpperCase() + v.slice(1),
}));

watch(newTeamType, (type) => {
  if (type) {
    newTeamName.value = defaultTeamNames[type] || type.charAt(0).toUpperCase() + type.slice(1);
  }
});

watch(columnCount, (newValue) => {
  localStorage.setItem('service_teams_column_count', newValue);
});


const gridColumnsClass = computed(() => {
  switch (columnCount.value) {
    case '1': return 'grid-cols-1';
    case '2': return 'grid-cols-1 sm:grid-cols-2';
    case '3': return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    case '4': return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
    default: return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  }
});

// All assigned server participant IDs
const assignedServerIds = computed(() => {
  const ids = new Set<string>();
  for (const team of serviceTeamStore.teams) {
    if (team.leaderId) ids.add(team.leaderId);
    if (team.members) {
      for (const m of team.members) {
        ids.add(m.participantId);
      }
    }
  }
  return ids;
});

const allServers = computed(() => {
  return (participantStore.participants || []).filter(
    p => p.type === 'server' && !p.isCancelled
  );
});

const serversWithoutTeam = computed(() => {
  return allServers.value.filter(s => !assignedServerIds.value.has(s.id));
});

const serversWithTeam = computed(() => {
  return allServers.value.filter(s => assignedServerIds.value.has(s.id));
});

const normalizeSearch = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const filteredServersWithoutTeam = computed(() => {
  if (!serverSearchQuery.value.trim()) return serversWithoutTeam.value;
  const q = normalizeSearch(serverSearchQuery.value);
  return serversWithoutTeam.value.filter(s => normalizeSearch(`${s.firstName} ${s.lastName}`).includes(q));
});

const filteredServersWithTeam = computed(() => {
  if (!serverSearchQuery.value.trim()) return serversWithTeam.value;
  const q = normalizeSearch(serverSearchQuery.value);
  return serversWithTeam.value.filter(s => normalizeSearch(`${s.firstName} ${s.lastName}`).includes(q));
});

const filteredTeams = computed(() => {
  if (!teamSearchQuery.value.trim()) return serviceTeamStore.teams;
  const q = normalizeSearch(teamSearchQuery.value);
  return serviceTeamStore.teams.filter(team => {
    const name = normalizeSearch(team.name);
    const type = (team.teamType || '').toLowerCase();
    if (name.includes(q) || type.includes(q)) return true;
    if (team.leader) {
      if (normalizeSearch(`${team.leader.firstName} ${team.leader.lastName}`).includes(q)) return true;
    }
    if (team.members) {
      for (const m of team.members) {
        if (m.participant && normalizeSearch(`${m.participant.firstName} ${m.participant.lastName}`).includes(q)) return true;
      }
    }
    return false;
  });
});

const startDrag = (event: DragEvent, participant: Participant) => {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify(participant));
    startDragState('server');
  }
};

const handleDragEnd = () => {
  endDrag();
  isOverUnassigned.value = false;
};

const onDragOverUnassigned = (_event: DragEvent) => {
  isOverUnassigned.value = true;
};

const onDragLeaveUnassigned = (event: DragEvent) => {
  const target = event.currentTarget as HTMLElement;
  const relatedTarget = event.relatedTarget as HTMLElement;
  if (!relatedTarget || !target.contains(relatedTarget)) {
    isOverUnassigned.value = false;
  }
};

const onDropToUnassigned = async (event: DragEvent) => {
  isOverUnassigned.value = false;
  const participantData = event.dataTransfer?.getData('application/json');
  if (!participantData) return;

  const participant = JSON.parse(participantData);

  // If dragged from a specific team, remove from that team first
  if (participant.sourceTeamId) {
    await serviceTeamStore.removeMember(participant.sourceTeamId, participant.id);
    return;
  }

  // Otherwise remove from ALL teams this server belongs to
  for (const team of serviceTeamStore.teams) {
    const isMember = team.members?.some(m => m.participantId === participant.id);
    if (isMember) {
      await serviceTeamStore.removeMember(team.id, participant.id);
    }
  }
};

const handleCreateTeam = () => {
  newTeamName.value = '';
  newTeamType.value = '';
  isCreateDialogOpen.value = true;
};

const confirmCreateTeam = async () => {
  if (!retreatStore.selectedRetreatId || !newTeamName.value || !newTeamType.value) return;
  await serviceTeamStore.createTeam({
    name: newTeamName.value,
    teamType: newTeamType.value,
    retreatId: retreatStore.selectedRetreatId,
    priority: serviceTeamStore.teams.length,
  });
  isCreateDialogOpen.value = false;
};

const handleDeleteTeam = (team: ServiceTeam) => {
  teamToDelete.value = team;
  isDeleteDialogOpen.value = true;
};

const confirmDeleteTeam = async () => {
  if (!teamToDelete.value) return;
  isDeleting.value = true;
  try {
    await serviceTeamStore.deleteTeam(teamToDelete.value.id);
  } finally {
    isDeleting.value = false;
    isDeleteDialogOpen.value = false;
  }
};

const showInstructions = (team: ServiceTeam) => {
  instructionsTeam.value = team;
  isInstructionsOpen.value = true;
};

const handleExportTeams = async () => {
  if (!retreatStore.selectedRetreatId) return;
  isExporting.value = true;
  try {
    await exportServiceTeamsToDocx(retreatStore.selectedRetreatId);
    toast({ title: t('serviceTeams.exportSuccess') });
  } catch (error) {
    console.error('Error exporting teams:', error);
    toast({ title: t('serviceTeams.exportError'), variant: 'destructive' });
  } finally {
    isExporting.value = false;
  }
};

const handlePrint = () => {
  window.print();
};

// Single watcher handles both initial load and retreat changes
watch(
  () => [retreatStore.selectedRetreatId, retreatStore.retreats] as const,
  ([newRetreatId, retreats]) => {
    if (newRetreatId && retreats.length > 0) {
      participantStore.filters.retreatId = newRetreatId;
      participantStore.filters.isCancelled = false;
      participantStore.fetchParticipants();
      serviceTeamStore.fetchTeams();
    }
  },
  { immediate: true }
);
</script>

<style>
@media print {
  body * { visibility: hidden; }
  .print-container, .print-container * { visibility: visible; }
  .print-container { position: absolute; left: 0; top: 0; width: 100%; }
  .no-print, .sticky, button, input { display: none !important; }
  .card-container {
    display: grid !important;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  @page { size: A4; margin: 1cm; }
  .team-card {
    break-inside: avoid-page;
    page-break-inside: avoid;
    display: block;
    height: auto;
    border: 1px solid #ccc;
    margin-bottom: 1rem;
  }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
</style>
