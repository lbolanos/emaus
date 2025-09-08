<template>
  <div class="p-4">
    <h1 class="text-2xl font-bold mb-4">Bed Assignments</h1>
    <p class="text-sm text-gray-600 mb-4">
      <span class="text-red-600 font-semibold">Red = Snores</span> | 
      <span class="text-green-600">Green = Doesn't Snore</span>
    </p>
    <div class="mb-4 text-sm">
      <span class="font-semibold">Unassigned:</span> 
      {{ unassignedWalkers.length }} walkers, 
      {{ unassignedServers.length }} servers
    </div>
    <div v-if="loading">Loading...</div>
    <div v-else-if="beds.length === 0">No beds found for this retreat.</div>
    <div v-else>
      <div v-for="floor in sortedFloors" :key="floor">
        <h2 class="text-xl font-bold mt-8 mb-4">Floor {{ floor === '0' ? 'Unassigned' : floor }}</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Room</TableHead>
              <TableHead>Bed</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Default Usage</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Snores</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="bed in groupedBeds[floor]" :key="bed.id">
              <TableCell>{{ bed.roomNumber }}</TableCell>
              <TableCell>{{ bed.bedNumber }}</TableCell>
              <TableCell>{{ bed.type }}</TableCell>
              <TableCell>{{ bed.defaultUsage }}</TableCell>
              <TableCell>
                <Select :model-value="bed.participantId" @update:model-value="assignParticipant(bed.id, $event)">
                  <SelectTrigger>
                    <SelectValue :placeholder="'Unassigned'">
                      {{ bed.participant ? `${bed.participant.firstName} ${bed.participant.lastName}` : 'Unassigned' }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    
                    <!-- Show walkers section -->
                    <template v-if="unassignedWalkers.length > 0">
                      <div class="px-2 py-1 text-sm font-semibold text-gray-700">Walkers</div>
                      <SelectItem v-for="p in unassignedWalkers" :key="p.id" :value="p.id">
                        {{ p.firstName }} {{ p.lastName }} ({{ calculateAge(p.birthDate) }})
                      </SelectItem>
                    </template>
                    
                    <!-- Show servers section -->
                    <template v-if="unassignedServers.length > 0">
                      <div class="px-2 py-1 text-sm font-semibold text-gray-700">Servers</div>
                      <SelectItem v-for="p in unassignedServers" :key="p.id" :value="p.id">
                        {{ p.firstName }} {{ p.lastName }} ({{ calculateAge(p.birthDate) }})
                      </SelectItem>
                    </template>
                    
                    <!-- Also show the currently assigned participant in the list -->
                    <SelectItem v-if="bed.participant" :value="bed.participant.id">
                      {{ bed.participant.firstName }} {{ bed.participant.lastName }} (Currently Assigned)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                {{ bed.participant ? calculateAge(bed.participant.birthDate) : '' }}
              </TableCell>
              <TableCell>
                <span v-if="bed.participant" :class="bed.participant.snores ? 'text-red-600 font-semibold' : 'text-green-600'">
                  {{ bed.participant.snores ? 'Yes' : 'No' }}
                </span>
                <span v-else>-</span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import { api } from '@/services/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select';
import type { RetreatBed } from '@repo/types';

const props = defineProps<{ id: string }>();
const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();

const beds = ref<RetreatBed[]>([]);
const loading = ref(false);

const calculateAge = (birthDate: string | Date): number | null => {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
};

const fetchBeds = async () => {
  if (!retreatStore.selectedRetreatId) return;
  loading.value = true;
  try {
    const response = await api.get(`/retreats/${retreatStore.selectedRetreatId}/beds`);
    beds.value = response.data;
    console.log('DEBUG: Beds fetched:', beds.value);
    console.log('DEBUG: Beds with participants:', beds.value.filter(b => b.participant));
  } catch (error) {
    console.error('Failed to fetch beds:', error);
  } finally {
    loading.value = false;
  }
};

const groupedBeds = computed(() => {
  return beds.value.reduce((acc, bed) => {
    const floor = bed.floor || 0;
    if (!acc[floor]) {
      acc[floor] = [];
    }
    acc[floor].push(bed);
    return acc;
  }, {} as Record<string, RetreatBed[]>);
});

const sortedFloors = computed(() => {
  return Object.keys(groupedBeds.value).sort((a, b) => Number(a) - Number(b));
});

const unassignedParticipants = computed(() => {
  const assignedIds = new Set(beds.value.map(b => b.participantId).filter(Boolean));
  console.log('DEBUG: Assigned participant IDs:', Array.from(assignedIds));
  console.log('DEBUG: Total participants in store:', participantStore.participants?.length || 0);
  console.log('DEBUG: Selected retreat ID:', retreatStore.selectedRetreatId);
  
  const allParticipants = participantStore.participants || [];
  const filteredParticipants = allParticipants.filter(p => 
    !assignedIds.has(p.id) && 
    p.retreatId === retreatStore.selectedRetreatId && 
    !p.isCancelled &&
    p.type !== 'waiting'
  );
  
  console.log('DEBUG: Unassigned participants:', filteredParticipants);
  console.log('DEBUG: Unassigned walkers:', filteredParticipants.filter(p => p.type === 'walker'));
  console.log('DEBUG: Unassigned servers:', filteredParticipants.filter(p => p.type === 'server'));
  
  return filteredParticipants;
});

const unassignedWalkers = computed(() => {
  const walkers = unassignedParticipants.value
    .filter((p: any) => p.type === 'walker')
    .sort((a: any, b: any) => new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime());
  console.log('DEBUG: Computed unassignedWalkers:', walkers);
  return walkers;
});

const unassignedServers = computed(() => {
  const servers = unassignedParticipants.value
    .filter((p: any) => p.type === 'server')
    .sort((a: any, b: any) => new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime());
  console.log('DEBUG: Computed unassignedServers:', servers);
  return servers;
});

const assignParticipant = async (bedId: string, participantId: string | null) => {
  const newParticipantId = participantId === 'unassigned' ? null : participantId;
  try {
    await api.put(`/retreat-beds/${bedId}/assign`, { participantId: newParticipantId });
    // Refresh data
    await fetchBeds();
    if (retreatStore.selectedRetreatId) {
      participantStore.filters.retreatId = retreatStore.selectedRetreatId;
      await participantStore.fetchParticipants();
    }
  } catch (error) {
    console.error('Failed to assign participant:', error);
  }
};

watch(() => retreatStore.selectedRetreatId, (newId) => {
  console.log('DEBUG: Retreat ID changed to:', newId);
  if (newId) {
    fetchBeds();
    participantStore.filters.retreatId = newId;
    console.log('DEBUG: Fetching participants for retreat:', newId);
    console.log('DEBUG: Participant store filters before fetch:', participantStore.filters);
    participantStore.fetchParticipants().then(() => {
      console.log('DEBUG: Fetch participants completed');
    }).catch((error) => {
      console.error('DEBUG: Fetch participants failed:', error);
    });
  }
}, { immediate: true });

// Also watch the participant store for changes
watch(() => participantStore.participants, (newParticipants) => {
  console.log('DEBUG: Participant store updated:', newParticipants?.length || 0, 'participants');
  console.log('DEBUG: Participant store data:', newParticipants);
}, { deep: true });

onMounted(() => {
  console.log('DEBUG: BedAssignmentsView mounted with props.id:', props.id);
  retreatStore.selectRetreat(props.id);
});
</script>
