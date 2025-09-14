<template>
  <div class="p-4 sm:p-6 lg:p-8">
    <div class="sm:flex sm:items-center sm:justify-between">
      <div class="sm:flex-auto">
        <h1 class="text-2xl font-bold leading-6 text-gray-900 dark:text-white">{{ $t('responsibilities.title') }}</h1>
      </div>
      <div class="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
        <Button @click="openAddEditModal(null)">{{ $t('responsibilities.createResponsability') }}</Button>
      </div>
    </div>

    <div v-if="loading" class="mt-8 text-center">
      <p>{{ $t('participants.loading') }}</p>
    </div>
    <div v-else-if="error" class="mt-8 text-center text-red-500">
      <p>{{ error }}</p>
    </div>
    <div v-else class="mt-8 flow-root">
      <div class="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
        <div class="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
          <div class="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{{ $t('responsibilities.addEditModal.responsabilityNameLabel') }}</TableHead>
                  <TableHead>{{ $t('responsibilities.assignedParticipant') }}</TableHead>
                  <TableHead>{{ $t('participants.actions') }}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="responsability in responsibilities" :key="responsability.id">
                  <TableCell>{{ responsability.name }}</TableCell>
                  <TableCell>
                    <template v-if="responsability.participant">
                      {{ responsability.participant.firstName }} {{ responsability.participant.lastName }}
                    </template>
                    <template v-else>
                      <Button variant="outline" size="sm" @click="openAssignModal(responsability)">{{ $t('responsibilities.assign') }}</Button>
                    </template>
                  </TableCell>
                  <TableCell>
                    <div class="flex gap-2">
                      <Button variant="ghost" size="icon" @click="openAddEditModal(responsability)"><Edit class="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" class="text-red-500 hover:text-red-700" @click="openDeleteDialog(responsability)"><Trash2 class="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <Dialog :open="isAddEditModalOpen" @update:open="isAddEditModalOpen = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ editingResponsability ? $t('responsibilities.addEditModal.editTitle') : $t('responsibilities.addEditModal.createTitle') }}</DialogTitle>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="responsability-name" class="text-right">{{ $t('responsibilities.addEditModal.responsabilityNameLabel') }}</Label>
            <Input id="responsability-name" v-model="responsabilityName" class="col-span-3" :placeholder="$t('responsibilities.addEditModal.responsabilityNamePlaceholder')" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="isAddEditModalOpen = false">{{ $t('common.cancel') }}</Button>
          <Button @click="saveResponsability">{{ $t('responsibilities.addEditModal.save') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Confirmation Dialog -->
    <Dialog :open="isDeleteDialog" @update:open="isDeleteDialog = $event">
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{{ $t('responsibilities.deleteConfirmationTitle') }}</DialogTitle>
                <DialogDescription>{{ $t('responsibilities.deleteConfirmation') }}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
                <Button variant="outline" @click="isDeleteDialog = false">{{ $t('common.cancel') }}</Button>
                <Button variant="destructive" @click="confirmDelete">{{ $t('common.delete') }}</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <!-- Assign Server Modal -->
    <Dialog :open="isAssignModalOpen" @update:open="isAssignModalOpen = $event">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ $t('responsibilities.assignServer') }} - {{ selectedResponsability?.name }}</DialogTitle>
          <DialogDescription>{{ $t('responsibilities.selectServerDescription') }}</DialogDescription>
        </DialogHeader>
        <div class="mt-4">
          <div class="mb-4">
            <Input
              v-model="serverSearchTerm"
              :placeholder="$t('responsibilities.searchServersPlaceholder')"
              class="w-full"
            />
          </div>
          <div v-if="filteredParticipants.length === 0" class="text-center py-8 text-gray-500">
            <template v-if="serverSearchTerm.trim()">
              {{ $t('responsibilities.noServersFound') }}
            </template>
            <template v-else>
              {{ $t('responsibilities.noAvailableServers') }}
            </template>
          </div>
          <div v-else class="grid gap-3 max-h-96 overflow-y-auto">
            <div
              v-for="participant in filteredParticipants"
              :key="participant.id"
              class="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
              @click="assignParticipant(selectedResponsability!.id, participant.id)"
            >
              <div class="flex flex-col">
                <span class="font-medium">{{ participant.firstName }} {{ participant.lastName }}</span>
                <span class="text-sm text-gray-500">{{ participant.email }}</span>
                <span class="text-sm text-gray-500">{{ participant.cellPhone }}</span>
              </div>
              <Button variant="outline" size="sm">{{ $t('responsibilities.assign') }}</Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="isAssignModalOpen = false">{{ $t('common.cancel') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import { useResponsabilityStore } from '@/stores/responsabilityStore';
import { storeToRefs } from 'pinia';
import { Button } from '@repo/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@repo/ui';
import { Input } from '@repo/ui';
import { Label } from '@repo/ui';
import { Edit, Trash2 } from 'lucide-vue-next';
import type { Responsability } from '@repo/types';

const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();
const responsabilityStore = useResponsabilityStore();

const { selectedRetreatId } = storeToRefs(retreatStore);
const { participants } = storeToRefs(participantStore);
const { responsibilities, loading, error } = storeToRefs(responsabilityStore);

const isAddEditModalOpen = ref(false);
const isDeleteDialog = ref(false);
const isAssignModalOpen = ref(false);
const editingResponsability = ref<Responsability | null>(null);
const responsabilityToDelete = ref<Responsability | null>(null);
const selectedResponsability = ref<Responsability | null>(null);
const responsabilityName = ref('');
const serverSearchTerm = ref('');

const availableParticipants = computed(() => {
  const assignedIds = new Set(responsibilities.value.map(c => c.participantId).filter(Boolean));
  return (participants.value || []).filter(p => p.type === 'server' && !p.isCancelled && !assignedIds.has(p.id));
});

const filteredParticipants = computed(() => {
  if (!serverSearchTerm.value.trim()) {
    return availableParticipants.value;
  }
  const searchTerm = serverSearchTerm.value.toLowerCase();
  return availableParticipants.value.filter(participant =>
    participant.firstName.toLowerCase().includes(searchTerm) ||
    participant.lastName.toLowerCase().includes(searchTerm) ||
    participant.email.toLowerCase().includes(searchTerm) ||
    (participant.cellPhone && participant.cellPhone.includes(searchTerm))
  );
});

onMounted(() => {
  if (selectedRetreatId.value) {
    responsabilityStore.fetchResponsibilities(selectedRetreatId.value);
    participantStore.filters.retreatId = selectedRetreatId.value;
    participantStore.fetchParticipants();
  }
});

const openAddEditModal = (responsability: Responsability | null) => {
  editingResponsability.value = responsability;
  responsabilityName.value = responsability ? responsability.name : '';
  isAddEditModalOpen.value = true;
};

const saveResponsability = async () => {
  if (!selectedRetreatId.value) return;

  if (editingResponsability.value) {
    // Update existing responsability
    await responsabilityStore.updateResponsability(editingResponsability.value.id, { name: responsabilityName.value });
  } else {
    // Create new responsability
    await responsabilityStore.createResponsability({ name: responsabilityName.value, retreatId: selectedRetreatId.value });
  }
  isAddEditModalOpen.value = false;
  editingResponsability.value = null;
  responsabilityName.value = '';
};

const openDeleteDialog = (responsability: Responsability) => {
  responsabilityToDelete.value = responsability;
  isDeleteDialog.value = true;
};

const confirmDelete = async () => {
  if (responsabilityToDelete.value) {
    await responsabilityStore.deleteResponsability(responsabilityToDelete.value.id);
  }
  isDeleteDialog.value = false;
  responsabilityToDelete.value = null;
};

const openAssignModal = (responsability: Responsability) => {
  selectedResponsability.value = responsability;
  serverSearchTerm.value = '';
  isAssignModalOpen.value = true;
};

const assignParticipant = async (responsabilityId: string, participantId: string) => {
  const idToAssign = participantId === 'unassigned' ? null : participantId;
  await responsabilityStore.assignParticipant(responsabilityId, idToAssign);
  isAssignModalOpen.value = false;
  selectedResponsability.value = null;
};
</script>
