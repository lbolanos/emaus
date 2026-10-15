<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
// lucide 0.363 has no HousePlus — Home is the pays-at-the-house icon (D8).
import { Home } from 'lucide-vue-next';
import { useParticipantStore } from '@/stores/participantStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useAuthPermissions } from '@/composables/useAuthPermissions';

/**
 * Quick "paga en la casa de retiro" toggle for the palancas flow
 * (specs/pays-at-house): the palanquero is usually the first to know the
 * walker will pay on arrival, and logs in with the communications profile —
 * which already carries participant:update. Same inline mold as
 * ParticipantQuickPhoneEditor, minus the popover: one confirm-gated click.
 *
 * Only rendered while the walker owes something (D1) and is not a scholarship
 * (D4); a paid participant keeps the row flag as audit (D3) but the button
 * disappears with the balance.
 */
interface PaysAtHouseParticipantLike {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  paysAtHouse?: boolean | null;
  isScholarship?: boolean | null;
  paymentStatus?: string | null;
}

const props = defineProps<{
  participant: PaysAtHouseParticipantLike;
}>();

const emit = defineEmits<{ (e: 'saved', participantId: string): void }>();

const { t } = useI18n();
const participantStore = useParticipantStore();
const retreatStore = useRetreatStore();
const { hasPermission } = useAuthPermissions();
// Palanqueros enter with the communications profile, which already has
// participant:update; viewers only see the flag.
const canEdit = computed(() => hasPermission('participant:update'));

// Owed states: the flag replaces "Pendiente" while there is balance (D1).
const owes = computed(() =>
  ['unpaid', 'partial', 'pays_at_house'].includes(props.participant.paymentStatus ?? ''),
);
const visible = computed(() => canEdit.value && owes.value && !props.participant.isScholarship);

const saving = ref(false);

async function toggle() {
  if (saving.value) return;
  const name = `${props.participant.firstName ?? ''} ${props.participant.lastName ?? ''}`.trim();
  const marked = !!props.participant.paysAtHouse;
  const message = marked
    ? t('paymentManagement.balances.confirmRemovePaysAtHouse', { name })
    : t('paymentManagement.balances.confirmPaysAtHouse', { name });
  if (!window.confirm(message)) return;

  try {
    saving.value = true;
    await participantStore.updateParticipant(props.participant.id, {
      paysAtHouse: !marked,
      contextRetreatId: retreatStore.selectedRetreatId || undefined,
    } as any);
    await participantStore.fetchParticipants();
    emit('saved', props.participant.id);
  } catch (error) {
    console.error('Error toggling pays-at-house:', error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <button
    v-if="visible"
    type="button"
    class="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-sky-50"
    :class="participant.paysAtHouse ? 'text-sky-600' : 'text-gray-400 hover:text-sky-600'"
    :disabled="saving"
    :title="participant.paysAtHouse ? t('paymentManagement.balances.removePaysAtHouse') : t('paymentManagement.balances.markPaysAtHouse')"
    :aria-label="participant.paysAtHouse ? t('paymentManagement.balances.removePaysAtHouse') : t('paymentManagement.balances.markPaysAtHouse')"
    @click.stop="toggle"
  >
    <Home class="h-3.5 w-3.5" />
  </button>
</template>
