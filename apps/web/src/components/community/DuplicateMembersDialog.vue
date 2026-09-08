<template>
  <Dialog :open="open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ $t('community.duplicates.title') }}</DialogTitle>
        <DialogDescription>{{ $t('community.duplicates.description') }}</DialogDescription>
      </DialogHeader>

      <div v-if="loading" class="py-10 flex justify-center">
        <Loader2 class="h-6 w-6 animate-spin text-primary" />
      </div>

      <p v-else-if="error" class="text-sm text-destructive py-4">{{ error }}</p>

      <p v-else-if="candidates.length === 0" class="py-10 text-center text-muted-foreground">
        {{ $t('community.duplicates.none') }}
      </p>

      <div v-else class="space-y-3">
        <p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
          {{ $t('community.duplicates.warning') }}
        </p>

        <div v-for="(pair, index) in candidates" :key="index" class="border rounded-lg p-3 space-y-3">
          <div class="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{{ $t(`community.duplicates.matchedBy.${pair.matchedBy}`) }}</Badge>
            <!-- El backend agrupa por coincidencia, así que un grupo puede traer 3 o
                 más fichas. La fusión es de dos en dos: sin este aviso, al fusionar
                 un grupo de tres quedaba una duplicada sin que nada lo dijera. -->
            <Badge v-if="pair.participants.length > 2" variant="secondary">
              {{ $t('community.duplicates.groupOf', { count: pair.participants.length }) }}
            </Badge>
          </div>

          <!-- Se elige explícitamente cuál sobrevive: la que tiene más datos
               suele ser la correcta, pero no siempre, y adivinar aquí tira
               información de alguien. -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              v-for="p in pair.participants"
              :key="p.id"
              type="button"
              class="text-left border rounded-md p-2 transition-colors"
              :class="keepBy[index] === p.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'"
              @click="keepBy[index] = p.id"
            >
              <p class="font-medium text-sm">{{ p.firstName }} {{ p.lastName }}</p>
              <p class="text-xs text-muted-foreground">{{ p.email || '—' }} · {{ p.cellPhone || '—' }}</p>
              <p class="text-xs text-muted-foreground mt-1">
                {{ $t('community.duplicates.references', { count: p.references }) }}
                <span v-if="p.hasUser"> · {{ $t('community.duplicates.hasUser') }}</span>
                <span v-if="p.isCommunityMember"> · {{ $t('community.duplicates.inRoster') }}</span>
              </p>
              <p v-if="keepBy[index] === p.id" class="text-xs font-medium text-primary mt-1">
                {{ $t('community.duplicates.keepsThis') }}
              </p>
            </button>
          </div>

          <div v-if="previews[index]" class="text-xs space-y-1">
            <p v-if="previews[index]!.blockers.length" class="text-destructive">
              {{ $t('community.duplicates.blocked') }}
              <span v-for="b in previews[index]!.blockers" :key="b.table + b.column">
                {{ b.reason }}.
              </span>
            </p>
            <p v-else class="text-muted-foreground">
              {{ $t('community.duplicates.willMove', { count: totalMoves(previews[index]!) }) }}
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" :disabled="busy === index" @click="loadPreview(index)">
              {{ $t('community.duplicates.preview') }}
            </Button>
            <Button
              size="sm"
              :disabled="busy === index || !canMerge(index)"
              @click="doMerge(index)"
            >
              <Loader2 v-if="busy === index" class="mr-2 h-4 w-4 animate-spin" />
              {{ $t('community.duplicates.merge') }}
            </Button>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">{{ $t('common.close') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, useToast,
} from '@repo/ui';
import { Loader2 } from 'lucide-vue-next';
import type { DuplicateCandidate, MergePreview } from '@repo/types';
import {
  apiErrorMessage,
  getCommunityDuplicates,
  mergeParticipantDuplicates,
  previewParticipantMerge,
} from '@/services/api';

const props = defineProps<{ open: boolean; communityId: string }>();
const emit = defineEmits<{ 'update:open': [boolean]; merged: [] }>();

const { t } = useI18n();
const { toast } = useToast();

const loading = ref(false);
const error = ref('');
const candidates = ref<DuplicateCandidate[]>([]);
const previews = ref<(MergePreview | null)[]>([]);
const keepBy = ref<string[]>([]);
const busy = ref<number | null>(null);

const totalMoves = (preview: MergePreview) =>
  preview.moves.reduce((sum, move) => sum + move.rows, 0);

/** Sin preview no se habilita fusionar: hay que ver qué se mueve antes. */
const canMerge = (index: number) => {
  const preview = previews.value[index];
  return Boolean(preview && preview.blockers.length === 0 && preview.keepId === keepBy.value[index]);
};

/** La ficha que se absorbe en esta pasada: la primera que no sea la elegida. */
const otherOf = (index: number) =>
  candidates.value[index].participants.find((p) => p.id !== keepBy.value[index])?.id ?? '';


const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    candidates.value = await getCommunityDuplicates(props.communityId);
    // Por defecto se conserva la ficha con más datos, que el backend devuelve
    // primero. Es una sugerencia: el usuario puede cambiarla.
    keepBy.value = candidates.value.map((c) => c.participants[0]?.id ?? '');
    previews.value = candidates.value.map(() => null);
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    loading.value = false;
  }
};

const loadPreview = async (index: number) => {
  busy.value = index;
  try {
    previews.value[index] = await previewParticipantMerge(
      props.communityId,
      keepBy.value[index],
      otherOf(index),
    );
  } catch (err) {
    toast({ title: apiErrorMessage(err), variant: 'destructive' });
  } finally {
    busy.value = null;
  }
};

const doMerge = async (index: number) => {
  busy.value = index;
  try {
    await mergeParticipantDuplicates(props.communityId, keepBy.value[index], otherOf(index));
    toast({ title: t('community.duplicates.merged') });
    emit('merged');
    await load();
  } catch (err) {
    toast({ title: apiErrorMessage(err), variant: 'destructive' });
  } finally {
    busy.value = null;
  }
};

// Al cambiar la elección de superviviente el preview anterior deja de aplicar.
watch(keepBy, () => {
  previews.value = previews.value.map(() => null);
}, { deep: true });

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) void load();
  },
  { immediate: true },
);
</script>
