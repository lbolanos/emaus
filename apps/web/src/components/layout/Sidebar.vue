<template>
  <aside class="w-64 bg-gray-800 text-white flex flex-col dark">
    <div class="h-16 flex items-center justify-center text-2xl font-bold">
      EMAUS
    </div>

    <div class="px-4 py-2 border-t border-b border-gray-700">
      <Label for="retreat-selector" class="block text-sm font-medium text-gray-400 mb-1">Retreat</Label>
      <div v-if="retreatStore.loading">Loading retreats...</div>
      <div v-else-if="retreatStore.retreats.length === 0" class="text-center">
        <p class="text-sm text-gray-400 mb-2">No retreats found.</p>
        <Button @click="isModalOpen = true" class="w-full">
          <Plus class="w-4 h-4 mr-2" />
          Add Retreat
        </Button>
      </div>
      <div v-else class="flex items-center space-x-2">
        <Select v-model="retreatStore.selectedRetreatId">
          <SelectTrigger id="retreat-selector">
            <SelectValue placeholder="Select a retreat" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem v-for="retreat in retreatStore.retreats" :key="retreat.id" :value="retreat.id">
                {{ retreat.parish }} - {{ new Date(retreat.startDate).toLocaleDateString() }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button @click="isModalOpen = true" variant="outline" size="icon">
          <Plus class="w-5 h-5" />
        </Button>
      </div>
    </div>

    <nav class="flex-1 px-2 py-4 space-y-1">
      <router-link to="/" v-slot="{ href, navigate, isActive }">
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white']"
        >
          <Users class="w-6 h-6 mr-3" />
          Participants
        </a>
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
import { Button } from '@repo/ui/components/ui/button';
import { Label } from '@repo/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';

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
