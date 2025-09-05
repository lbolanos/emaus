<template>
    <div class="container mx-auto px-4 py-8">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-3xl font-bold">{{ $t('retreatCharges.title') }}</h1>
        <Button @click="openCreateModal">
          {{ $t('retreatCharges.createCharge') }}
        </Button>
      </div>

      <div class="grid gap-6">
        <RetreatChargeList
          :charges="charges"
          :available-participants="availableParticipants"
          @assign-charge="handleAssignCharge"
          @edit-charge="handleEditCharge"
          @delete-charge="openDeleteConfirmation"
        />
      </div>

      <AddEditChargeModal
        :open="showAddEditModal"
        :charge="editingCharge"
        @close="closeAddEditModal"
        @save="handleSaveCharge"
      />

      <ConfirmationDialog
        :open="showDeleteConfirmation"
        :title="$t('retreatCharges.deleteConfirmationTitle')"
        :message="$t('retreatCharges.deleteConfirmation')"
        :confirm-button-text="$t('common.delete')"
        :cancel-button-text="$t('common.cancel')"
        @close="closeDeleteConfirmation"
        @confirm="confirmDeleteCharge"
      />
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRetreatChargeStore } from '../stores/retreatChargeStore';
import { useParticipantStore } from '../stores/participantStore';
import { useRetreatStore } from '../stores/retreatStore';
import { Button } from '@repo/ui/components/ui/button';
import RetreatChargeList from '../components/RetreatChargeList.vue';
import AddEditChargeModal from '../components/AddEditChargeModal.vue';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import type { RetreatCharge } from '@repo/types/retreat';
import type { Participant } from '@repo/types';

const retreatChargeStore = useRetreatChargeStore();
const participantStore = useParticipantStore();
const retreatStore = useRetreatStore();

const charges = computed(() => retreatChargeStore.charges);
const availableParticipants = ref<Participant[]>([]);

const showAddEditModal = ref(false);
const editingCharge = ref<RetreatCharge | null>(null);

const showDeleteConfirmation = ref(false);
const deletingChargeId = ref<number | null>(null);

onMounted(async () => {
  await loadCharges();
  await loadParticipants();
});

const loadCharges = async () => {
  if (retreatStore.selectedRetreatId) {
    await retreatChargeStore.fetchCharges(retreatStore.selectedRetreatId);
  }
};

const loadParticipants = async () => {
  if (retreatStore.selectedRetreatId) {
    await participantStore.fetchParticipants(retreatStore.selectedRetreatId);
    availableParticipants.value = participantStore.allParticipants.filter(p => p.type === 'server');
  }
};

const openCreateModal = () => {
  editingCharge.value = null;
  showAddEditModal.value = true;
};

const handleEditCharge = (charge: RetreatCharge) => {
  editingCharge.value = charge;
  showAddEditModal.value = true;
};

const closeAddEditModal = () => {
  showAddEditModal.value = false;
  editingCharge.value = null;
};

const handleSaveCharge = async (chargeData: { name: string; id?: number }) => {
  if (retreatStore.selectedRetreatId) {
    if (editingCharge.value && editingCharge.value.id) {
      await retreatChargeStore.updateCharge(editingCharge.value.id, { name: chargeData.name });
    } else {
      await retreatChargeStore.createCharge({ name: chargeData.name, retreatId: retreatStore.selectedRetreatId });
    }
    await loadCharges();
    closeAddEditModal();
  }
};

const openDeleteConfirmation = (chargeId: number) => {
  deletingChargeId.value = chargeId;
  showDeleteConfirmation.value = true;
};

const closeDeleteConfirmation = () => {
  showDeleteConfirmation.value = false;
  deletingChargeId.value = null;
};

const confirmDeleteCharge = async () => {
  if (deletingChargeId.value) {
    await retreatChargeStore.deleteCharge(deletingChargeId.value);
    await loadCharges();
    closeDeleteConfirmation();
  }
};

const handleAssignCharge = async ({ chargeId, participantId }: { chargeId: number, participantId: number }) => {
  await retreatChargeStore.assignCharge(chargeId, participantId);
  await loadCharges();
};
</script>