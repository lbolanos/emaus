<script setup lang="ts">
import { useWalkerStore } from '@/stores/walkerStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type { CreateWalker } from '@repo/types';
import AddWalkerModal from './AddWalkerModal.vue';

const walkerStore = useWalkerStore();
const { walkers, loading, error } = storeToRefs(walkerStore);

const retreatStore = useRetreatStore();
const { selectedRetreatId } = storeToRefs(retreatStore);

const isModalOpen = ref(false);

watch(selectedRetreatId, (newId) => {
  if (newId) {
    walkerStore.fetchWalkers(newId);
  }
}, { immediate: true });

const handleAddWalker = async (walkerData: CreateWalker) => {
  try {
    await walkerStore.createWalker(walkerData);
    isModalOpen.value = false;
  } catch (err) {
    console.error('Failed to create walker:', err);
  }
};
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-semibold">Walkers</h2>
      <button
        @click="isModalOpen = true"
        :disabled="!selectedRetreatId"
        class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Add Walker
      </button>
    </div>
    <div v-if="loading">Loading...</div>
    <div v-else-if="error" class="text-red-500">{{ error }}</div>
    <div v-else-if="!selectedRetreatId" class="text-center text-gray-500">
      <p>Please select a retreat to see the participants.</p>
    </div>
    <ul v-else-if="walkers.length > 0" class="space-y-2">
      <li
        v-for="walker in walkers"
        :key="walker.id"
        class="p-4 bg-white border rounded-md shadow-sm"
      >
        {{ walker.firstName }} {{ walker.lastName }} - {{ walker.email }}
      </li>
    </ul>
    <div v-else class="text-center text-gray-500">
      <p>No walkers found for this retreat.</p>
    </div>
    <AddWalkerModal
      v-if="selectedRetreatId"
      :open="isModalOpen"
      @update:open="isModalOpen = $event"
      @submit="handleAddWalker"
      :retreat-id="selectedRetreatId"
    />
  </div>
</template>
