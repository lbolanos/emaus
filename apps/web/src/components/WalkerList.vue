<script setup lang="ts">
import { useWalkerStore } from '@/stores/walkerStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type { CreateWalker } from '@repo/types';
import AddWalkerModal from './AddWalkerModal.vue';
import { Button } from '@repo/ui/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from '@repo/ui/components/ui/table';

const walkerStore = useWalkerStore();
const { walkers, loading, error } = storeToRefs(walkerStore);

const retreatStore = useRetreatStore();
const { selectedRetreatId } = storeToRefs(retreatStore);

const isModalOpen = ref(false);

watch(selectedRetreatId, (newId) => {
  if (newId) {
    walkerStore.fetchWalkers(newId);
  } else {
    walkerStore.clearWalkers();
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
      <Button
        @click="isModalOpen = true"
        :disabled="!selectedRetreatId"
      >
        Add Walker
      </Button>
    </div>
    <div v-if="loading">Loading...</div>
    <div v-else-if="error" class="text-red-500">{{ error }}</div>
    <div v-else-if="!selectedRetreatId" class="text-center text-gray-500 py-8">
      <p>Please select a retreat to see the participants.</p>
    </div>
    <Table v-else>
      <TableCaption v-if="walkers.length === 0">No walkers found for this retreat.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>First Name</TableHead>
          <TableHead>Last Name</TableHead>
          <TableHead>Email</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="walker in walkers" :key="walker.id">
          <TableCell>{{ walker.firstName }}</TableCell>
          <TableCell>{{ walker.lastName }}</TableCell>
          <TableCell>{{ walker.email }}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <AddWalkerModal
      v-if="selectedRetreatId"
      :open="isModalOpen"
      @update:open="isModalOpen = $event"
      @submit="handleAddWalker"
      :retreat-id="selectedRetreatId"
    />
  </div>
</template>