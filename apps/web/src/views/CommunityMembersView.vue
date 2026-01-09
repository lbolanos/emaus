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
        <Table class="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>
                <button @click="sortBy('name')" class="flex items-center gap-1 hover:text-primary transition-colors">
                  {{ $t('participants.name') }}
                  <ChevronUp v-if="sortColumn === 'name' && sortDirection === 'asc'" class="w-3.5 h-3.5" />
                  <ChevronDown v-if="sortColumn === 'name' && sortDirection === 'desc'" class="w-3.5 h-3.5" />
                </button>
              </TableHead>
              <TableHead>
                <button @click="sortBy('email')" class="flex items-center gap-1 hover:text-primary transition-colors">
                  {{ $t('participants.email') }}
                  <ChevronUp v-if="sortColumn === 'email' && sortDirection === 'asc'" class="w-3.5 h-3.5" />
                  <ChevronDown v-if="sortColumn === 'email' && sortDirection === 'desc'" class="w-3.5 h-3.5" />
                </button>
              </TableHead>
              <TableHead>
                <button @click="sortBy('state')" class="flex items-center gap-1 hover:text-primary transition-colors">
                  {{ $t('community.admin.status') }}
                  <ChevronUp v-if="sortColumn === 'state' && sortDirection === 'asc'" class="w-3.5 h-3.5" />
                  <ChevronDown v-if="sortColumn === 'state' && sortDirection === 'desc'" class="w-3.5 h-3.5" />
                </button>
              </TableHead>
              <TableHead>
                <button @click="sortBy('attendance')" class="flex items-center gap-1 hover:text-primary transition-colors">
                  {{ $t('community.participationRate') }}
                  <ChevronUp v-if="sortColumn === 'attendance' && sortDirection === 'asc'" class="w-3.5 h-3.5" />
                  <ChevronDown v-if="sortColumn === 'attendance' && sortDirection === 'desc'" class="w-3.5 h-3.5" />
                </button>
              </TableHead>
              <TableHead>{{ $t('participants.actions') }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="member in filteredMembers" :key="member.id" class="hover:bg-muted/50">
              <TableCell class="font-medium py-2">
                {{ member.participant?.firstName }} {{ member.participant?.lastName }}
              </TableCell>
              <TableCell class="py-2">{{ member.participant?.email }}</TableCell>
              <TableCell class="py-2">
                <Select
                  :model-value="member.state"
                  @update:model-value="updateMemberState(member.id, $event)"
                >
                  <SelectTrigger class="h-7 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="state in states" :key="state" :value="state">
                      {{ $t(`community.memberStates.${state}`) }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell class="py-2">
                <Badge :variant="getFrequencyVariant(member.lastMeetingsFrequency)" class="text-xs">
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
              <TableCell colspan="5" class="text-center py-8 text-muted-foreground">
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
    </div>
  </TooltipProvider>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCommunityStore } from '@/stores/communityStore';
import { storeToRefs } from 'pinia';
import { Loader2, UserPlus, UserMinus, Search, ChevronRight, ChevronUp, ChevronDown, Download } from 'lucide-vue-next';
import {
  Button, Input, Card, Badge,
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

// Sort state
const sortColumn = ref<'name' | 'email' | 'state' | 'attendance'>('attendance');
const sortDirection = ref<'asc' | 'desc'>('desc');

const states = Object.values(MemberStateEnum.enum);

onMounted(async () => {
  await communityStore.fetchCommunity(props.id);
  await fetchMembers();
});

const fetchMembers = async () => {
  await communityStore.fetchMembers(props.id);
};

const filteredMembers = computed(() => {
  let filtered = members.value.filter(member => {
    // Safety check for participant data
    if (!member.participant) return false;

    const fullName = `${member.participant.firstName} ${member.participant.lastName}`.toLowerCase();
    const matchesSearch = fullName.includes(searchQuery.value.toLowerCase()) ||
                         member.participant.email?.toLowerCase().includes(searchQuery.value.toLowerCase());
    const matchesState = stateFilter.value === 'all' || member.state === stateFilter.value;
    return matchesSearch && matchesState;
  });

  // Sort filtered members
  filtered = [...filtered].sort((a, b) => {
    let compareValue = 0;

    switch (sortColumn.value) {
      case 'name': {
        const aName = `${a.participant?.firstName} ${a.participant?.lastName}`.toLowerCase();
        const bName = `${b.participant?.firstName} ${b.participant?.lastName}`.toLowerCase();
        compareValue = aName.localeCompare(bName);
        break;
      }
      case 'email':
        compareValue = (a.participant?.email || '').localeCompare(b.participant?.email || '');
        break;
      case 'state':
        compareValue = a.state.localeCompare(b.state);
        break;
      case 'attendance':
        compareValue = (a.lastMeetingsAttendanceRate || 0) - (b.lastMeetingsAttendanceRate || 0);
        break;
    }

    return sortDirection.value === 'asc' ? compareValue : -compareValue;
  });

  return filtered;
});

const sortBy = (column: 'name' | 'email' | 'state' | 'attendance') => {
  if (sortColumn.value === column) {
    // Toggle direction if clicking the same column
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
  } else {
    // New column, set to descending by default (except for name/email where ascending is more natural)
    sortColumn.value = column;
    sortDirection.value = column === 'name' || column === 'email' ? 'asc' : 'desc';
  }
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

const getFrequencyVariant = (frequency: string | undefined): any => {
  switch (frequency?.toLowerCase()) {
    case 'high': return 'success';
    case 'medium': return 'warning';
    case 'low': return 'danger';
    case 'none': return 'neutral';
    default: return 'neutral';
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
