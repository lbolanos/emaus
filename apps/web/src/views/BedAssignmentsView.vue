<template>
  <div class="p-4">
    <h1 class="text-2xl font-bold mb-4">Bed Assignments</h1>
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
                    <template v-if="bed.defaultUsage === 'caminante'">
                      <SelectItem v-for="p in unassignedWalkers" :key="p.id" :value="p.id">
                        {{ p.firstName }} {{ p.lastName }}
                      </SelectItem>
                    </template>
                    <template v-else-if="bed.defaultUsage === 'servidor'">
                      <SelectItem v-for="p in unassignedServers" :key="p.id" :value="p.id">
                        {{ p.firstName }} {{ p.lastName }}
                      </SelectItem>
                    </template>
                    <!-- Also show the currently assigned participant in the list -->
                    <SelectItem v-if="bed.participant" :value="bed.participant.id">
                      {{ bed.participant.firstName }} {{ bed.participant.lastName }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                {{ bed.participant ? calculateAge(bed.participant.birthDate) : '' }}
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
  return (participantStore.allParticipants || []).filter(p => !assignedIds.has(p.id));
});

const unassignedWalkers = computed(() => {
  return unassignedParticipants.value
    .filter(p => p.type === 'walker')
    .sort((a, b) => new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime());
});

const unassignedServers = computed(() => {
  return unassignedParticipants.value
    .filter(p => p.type === 'server')
    .sort((a, b) => new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime());
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
  if (newId) {
    fetchBeds();
    participantStore.filters.retreatId = newId;
    participantStore.fetchParticipants();
  }
}, { immediate: true });

onMounted(() => {
  retreatStore.selectRetreat(props.id);
});
</script>
