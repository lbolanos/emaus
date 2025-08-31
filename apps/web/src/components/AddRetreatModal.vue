<template>
  <SimpleModal :open="open" @update:open="emit('update:open', $event)" title="Add New Retreat">
    <form @submit.prevent="handleSubmit">
      <div class="space-y-4">
        <div>
          <label for="parish" class="block text-sm font-medium text-gray-700">Parish</label>
          <input v-model="formData.parish" type="text" id="parish" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900" required />
        </div>
        <div>
          <label for="startDate" class="block text-sm font-medium text-gray-700">Start Date</label>
          <input v-model="formData.startDate" type="date" id="startDate" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900" required />
        </div>
        <div>
          <label for="endDate" class="block text-sm font-medium text-gray-700">End Date</label>
          <input v-model="formData.endDate" type="date" id="endDate" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900" required />
        </div>
        <div>
          <label for="houseId" class="block text-sm font-medium text-gray-700">House</label>
          <select v-model="formData.houseId" id="houseId" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900">
            <option value="">None</option>
            <option v-for="house in houseStore.houses" :key="house.id" :value="house.id">{{ house.name }}</option>
          </select>
        </div>
      </div>
      <div class="mt-6 flex justify-end">
        <button type="button" @click="emit('update:open', false)" class="mr-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">Cancel</button>
        <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">Save Retreat</button>
      </div>
    </form>
  </SimpleModal>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { CreateRetreat } from '@repo/types';
import { useHouseStore } from '@/stores/houseStore';
import SimpleModal from './SimpleModal.vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'submit', data: CreateRetreat): void }>();

const houseStore = useHouseStore();

onMounted(() => {
  if (houseStore.houses.length === 0) {
    houseStore.fetchHouses();
  }
});

const formData = ref<CreateRetreat>({
  parish: '',
  startDate: new Date(),
  endDate: new Date(),
  houseId: '',
});

const handleSubmit = () => {
  emit('submit', { ...formData.value });
  emit('update:open', false);
};
</script>