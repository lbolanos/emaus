<template>
  <aside class="w-64 bg-gray-800 text-white flex flex-col">
    <div class="h-16 flex items-center justify-center text-2xl font-bold">
      EMAUS
    </div>

    <div class="px-4 py-2 border-t border-b border-gray-700">
      <label for="retreat-selector" class="block text-sm font-medium text-gray-400 mb-1">Retreat</label>
      <div v-if="retreatStore.loading">Loading retreats...</div>
      <div v-else-if="retreatStore.retreats.length === 0" class="text-center">
        <p class="text-sm text-gray-400 mb-2">No retreats found.</p>
        <button @click="isModalOpen = true" class="w-full flex items-center justify-center px-2 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">
          <Plus class="w-4 h-4 mr-2" />
          Add Retreat
        </button>
      </div>
      <div v-else class="flex items-center space-x-2">
        <select
          id="retreat-selector"
          v-model="retreatStore.selectedRetreatId"
          class="block w-full bg-gray-900 border border-gray-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        >
          <option v-for="retreat in retreatStore.retreats" :key="retreat.id" :value="retreat.id">
            {{ retreat.parish }} - {{ new Date(retreat.startDate).toLocaleDateString() }}
          </option>
        </select>
        <button @click="isModalOpen = true" class="p-2 rounded-md hover:bg-gray-700">
          <Plus class="w-5 h-5" />
        </button>
      </div>
    </div>

    <nav class="flex-1 px-2 py-4 space-y-1">
      <router-link
        to="/"
        class="flex items-center px-2 py-2 text-sm font-medium rounded-md hover:bg-gray-700"
        :class="{ 'bg-gray-900': $route.path === '/' }"
      >
        <Users class="w-6 h-6 mr-3" />
        Participants
      </router-link>
      <!-- Add other menu items here -->
    </nav>

    <AddRetreatModal :open="isModalOpen" @update:open="isModalOpen = $event" @submit="handleAddRetreat" />
  </aside>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRetreatStore } from '@/stores/retreatStore';
import type { CreateRetreat } from '@repo/types';
import { Users, Plus } from 'lucide-vue-next';
import AddRetreatModal from '@/components/AddRetreatModal.vue';

const retreatStore = useRetreatStore();
const isModalOpen = ref(false);

onMounted(() => {
  retreatStore.fetchRetreats();
});

const handleAddRetreat = async (retreatData: CreateRetreat) => {
  try {
    await retreatStore.createRetreat(retreatData);
    isModalOpen.value = false;
  } catch (err) {
    console.error('Failed to create retreat:', err);
  }
};
</script>