<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useRetreatStore } from '@/stores/retreatStore';
import { api } from '@/services/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card';
import type { RetreatBed } from '@repo/types';

const route = useRoute();
const retreatStore = useRetreatStore();
const beds = ref<RetreatBed[]>([]);
const loading = ref(true);

const retreatId = computed(() => route.params.id as string || retreatStore.selectedRetreatId);

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

onMounted(fetchBeds);

const groupedBeds = computed(() => {
  return beds.value.reduce((acc, bed) => {
    const roomNumber = bed.roomNumber;
    if (!acc[roomNumber]) {
      acc[roomNumber] = [];
    }
    acc[roomNumber].push(bed);
    return acc;
  }, {} as Record<string, RetreatBed[]>);
});
</script>

<template>
  <div class="p-4">
    <h1 class="text-2xl font-bold mb-4">{{ $t('rooms.title') }}</h1>
    <div v-if="loading" class="text-center">
      <p>{{ $t('participants.loading') }}</p>
    </div>
    <div v-else-if="!beds.length" class="text-center">
      <p>{{ $t('rooms.noRoomsFound') }}</p>
    </div>
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card v-for="(roomBeds, roomNumber) in groupedBeds" :key="roomNumber">
        <CardHeader>
          <CardTitle>{{ $t('rooms.room') }} {{ roomNumber }}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{{ $t('rooms.bedNumber') }}</TableHead>
                <TableHead>{{ $t('rooms.participant') }}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="bed in roomBeds" :key="bed.id">
                <TableCell>{{ bed.bedNumber }}</TableCell>
                <TableCell>
                  {{ bed.participant ? `${bed.participant.firstName} ${bed.participant.lastName}` : $t('rooms.unassigned') }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
