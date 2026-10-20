<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label } from '@repo/ui';
import { changeParticipantEmailSchema } from '@repo/types';
import {
  changeParticipantEmail,
  type ParticipantEmailChangeResult,
} from '@/services/api';
import { apiErrorMessage } from '@/services/apiError';

/**
 * D7 of specs/participant-email-change: the email is the participant's global
 * identity, so correcting it asks for the new address TWICE (type-to-confirm
 * kills the original typo/autocomplete mistake), shows what the change drags
 * along BEFORE accepting, and the detailed effects AFTER (account linked,
 * community overlays cleared, message queue regenerated, spouse share).
 *
 * Mounted from startup with `open=false` (same rule as MessageDialog): the
 * reset runs on the open watcher, and a dialog mounted lazily via v-if would
 * miss it.
 */
const props = defineProps<{
  open: boolean;
  participant: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    retreatId?: string | null;
  };
}>();

const emit = defineEmits<{
  close: [];
  saved: [result: ParticipantEmailChangeResult];
}>();

const { t } = useI18n();

const newEmail = ref('');
const confirmEmail = ref('');
const saving = ref(false);
const error = ref('');
const result = ref<ParticipantEmailChangeResult | null>(null);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      newEmail.value = '';
      confirmEmail.value = '';
      error.value = '';
      result.value = null;
      saving.value = false;
    }
  },
);

const fullName = computed(() =>
  [props.participant.firstName, props.participant.lastName]
    .filter(Boolean)
    .join(' ')
    .trim(),
);

// Same validation the server runs (normalizeEmail + email), so what the button
// allows is exactly what the API accepts; data.email is the normalized value.
const parsedEmail = computed(() =>
  changeParticipantEmailSchema.shape.body.safeParse({ email: newEmail.value }),
);
const normalizedEmail = computed(() =>
  parsedEmail.value.success ? parsedEmail.value.data.email : null,
);
const sameAsCurrent = computed(() => {
  if (!normalizedEmail.value || !props.participant.email) return false;
  return (
    normalizedEmail.value.toLowerCase() ===
    props.participant.email.trim().toLowerCase()
  );
});
const confirmMatches = computed(
  () =>
    confirmEmail.value.trim().toLowerCase() ===
    newEmail.value.trim().toLowerCase(),
);

const hint = computed(() => {
  if (!newEmail.value.trim()) return '';
  if (!parsedEmail.value.success) return t('participants.emailChange.invalid');
  if (sameAsCurrent.value) return t('participants.emailChange.sameAsCurrent');
  if (confirmEmail.value.trim() && !confirmMatches.value)
    return t('participants.emailChange.mismatch');
  return '';
});

const canSubmit = computed(
  () =>
    !!normalizedEmail.value &&
    !sameAsCurrent.value &&
    confirmMatches.value &&
    !saving.value,
);

// Human-readable breakdown of the server's effects (D7: "resultado detallado").
const effectLines = computed(() => {
  const effects = result.value?.effects;
  if (!effects) return [];
  const lines: string[] = [];
  if (effects.userLinked) lines.push(t('participants.emailChange.effectUserLinked'));
  if (effects.userWithOldEmail)
    lines.push(t('participants.emailChange.effectUserWithOldEmail'));
  if (effects.overlaysCleared > 0)
    lines.push(
      t('participants.emailChange.effectOverlaysCleared', {
        count: effects.overlaysCleared,
      }),
    );
  if (effects.queueRegenerated.length > 0)
    lines.push(
      t('participants.emailChange.effectQueueRegenerated', {
        retreats: effects.queueRegenerated.length,
        regenerated: effects.queueRegenerated.reduce(
          (sum, r) => sum + r.regenerated,
          0,
        ),
      }),
    );
  if (effects.spouseShareRetreats.length > 0)
    lines.push(
      t('participants.emailChange.effectSpouseShare', {
        count: effects.spouseShareRetreats.length,
      }),
    );
  if (lines.length === 0) lines.push(t('participants.emailChange.effectNothingElse'));
  return lines;
});

async function submit() {
  if (!canSubmit.value || !normalizedEmail.value) return;
  saving.value = true;
  error.value = '';
  try {
    const res = await changeParticipantEmail(
      props.participant.id,
      normalizedEmail.value,
      props.participant.retreatId ?? undefined,
    );
    result.value = res;
    emit('saved', res);
  } catch (e) {
    // 409s carry the pedagogical message naming the current owner; any other
    // failure falls back to the shared extractor.
    error.value = apiErrorMessage(e);
  } finally {
    saving.value = false;
  }
}

function close() {
  emit('close');
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => !value && close()">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t('participants.emailChange.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('participants.emailChange.description') }}
        </DialogDescription>
      </DialogHeader>

      <!-- Before: type-to-confirm + consequences summary -->
      <template v-if="!result">
        <div class="space-y-1">
          <p class="text-sm font-medium text-gray-900">{{ fullName }}</p>
          <p class="text-xs text-gray-500">
            {{ t('participants.emailChange.current') }}:
            <span class="font-mono">{{ participant.email }}</span>
          </p>
        </div>

        <div class="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p class="font-semibold">{{ t('participants.emailChange.summaryTitle') }}</p>
          <p class="mt-1">{{ t('participants.emailChange.summary') }}</p>
        </div>

        <div class="space-y-3">
          <div class="space-y-1.5">
            <Label for="email-change-new" class="text-xs font-medium text-gray-500">
              {{ t('participants.emailChange.newEmail') }}
            </Label>
            <Input
              id="email-change-new"
              v-model="newEmail"
              type="email"
              autocomplete="off"
              class="w-full font-mono"
            />
          </div>
          <div class="space-y-1.5">
            <Label for="email-change-confirm" class="text-xs font-medium text-gray-500">
              {{ t('participants.emailChange.confirmEmail') }}
            </Label>
            <Input
              id="email-change-confirm"
              v-model="confirmEmail"
              type="email"
              autocomplete="off"
              class="w-full font-mono"
              @keydown.enter.prevent="submit"
            />
          </div>
          <p v-if="hint" class="text-xs text-red-600">{{ hint }}</p>
          <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        </div>

        <DialogFooter class="sm:justify-end">
          <Button variant="outline" :disabled="saving" @click="close">
            {{ t('common.actions.cancel') }}
          </Button>
          <Button :disabled="!canSubmit" @click="submit">
            {{ saving ? t('participants.emailChange.submitting') : t('participants.emailChange.submit') }}
          </Button>
        </DialogFooter>
      </template>

      <!-- After: the detailed result -->
      <template v-else>
        <div class="space-y-3">
          <p class="text-sm font-semibold text-green-700">
            {{ t('participants.emailChange.successTitle') }}
          </p>
          <p v-if="!result.changed" class="text-sm text-gray-600">
            {{ t('participants.emailChange.successNoop') }}
          </p>
          <p v-else class="text-sm text-gray-700">
            {{ t('participants.emailChange.newEmailLabel') }}:
            <span class="font-mono">{{ result.participant.email }}</span>
          </p>
          <ul class="list-disc space-y-1 pl-5 text-xs text-gray-600">
            <li v-for="(line, index) in effectLines" :key="index">{{ line }}</li>
          </ul>
        </div>
        <DialogFooter class="sm:justify-end">
          <Button @click="close">{{ t('common.actions.close') }}</Button>
        </DialogFooter>
      </template>
    </DialogContent>
  </Dialog>
</template>
