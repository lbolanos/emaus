<template>
  <div class="p-4 sm:p-6 lg:p-8">
    <div class="sm:flex sm:items-center sm:justify-between">
      <div class="sm:flex-auto">
        <h1 class="text-2xl font-bold leading-6 text-gray-900 dark:text-white">{{ $t('bedAssignments.title') }}</h1>
        <p class="mt-2 text-sm text-gray-700 dark:text-gray-300">{{ $t('bedAssignments.description') }}</p>
        <div class="mt-2 flex items-center gap-4 text-sm">
          <span class="flex items-center">
            <span class="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
            {{ $t('bedAssignments.snores') }}
          </span>
          <span class="flex items-center">
            <span class="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
            {{ $t('bedAssignments.doesNotSnore') }}
          </span>
        </div>
      </div>
      <div class="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
        <Button @click="isAutoAssignDialogOpen = true" variant="outline">{{ $t('bedAssignments.autoAssign') }}</Button>
        <Button @click="isClearAssignmentsDialogOpen = true" variant="outline" class="ml-2">{{ $t('bedAssignments.clearAll') }}</Button>
        <Button @click="exportAssignments" class="ml-2">{{ $t('bedAssignments.export') }}</Button>
      </div>
    </div>

    <!-- Search and Filters -->
    <div class="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <div class="flex flex-col sm:flex-row gap-4">
        <div class="flex-1">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              v-model="searchQuery"
              type="text"
              :placeholder="$t('bedAssignments.searchPlaceholder')"
              class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>
        <div class="flex gap-2">
          <select
            v-model="searchType"
            class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:text-white"
          >
            <option value="all">{{ $t('bedAssignments.searchType.all') }}</option>
            <option value="participants">{{ $t('bedAssignments.searchType.participants') }}</option>
            <option value="beds">{{ $t('bedAssignments.searchType.beds') }}</option>
          </select>
          <select
            v-model="participantFilter"
            class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:text-white"
          >
            <option value="all">{{ $t('bedAssignments.participantFilter.all') }}</option>
            <option value="walkers">{{ $t('bedAssignments.participantFilter.walkers') }}</option>
            <option value="servers">{{ $t('bedAssignments.participantFilter.servers') }}</option>
            <option value="snores">{{ $t('bedAssignments.participantFilter.snores') }}</option>
            <option value="nonSnores">{{ $t('bedAssignments.participantFilter.nonSnores') }}</option>
          </select>
          <Button
            @click="clearSearch"
            variant="outline"
            class="px-3 py-2"
          >
            <X class="w-4 h-4" />
          </Button>
        </div>
      </div>

      <!-- Search Results Summary -->
      <div v-if="searchQuery || participantFilter !== 'all'" class="mt-3 text-sm text-gray-600 dark:text-gray-400">
        <span v-if="searchQuery">
          {{ $t('bedAssignments.searchResults') }}: "{{ searchQuery }}" -
          {{ filteredBeds.length }} {{ $t('bedAssignments.bedsFound') }}
        </span>
        <span v-if="participantFilter !== 'all'">
          {{ $t('bedAssignments.filterApplied') }}: {{ getFilterLabel() }}
        </span>
      </div>
    </div>

    <!-- Statistics Cards -->
    <div class="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div class="flex items-center">
          <div class="flex-shrink-0 bg-blue-500 rounded-md p-3">
            <Users class="h-6 w-6 text-white" />
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{{ $t('bedAssignments.totalParticipants') }}</dt>
              <dd class="text-lg font-medium text-gray-900 dark:text-white">{{ totalParticipants }}</dd>
            </dl>
          </div>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div class="flex items-center">
          <div class="flex-shrink-0 bg-green-500 rounded-md p-3">
            <BedDouble class="h-6 w-6 text-white" />
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{{ $t('bedAssignments.assignedBeds') }}</dt>
              <dd class="text-lg font-medium text-gray-900 dark:text-white">{{ assignedBeds }} / {{ totalBeds }}</dd>
            </dl>
          </div>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div class="flex items-center">
          <div class="flex-shrink-0 bg-yellow-500 rounded-md p-3">
            <UserX class="h-6 w-6 text-white" />
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{{ $t('bedAssignments.unassignedParticipants') }}</dt>
              <dd class="text-lg font-medium text-gray-900 dark:text-white">{{ unassignedWalkers.length + unassignedServers.length }}</dd>
            </dl>
          </div>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div class="flex items-center">
          <div class="flex-shrink-0 bg-purple-500 rounded-md p-3">
            <Home class="h-6 w-6 text-white" />
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{{ $t('bedAssignments.floorsUsed') }}</dt>
              <dd class="text-lg font-medium text-gray-900 dark:text-white">{{ sortedFloors.length }}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>

    <!-- Unassigned Participants Areas -->
    <div class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Unassigned Servers -->
      <div>
        <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">{{ $t('bedAssignments.unassignedServers') }}</h3>
        <div
          @drop="onDropToUnassigned($event, 'server')"
          @dragover.prevent="onDragOverUnassigned($event, 'server')"
          @dragenter.prevent
          @dragleave="isOverUnassignedServer = false"
          class="mt-2 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border min-h-[20px] max-h-60 overflow-y-auto flex flex-wrap gap-2 transition-colors"
          :class="{ 'border-primary bg-primary/10 border-dashed border-2': isOverUnassignedServer }"
        >
          <div
            v-for="server in unassignedServers"
            :key="server.id"
            draggable="true"
            @dragstart="startDrag($event, server)"
            :title="`${server.firstName} ${server.lastName}\n${$t('bedAssignments.age')}: ${calculateAge(server.birthDate)}\n${$t('bedAssignments.snores')}: ${server.snores ? $t('common.yes') : $t('common.no')}`"
            :style="{ borderColor: server.family_friend_color || '#ccc' }"
            class="px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full text-sm font-medium cursor-grab border-2 flex items-center gap-2"
          >
            <span class="w-2 h-2 rounded-full" :class="server.snores ? 'bg-red-500' : 'bg-green-500'"></span>
            {{ server.firstName.split(' ')[0] }} {{ server.lastName.charAt(0) }}.
            <span class="text-xs opacity-75">({{ calculateAge(server.birthDate) }})</span>
          </div>
          <div v-if="unassignedServers.length === 0" class="text-gray-500 text-sm italic w-full text-center py-4">
            {{ $t('bedAssignments.allServersAssigned') }}
          </div>
        </div>
      </div>
      <!-- Unassigned Walkers -->
      <div>
        <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">{{ $t('bedAssignments.unassignedWalkers') }}</h3>
        <div
          @drop="onDropToUnassigned($event, 'walker')"
          @dragover.prevent="onDragOverUnassigned($event, 'walker')"
          @dragenter.prevent
          @dragleave="isOverUnassignedWalker = false"
          class="mt-2 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border min-h-[20px] max-h-60 overflow-y-auto flex flex-wrap gap-2 transition-colors"
          :class="{ 'border-primary bg-primary/10 border-dashed border-2': isOverUnassignedWalker }"
        >
          <div
            v-for="walker in unassignedWalkers"
            :key="walker.id"
            draggable="true"
            @dragstart="startDrag($event, walker)"
            :title="`${walker.firstName} ${walker.lastName}\n${$t('bedAssignments.age')}: ${calculateAge(walker.birthDate)}\n${$t('bedAssignments.snores')}: ${walker.snores ? $t('common.yes') : $t('common.no')}\n${$t('bedAssignments.idOnRetreat')}: ${walker.id_on_retreat || 'N/A'}`"
            :style="{ borderColor: walker.family_friend_color || '#ccc' }"
            class="px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-sm font-medium cursor-grab border-2 flex items-center gap-2"
          >
            <span class="w-2 h-2 rounded-full" :class="walker.snores ? 'bg-red-500' : 'bg-green-500'"></span>
            {{ walker.id_on_retreat || '?' }} {{ walker.firstName.split(' ')[0] }} {{ walker.lastName.charAt(0) }}.
            <span class="text-xs opacity-75">({{ calculateAge(walker.birthDate) }})</span>
          </div>
          <div v-if="unassignedWalkers.length === 0" class="text-gray-500 text-sm italic w-full text-center py-4">
            {{ $t('bedAssignments.allWalkersAssigned') }}
          </div>
        </div>
      </div>
    </div>

    <!-- Beds by Floor -->
    <div v-if="retreatStore.selectedRetreatId">
      <div v-if="loading" class="mt-8 text-center">
        <Loader2 class="w-8 h-8 animate-spin mx-auto" />
        <p class="mt-2">{{ $t('common.loading') }}</p>
      </div>
      <div v-else-if="error" class="mt-8 text-center text-red-500">
        <p>{{ error }}</p>
      </div>
      <div v-else-if="beds.length === 0" class="mt-8 text-center">
        <Home class="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p class="text-gray-600">{{ $t('bedAssignments.noBedsFound') }}</p>
      </div>
      <div v-else class="mt-8 space-y-8">
        <!-- No search results -->
        <div v-if="filteredBeds.length === 0 && (searchQuery || participantFilter !== 'all')" class="text-center py-12">
          <Search class="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {{ $t('bedAssignments.noSearchResults') }}
          </h3>
          <p class="text-gray-600 dark:text-gray-400">
            {{ $t('bedAssignments.noSearchResultsDesc') }}
          </p>
          <Button @click="clearSearch" class="mt-4">
            {{ $t('bedAssignments.clearSearch') }}
          </Button>
        </div>

        <!-- Search results or all beds -->
        <div v-else>
          <div v-for="floor in sortedFilteredFloors" :key="floor" class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <div class="flex items-center justify-between">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                  {{ floor === '0' ? $t('bedAssignments.unassignedFloor') : `${$t('bedAssignments.floor')} ${floor}` }}
                </h2>
                <div class="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <span>{{ groupedFilteredBeds[floor].length }} {{ $t('bedAssignments.beds') }}</span>
                  <span>{{ groupedFilteredBeds[floor].filter(b => b.participant).length }} {{ $t('bedAssignments.occupied') }}</span>
                </div>
              </div>
            </div>
            <div class="p-6">
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                <BedCard
                  v-for="bed in groupedFilteredBeds[floor]"
                  :key="bed.id"
                  :bed="bed"
                  :is-over="isOverBed === bed.id"
                  :highlighted="shouldHighlightBed(bed)"
                  @drop="onDropToBed"
                  @dragover="onDragOverBed"
                  @dragleave="onDragLeaveBed"
                  @assign="assignParticipant"
                  @unassign="unassignParticipant"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="mt-8 text-center">
      <Home class="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <p class="text-gray-600">{{ $t('participants.selectRetreatPrompt') }}</p>
    </div>

    <!-- Auto-Assign Confirmation Dialog -->
    <Dialog :open="isAutoAssignDialogOpen" @update:open="isAutoAssignDialogOpen = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('bedAssignments.autoAssignConfirmation.title') }}</DialogTitle>
          <DialogDescription>{{ $t('bedAssignments.autoAssignConfirmation.description') }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="isAutoAssignDialogOpen = false">{{ $t('common.cancel') }}</Button>
          <Button @click="confirmAutoAssign" :disabled="isAutoAssigning">
            <Loader2 v-if="isAutoAssigning" class="w-4 h-4 mr-2 animate-spin" />
            {{ isAutoAssigning ? $t('bedAssignments.autoAssignConfirmation.autoAssigning') : $t('bedAssignments.autoAssignConfirmation.confirm') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Clear Assignments Confirmation Dialog -->
    <Dialog :open="isClearAssignmentsDialogOpen" @update:open="isClearAssignmentsDialogOpen = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('bedAssignments.clearAssignmentsConfirmation.title') }}</DialogTitle>
          <DialogDescription>{{ $t('bedAssignments.clearAssignmentsConfirmation.description') }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="isClearAssignmentsDialogOpen = false">{{ $t('common.cancel') }}</Button>
          <Button variant="destructive" @click="confirmClearAssignments" :disabled="isClearing">
            <Loader2 v-if="isClearing" class="w-4 h-4 mr-2 animate-spin" />
            {{ $t('common.confirm') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import { useToast } from '@repo/ui';
import { api } from '@/services/api';
import { Button } from '@repo/ui';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@repo/ui';
import { Loader2 } from 'lucide-vue-next';
import { Users, BedDouble, UserX, Home, Search, X } from 'lucide-vue-next';
import type { RetreatBed, Participant } from '@repo/types';
import { useI18n } from 'vue-i18n';
import BedCard from './BedCard.vue';

const props = defineProps<{ id: string }>();
const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();
const { toast } = useToast();
const { t } = useI18n();

const beds = ref<RetreatBed[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

// Dialog states
const isAutoAssignDialogOpen = ref(false);
const isClearAssignmentsDialogOpen = ref(false);
const isAutoAssigning = ref(false);
const isClearing = ref(false);

// Drag and drop states
const isOverUnassignedServer = ref(false);
const isOverUnassignedWalker = ref(false);
const isOverBed = ref<string | null>(null);

// Search states
const searchQuery = ref('');
const searchType = ref<'all' | 'participants' | 'beds'>('all');
const participantFilter = ref<'all' | 'walkers' | 'servers' | 'snores' | 'nonSnores'>('all');

const calculateAge = (birthDate: string | Date): number | null => {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
};

const fetchBeds = async () => {
  if (!retreatStore.selectedRetreatId) return;
  loading.value = true;
  error.value = null;
  try {
    const response = await api.get(`/retreats/${retreatStore.selectedRetreatId}/beds`);
    beds.value = response.data;
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || t('bedAssignments.fetchBedsError');
    error.value = errorMessage;
    toast({
      title: t('common.error'),
      description: errorMessage,
      variant: 'destructive',
    });
  } finally {
    loading.value = false;
  }
};

const groupedBeds = computed(() => {
  return beds.value.reduce((acc, bed) => {
    const floor = bed.floor || 0;
    if (!acc[floor]) {
      acc[floor] = [];
    }
    acc[floor].push(bed);
    return acc;
  }, {} as Record<string, RetreatBed[]>);
});

const sortedFloors = computed(() => {
  return Object.keys(groupedBeds.value).sort((a, b) => Number(a) - Number(b));
});

const unassignedParticipants = computed(() => {
  const assignedIds = new Set(beds.value.map(b => b.participantId).filter(Boolean));

  const allParticipants = participantStore.participants || [];
  const filteredParticipants = allParticipants.filter(p =>
    !assignedIds.has(p.id) &&
    p.retreatId === retreatStore.selectedRetreatId &&
    !p.isCancelled &&
    p.type !== 'waiting'
  );

  return filteredParticipants;
});

const unassignedWalkers = computed(() => {
  const walkers = unassignedParticipants.value
    .filter((p: any) => p.type === 'walker')
    .sort((a: any, b: any) => new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime());
  return walkers;
});

const unassignedServers = computed(() => {
  const servers = unassignedParticipants.value
    .filter((p: any) => p.type === 'server')
    .sort((a: any, b: any) => new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime());
  return servers;
});

// Statistics
const totalParticipants = computed(() => {
  return (participantStore.participants || []).filter(p =>
    p.retreatId === retreatStore.selectedRetreatId &&
    !p.isCancelled &&
    p.type !== 'waiting'
  ).length;
});

const totalBeds = computed(() => beds.value.length);

const assignedBeds = computed(() => beds.value.filter(b => b.participantId).length);

// Search and filter computed properties
const filteredBeds = computed(() => {
  let filtered = [...beds.value];

  // Apply participant filter
  if (participantFilter.value !== 'all') {
    filtered = filtered.filter(bed => {
      if (!bed.participant) return false;

      switch (participantFilter.value) {
        case 'walkers':
          return bed.participant.type === 'walker';
        case 'servers':
          return bed.participant.type === 'server';
        case 'snores':
          return bed.participant.snores === true;
        case 'nonSnores':
          return bed.participant.snores === false;
        default:
          return true;
      }
    });
  }

  // Apply search query
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim();

    filtered = filtered.filter(bed => {
      // Search beds
      if (searchType.value === 'all' || searchType.value === 'beds') {
        if (
          bed.roomNumber.toLowerCase().includes(query) ||
          bed.bedNumber.toLowerCase().includes(query) ||
          (bed.floor && bed.floor.toString().includes(query)) ||
          bed.type.toLowerCase().includes(query)
        ) {
          return true;
        }
      }

      // Search participants
      if (searchType.value === 'all' || searchType.value === 'participants') {
        if (bed.participant) {
          const participant = bed.participant;
          if (
            participant.firstName.toLowerCase().includes(query) ||
            participant.lastName.toLowerCase().includes(query) ||
            (participant.id_on_retreat && participant.id_on_retreat.toString().includes(query)) ||
            (participant.family_friend_color && participant.family_friend_color.toLowerCase().includes(query))
          ) {
            return true;
          }
        }
      }

      return false;
    });
  }

  return filtered;
});

const groupedFilteredBeds = computed(() => {
  return filteredBeds.value.reduce((acc, bed) => {
    const floor = bed.floor || 0;
    if (!acc[floor]) {
      acc[floor] = [];
    }
    acc[floor].push(bed);
    return acc;
  }, {} as Record<string, RetreatBed[]>);
});

const sortedFilteredFloors = computed(() => {
  return Object.keys(groupedFilteredBeds.value).sort((a, b) => Number(a) - Number(b));
});

// Drag and drop functions
const startDrag = (event: DragEvent, participant: Participant) => {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify({
      ...participant,
      sourceBedId: beds.value.find(b => b.participantId === participant.id)?.id
    }));
  }
};

const onDragOverUnassigned = (event: DragEvent, participantType: 'server' | 'walker') => {
  const participantData = event.dataTransfer?.getData('application/json');
  if (!participantData) return;

  const participant = JSON.parse(participantData);

  if (participantType === 'server' && participant.type === 'server') {
    isOverUnassignedServer.value = true;
  } else if (participantType === 'walker' && participant.type === 'walker') {
    isOverUnassignedWalker.value = true;
  }
};

const onDropToUnassigned = async (_event: DragEvent, _participantType: 'server' | 'walker') => {
  isOverUnassignedServer.value = false;
  isOverUnassignedWalker.value = false;

  const participantData = _event.dataTransfer?.getData('application/json');
  if (!participantData) return;

  const participant = JSON.parse(participantData);

  // Only proceed if the participant was dragged from a bed
  if (!participant.sourceBedId) return;

  try {
    await unassignParticipant(participant.sourceBedId);
  } catch (error) {
    console.error('Failed to unassign participant:', error);
  }
};

const onDragOverBed = (event: DragEvent, bedId: string) => {
  isOverBed.value = bedId;
};

const onDragLeaveBed = () => {
  isOverBed.value = null;
};

const onDropToBed = async (event: DragEvent, bedId: string) => {
  isOverBed.value = null;

  const participantData = event.dataTransfer?.getData('application/json');
  if (!participantData) return;

  const participant = JSON.parse(participantData);
  try {
    await assignParticipant(bedId, participant.id);
  } catch (error) {
    console.error('Failed to assign participant:', error);
  }
};

const assignParticipant = async (bedId: string, participantId: string) => {
  try {
    await api.put(`/retreat-beds/${bedId}/assign`, { participantId });
    // Refresh data
    await fetchBeds();
    if (retreatStore.selectedRetreatId) {
      participantStore.filters.retreatId = retreatStore.selectedRetreatId;
      await participantStore.fetchParticipants();
    }
    toast({
      title: t('bedAssignments.assignmentSuccess'),
      description: t('bedAssignments.assignmentSuccessDesc'),
    });
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || t('bedAssignments.assignmentError');
    toast({
      title: t('common.error'),
      description: errorMessage,
      variant: 'destructive',
    });
  }
};

const unassignParticipant = async (bedId: string) => {
  try {
    await api.put(`/retreat-beds/${bedId}/assign`, { participantId: null });
    // Refresh data
    await fetchBeds();
    if (retreatStore.selectedRetreatId) {
      participantStore.filters.retreatId = retreatStore.selectedRetreatId;
      await participantStore.fetchParticipants();
    }
    toast({
      title: t('bedAssignments.unassignmentSuccess'),
      description: t('bedAssignments.unassignmentSuccessDesc'),
    });
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || t('bedAssignments.unassignmentError');
    toast({
      title: t('common.error'),
      description: errorMessage,
      variant: 'destructive',
    });
  }
};

// Action functions
const confirmAutoAssign = async () => {
  if (!retreatStore.selectedRetreatId) return;

  isAutoAssigning.value = true;
  try {
    await api.post(`/retreats/${retreatStore.selectedRetreatId}/auto-assign-beds`);
    isAutoAssignDialogOpen.value = false;
    await fetchBeds();
    toast({
      title: t('bedAssignments.autoAssignSuccess'),
      description: t('bedAssignments.autoAssignSuccessDesc'),
    });
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || t('bedAssignments.autoAssignError');
    toast({
      title: t('common.error'),
      description: errorMessage,
      variant: 'destructive',
    });
  } finally {
    isAutoAssigning.value = false;
  }
};

const confirmClearAssignments = async () => {
  if (!retreatStore.selectedRetreatId) return;

  isClearing.value = true;
  try {
    await api.delete(`/retreats/${retreatStore.selectedRetreatId}/bed-assignments`);
    isClearAssignmentsDialogOpen.value = false;
    await fetchBeds();
    toast({
      title: t('bedAssignments.clearAssignmentsSuccess'),
      description: t('bedAssignments.clearAssignmentsSuccessDesc'),
    });
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || t('bedAssignments.clearAssignmentsError');
    toast({
      title: t('common.error'),
      description: errorMessage,
      variant: 'destructive',
    });
  } finally {
    isClearing.value = false;
  }
};

const exportAssignments = async () => {
  if (!retreatStore.selectedRetreatId) return;

  try {
    const response = await api.get(`/retreats/${retreatStore.selectedRetreatId}/bed-assignments/export`, {
      responseType: 'blob'
    });

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `bed-assignments-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);

    toast({
      title: t('bedAssignments.exportSuccess'),
      description: t('bedAssignments.exportSuccessDesc'),
    });
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || t('bedAssignments.exportError');
    toast({
      title: t('common.error'),
      description: errorMessage,
      variant: 'destructive',
    });
  }
};

// Search functions
const clearSearch = () => {
  searchQuery.value = '';
  searchType.value = 'all';
  participantFilter.value = 'all';
};

const shouldHighlightBed = (bed: RetreatBed) => {
  if (!searchQuery.value.trim()) return false;

  const query = searchQuery.value.toLowerCase().trim();
  if (bed.participant) {
    return (
      bed.participant.firstName.toLowerCase().includes(query) ||
      bed.participant.lastName.toLowerCase().includes(query) ||
      (bed.participant.id_on_retreat && bed.participant.id_on_retreat.toString().includes(query))
    );
  }

  return (
    bed.roomNumber.toLowerCase().includes(query) ||
    bed.bedNumber.toLowerCase().includes(query) ||
    (bed.floor && bed.floor.toString().includes(query))
  );
};

const getFilterLabel = () => {
  const labels: Record<string, string> = {
    walkers: t('bedAssignments.participantFilter.walkers'),
    servers: t('bedAssignments.participantFilter.servers'),
    snores: t('bedAssignments.participantFilter.snores'),
    nonSnores: t('bedAssignments.participantFilter.nonSnores')
  };
  return labels[participantFilter.value] || '';
};

watch(() => retreatStore.selectedRetreatId, (newId) => {
  if (newId) {
    fetchBeds();
    participantStore.filters.retreatId = newId;
    participantStore.fetchParticipants();
  }
}, { immediate: true });

onMounted(() => {
  retreatStore.selectRetreat(props.id);
});
</script>
