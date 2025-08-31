<script setup lang="ts">
import { useWalkerStore } from '@/stores/walkerStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { watch } from 'vue'; // Removed onMounted
import { storeToRefs } from 'pinia';
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
const { selectedRetreatId, walkerRegistrationLink } = storeToRefs(retreatStore);

watch(selectedRetreatId, (newId) => {
  if (newId) {
    walkerStore.fetchWalkers(newId);
  } else {
    walkerStore.clearWalkers();
  }
}, { immediate: true });

const openRegistrationLink = () => {
  if (walkerRegistrationLink.value) {
    window.open(walkerRegistrationLink.value, '_blank');
  }
};
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-semibold">{{ $t('walkers.title') }}</h2>
      <Button
        @click="openRegistrationLink"
        :disabled="!selectedRetreatId"
      >
        {{ $t('walkers.addWalker') }}
      </Button>
    </div>
    <div v-if="loading">{{ $t('walkers.loading') }}</div>
    <div v-else-if="error" class="text-red-500">{{ error }}</div>
    <div v-else-if="!selectedRetreatId" class="text-center text-gray-500 py-8">
      <p>{{ $t('walkers.selectRetreatPrompt') }}</p>
    </div>
    <Table v-else>
      <TableCaption v-if="walkers.length === 0">{{ $t('walkers.noWalkersFound') }}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{{ $t('walkers.name') }}</TableHead>
          <TableHead>{{ $t('walkers.email') }}</TableHead>
          <TableHead>{{ $t('walkers.actions') }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="walker in walkers" :key="walker.id">
          <TableCell>{{ walker.firstName }} {{ walker.lastName }}</TableCell>
          <TableCell>{{ walker.email }}</TableCell>
          <TableCell></TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>