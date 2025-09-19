<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useRetreatStore } from '@/stores/retreatStore';
import { api } from '@/services/api';
import { Button } from '@repo/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import type { RetreatBed, Participant } from '@repo/types';

const route = useRoute();
const retreatStore = useRetreatStore();
const beds = ref<RetreatBed[]>([]);
const loading = ref(true);

const retreatId = computed(() => route.params.id as string || retreatStore.selectedRetreatId);

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
  if (!retreatId.value) return;
  loading.value = true;
  try {
    const response = await api.get(`/retreats/${retreatId.value}/beds`);
    beds.value = response.data;
  } catch (error) {
    console.error('Error fetching beds:', error);
  } finally {
    loading.value = false;
  }
};

const printContent = () => {
  window.print();
};

onMounted(fetchBeds);

const groupedBeds = computed(() => {
  return beds.value.reduce((acc, bed) => {
    const floor = bed.floor || 'Unassigned Floor'; // Handle cases where floor might be null or undefined
    const roomNumber = bed.roomNumber;

    if (!acc[floor]) {
      acc[floor] = {};
    }
    if (!acc[floor][roomNumber]) {
      acc[floor][roomNumber] = [];
    }
    acc[floor][roomNumber].push(bed);
    return acc;
  }, {} as Record<string, Record<string, RetreatBed[]>>);
});
</script>

<template>
  <div class="p-4 print-container">
    <div class="flex justify-between items-center mb-4 no-print">
      <h1 class="text-2xl font-bold">{{ $t('rooms.title') }}</h1>
      <Button @click="printContent">
        {{ $t('common.actions.print') }}
      </Button>
    </div>
    <div v-if="loading" class="text-center">
      <p>{{ $t('participants.loading') }}</p>
    </div>
    <div v-else-if="!beds.length" class="text-center">
      <p>{{ $t('rooms.noRoomsFound') }}</p>
    </div>
    <div v-else>
      <div v-for="(floorRooms, floor) in groupedBeds" :key="floor" class="mb-8 print-section">
        <h2 class="text-xl font-semibold mb-4">{{ $t('rooms.floor') }} {{ floor }}</h2>
        <div class="card-container grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card v-for="(roomBeds, roomNumber) in floorRooms" :key="roomNumber">
            <CardHeader>
              <CardTitle>
                {{ $t('rooms.room') }} {{ roomNumber }}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{{ $t('rooms.bedNumber') }}</TableHead>
                    <TableHead>{{ $t('rooms.participant') }}</TableHead>
                    <TableHead>{{ $t('rooms.type') }}</TableHead>
                    <!--TableHead>{{ $t('rooms.age') }}</TableHead-->
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="bed in roomBeds" :key="bed.id">
                    <TableCell>{{ bed.bedNumber }}</TableCell>                    
                    <TableCell>
                      {{ bed.participant ? `${bed.participant.firstName} ${bed.participant.lastName}` : $t('rooms.unassigned') }}
                    </TableCell>
                    <TableCell>{{ bed.type }}</TableCell>
                    <!--TableCell>
                      {{ bed.participant ? calculateAge(bed.participant.birthDate) : '' }}
                    </TableCell-->
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
@media print {
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
  .no-print {
    display: none !important;
  }
  .card-container {
    display: grid !important;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }
  .card {
    page-break-inside: avoid;
    border: 1px solid #ccc;
    margin-bottom: 1rem;
  }
  .print-section {
    page-break-after: always;
  }
  .mb-8 {
    margin-bottom: 0; /* Remove extra margin on print */
  }
}
</style>
