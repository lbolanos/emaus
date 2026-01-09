<template>
  <TooltipProvider>
    <a href="#members-content" class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-background focus:border focus:rounded-md">
      Saltar al contenido principal
    </a>
    <div id="members-content" class="p-4 space-y-4" role="main" aria-label="Gestión de miembros de comunidad">
    <div v-if="loadingCommunity" class="space-y-4" role="status" aria-live="polite">
      <SkeletonCard v-for="i in 5" :key="i" />
      <span class="sr-only">Cargando miembros...</span>
    </div>

    <template v-else-if="currentCommunity">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="text-2xl font-bold">{{ currentCommunity.name }} - {{ $t('community.membersLabel') }}</h1>
          <div class="flex items-center text-sm text-muted-foreground">
            <router-link :to="{ name: 'community-dashboard', params: { id: currentCommunity.id } }" class="hover:underline">
              {{ $t('community.dashboard') }}
            </router-link>
            <ChevronRight class="w-4 h-4 mx-1" />
            <span>{{ $t('community.membersLabel') }}</span>
          </div>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" @click="exportMembers">
            <Download class="w-4 h-4 mr-2" />
            {{ $t('community.members.export') }}
          </Button>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button @click="isImportModalOpen = true">
                <UserPlus class="w-4 h-4 mr-2" />
                {{ $t('community.import.title') }}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Importar miembros desde un retiro</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <!-- Bulk Action Bar -->
      <div v-if="selectedMemberIds.size > 0" class="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 bg-background border rounded-lg shadow-lg p-3 flex items-center gap-3">
        <div class="flex items-center gap-2">
          <CheckSquare class="w-5 h-5 text-primary" />
          <span class="font-medium">{{ selectedMemberIds.size }} {{ $t('community.members.selected') }}</span>
        </div>
        <div class="h-6 w-px bg-border"></div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="openBulkStateModal">
            {{ $t('community.members.changeState') }}
          </Button>
          <Button variant="outline" size="sm" @click="openBulkRemoveDialog" class="text-destructive hover:text-destructive">
            <UserMinus class="w-4 h-4 mr-1" />
            {{ $t('community.members.remove') }}
          </Button>
          <Button variant="ghost" size="sm" @click="clearSelection">
            <X class="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div class="flex items-center space-x-2">
        <div class="relative flex-1 max-w-sm">
          <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            :placeholder="$t('community.members.searchPlaceholder')"
            class="pl-8"
          />
        </div>
        <Select v-model="stateFilter">
          <SelectTrigger class="w-[180px]">
            <SelectValue :placeholder="$t('community.members.filterByState')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{{ $t('community.members.allStates') }}</SelectItem>
            <SelectItem v-for="state in states" :key="state" :value="state">
              {{ $t(`community.memberStates.${state}`) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Filter Presets -->
      <div class="flex items-center gap-2" role="group" aria-label="Filtros rápidos de miembros">
        <span class="text-sm text-muted-foreground">Filtros rápidos:</span>
        <Button
          variant="outline"
          size="sm"
          :class="{ 'bg-primary text-primary-foreground': stateFilter === 'all' }"
          :aria-pressed="stateFilter === 'all'"
          @click="stateFilter = 'all'"
        >
          Todos
        </Button>
        <Button
          variant="outline"
          size="sm"
          :class="{ 'bg-primary text-primary-foreground': stateFilter === 'active_member' }"
          :aria-pressed="stateFilter === 'active_member'"
          @click="stateFilter = 'active_member'"
        >
          Activos
        </Button>
        <Button
          variant="outline"
          size="sm"
          :class="{ 'bg-primary text-primary-foreground': stateFilter === 'far_from_location' }"
          :aria-pressed="stateFilter === 'far_from_location'"
          @click="stateFilter = 'far_from_location'"
        >
          Lejanos
        </Button>
        <Button
          variant="outline"
          size="sm"
          :class="{ 'bg-primary text-primary-foreground': stateFilter === 'no_answer' }"
          :aria-pressed="stateFilter === 'no_answer'"
          @click="stateFilter = 'no_answer'"
        >
          Sin respuesta
        </Button>
      </div>

      <!-- Live region for filter results -->
      <div aria-live="polite" class="sr-only">
        {{ filteredMembers.length }} miembros encontrados
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-[50px]">
                <Checkbox
                  :checked="allSelected"
                  :indeterminate="someSelected"
                  @update:checked="toggleSelectAll"
                  :aria-label="allSelected ? $t('community.members.deselectAll') : $t('community.members.selectAll')"
                />
              </TableHead>
              <TableHead>{{ $t('participants.name') }}</TableHead>
              <TableHead>{{ $t('participants.email') }}</TableHead>
              <TableHead>{{ $t('community.admin.status') }}</TableHead>
              <TableHead>{{ $t('community.participationRate') }}</TableHead>
              <TableHead>{{ $t('participants.actions') }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="member in filteredMembers" :key="member.id" :class="{ 'bg-muted/50': selectedMemberIds.has(member.id) }">
              <TableCell>
                <Checkbox
                  :model-value="selectedMemberIds.has(member.id)"
                  @update:model-value="
                    $event
                      ? selectedMemberIds.add(member.id)
                      : selectedMemberIds.delete(member.id)
                  "
                  :aria-label="`${selectedMemberIds.has(member.id) ? 'Deseleccionar' : 'Seleccionar'} ${member.participant?.firstName} ${member.participant?.lastName}`"
                />
              </TableCell>
              <TableCell class="font-medium">
                {{ member.participant?.firstName }} {{ member.participant?.lastName }}
              </TableCell>
              <TableCell>{{ member.participant?.email }}</TableCell>
              <TableCell>
                <Select
                  :model-value="member.state"
                  @update:model-value="updateMemberState(member.id, $event)"
                >
                  <SelectTrigger class="h-8 w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="state in states" :key="state" :value="state">
                      {{ $t(`community.memberStates.${state}`) }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Badge :variant="getFrequencyVariant(member.lastMeetingsFrequency)">
                  {{ $t(`community.participationFrequency.${member.lastMeetingsFrequency?.toLowerCase() || 'none'}`) }}
                  ({{ Math.round(member.lastMeetingsAttendanceRate || 0) }}%)
                </Badge>
              </TableCell>
              <TableCell>
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button variant="ghost" size="icon" @click="confirmRemove(member)" class="text-destructive">
                      <UserMinus class="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Eliminar miembro</p>
                  </TooltipContent>
                </Tooltip>
              </TableCell>
            </TableRow>
            <TableRow v-if="filteredMembers.length === 0">
              <TableCell colspan="6" class="text-center py-8 text-muted-foreground">
                No members found.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>
    </template>

    <ImportMembersModal
      v-if="currentCommunity"
      v-model:open="isImportModalOpen"
      :community-id="currentCommunity.id"
      @imported="fetchMembers"
    />

    <Dialog :open="!!memberToRemove" @update:open="memberToRemove = null">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('delete.confirmTitle') }}</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove {{ memberToRemove?.participant.firstName }} from the community?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="memberToRemove = null">{{ $t('common.actions.cancel') }}</Button>
          <Button variant="destructive" @click="handleRemove">
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Bulk State Change Modal -->
    <Dialog :open="isBulkStateModalOpen" @update:open="isBulkStateModalOpen = false">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('community.members.changeState') }}</DialogTitle>
          <DialogDescription>
            {{ $t('community.members.confirmBulkChange', { count: selectedMemberIds.size, state: bulkNewState || '...' }) }}
          </DialogDescription>
        </DialogHeader>
        <div class="py-4">
          <Label for="bulkState">Nuevo estado</Label>
          <Select v-model="bulkNewState">
            <SelectTrigger id="bulkState" class="mt-2">
              <SelectValue placeholder="Selecciona un estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="state in states" :key="state" :value="state">
                {{ $t(`community.memberStates.${state}`) }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="isBulkStateModalOpen = false">{{ $t('common.actions.cancel') }}</Button>
          <Button @click="handleBulkStateChange" :disabled="!bulkNewState">
            {{ $t('community.members.changeState') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Bulk Remove Dialog -->
    <Dialog :open="isBulkRemoveDialogOpen" @update:open="isBulkRemoveDialogOpen = false">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('delete.confirmTitle') }}</DialogTitle>
          <DialogDescription>
            {{ $t('community.members.confirmBulkRemove', { count: selectedMemberIds.size }) }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="isBulkRemoveDialogOpen = false">{{ $t('common.actions.cancel') }}</Button>
          <Button variant="destructive" @click="handleBulkRemove">
            {{ $t('community.members.remove') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </div>
  </TooltipProvider>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCommunityStore } from '@/stores/communityStore';
import { storeToRefs } from 'pinia';
import { Loader2, UserPlus, UserMinus, Search, ChevronRight, CheckSquare, Square, X, Download } from 'lucide-vue-next';
import {
  Button, Input, Card, Badge, Checkbox,
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from '@repo/ui';
import { useToast } from '@repo/ui';
import ImportMembersModal from '@/components/community/ImportMembersModal.vue';
import SkeletonCard from '@/components/community/SkeletonCard.vue';
import { MemberStateEnum, type MemberState } from '@repo/types';

const { t: $t } = useI18n();

const props = defineProps<{
  id: string;
}>();

const communityStore = useCommunityStore();
const { currentCommunity, members, loadingCommunity } = storeToRefs(communityStore);
const { toast } = useToast();

const searchQuery = ref('');
const stateFilter = ref('all');
const isImportModalOpen = ref(false);
const memberToRemove = ref<any>(null);
const selectedMemberIds = ref<Set<string>>(new Set());
const isBulkStateModalOpen = ref(false);
const bulkNewState = ref<MemberState | ''>('');
const isBulkRemoveDialogOpen = ref(false);

const states = Object.values(MemberStateEnum.enum);

onMounted(async () => {
  await communityStore.fetchCommunity(props.id);
  await fetchMembers();
});

const fetchMembers = async () => {
  await communityStore.fetchMembers(props.id);
};

const filteredMembers = computed(() => {
  return members.value.filter(member => {
    // Safety check for participant data
    if (!member.participant) return false;

    const fullName = `${member.participant.firstName} ${member.participant.lastName}`.toLowerCase();
    const matchesSearch = fullName.includes(searchQuery.value.toLowerCase()) ||
                         member.participant.email?.toLowerCase().includes(searchQuery.value.toLowerCase());
    const matchesState = stateFilter.value === 'all' || member.state === stateFilter.value;
    return matchesSearch && matchesState;
  });
});

const selectedMembers = computed(() => {
  return members.value.filter(m => selectedMemberIds.value.has(m.id));
});

const allSelected = computed(() => {
  return filteredMembers.value.length > 0 && selectedMemberIds.value.size === filteredMembers.value.length;
});

const someSelected = computed(() => {
  return selectedMemberIds.value.size > 0 && selectedMemberIds.value.size < filteredMembers.value.length;
});

const toggleSelectAll = () => {
  if (allSelected.value) {
    selectedMemberIds.value.clear();
  } else {
    filteredMembers.value.forEach(m => selectedMemberIds.value.add(m.id));
  }
};

const clearSelection = () => {
  selectedMemberIds.value.clear();
};

const updateMemberState = async (memberId: string, newState: any) => {
  try {
    await communityStore.updateMemberState(props.id, memberId, newState);
  } catch (error) {
    console.error('Failed to update member state:', error);
  }
};

const confirmRemove = (member: any) => {
  memberToRemove.value = member;
};

const handleRemove = async () => {
  if (!memberToRemove.value) return;
  try {
    await communityStore.removeMember(props.id, memberToRemove.value.id);
  } catch (error) {
    console.error('Failed to remove member:', error);
  } finally {
    memberToRemove.value = null;
  }
};

const openBulkStateModal = () => {
  bulkNewState.value = '';
  isBulkStateModalOpen.value = true;
};

const handleBulkStateChange = async () => {
  if (!bulkNewState.value || selectedMemberIds.value.size === 0) return;

  // Type guard to ensure bulkNewState is a valid MemberState
  const newState = bulkNewState.value as MemberState;

  try {
    for (const memberId of selectedMemberIds.value) {
      await communityStore.updateMemberState(props.id, memberId, newState);
    }
    toast({
      title: 'Estados actualizados',
      description: `${selectedMemberIds.value.size} miembros han sido actualizados a ${newState}`,
    });
    isBulkStateModalOpen.value = false;
    clearSelection();
  } catch (error) {
    console.error('Failed to bulk update member states:', error);
    toast({
      title: 'Error',
      description: 'No se pudieron actualizar los estados',
      variant: 'destructive',
    });
  }
};

const openBulkRemoveDialog = () => {
  isBulkRemoveDialogOpen.value = true;
};

const handleBulkRemove = async () => {
  if (selectedMemberIds.value.size === 0) return;

  try {
    for (const memberId of selectedMemberIds.value) {
      await communityStore.removeMember(props.id, memberId);
    }
    toast({
      title: 'Miembros eliminados',
      description: `${selectedMemberIds.value.size} miembros han sido eliminados de la comunidad`,
    });
    isBulkRemoveDialogOpen.value = false;
    clearSelection();
  } catch (error) {
    console.error('Failed to bulk remove members:', error);
    toast({
      title: 'Error',
      description: 'No se pudieron eliminar los miembros',
      variant: 'destructive',
    });
  }
};

const getFrequencyVariant = (frequency: string | undefined): any => {
  switch (frequency) {
    case 'HIGH': return 'default';
    case 'MEDIUM': return 'secondary';
    case 'LOW': return 'outline';
    case 'NONE': return 'destructive';
    default: return 'outline';
  }
};

const exportMembers = () => {
  try {
    const headers = ['Nombre', 'Email', 'Teléfono', 'Estado', 'Frecuencia de Participación', '% Asistencia'];
    const rows = members.value.map(m => [
      `${m.participant?.firstName || ''} ${m.participant?.lastName || ''}`.trim(),
      m.participant?.email || '',
      m.participant?.cellPhone || m.participant?.homePhone || '',
      $t(`community.memberStates.${m.state}`),
      $t(`community.participationFrequency.${m.lastMeetingsFrequency?.toLowerCase() || 'none'}`),
      `${Math.round(m.lastMeetingsAttendanceRate || 0)}%`
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `miembros-${currentCommunity.value?.name || 'comunidad'}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: $t('community.members.exportSuccess'),
      description: `${members.value.length} miembros exportados`,
    });
  } catch (error) {
    console.error('Failed to export members:', error);
    toast({
      title: $t('community.members.exportFailed'),
      description: error instanceof Error ? error.message : 'Unknown error',
      variant: 'destructive',
    });
  }
};
</script>
