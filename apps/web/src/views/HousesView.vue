<template>
  <div class="p-4">
    <div class="flex justify-between items-center mb-4">
      <h1 class="text-2xl font-bold">Houses</h1>
      <div class="flex items-center space-x-2">
        <Input v-model="searchQuery" placeholder="Search..." class="max-w-sm" />
        <Button @click="openAddModal">Add House</Button>
      </div>
    </div>

    <div v-if="store.loading">Loading...</div>
    <div v-else>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Beds</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="house in filteredHouses" :key="house.id">
            <TableCell>{{ house.name }}</TableCell>
            <TableCell>{{ house.address1 }}</TableCell>
            <TableCell>
              <div class="flex items-center gap-2">
                <span>{{ house.beds?.length || 0 }}</span>
                <Button
                  v-if="house.beds && house.beds.length > 0"
                  variant="ghost"
                  size="sm"
                  @click="openBedMap(house)"
                  class="p-1 h-6 w-6"
                  title="Ver mapa de camas"
                >
                  <Map class="w-4 h-4" />
                </Button>
              </div>
            </TableCell>
            <TableCell class="space-x-2">
              <Button variant="outline" size="sm" @click="openEditModal(house)">Editar</Button>
              <Button
                variant="outline"
                size="sm"
                @click="openBedMap(house)"
                :disabled="!house.beds || house.beds.length === 0"
              >
                <Map class="w-4 h-4 mr-1" />
                Mapa
              </Button>
              <Button variant="destructive" size="sm" @click="deleteHouse(house.id)">Eliminar</Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
    
    <AddEditHouseModal
      :open="isModalOpen"
      :house="selectedHouse"
      @update:open="isModalOpen = $event"
      @submit="handleSubmit"
    />

    <HouseBedMap
      :open="isBedMapOpen"
      :house="selectedHouseForMap"
      @update:open="isBedMapOpen = $event"
      @save-house="handleSaveHouse"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useHouseStore } from '@/stores/houseStore';
import { Button } from '@repo/ui';
import { Input } from '@repo/ui';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@repo/ui';
import AddEditHouseModal from '@/components/AddEditHouseModal.vue';
import HouseBedMap from '@/components/HouseBedMap.vue';
import { Map } from 'lucide-vue-next';

const store = useHouseStore();
const isModalOpen = ref(false);
const selectedHouse = ref<any | null>(null);
const searchQuery = ref('');
const isBedMapOpen = ref(false);
const selectedHouseForMap = ref<any | null>(null);

const filteredHouses = computed(() => {
  if (!searchQuery.value) {
    return store.houses;
  }
  return store.houses.filter(house =>
    house.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
    (house.address1 && house.address1.toLowerCase().includes(searchQuery.value.toLowerCase()))
  );
});

onMounted(() => {
  store.fetchHouses();
});

const openAddModal = () => {
  selectedHouse.value = null;
  isModalOpen.value = true;
};

const openEditModal = (house: any) => {
  selectedHouse.value = house;
  isModalOpen.value = true;
};

const handleSubmit = async (data: any) => {
  let success = false;
  if (data.id) {
    success = await store.updateHouse(data.id, data);
  } else {
    success = await store.createHouse(data);
  }
  if (success) {
    isModalOpen.value = false;
  }
};

const deleteHouse = (id: string) => {
  if (confirm('¿Estás seguro que quieres eliminar esta casa?')) {
    store.deleteHouse(id);
  }
};

const openBedMap = (house: any) => {
  selectedHouseForMap.value = house;
  isBedMapOpen.value = true;
};

const handleSaveHouse = async (house: any) => {
  // Normalize all bed data to ensure correct types
  const normalizedHouse = {
    ...house,
    beds: house.beds?.map((bed: any) => ({
      ...bed,
      roomNumber: bed.roomNumber?.toString() || '',
      floor: Number(bed.floor) || 1,
      bedNumber: bed.bedNumber?.toString() || '',
      type: bed.type || 'normal',
      defaultUsage: bed.defaultUsage || 'caminante'
    })) || []
  };

  const success = await store.updateHouse(house.id, normalizedHouse);
  if (success) {
    selectedHouseForMap.value = normalizedHouse;
  }
  return success;
};
</script>
