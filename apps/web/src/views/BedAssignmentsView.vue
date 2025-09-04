<template>
  <div class="p-4">
    <h1 class="text-2xl font-bold mb-4">Bed Assignments</h1>
    <div v-if="loading">Loading...</div>
    <div v-else-if="beds.length === 0">No beds found for this retreat.</div>
    <div v-else>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Room</TableHead>
            <TableHead>Bed</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Default Usage</TableHead>
            <TableHead>Assigned To</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="bed in beds" :key="bed.id">
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
                  <SelectItem :value="null">Unassigned</SelectItem>
                  <SelectItem v-for="p in unassignedParticipants" :key="p.id" :value="p.id">
                    {{ p.firstName }} {{ p.lastName }}
                  </SelectItem>
                   <!-- Also show the currently assigned participant in the list -->
                  <SelectItem v-if="bed.participant" :value="bed.participant.id">
                    {{ bed.participant.firstName }} {{ bed.participant.lastName }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import { api } from '@/services/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select';
import type { RetreatBed } from '@repo/types';

const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();

const beds = ref<RetreatBed[]>([]);
const loading = ref(false);

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

const unassignedParticipants = computed(() => {
  const assignedIds = new Set(beds.value.map(b => b.participantId).filter(Boolean));
  return participantStore.participants.filter(p => !assignedIds.has(p.id));
});

const assignParticipant = async (bedId: string, participantId: string | null) => {
  try {
    await api.put(`/retreat-beds/${bedId}/assign`, { participantId });
    // Refresh data
    await fetchBeds();
    if (retreatStore.selectedRetreatId) {
      await participantStore.fetchParticipants(retreatStore.selectedRetreatId);
    }
  } catch (error) {
    console.error('Failed to assign participant:', error);
  }
};

onMounted(() => {
  fetchBeds();
  if (retreatStore.selectedRetreatId && participantStore.participants.length === 0) {
    participantStore.fetchParticipants(retreatStore.selectedRetreatId);
  }
});
</script>
