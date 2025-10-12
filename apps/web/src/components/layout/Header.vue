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
          <!-- Permission refresh indicator -->
          <div v-if="authStore.refreshingProfile" class="flex items-center text-sm text-blue-600">
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Updating permissions...
          </div>
        </div>
      </div>
    </div>
    <div class="flex items-center gap-4">
      <!-- User info and role display -->
      <div v-if="authStore.isAuthenticated && authStore.user" class="hidden md:block">
        <div class="flex items-center gap-3 text-sm">
          <div class="text-right">
            <div class="font-medium text-gray-900">{{ authStore.user.displayName }}</div>
            <div v-if="currentRetreatRole" class="text-xs text-blue-600 font-medium">
              {{ currentRetreatRole.name }} • {{ selectedRetreatName }}
            </div>
            <div v-else-if="retreatStore.selectedRetreatId" class="text-xs text-gray-500">
              No role • {{ selectedRetreatName }}
            </div>
            <div v-else class="text-xs text-gray-400">
              No retreat selected
            </div>
          </div>
        </div>
      </div>

      <!-- Mobile user info with tooltip -->
      <div v-if="authStore.isAuthenticated && authStore.user" class="md:hidden">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button variant="ghost" size="icon" class="relative">
                <User class="h-5 w-5" />
                <!-- Role indicator dot -->
                <div
                  v-if="currentRetreatRole"
                  class="absolute -top-1 -right-1 h-3 w-3 rounded-full"
                  :class="{
                    'bg-green-500': currentRetreatRole.name === 'admin' || currentRetreatRole.name === 'superadmin',
                    'bg-blue-500': currentRetreatRole.name === 'regular_server',
                    'bg-orange-500': currentRetreatRole.name === 'treasurer',
                    'bg-purple-500': currentRetreatRole.name === 'logistics',
                    'bg-yellow-500': currentRetreatRole.name === 'communications',
                    'bg-gray-400': !currentRetreatRole
                  }"
                ></div>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <div class="text-center">
                <p class="font-medium">{{ authStore.user.displayName }}</p>
                <p v-if="currentRetreatRole" class="text-sm text-blue-600">
                  {{ currentRetreatRole.name }} in {{ selectedRetreatName }}
                </p>
                <p v-else-if="retreatStore.selectedRetreatId" class="text-sm text-gray-500">
                  No role in {{ selectedRetreatName }}
                </p>
                <p v-else class="text-sm text-gray-400">
                  No retreat selected
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div>
        <LanguageSwitcher />
      </div>
    </div>
  </header>
  <RetreatModal
    :open="isAddModalOpen"
    mode="add"
    @update:open="isAddModalOpen = $event"
    @submit="handleAddRetreat"
  />
  <RetreatModal
    :open="isEditModalOpen"
    mode="edit"
    :retreat="retreatStore.selectedRetreat"
    @update:open="isEditModalOpen = $event"
    @update="handleEditRetreat"
  />
</template>

<script setup lang="ts">
import { onMounted, ref, watch, computed } from 'vue';
import { useRetreatStore } from '@/stores/retreatStore';
import { useAuthStore } from '@/stores/authStore';
import { useAuthPermissions } from '@/composables/useAuthPermissions';
import type { CreateRetreat, Retreat } from '@repo/types'; // Import Retreat type
import { Plus, Edit, Menu, User } from 'lucide-vue-next'; // Import User icon for mobile
import RetreatModal from '@/components/RetreatModal.vue';
import { Button } from '@repo/ui';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@repo/ui';
import LanguageSwitcher from '@/components/LanguageSwitcher.vue';
import { useUIStore } from '@/stores/ui';

const uiStore = useUIStore();
const retreatStore = useRetreatStore();
const authStore = useAuthStore();
const { currentRetreatRole } = useAuthPermissions();
const isAddModalOpen = ref(false);
const isEditModalOpen = ref(false); // New ref for edit modal

// Computed property for selected retreat name
const selectedRetreatName = computed(() => {
  if (!retreatStore.selectedRetreat) return '';
  return retreatStore.selectedRetreat.parish;
});

onMounted(() => {
  retreatStore.fetchRetreats();
});

watch(
  () => retreatStore.selectedRetreatId,
  async (newId, oldId) => {
    if (newId && newId !== oldId) {
      console.log(`Retreat selection changed from ${oldId} to ${newId}. Refreshing user permissions...`);

      // Refresh user profile to get retreat-specific permissions
      await authStore.refreshUserProfile();

      console.log('User permissions refreshed for new retreat.');
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
    // Debug logging
    console.log('Header - Received update retreat data:', retreatData);
    console.log('Header - isPublic value:', retreatData.isPublic);

    // Assuming an updateRetreat action exists in retreatStore
    await retreatStore.updateRetreat(retreatData); // This action needs to be implemented in retreatStore
    isEditModalOpen.value = false;
  } catch (err) {
    console.error('Failed to update retreat:', err);
  }
};
</script>