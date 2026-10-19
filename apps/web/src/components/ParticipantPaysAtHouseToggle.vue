<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
// lucide 0.363 has no HousePlus — Home is the pays-at-the-house icon (D8).
import { Home } from 'lucide-vue-next';
import { usePaysAtHouseToggle } from '@/composables/usePaysAtHouseToggle';

/**
 * Quick "paga en la casa de retiro" toggle for the palancas flow
 * (specs/pays-at-house): the palanquero is usually the first to know the
 * walker will pay on arrival. Same inline mold as ParticipantQuickPhoneEditor,
 * minus the popover: one confirm-gated click.
 *
 * Gates and the write itself live in usePaysAtHouseToggle, shared with the
 * balances table and the payment modal: participant:update + owes something
 * (D1) + no scholarship (D4) + a selected retreat.
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
const { canToggle, isSaving, toggle } = usePaysAtHouseToggle();

// A paid participant keeps the row flag as audit (D3) but the button
// disappears with the balance.
const visible = computed(() => canToggle(props.participant));
const saving = computed(() => isSaving(props.participant.id));

async function onToggle() {
  if (await toggle(props.participant)) emit('saved', props.participant.id);
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
    @click.stop="onToggle"
  >
    <Home class="h-3.5 w-3.5" />
  </button>
</template>
