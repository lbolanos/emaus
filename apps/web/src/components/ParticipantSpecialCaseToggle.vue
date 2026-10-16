<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Flag } from 'lucide-vue-next';
import { SPECIAL_CASE_CATEGORIES, type SpecialCaseCategory } from '@repo/types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui';
import { useParticipantStore } from '@/stores/participantStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useAuthPermissions } from '@/composables/useAuthPermissions';

/**
 * Mark / unmark a walker as a "caso especial" (specs/special-case): the
 * palanquero flags something the coordinator must review before the retreat,
 * and the coordinator removes the flag once attended (the update audit keeps
 * the trace).
 *
 * Marking opens a small dialog: category is required, note optional (D4).
 * Unmarking is a confirm-gated click; the API clears category and note.
 *
 * Health regime (D2): the fields only reach callers with participant:health,
 * so the control requires it on top of participant:update.
 */
interface SpecialCaseParticipantLike {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  specialCase?: boolean | null;
}

const props = withDefaults(
  defineProps<{
    participant: SpecialCaseParticipantLike;
    /** 'icon': inline flag for list rows. 'button': labeled button (inbox). */
    variant?: 'icon' | 'button';
  }>(),
  { variant: 'icon' },
);

const emit = defineEmits<{ (e: 'saved', participantId: string): void }>();

const { t } = useI18n();
const participantStore = useParticipantStore();
const retreatStore = useRetreatStore();
const { hasPermission } = useAuthPermissions();

const canEdit = computed(
  () => hasPermission('participant:update') && hasPermission('participant:health'),
);
const marked = computed(() => props.participant.specialCase === true);
// Trim each part: legacy rows carry trailing spaces ("Javier "), which showed
// up as a double space in the native confirm().
const participantName = computed(() =>
  [props.participant.firstName, props.participant.lastName]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' '),
);
const actionLabel = computed(() => (marked.value ? t('specialCases.remove') : t('specialCases.mark')));

const saving = ref(false);
const dialogOpen = ref(false);
const category = ref<SpecialCaseCategory | null>(null);
const notes = ref('');

function onClick() {
  if (saving.value) return;
  if (marked.value) {
    void unmark();
    return;
  }
  category.value = null;
  notes.value = '';
  dialogOpen.value = true;
}

async function save(payload: Record<string, unknown>) {
  try {
    saving.value = true;
    await participantStore.updateParticipant(props.participant.id, {
      ...payload,
      contextRetreatId: retreatStore.selectedRetreatId || undefined,
    } as any);
    await participantStore.fetchParticipants();
    emit('saved', props.participant.id);
  } catch (error) {
    console.error('Error saving special case:', error);
  } finally {
    saving.value = false;
  }
}

async function submitMark() {
  if (!category.value) return;
  const payload: Record<string, unknown> = {
    specialCase: true,
    specialCaseCategory: category.value,
  };
  const trimmed = notes.value.trim();
  if (trimmed) payload.specialCaseNotes = trimmed;
  // Close before the await (reka-ui: never leave the dialog open across the
  // reload, or the body keeps pointer-events: none).
  dialogOpen.value = false;
  await save(payload);
}

async function unmark() {
  if (!window.confirm(t('specialCases.confirmRemove', { name: participantName.value }))) return;
  await save({ specialCase: false });
}
</script>

<template>
  <template v-if="canEdit">
    <Button
      v-if="variant === 'button'"
      variant="outline"
      size="sm"
      :disabled="saving"
      data-testid="special-case-toggle"
      @click.stop="onClick"
    >
      <Flag class="mr-1.5 h-3.5 w-3.5" />
      {{ actionLabel }}
    </Button>
    <button
      v-else
      type="button"
      class="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-amber-50"
      :class="marked ? 'text-amber-600' : 'text-gray-400 hover:text-amber-600'"
      :disabled="saving"
      :title="actionLabel"
      :aria-label="actionLabel"
      data-testid="special-case-toggle"
      @click.stop="onClick"
    >
      <Flag class="h-3.5 w-3.5" :class="marked ? 'fill-current' : ''" />
    </button>

    <Dialog v-model:open="dialogOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t('specialCases.markTitle') }}</DialogTitle>
          <DialogDescription>
            {{ t('specialCases.markDescription', { name: participantName }) }}
          </DialogDescription>
        </DialogHeader>

        <form class="space-y-4" data-testid="special-case-form" @submit.prevent="submitMark">
          <fieldset class="space-y-2">
            <legend class="text-sm font-medium mb-1">{{ t('specialCases.categoryLabel') }}</legend>
            <label
              v-for="option in SPECIAL_CASE_CATEGORIES"
              :key="option"
              class="flex items-center gap-2 text-sm cursor-pointer"
            >
              <input
                v-model="category"
                type="radio"
                name="special-case-category"
                :value="option"
                class="h-4 w-4 text-amber-600 focus:ring-amber-500"
              />
              {{ t(`specialCases.categories.${option}`) }}
            </label>
          </fieldset>

          <label class="block space-y-1">
            <span class="text-sm font-medium">{{ t('specialCases.notes') }}</span>
            <textarea
              v-model="notes"
              rows="3"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              :placeholder="t('specialCases.notesPlaceholder')"
            />
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" @click="dialogOpen = false">
              {{ t('common.actions.cancel') }}
            </Button>
            <Button type="submit" :disabled="!category || saving">
              {{ t('specialCases.mark') }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </template>
</template>
