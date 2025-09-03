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
            <TableCell>{{ house.beds?.length || 0 }}</TableCell>
            <TableCell class="space-x-2">
              <Button variant="outline" size="sm" @click="openEditModal(house)">Edit</Button>
              <Button variant="destructive" size="sm" @click="deleteHouse(house.id)">Delete</Button>
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
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useHouseStore } from '@/stores/houseStore';
import { Button } from '@repo/ui/components/ui/button';
import { Input } from '@repo/ui/components/ui/input';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@repo/ui/components/ui/table';
import AddEditHouseModal from '@/components/AddEditHouseModal.vue';

const store = useHouseStore();
const isModalOpen = ref(false);
const selectedHouse = ref<any | null>(null);
const searchQuery = ref('');

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
  if (confirm('Are you sure you want to delete this house?')) {
    store.deleteHouse(id);
  }
};
</script>
