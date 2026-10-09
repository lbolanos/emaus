<template>
  <Dialog :open="open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="sm:max-w-xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ $t('community.duplicates.pairTitle') }}</DialogTitle>
        <DialogDescription>{{ $t('community.duplicates.pairDescription') }}</DialogDescription>
      </DialogHeader>

      <div v-if="pair" class="space-y-3">
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{{ $t(`community.duplicates.matchedBy.${pair.matchedBy}`) }}</Badge>
          <Badge v-if="pair.participants.length > 2" variant="secondary">
            {{ $t('community.duplicates.groupOf', { count: pair.participants.length }) }}
          </Badge>
        </div>

        <p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
          {{ $t('community.duplicates.warning') }}
        </p>

        <!-- Se elige explícitamente cuál sobrevive: la que tiene más datos
             suele ser la correcta, pero no siempre, y adivinar aquí tira
             información de alguien. -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            v-for="p in pair.participants"
            :key="p.id"
            type="button"
            class="text-left border rounded-md p-2 transition-colors"
            :class="keepId === p.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'"
            @click="keepId = p.id"
          >
            <p class="font-medium text-sm">{{ p.firstName }} {{ p.lastName }}</p>
            <p class="text-xs text-muted-foreground">{{ p.email || '—' }} · {{ p.cellPhone || '—' }}</p>
            <p class="text-xs text-muted-foreground mt-1">
              {{ $t('community.duplicates.references', { count: p.references }) }}
              <span v-if="p.hasUser"> · {{ $t('community.duplicates.hasUser') }}</span>
              <span v-if="p.isCommunityMember"> · {{ $t('community.duplicates.inRoster') }}</span>
            </p>
            <p v-if="keepId === p.id" class="text-xs font-medium text-primary mt-1">
              {{ $t('community.duplicates.keepsThis') }}
            </p>
          </button>
        </div>

        <div v-if="preview" class="text-xs space-y-1">
          <p v-if="preview.blockers.length" class="text-destructive">
            {{ $t('community.duplicates.blocked') }}
            <span v-for="b in preview.blockers" :key="b.table + b.column">
              {{ b.reason }}.
            </span>
          </p>
          <p v-else class="text-muted-foreground">
            {{ $t('community.duplicates.willMove', { count: totalMoves }) }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" :disabled="busy" @click="loadPreview">
            {{ $t('community.duplicates.preview') }}
          </Button>
          <Button size="sm" :disabled="busy || !canMerge" @click="doMerge">
            <Loader2 v-if="busy" class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('community.duplicates.merge') }}
          </Button>
          <!-- Falso positivo. Sólo pares exactos: descartar un grupo de 3+
               ambiguo escondería pares verdaderos. Confirmación en dos pasos
               (sin AlertDialog): el primer click arma, el segundo ejecuta. -->
          <Button
            v-if="pair.participants.length === 2"
            variant="ghost"
            size="sm"
            class="text-muted-foreground"
            :disabled="busy"
            @click="onDismissClick"
          >
            {{
              confirmDismiss
                ? $t('community.duplicates.notSameConfirm')
                : $t('community.duplicates.notSame')
            }}
          </Button>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">{{ $t('common.close') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, useToast,
} from '@repo/ui';
import { Loader2 } from 'lucide-vue-next';
import type { DuplicateCandidate, MergePreview } from '@repo/types';
import {
  apiErrorMessage,
  dismissCommunityDuplicatePair,
  mergeParticipantDuplicates,
  previewParticipantMerge,
} from '@/services/api';

// Diálogo de fusión de UN par identificado (la vista de attendance stats lo
// abre desde el hint "Posible duplicado"). Misma UX que el par del listado de
// duplicados (DuplicateMembersDialog): preview obligatorio, blockers respetados
// y preview invalidado al cambiar de superviviente.
const props = defineProps<{
  open: boolean;
  communityId: string;
  pair: DuplicateCandidate | null;
}>();
const emit = defineEmits<{
  'update:open': [boolean];
  merged: [];
  // "No son la misma persona" llega en M3; se declara ya para que la API del
  // componente no cambie cuando se implemente.
  dismissed: [];
}>();

const { t } = useI18n();
const { toast } = useToast();

const keepId = ref('');
const preview = ref<MergePreview | null>(null);
const busy = ref(false);
// Paso 1 del descarte: el botón ya se pulsó y el segundo click confirma.
const confirmDismiss = ref(false);

const totalMoves = computed(() => preview.value?.moves.reduce((sum, move) => sum + move.rows, 0) ?? 0);

/** Sin preview no se habilita fusionar: hay que ver qué se mueve antes. */
const canMerge = computed(() =>
  Boolean(preview.value && preview.value.blockers.length === 0 && preview.value.keepId === keepId.value));

/** La ficha que se absorbe: la primera que no sea la elegida. */
const otherId = computed(() =>
  props.pair?.participants.find((p) => p.id !== keepId.value)?.id ?? '');

const reset = () => {
  // El backend ordena el par por referencias descendente: la primera es la
  // candidata natural a conservarse. Es una sugerencia; el usuario puede
  // cambiarla.
  keepId.value = props.pair?.participants[0]?.id ?? '';
  preview.value = null;
  confirmDismiss.value = false;
};

const loadPreview = async () => {
  busy.value = true;
  try {
    preview.value = await previewParticipantMerge(props.communityId, keepId.value, otherId.value);
  } catch (err) {
    toast({ title: apiErrorMessage(err), variant: 'destructive' });
  } finally {
    busy.value = false;
  }
};

const doMerge = async () => {
  busy.value = true;
  try {
    await mergeParticipantDuplicates(props.communityId, keepId.value, otherId.value);
    toast({ title: t('community.duplicates.merged') });
    emit('merged');
    emit('update:open', false);
  } catch (err) {
    toast({ title: apiErrorMessage(err), variant: 'destructive' });
  } finally {
    busy.value = false;
  }
};

const onDismissClick = () => {
  if (!confirmDismiss.value) {
    confirmDismiss.value = true;
    return;
  }
  void doDismiss();
};

const doDismiss = async () => {
  const [a, b] = props.pair?.participants ?? [];
  if (!a || !b) return;
  busy.value = true;
  try {
    await dismissCommunityDuplicatePair(props.communityId, a.id, b.id);
    toast({ title: t('community.duplicates.dismissedToast') });
    emit('dismissed');
    emit('update:open', false);
  } catch (err) {
    toast({ title: apiErrorMessage(err), variant: 'destructive' });
  } finally {
    busy.value = false;
    confirmDismiss.value = false;
  }
};

// Al abrir (o al llegar un par distinto) se resetean elección y preview: el
// estado de un par anterior no puede filtrarse al siguiente.
watch(
  () => [props.open, props.pair] as const,
  ([isOpen]) => {
    if (isOpen) reset();
  },
  { immediate: true },
);

// Al cambiar la elección de superviviente el preview anterior deja de aplicar.
watch(keepId, () => {
  preview.value = null;
});
</script>
