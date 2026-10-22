<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <div class="flex items-center justify-between">
          <div>
            <DialogTitle>{{ $t('community.import.title') }}</DialogTitle>
            <DialogDescription class="mt-1">
              Selecciona participantes de un retiro para importarlos a esta comunidad
            </DialogDescription>
          </div>
          <Badge v-if="selectedCount > 0" variant="secondary" class="text-sm">
            {{ selectedCount }} seleccionado{{ selectedCount !== 1 ? 's' : '' }}
          </Badge>
        </div>
      </DialogHeader>

      <div class="flex-1 overflow-y-auto py-4 space-y-4">
        <!-- Retreat Selection -->
        <div class="space-y-2">
          <Label for="retreat-select">
            Seleccionar Retiro
            <span class="text-red-500">*</span>
          </Label>
          <Select id="retreat-select" v-model="selectedRetreatId" @update:model-value="onRetreatSelected">
            <SelectTrigger class="w-full">
              <SelectValue :placeholder="retreats.length === 0 ? 'Cargando retiros...' : 'Selecciona un retiro'" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="retreat in sortedRetreats" :key="retreat.id" :value="retreat.id" class="py-3">
                <div class="flex flex-col gap-1">
                  <span class="font-medium">{{ retreat.parish }}</span>
                  <span class="text-xs text-muted-foreground flex items-center gap-2">
                    <Calendar class="w-3 h-3" />
                    {{ formatDateRange(retreat.startDate, retreat.endDate) }}
                  </span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Result of the last import, when someone stayed out: it stays until the
             dialog closes or another retreat is picked, unlike a toast. -->
        <div
          v-if="importResult"
          role="status"
          class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-2"
        >
          <p class="font-medium">
            {{ importResult.imported === 1 ? 'Se importó 1 participante' : `Se importaron ${importResult.imported} participantes` }}.
            No {{ importResult.skipped.length === 1 ? 'entró' : 'entraron' }}:
          </p>
          <ul class="list-disc pl-5 space-y-1">
            <li v-for="skip in importResult.skipped" :key="skip.participantId">
              <span class="font-medium">{{ skip.name || 'Participante sin nombre' }}</span>: {{ skipReason(skip) }}
            </li>
          </ul>
        </div>

        <!-- Loading State -->
        <div v-if="loadingParticipants" class="flex flex-col items-center justify-center py-12 text-center">
          <Loader2 class="w-10 h-10 animate-spin text-primary mb-4" />
          <p class="text-muted-foreground">Cargando participantes...</p>
        </div>

        <!-- Empty State - No retreat selected -->
        <div v-else-if="!selectedRetreatId" class="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
          <Users class="w-16 h-16 text-muted-foreground mb-4" />
          <p class="text-lg font-medium mb-2">Selecciona un retiro</p>
          <p class="text-sm text-muted-foreground max-w-md">
            Elige un retiro de la lista arriba para ver los participantes disponibles para importar.
          </p>
        </div>

        <!-- Content when retreat is selected -->
        <template v-else>
          <!-- Filters and Search -->
          <div class="space-y-3">
            <div class="flex flex-col sm:flex-row gap-3">
              <!-- Search -->
              <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  v-model="searchQuery"
                  placeholder="Buscar por nombre o email..."
                  class="pl-9"
                />
              </div>

              <!-- Type Filter -->
              <Select v-model="typeFilter">
                <SelectTrigger class="w-full sm:w-[180px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="walker">Caminantes</SelectItem>
                  <SelectItem value="server">Servidores</SelectItem>
                </SelectContent>
              </Select>

              <!-- Select All -->
              <Button
                variant="outline"
                size="sm"
                class="shrink-0"
                :disabled="selectableParticipants.length === 0"
                @click="toggleAllFiltered"
              >
                <Check v-if="allFilteredSelected" class="w-4 h-4 mr-1" />
                <Square v-else class="w-4 h-4 mr-1" />
                {{ allFilteredSelected ? 'Deseleccionar' : 'Seleccionar' }} todos ({{ selectableParticipants.length }})
              </Button>
            </div>

            <!-- Cancelled participants stay out unless asked for -->
            <div v-if="cancelledCount > 0" class="flex items-center gap-2 text-sm">
              <Switch id="include-cancelled" v-model="includeCancelled" />
              <Label for="include-cancelled" class="font-normal cursor-pointer">
                Incluir cancelados ({{ cancelledCount }})
              </Label>
            </div>

            <!-- Results Summary -->
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">
                Mostrando <strong>{{ filteredCount }}</strong> de <strong>{{ participants.length }}</strong> participantes
              </span>
              <span v-if="!allFilteredSelected && selectedCount > 0" class="text-muted-foreground">
                <span class="text-primary">{{ selectedCount }}</span> seleccionados
              </span>
            </div>
          </div>

          <!-- Empty State - No participants found after filtering -->
          <div v-if="filteredParticipants.length === 0" class="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
            <Search class="w-16 h-16 text-muted-foreground mb-4" />
            <p class="text-lg font-medium mb-2">
              {{ searchQuery || typeFilter !== 'all' ? 'No se encontraron participantes' : 'No hay participantes disponibles' }}
            </p>
            <p class="text-sm text-muted-foreground max-w-md mb-4">
              {{ searchQuery ? 'Intenta con otro término de búsqueda' : typeFilter !== 'all' ? 'Selecciona otro tipo de participante' : 'Este retiro no tiene participantes disponibles' }}
            </p>
            <Button v-if="searchQuery || typeFilter !== 'all'" variant="outline" size="sm" @click="clearFilters">
              Limpiar filtros
            </Button>
          </div>

          <!-- Participants Table -->
          <div v-else class="border rounded-lg overflow-hidden">
            <div class="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader class="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead class="w-[50px]">
                      <Checkbox
                        :model-value="allFilteredSelected ? true : (someFilteredSelected ? 'indeterminate' : false)"
                        @update:model-value="toggleAllFiltered()"
                      />
                    </TableHead>
                    <TableHead>Participante</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead class="text-right">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    v-for="participant in filteredParticipants"
                    :key="participant.id"
                    :class="participant.phoneConflictWith ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50'"
                    @click="toggleParticipant(participant.id)"
                  >
                    <TableCell @click.stop>
                      <Checkbox
                        :model-value="selectedIds.includes(participant.id)"
                        :disabled="!!participant.phoneConflictWith"
                        @update:model-value="toggleParticipant(participant.id)"
                      />
                    </TableCell>
                    <TableCell>
                      <div class="flex flex-col">
                        <span class="font-medium">
                          {{ participant.firstName }} {{ participant.lastName }}
                        </span>
                        <span class="text-xs text-muted-foreground">{{ participant.email }}</span>
                        <span v-if="participant.phoneConflictWith" class="text-xs text-amber-700">
                          Su teléfono ya es de {{ participant.phoneConflictWith }}: no se puede importar
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div class="flex flex-wrap gap-1">
                        <Badge :variant="participant.type === 'walker' ? 'default' : 'secondary'" class="text-xs">
                          {{ typeLabel(participant.type) }}
                        </Badge>
                        <Badge v-if="participant.isCancelled" variant="destructive" class="text-xs">
                          Cancelado
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell class="text-right">
                      <Badge
                        v-if="selectedIds.includes(participant.id)"
                        variant="outline"
                        class="bg-green-50 text-green-700 border-green-200"
                      >
                        <Check class="w-3 h-3 mr-1" />
                        Seleccionado
                      </Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </template>
      </div>

      <!-- Footer with Summary -->
      <DialogFooter class="flex-col sm:flex-row gap-3 border-t pt-4">
        <div class="flex-1 flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
          <div v-if="selectedCount > 0" class="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg">
            <Check class="w-4 h-4 text-primary" />
            <span class="font-medium">
              {{ selectedCount }} {{ selectedCount === 1 ? 'participante' : 'participantes' }}
            </span>
            <span class="text-muted-foreground">se importarán</span>
          </div>
          <div v-else class="text-muted-foreground px-3 py-2">
            Selecciona participantes para importar
          </div>
        </div>
        <div class="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" @click="handleClose" :disabled="isImporting">
            Cancelar
          </Button>
          <Button
            @click="handleImport"
            :disabled="selectedCount === 0 || isImporting"
            class="min-w-[140px]"
          >
            <Loader2 v-if="isImporting" class="w-4 h-4 mr-2 animate-spin" />
            <Users v-else class="w-4 h-4 mr-2" />
            {{ isImporting ? 'Importando...' : `Importar ${selectedCount}` }}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>

    <!-- Confirmation Dialog -->
    <Dialog :open="showConfirmDialog" @update:open="showConfirmDialog = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar importación</DialogTitle>
          <DialogDescription>
            Estás a punto de importar <strong>{{ selectedCount }}</strong> {{ selectedCount === 1 ? 'participante' : 'participantes' }} a la comunidad.
          </DialogDescription>
        </DialogHeader>
        <div class="py-4">
          <div class="bg-muted/50 rounded-lg p-4 space-y-2">
            <div class="flex items-center gap-2 text-sm">
              <Users class="w-4 h-4 text-muted-foreground" />
              <span class="font-medium">Retiro:</span>
              <span>{{ selectedRetreat?.parish }}</span>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <Calendar class="w-4 h-4 text-muted-foreground" />
              <span class="font-medium">Fecha:</span>
              <span>{{ formatDateRange(selectedRetreat?.startDate, selectedRetreat?.endDate) }}</span>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <Check class="w-4 h-4 text-green-600" />
              <span class="font-medium">A importar:</span>
              <span class="text-green-600 font-bold">{{ selectedCount }}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showConfirmDialog = false" :disabled="isImporting">
            Cancelar
          </Button>
          <Button @click="confirmImport" :disabled="isImporting">
            <Loader2 v-if="isImporting" class="w-4 h-4 mr-2 animate-spin" />
            Confirmar importación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRetreatStore } from '@/stores/retreatStore';
import { useCommunityStore } from '@/stores/communityStore';
import { storeToRefs } from 'pinia';
import { Search, Users, Check, Square, Calendar, Loader2 } from 'lucide-vue-next';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, Input, Checkbox, Label, Badge, Switch,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@repo/ui';
import { useToast } from '@repo/ui';
import type { ImportMembersSkip } from '@repo/types';
import { apiErrorMessage } from '@/services/apiError';

const props = defineProps<{
  open: boolean;
  communityId: string;
}>();

const emit = defineEmits(['update:open', 'imported']);

const retreatStore = useRetreatStore();
const communityStore = useCommunityStore();
const { retreats } = storeToRefs(retreatStore);
const { toast } = useToast();

const selectedRetreatId = ref('');
const searchQuery = ref('');
const typeFilter = ref<'all' | 'walker' | 'server'>('all');
const includeCancelled = ref(false);
const importResult = ref<{ imported: number; skipped: ImportMembersSkip[] } | null>(null);
const participants = ref<any[]>([]);
const selectedIds = ref<string[]>([]);
const loadingParticipants = ref(false);
const isImporting = ref(false);
const showConfirmDialog = ref(false);

// Computed
const sortedRetreats = computed(() => {
  return [...(retreats.value || [])].sort((a, b) =>
    new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );
});

const selectedRetreat = computed(() =>
  sortedRetreats.value.find(r => r.id === selectedRetreatId.value)
);

const cancelledCount = computed(() => participants.value.filter(p => p.isCancelled).length);

const filteredParticipants = computed(() => {
  let filtered = participants.value;

  if (!includeCancelled.value) {
    filtered = filtered.filter(p => !p.isCancelled);
  }

  // Filter by type; angelitos (partial_server) are part of the serving team
  if (typeFilter.value === 'walker') {
    filtered = filtered.filter(p => p.type === 'walker');
  } else if (typeFilter.value === 'server') {
    filtered = filtered.filter(p => p.type === 'server' || p.type === 'partial_server');
  }

  // Filter by search query
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(p =>
      p.firstName?.toLowerCase().includes(query) ||
      p.lastName?.toLowerCase().includes(query) ||
      p.email?.toLowerCase().includes(query)
    );
  }

  return filtered;
});

const filteredCount = computed(() => filteredParticipants.value.length);

// A candidate whose phone a member already has would be refused by the import
// (one phone per community), so it can't be picked.
const selectableParticipants = computed(() =>
  filteredParticipants.value.filter(p => !p.phoneConflictWith)
);

const allFilteredSelected = computed(() => {
  return selectableParticipants.value.length > 0 &&
    selectableParticipants.value.every(p => selectedIds.value.includes(p.id));
});

const someFilteredSelected = computed(() => {
  const selectableSet = new Set(selectableParticipants.value.map(p => p.id));
  const selectedInFiltered = selectedIds.value.filter(id => selectableSet.has(id));
  return selectedInFiltered.length > 0 && selectedInFiltered.length < selectableParticipants.value.length;
});

const selectedCount = computed(() => selectedIds.value.length);

// Methods
const typeLabel = (type?: string) =>
  ({ walker: 'Caminante', server: 'Servidor', partial_server: 'Angelito', waiting: 'En espera' } as Record<string, string>)[
    type ?? ''
  ] ?? 'Servidor';

const parseLocalDate = (dateStr: string): Date => {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(dateStr);
};

const formatDateRange = (start: any, end: any) => {
  if (!start) return '';
  const startDate = parseLocalDate(String(start)).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  if (!end) return startDate;
  const endDate = parseLocalDate(String(end)).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  return `${startDate} - ${endDate}`;
};

const handleRetreatChange = async () => {
  if (!selectedRetreatId.value) {
    participants.value = [];
    selectedIds.value = [];
    return;
  }

  loadingParticipants.value = true;
  try {
    const data = await communityStore.fetchPotentialMembers(props.communityId, selectedRetreatId.value);
    // Filter out participants who are already members of the community
    const participantList = Array.isArray(data) ? data : [];
    participants.value = participantList.filter(p => !p.alreadyMember);
    selectedIds.value = [];
  } catch (error) {
    console.error('Failed to fetch potential members:', error);
    participants.value = [];
    toast({
      title: 'Error',
      description: 'No se pudieron cargar los participantes',
      variant: 'destructive'
    });
  } finally {
    loadingParticipants.value = false;
  }
};

const onRetreatSelected = () => {
  importResult.value = null;
  handleRetreatChange();
};

const skipReason = (skip: ImportMembersSkip) => {
  switch (skip.reason) {
    case 'phone_duplicate_in_community':
      return skip.conflictWith
        ? `su teléfono ya es de ${skip.conflictWith}`
        : 'su teléfono ya lo tiene otro miembro';
    case 'not_in_retreat':
      return 'ya no está en la lista del retiro';
    default:
      return 'error inesperado, inténtalo de nuevo';
  }
};

const clearFilters = () => {
  searchQuery.value = '';
  typeFilter.value = 'all';
};

const toggleParticipant = (id: string) => {
  if (participants.value.find(p => p.id === id)?.phoneConflictWith) return;
  const index = selectedIds.value.indexOf(id);
  if (index > -1) {
    selectedIds.value = selectedIds.value.filter(selectedId => selectedId !== id);
  } else {
    selectedIds.value = [...selectedIds.value, id];
  }
};

const toggleAllFiltered = () => {
  if (allFilteredSelected.value) {
    // Deselect all in current filtered view
    const filteredSet = new Set(filteredParticipants.value.map(p => p.id));
    selectedIds.value = selectedIds.value.filter(id => !filteredSet.has(id));
  } else {
    // Select all in current filtered view, except who can't be imported
    const newSelected = [...selectedIds.value];
    selectableParticipants.value.forEach(p => {
      if (!selectedIds.value.includes(p.id)) {
        newSelected.push(p.id);
      }
    });
    selectedIds.value = newSelected;
  }
};

const handleImport = () => {
  if (selectedCount.value === 0) return;
  showConfirmDialog.value = true;
};

const confirmImport = async () => {
  showConfirmDialog.value = false;
  isImporting.value = true;
  let importSuccess = false;

  try {
    const { imported, skipped } = await communityStore.importMembers(
      props.communityId,
      selectedRetreatId.value,
      selectedIds.value
    );

    emit('imported');
    if (skipped.length === 0) {
      toast({
        title: 'Importación exitosa',
        description: `Se importaron ${imported.length} ${imported.length === 1 ? 'participante' : 'participantes'} a la comunidad`,
      });
      importSuccess = true;
    } else {
      // Someone stayed out: keep the dialog open with who and why, and reload the
      // list so the ones that did come in drop out of it.
      importResult.value = { imported: imported.length, skipped };
      await handleRetreatChange();
    }
  } catch (error: any) {
    console.error('Failed to import members:', error);
    toast({
      title: 'Error',
      description: apiErrorMessage(error, 'No se pudieron importar los participantes'),
      variant: 'destructive'
    });
  } finally {
    isImporting.value = false;
    // Close dialog after import completes (only on success)
    if (importSuccess) {
      emit('update:open', false);
    }
  }
};

const handleClose = () => {
  if (!isImporting.value) {
    emit('update:open', false);
  }
};

// Lifecycle
onMounted(async () => {
  await retreatStore.fetchRetreats();
});

// Reset state when dialog opens/closes
watch(() => props.open, (isOpen) => {
  if (!isOpen) {
    // Reset state when closing
    selectedRetreatId.value = '';
    participants.value = [];
    selectedIds.value = [];
    searchQuery.value = '';
    typeFilter.value = 'all';
    includeCancelled.value = false;
    importResult.value = null;
    showConfirmDialog.value = false;
  }
});

// Hiding the cancelled again also drops them from the selection, so the import
// never carries someone the list no longer shows.
watch(includeCancelled, (include) => {
  if (include) return;
  const cancelled = new Set(participants.value.filter(p => p.isCancelled).map(p => p.id));
  selectedIds.value = selectedIds.value.filter(id => !cancelled.has(id));
});
</script>
