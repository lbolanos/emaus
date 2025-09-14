<template>
  <div class="p-4 sm:p-6 lg:p-8">
    <div class="sm:flex sm:items-center sm:justify-between">
      <div class="sm:flex-auto">
        <h1 class="text-2xl font-bold leading-6 text-gray-900 dark:text-white">{{ $t('charges.title') }}</h1>
      </div>
      <div class="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
        <Button @click="openAddEditModal(null)">{{ $t('charges.createCharge') }}</Button>
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
                  <TableHead>{{ $t('charges.addEditModal.chargeNameLabel') }}</TableHead>
                  <TableHead>{{ $t('charges.assignedParticipant') }}</TableHead>
                  <TableHead>{{ $t('participants.actions') }}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="charge in charges" :key="charge.id">
                  <TableCell>{{ charge.name }}</TableCell>
                  <TableCell>
                    <template v-if="charge.participant">
                      {{ charge.participant.firstName }} {{ charge.participant.lastName }}
                    </template>
                    <template v-else>
                      <Button variant="outline" size="sm" @click="openAssignModal(charge)">{{ $t('charges.assign') }}</Button>
                    </template>
                  </TableCell>
                  <TableCell>
                    <div class="flex gap-2">
                      <Button variant="ghost" size="icon" @click="openAddEditModal(charge)"><Edit class="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" class="text-red-500 hover:text-red-700" @click="openDeleteDialog(charge)"><Trash2 class="h-4 w-4" /></Button>
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
          <DialogTitle>{{ editingCharge ? $t('charges.addEditModal.editTitle') : $t('charges.addEditModal.createTitle') }}</DialogTitle>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="charge-name" class="text-right">{{ $t('charges.addEditModal.chargeNameLabel') }}</Label>
            <Input id="charge-name" v-model="chargeName" class="col-span-3" :placeholder="$t('charges.addEditModal.chargeNamePlaceholder')" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="isAddEditModalOpen = false">{{ $t('common.cancel') }}</Button>
          <Button @click="saveCharge">{{ $t('charges.addEditModal.save') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Confirmation Dialog -->
    <Dialog :open="isDeleteDialog" @update:open="isDeleteDialog = $event">
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{{ $t('charges.deleteConfirmationTitle') }}</DialogTitle>
                <DialogDescription>{{ $t('charges.deleteConfirmation') }}</DialogDescription>
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
          <DialogTitle>{{ $t('charges.assignServer') }} - {{ selectedCharge?.name }}</DialogTitle>
          <DialogDescription>{{ $t('charges.selectServerDescription') }}</DialogDescription>
        </DialogHeader>
        <div class="mt-4">
          <div class="mb-4">
            <Input
              v-model="serverSearchTerm"
              :placeholder="$t('charges.searchServersPlaceholder')"
              class="w-full"
            />
          </div>
          <div v-if="filteredParticipants.length === 0" class="text-center py-8 text-gray-500">
            <template v-if="serverSearchTerm.trim()">
              {{ $t('charges.noServersFound') }}
            </template>
            <template v-else>
              {{ $t('charges.noAvailableServers') }}
            </template>
          </div>
          <div v-else class="grid gap-3 max-h-96 overflow-y-auto">
            <div
              v-for="participant in filteredParticipants"
              :key="participant.id"
              class="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
              @click="assignParticipant(selectedCharge!.id, participant.id)"
            >
              <div class="flex flex-col">
                <span class="font-medium">{{ participant.firstName }} {{ participant.lastName }}</span>
                <span class="text-sm text-gray-500">{{ participant.email }}</span>
                <span class="text-sm text-gray-500">{{ participant.cellPhone }}</span>
              </div>
              <Button variant="outline" size="sm">{{ $t('charges.assign') }}</Button>
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
import { useChargeStore } from '@/stores/chargeStore';
import { storeToRefs } from 'pinia';
import { Button } from '@repo/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@repo/ui';
import { Input } from '@repo/ui';
import { Label } from '@repo/ui';
import { Edit, Trash2 } from 'lucide-vue-next';
import type { Charge } from '@repo/types';

const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();
const chargeStore = useChargeStore();

const { selectedRetreatId } = storeToRefs(retreatStore);
const { participants } = storeToRefs(participantStore);
const { charges, loading, error } = storeToRefs(chargeStore);

const isAddEditModalOpen = ref(false);
const isDeleteDialog = ref(false);
const isAssignModalOpen = ref(false);
const editingCharge = ref<Charge | null>(null);
const chargeToDelete = ref<Charge | null>(null);
const selectedCharge = ref<Charge | null>(null);
const chargeName = ref('');
const serverSearchTerm = ref('');

const availableParticipants = computed(() => {
  const assignedIds = new Set(charges.value.map(c => c.participantId).filter(Boolean));
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
    chargeStore.fetchCharges(selectedRetreatId.value);
    participantStore.filters.retreatId = selectedRetreatId.value;
    participantStore.fetchParticipants();
  }
});

const openAddEditModal = (charge: Charge | null) => {
  editingCharge.value = charge;
  chargeName.value = charge ? charge.name : '';
  isAddEditModalOpen.value = true;
};

const saveCharge = async () => {
  if (!selectedRetreatId.value) return;

  if (editingCharge.value) {
    // Update existing charge
    await chargeStore.updateCharge(editingCharge.value.id, { name: chargeName.value });
  } else {
    // Create new charge
    await chargeStore.createCharge({ name: chargeName.value, retreatId: selectedRetreatId.value });
  }
  isAddEditModalOpen.value = false;
  editingCharge.value = null;
  chargeName.value = '';
};

const openDeleteDialog = (charge: Charge) => {
  chargeToDelete.value = charge;
  isDeleteDialog.value = true;
};

const confirmDelete = async () => {
  if (chargeToDelete.value) {
    await chargeStore.deleteCharge(chargeToDelete.value.id);
  }
  isDeleteDialog.value = false;
  chargeToDelete.value = null;
};

const openAssignModal = (charge: Charge) => {
  selectedCharge.value = charge;
  serverSearchTerm.value = '';
  isAssignModalOpen.value = true;
};

const assignParticipant = async (chargeId: string, participantId: string) => {
  const idToAssign = participantId === 'unassigned' ? null : participantId;
  await chargeStore.assignParticipant(chargeId, idToAssign);
  isAssignModalOpen.value = false;
  selectedCharge.value = null;
};
</script>
