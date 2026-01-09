<template>
  <TooltipProvider>
    <div class="p-4 space-y-4">
    <div v-if="loadingCommunity" class="flex justify-center py-12">
      <Loader2 class="w-8 h-8 animate-spin text-primary" />
    </div>

    <template v-else-if="currentCommunity">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="text-2xl font-bold">{{ currentCommunity.name }} - {{ $t('community.members') }}</h1>
          <div class="flex items-center text-sm text-muted-foreground">
            <router-link :to="{ name: 'community-dashboard', params: { id: currentCommunity.id } }" class="hover:underline">
              {{ $t('community.dashboard') }}
            </router-link>
            <ChevronRight class="w-4 h-4 mx-1" />
            <span>{{ $t('community.members') }}</span>
          </div>
        </div>
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

      <div class="flex items-center space-x-2">
        <div class="relative flex-1 max-w-sm">
          <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            v-model="searchQuery" 
            :placeholder="$t('sidebar.searchPlaceholder')" 
            class="pl-8" 
          />
        </div>
        <Select v-model="stateFilter">
          <SelectTrigger class="w-[180px]">
            <SelectValue placeholder="Filter by State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            <SelectItem v-for="state in states" :key="state" :value="state">
              {{ $t(`community.memberStates.${state}`) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{{ $t('participants.name') }}</TableHead>
              <TableHead>{{ $t('participants.email') }}</TableHead>
              <TableHead>{{ $t('community.admin.status') }}</TableHead>
              <TableHead>{{ $t('community.participationRate') }}</TableHead>
              <TableHead>{{ $t('participants.actions') }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="member in filteredMembers" :key="member.id">
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
          <Button variant="outline" @click="memberToRemove = null">Cancel</Button>
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
import { useCommunityStore } from '@/stores/communityStore';
import { storeToRefs } from 'pinia';
import { Loader2, UserPlus, UserMinus, Search, ChevronRight } from 'lucide-vue-next';
import {
  Button, Input, Card, Badge,
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from '@repo/ui';
import ImportMembersModal from '@/components/community/ImportMembersModal.vue';
import { MemberStateEnum } from '@repo/types';

const props = defineProps<{
  id: string;
}>();

const communityStore = useCommunityStore();
const { currentCommunity, members, loadingCommunity } = storeToRefs(communityStore);

const searchQuery = ref('');
const stateFilter = ref('all');
const isImportModalOpen = ref(false);
const memberToRemove = ref<any>(null);

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
  switch (frequency) {
    case 'HIGH': return 'default';
    case 'MEDIUM': return 'secondary';
    case 'LOW': return 'outline';
    case 'NONE': return 'destructive';
    default: return 'outline';
  }
};
</script>
