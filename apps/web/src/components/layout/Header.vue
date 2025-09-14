<template>
  <header class="flex items-center justify-between px-4 bg-white border-b">
    <div class="flex items-center gap-4">
      <Button variant="ghost" size="icon" @click="uiStore.toggleSidebar">
        <Menu class="h-6 w-6" />
      </Button>
      <div class="px-4 py-2">
        <!--Label for="retreat-selector" class="text-sm font-medium text-gray-400 mb-1">{{ $t('sidebar.retreat') }}</Label-->
        <div v-if="retreatStore.loading">{{ $t('sidebar.loadingRetreats') }}</div>
        <div v-else-if="retreatStore.retreats.length === 0" class="text-center">
          <p class="text-sm text-gray-400 mb-2">{{ $t('sidebar.noRetreatsFound') }}</p>
          <Button @click="isAddModalOpen = true" class="w-full">
            <Plus class="w-4 h-4 mr-2" />
            {{ $t('sidebar.addRetreat') }}
          </Button>
        </div>
        <div v-else class="flex items-center space-x-2">
          <Select v-model="retreatStore.selectedRetreatId as string">
            <SelectTrigger id="retreat-selector">
              <SelectValue :placeholder="$t('sidebar.selectRetreat')" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem v-for="retreat in retreatStore.retreats" :key="retreat.id" :value="retreat.id">
                  {{ retreat.parish }} - {{ new Date(retreat.startDate).toLocaleDateString() }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button @click="isAddModalOpen = true" variant="outline" size="icon">
            <Plus class="w-5 h-5" />
          </Button>
          <Button
            v-if="retreatStore.selectedRetreatId"
            @click="isEditModalOpen = true"
            variant="outline"
            size="icon"
          >
            <Edit class="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
    <div>
      <LanguageSwitcher />
    </div>
  </header>
  <AddRetreatModal :open="isAddModalOpen" @update:open="isAddModalOpen = $event" @submit="handleAddRetreat" />
  <EditRetreatModal
    :open="isEditModalOpen"
    @update:open="isEditModalOpen = $event"
    :retreat="retreatStore.selectedRetreat"
    @submit="handleEditRetreat"
  />
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRetreatStore } from '@/stores/retreatStore';
import type { CreateRetreat, Retreat } from '@repo/types'; // Import Retreat type
import { Plus, Edit, Menu } from 'lucide-vue-next'; // Import Edit icon
import AddRetreatModal from '@/components/AddRetreatModal.vue';
import EditRetreatModal from '@/components/EditRetreatModal.vue'; // New import
import { Button } from '@repo/ui';
import { Label } from '@repo/ui';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import LanguageSwitcher from '@/components/LanguageSwitcher.vue';
import { useUIStore } from '@/stores/ui';

const uiStore = useUIStore();
const retreatStore = useRetreatStore();
const isAddModalOpen = ref(false);
const isEditModalOpen = ref(false); // New ref for edit modal

onMounted(() => {
  retreatStore.fetchRetreats();
});

watch(
  () => retreatStore.selectedRetreatId,
  (newId, oldId) => {
    if (newId && newId !== oldId) {
      // Here you can add any logic that needs to run when the retreat changes.
      // For example, if other stores need to be updated:
      // useSomeOtherStore().fetchDataForRetreat(newId);
      console.log(`Retreat selection changed from ${oldId} to ${newId}. Views should update now.`);
    }
  },
);

const handleAddRetreat = async (retreatData: CreateRetreat) => {
  try {
    await retreatStore.createRetreat(retreatData);
    isAddModalOpen.value = false;
  } catch (err) {
    console.error('Failed to create retreat:', err);
  }
};

const handleEditRetreat = async (retreatData: Retreat) => { // New function for editing
  try {
    // Assuming an updateRetreat action exists in retreatStore
    await retreatStore.updateRetreat(retreatData); // This action needs to be implemented in retreatStore
    isEditModalOpen.value = false;
  } catch (err) {
    console.error('Failed to update retreat:', err);
  }
};
</script>