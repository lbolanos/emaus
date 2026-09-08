<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
  useToast,
} from '@repo/ui';
import { FileDown, Printer } from 'lucide-vue-next';
import {
  buildPriestLetterMarkdown,
  formatRetreatDateRangeEs,
  printableSlug,
  PRIEST_LETTER_TITLE,
} from '@repo/utils';
import {
  retreatPreparationApi,
  retreatScheduleApi,
  type RetreatPreparationDTO,
  type RetreatScheduleItemDTO,
} from '@/services/api';
import { useRetreatStore } from '@/stores/retreatStore';
import { renderMarkdown } from '@/composables/useMarkdown';
import { printMarkdownDocument } from '@/composables/usePrintableDocument';
import { downloadMarkdownPdf } from '@/composables/usePreparationPdf';
import {
  buildPriestLetterData,
  retreatLetterLogoUrl,
  type PriestLetterRetreatInput,
} from '@/utils/priestLetterData';

const props = defineProps<{ retreatId: string }>();
const open = defineModel<boolean>('open', { default: false });

const { toast } = useToast();
const retreatStore = useRetreatStore();

const loading = ref(false);
const pdfBusy = ref(false);
/** Retreat the data currently in memory belongs to. */
const loadedFor = ref<string | null>(null);
const preparations = ref<RetreatPreparationDTO[]>([]);
const scheduleItems = ref<RetreatScheduleItemDTO[]>([]);
const scheduleFailed = ref(false);
const preparationsFailed = ref(false);
/** The editable text. Seeded from `resolvedMarkdown`, never bound to it. */
const draft = ref('');

// Resolved by `retreatId`, not by the selected retreat: if the two drift apart
// the letter carries one retreat's name and dates with another's schedule, and
// this is a document handed to a third party.
// `retreatSchema` does not declare `house`, although the API does send it, so
// the adapter's structural type is the contract the letter actually needs.
const retreat = computed<PriestLetterRetreatInput | null>(() => {
  const byId = retreatStore.retreats.find((item) => item.id === props.retreatId);
  const selected = retreatStore.selectedRetreat;
  const resolved = byId ?? (selected?.id === props.retreatId ? selected : null);
  return (resolved ?? null) as unknown as PriestLetterRetreatInput | null;
});

const letterData = computed(() =>
  buildPriestLetterData({
    retreat: retreat.value,
    preparations: preparations.value,
    scheduleItems: scheduleItems.value,
  }),
);

const resolvedMarkdown = computed(() => {
  const data = letterData.value;
  return data ? buildPriestLetterMarkdown(data) : '';
});

const previewHtml = computed(() => renderMarkdown(draft.value));

/** Right side of the running head: which retreat this paper belongs to. */
const printMeta = computed(() => {
  const data = letterData.value;
  if (!data) return undefined;
  return `Retiro ${formatRetreatDateRangeEs(data.startDate, data.endDate)}`;
});

// The logo is the paper's chrome, not editable text: it goes to the A4 sheet
// and to the preview, never to the markdown (or it prints twice).
const logoUrl = computed(() => retreatLetterLogoUrl(retreat.value?.retreat_type));

const fileName = computed(
  () => `solicitud-parroco-${printableSlug(retreat.value?.parish ?? '')}`,
);

async function load() {
  loading.value = true;
  scheduleFailed.value = false;
  preparationsFailed.value = false;
  try {
    if (!retreat.value) await retreatStore.fetchRetreat(props.retreatId);

    // Neither source is essential: without them the letter still asks for
    // everything, just with "(por confirmar)" where the dates would go. So they
    // are settled independently instead of failing the whole dialog.
    const [scheduleResult, preparationsResult] = await Promise.allSettled([
      retreatScheduleApi.list(props.retreatId),
      retreatPreparationApi.list(props.retreatId),
    ]);

    if (scheduleResult.status === 'fulfilled') {
      scheduleItems.value = scheduleResult.value ?? [];
    } else {
      scheduleItems.value = [];
      scheduleFailed.value = true;
    }

    if (preparationsResult.status === 'fulfilled') {
      preparations.value = preparationsResult.value ?? [];
    } else {
      preparations.value = [];
      preparationsFailed.value = true;
    }

    loadedFor.value = props.retreatId;
    draft.value = resolvedMarkdown.value;
  } finally {
    loading.value = false;
  }
}

// `immediate` so it also loads when the dialog mounts already open; the
// `loadedFor` guard keeps it from refetching when reopened.
watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    if (loadedFor.value === props.retreatId) return;
    void load();
  },
  { immediate: true },
);

/** Throws away the edits and rebuilds the letter from the retreat data. */
function reset() {
  draft.value = resolvedMarkdown.value;
}

function print() {
  printMarkdownDocument({
    title: PRIEST_LETTER_TITLE,
    markdown: draft.value,
    subtitle: retreat.value?.parish ?? undefined,
    meta: printMeta.value,
    logoUrl: logoUrl.value,
    onPopupBlocked: () =>
      toast({
        title: 'El navegador bloqueó la ventana de impresión',
        description: 'Permite las ventanas emergentes e inténtalo de nuevo.',
        variant: 'destructive',
      }),
  });
}

async function downloadPdf() {
  pdfBusy.value = true;
  try {
    await downloadMarkdownPdf({
      fileName: fileName.value,
      title: PRIEST_LETTER_TITLE,
      markdown: draft.value,
      subtitle: retreat.value?.parish ?? undefined,
      meta: printMeta.value,
      onError: (message) => toast({ title: message, variant: 'destructive' }),
    });
  } finally {
    pdfBusy.value = false;
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Carta de solicitud al párroco</DialogTitle>
      </DialogHeader>

      <p class="text-xs text-gray-500">
        Se arma con los datos del retiro y los horarios del Minuto a Minuto. Puedes ajustar el
        texto antes de imprimir — los cambios no se guardan.
      </p>

      <p
        v-if="scheduleFailed || preparationsFailed"
        class="text-xs rounded border border-amber-300 bg-amber-50 text-amber-800 px-3 py-2"
        data-testid="priest-letter-warning"
      >
        <template v-if="scheduleFailed">
          No pudimos leer el Minuto a Minuto de este retiro; los horarios salen como (por
          confirmar).
        </template>
        <template v-else>
          No pudimos leer el calendario de preparaciones; el día y la hora de las reuniones salen
          como (por confirmar).
        </template>
      </p>

      <div v-if="loading" class="py-10 text-center text-sm text-gray-500">
        Armando la carta…
      </div>

      <div v-else-if="!letterData" class="py-10 text-center text-sm text-gray-500">
        Este retiro no tiene fechas capturadas, así que no se puede armar la carta.
      </div>

      <div v-else class="grid gap-3 md:grid-cols-2">
        <div class="space-y-1">
          <Label for="priest-letter-draft">Texto</Label>
          <Textarea
            id="priest-letter-draft"
            v-model="draft"
            rows="20"
            class="font-mono text-xs h-[30rem]"
            data-testid="priest-letter-draft"
          />
        </div>
        <div class="space-y-1">
          <Label>Vista previa</Label>
          <div
            class="letter-preview border rounded p-3 bg-white overflow-y-auto h-[30rem]"
            data-testid="priest-letter-preview"
          >
            <img :src="logoUrl" alt="" class="letter-logo" />
            <div class="prose prose-sm max-w-none" v-html="previewHtml" />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="loading" @click="reset">Restablecer</Button>
        <Button
          variant="outline"
          :disabled="loading || !letterData"
          data-testid="priest-letter-print"
          @click="print"
        >
          <Printer class="w-4 h-4 mr-1" /> Imprimir
        </Button>
        <Button
          :disabled="loading || pdfBusy || !letterData"
          data-testid="priest-letter-pdf"
          @click="downloadPdf"
        >
          <FileDown class="w-4 h-4 mr-1" /> Descargar PDF
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
/* The logo prints at ~24mm (see `header.doc-head img` on the A4 sheet). Without
   a cap here it renders at natural size and pushes the letter out of the
   preview, which would stop showing what actually gets printed. */
.letter-logo {
  max-height: 90px;
  width: auto;
  margin: 0 auto 0.75rem;
  display: block;
}
</style>
