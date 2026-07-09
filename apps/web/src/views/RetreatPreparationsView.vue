<template>
  <div class="p-4 md:p-6 space-y-4">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold flex items-center gap-2">
          <BookOpen class="h-6 w-6" />
          {{ t('preparations.title') }}
        </h1>
        <p class="text-sm text-muted-foreground">{{ t('preparations.subtitle') }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" :title="t('preparations.help')" @click="helpOpen = true">
          <HelpCircle class="h-5 w-5" />
        </Button>
        <Button variant="outline" :disabled="!canCopyLink" @click="copyPublicLink">
          <Link2 class="h-4 w-4 mr-1" />
          {{ t('preparations.copyPublicLink') }}
        </Button>
        <Button variant="outline" @click="openAddEntry">
          <Plus class="h-4 w-4 mr-1" />
          {{ t('preparations.addEntry') }}
        </Button>
        <Button @click="openGenerate">
          <CalendarPlus class="h-4 w-4 mr-1" />
          {{ t('preparations.generate') }}
        </Button>
      </div>
    </div>

    <div
      v-if="!canCopyLink"
      class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2"
    >
      {{ t('preparations.publicLinkUnavailable') }}
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-12">{{ t('common.loading') }}</div>

    <!-- Empty state -->
    <div
      v-else-if="!preparations.length"
      class="border rounded-lg bg-white p-10 text-center space-y-4"
    >
      <p class="text-gray-600">{{ t('preparations.noEntries') }}</p>
      <Button @click="openGenerate">
        <CalendarPlus class="h-4 w-4 mr-1" />
        {{ t('preparations.generate') }}
      </Button>
    </div>

    <!-- Calendario -->
    <div v-else class="space-y-3">
      <div
        v-for="prep in preparations"
        :key="prep.id"
        class="border rounded-lg bg-white p-4"
        :class="prep.type === 'break' ? 'border-amber-300 bg-amber-50' : ''"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex items-start gap-3 flex-1 min-w-[260px]">
            <span
              v-if="prep.type === 'session'"
              class="shrink-0 mt-1 inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-2.5 py-0.5 text-xs font-semibold"
            >
              {{ t('preparations.week') }} {{ prep.weekNumber ?? '–' }}
            </span>
            <span
              v-else
              class="shrink-0 mt-1 inline-flex items-center rounded-full bg-amber-200 text-amber-900 px-2.5 py-0.5 text-xs font-semibold"
            >
              {{ t('preparations.break') }}
            </span>
            <div class="flex-1 space-y-2">
              <Input
                :model-value="prep.title"
                class="font-medium"
                @change="(e: Event) => saveField(prep, 'title', (e.target as HTMLInputElement).value)"
              />
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <input
                  type="date"
                  class="border rounded px-2 py-1 text-sm"
                  :value="prep.date ?? ''"
                  @change="(e: Event) => saveField(prep, 'date', (e.target as HTMLInputElement).value || null)"
                />
                <input
                  v-if="prep.type === 'session'"
                  type="time"
                  class="border rounded px-2 py-1 text-sm"
                  :value="prep.time ?? ''"
                  @change="(e: Event) => saveField(prep, 'time', (e.target as HTMLInputElement).value || null)"
                />
                <span v-if="prep.date" class="text-gray-500">{{ formatLongDate(prep.date) }}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <Button
              v-if="prep.type === 'session'"
              variant="outline"
              size="sm"
              @click="openSkip(prep)"
            >
              <CalendarOff class="h-4 w-4 mr-1" />
              {{ t('preparations.skip') }}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="text-red-600 hover:text-red-700"
              @click="openDelete(prep)"
            >
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>
        </div>

        <!-- Documentos (solo sesiones) -->
        <div v-if="prep.type === 'session'" class="mt-3 border-t pt-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold uppercase text-gray-500">
              {{ t('preparations.documents') }}
            </span>
            <Button variant="outline" size="sm" @click="triggerUpload(prep)">
              <Upload class="h-4 w-4 mr-1" />
              {{ t('preparations.uploadFile') }}
            </Button>
            <Button variant="outline" size="sm" @click="openMarkdownEditor(prep, null)">
              <FileText class="h-4 w-4 mr-1" />
              {{ t('preparations.newText') }}
            </Button>
            <span v-if="uploadingFor === prep.id" class="text-xs text-gray-500">
              {{ t('common.loading') }}
            </span>
          </div>
          <ul v-if="prep.documents?.length" class="mt-2 flex flex-wrap gap-2">
            <li
              v-for="doc in prep.documents"
              :key="doc.id"
              class="flex items-center gap-1 border rounded-full pl-3 pr-1 py-1 text-sm bg-gray-50"
            >
              <template v-if="doc.kind === 'markdown'">
                <FileText class="h-4 w-4 text-emerald-600" />
                <button class="hover:underline" @click="openMarkdownEditor(prep, doc)">
                  {{ doc.fileName.replace(/\.md$/i, '') }}
                </button>
              </template>
              <template v-else>
                <FileDown class="h-4 w-4 text-blue-600" />
                <a :href="doc.url" target="_blank" rel="noopener" class="hover:underline">
                  {{ doc.fileName }}
                </a>
              </template>
              <Button
                variant="ghost"
                size="icon"
                class="h-6 w-6 text-gray-400 hover:text-red-600"
                @click="openDeleteDoc(doc)"
              >
                <X class="h-3.5 w-3.5" />
              </Button>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- input file oculto compartido -->
    <input
      ref="fileInputRef"
      type="file"
      class="hidden"
      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
      @change="onFileChosen"
    />

    <!-- Dialog: generar calendario -->
    <Dialog v-model:open="generateOpen">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{{ t('preparations.generateTitle') }}</DialogTitle>
          <DialogDescription>{{ t('preparations.generateHint') }}</DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <Label>{{ t('preparations.weeks') }}</Label>
              <Input v-model.number="genForm.weeks" type="number" min="1" max="12" />
            </div>
            <div>
              <Label>{{ t('preparations.time') }}</Label>
              <input
                v-model="genForm.time"
                type="time"
                class="border rounded px-2 py-1.5 w-full text-sm"
              />
            </div>
          </div>
          <div>
            <Label>{{ t('preparations.firstDate') }}</Label>
            <input
              v-model="genForm.firstDate"
              type="date"
              class="border rounded px-2 py-1.5 w-full text-sm"
            />
          </div>
          <div v-if="genPreview.length" class="text-xs text-gray-600">
            <span class="font-semibold">{{ t('preparations.previewDates') }}:</span>
            <ul class="mt-1 grid grid-cols-2 gap-x-4">
              <li v-for="(d, i) in genPreview" :key="d">
                {{ i + 1 }}ª — {{ formatLongDate(d) }}
              </li>
            </ul>
          </div>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="genForm.includeDefaultDocs" type="checkbox" />
            {{ t('preparations.includeDefaultDocs') }}
          </label>
          <label v-if="preparations.length" class="flex items-center gap-2 text-sm text-red-700">
            <input v-model="genForm.clearExisting" type="checkbox" />
            {{ t('preparations.clearExisting') }}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="generateOpen = false">
            {{ t('preparations.cancel') }}
          </Button>
          <Button
            :disabled="!genForm.firstDate || !genForm.time || genBusy || (preparations.length > 0 && !genForm.clearExisting)"
            @click="confirmGenerate"
          >
            {{ t('preparations.generateConfirm') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Dialog: agregar entrada -->
    <Dialog v-model:open="addOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t('preparations.addEntry') }}</DialogTitle>
        </DialogHeader>
        <div class="space-y-3">
          <div class="flex gap-4 text-sm">
            <label class="flex items-center gap-1.5">
              <input v-model="addForm.type" type="radio" value="session" />
              {{ t('preparations.week') }}
            </label>
            <label class="flex items-center gap-1.5">
              <input v-model="addForm.type" type="radio" value="break" />
              {{ t('preparations.break') }}
            </label>
          </div>
          <div>
            <Label>{{ t('preparations.titleField') }}</Label>
            <Input v-model="addForm.title" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <Label>{{ t('preparations.dateField') }}</Label>
              <input
                v-model="addForm.date"
                type="date"
                class="border rounded px-2 py-1.5 w-full text-sm"
              />
            </div>
            <div v-if="addForm.type === 'session'">
              <Label>{{ t('preparations.time') }}</Label>
              <input
                v-model="addForm.time"
                type="time"
                class="border rounded px-2 py-1.5 w-full text-sm"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="addOpen = false">{{ t('preparations.cancel') }}</Button>
          <Button :disabled="!addForm.title.trim()" @click="confirmAddEntry">
            {{ t('preparations.save') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Dialog: saltar por festivo -->
    <Dialog v-model:open="skipOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t('preparations.skipTitle') }}</DialogTitle>
          <DialogDescription>{{ t('preparations.skipBody') }}</DialogDescription>
        </DialogHeader>
        <div>
          <Label>{{ t('preparations.skipReason') }}</Label>
          <Input
            v-model="skipReason"
            :placeholder="t('preparations.skipReasonPlaceholder')"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" @click="skipOpen = false">
            {{ t('preparations.cancel') }}
          </Button>
          <Button @click="confirmSkip">{{ t('preparations.confirmSkip') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Dialog: eliminar entrada / documento -->
    <Dialog v-model:open="deleteOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t('preparations.deleteTitle') }}</DialogTitle>
          <DialogDescription>{{ t('preparations.deleteBody') }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteOpen = false">
            {{ t('preparations.cancel') }}
          </Button>
          <Button variant="destructive" @click="confirmDelete">
            {{ t('preparations.delete') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Dialog: ayuda -->
    <PreparationsHelpDialog :open="helpOpen" @update:open="helpOpen = $event" />

    <!-- Dialog: editor de texto markdown -->
    <Dialog v-model:open="mdOpen">
      <DialogContent class="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {{ mdEditingDoc ? t('preparations.editText') : t('preparations.newText') }}
          </DialogTitle>
        </DialogHeader>
        <div class="space-y-3">
          <div>
            <Label>{{ t('preparations.textTitle') }}</Label>
            <Input v-model="mdForm.title" />
          </div>
          <div>
            <Label>{{ t('preparations.textContent') }}</Label>
            <Textarea v-model="mdForm.content" rows="14" class="font-mono text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="mdOpen = false">{{ t('preparations.cancel') }}</Button>
          <Button :disabled="!mdForm.title.trim() || mdBusy" @click="confirmMarkdown">
            {{ t('preparations.save') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import {
  Button,
  Input,
  Label,
  Textarea,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useToast,
} from '@repo/ui';
import {
  BookOpen,
  CalendarPlus,
  CalendarOff,
  FileDown,
  FileText,
  HelpCircle,
  Link2,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-vue-next';
import PreparationsHelpDialog from '@/components/PreparationsHelpDialog.vue';
import { useRetreatStore } from '@/stores/retreatStore';
import {
  retreatPreparationApi,
  apiErrorMessage,
  type RetreatPreparationDTO,
  type RetreatPreparationDocumentDTO,
} from '@/services/api';

const { t } = useI18n();
const route = useRoute();
const { toast } = useToast();
const retreatStore = useRetreatStore();

const retreatId = computed(() => (route.params.id as string) || retreatStore.selectedRetreatId);
const retreat = computed(
  () => retreatStore.retreats.find((r) => r.id === retreatId.value) ?? null,
);
const canCopyLink = computed(() => !!retreat.value?.slug && !!retreat.value?.isPublic);

const loading = ref(true);
const helpOpen = ref(false);
const preparations = ref<RetreatPreparationDTO[]>([]);

async function reload() {
  if (!retreatId.value) return;
  try {
    preparations.value = await retreatPreparationApi.list(retreatId.value);
  } catch (err) {
    toast({ title: apiErrorMessage(err), variant: 'destructive' });
  } finally {
    loading.value = false;
  }
}

onMounted(reload);

// Formatea date-only sin shift TZ: parsear como hora local (sin sufijo Z).
function formatLongDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  return d.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function copyPublicLink() {
  if (!retreat.value?.slug) return;
  const url = `${window.location.origin}/preparaciones/${retreat.value.slug}`;
  navigator.clipboard.writeText(url);
  toast({ title: t('preparations.linkCopied'), description: url });
}

// -- Edición inline --
async function saveField(
  prep: RetreatPreparationDTO,
  field: 'title' | 'date' | 'time',
  value: string | null,
) {
  try {
    const updated = await retreatPreparationApi.update(prep.id, { [field]: value });
    const idx = preparations.value.findIndex((p) => p.id === prep.id);
    if (idx >= 0) preparations.value[idx] = { ...updated, documents: prep.documents };
    if (field === 'date') await reload(); // el orden puede cambiar
  } catch (err) {
    toast({ title: apiErrorMessage(err), variant: 'destructive' });
  }
}

// -- Generar calendario --
const generateOpen = ref(false);
const genBusy = ref(false);
const genForm = reactive({
  weeks: 7,
  firstDate: '',
  time: '20:00',
  clearExisting: false,
  includeDefaultDocs: true,
});

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const genPreview = computed(() => {
  if (!genForm.firstDate || !genForm.weeks) return [];
  const weeks = Math.min(Math.max(genForm.weeks, 1), 12);
  return Array.from({ length: weeks }, (_, i) => addDaysYmd(genForm.firstDate, i * 7));
});

function openGenerate() {
  genForm.clearExisting = false;
  if (!genForm.firstDate) {
    // Default: 7 sesiones que terminan una semana antes del retiro.
    const start = retreat.value?.startDate
      ? String(retreat.value.startDate).slice(0, 10)
      : null;
    genForm.firstDate = start ? addDaysYmd(start, -7 * genForm.weeks) : '';
  }
  generateOpen.value = true;
}

async function confirmGenerate() {
  if (!retreatId.value) return;
  generateOpen.value = false; // cerrar ANTES del await (regla reka-ui)
  genBusy.value = true;
  try {
    preparations.value = await retreatPreparationApi.generate(retreatId.value, {
      weeks: Math.min(Math.max(genForm.weeks, 1), 12),
      firstDate: genForm.firstDate,
      time: genForm.time,
      clearExisting: genForm.clearExisting,
      includeDefaultDocs: genForm.includeDefaultDocs,
    });
  } catch (err) {
    toast({ title: apiErrorMessage(err), variant: 'destructive' });
  } finally {
    genBusy.value = false;
  }
}

// -- Agregar entrada --
const addOpen = ref(false);
const addForm = reactive({
  type: 'session' as 'session' | 'break',
  title: '',
  date: '',
  time: '20:00',
});

function openAddEntry() {
  addForm.title = '';
  addForm.date = '';
  addOpen.value = true;
}

async function confirmAddEntry() {
  if (!retreatId.value) return;
  addOpen.value = false;
  try {
    await retreatPreparationApi.create(retreatId.value, {
      type: addForm.type,
      title: addForm.title.trim(),
      date: addForm.date || null,
      time: addForm.type === 'session' ? addForm.time || null : null,
      weekNumber: null,
    });
    await reload();
  } catch (err) {
    toast({ title: apiErrorMessage(err), variant: 'destructive' });
  }
}

// -- Saltar por festivo --
const skipOpen = ref(false);
const skipReason = ref('');
const skipTarget = ref<RetreatPreparationDTO | null>(null);

function openSkip(prep: RetreatPreparationDTO) {
  skipTarget.value = prep;
  skipReason.value = '';
  skipOpen.value = true;
}

async function confirmSkip() {
  const target = skipTarget.value;
  skipOpen.value = false;
  if (!target) return;
  try {
    preparations.value = await retreatPreparationApi.skip(
      target.id,
      skipReason.value.trim() || undefined,
    );
  } catch (err) {
    toast({ title: apiErrorMessage(err), variant: 'destructive' });
  }
}

// -- Eliminar entrada o documento --
const deleteOpen = ref(false);
const deleteEntryTarget = ref<RetreatPreparationDTO | null>(null);
const deleteDocTarget = ref<RetreatPreparationDocumentDTO | null>(null);

function openDelete(prep: RetreatPreparationDTO) {
  deleteEntryTarget.value = prep;
  deleteDocTarget.value = null;
  deleteOpen.value = true;
}

function openDeleteDoc(doc: RetreatPreparationDocumentDTO) {
  deleteDocTarget.value = doc;
  deleteEntryTarget.value = null;
  deleteOpen.value = true;
}

async function confirmDelete() {
  const entry = deleteEntryTarget.value;
  const doc = deleteDocTarget.value;
  deleteOpen.value = false;
  try {
    if (entry) await retreatPreparationApi.remove(entry.id);
    else if (doc) await retreatPreparationApi.removeDocument(doc.id);
    await reload();
  } catch (err) {
    toast({ title: apiErrorMessage(err), variant: 'destructive' });
  }
}

// -- Subir archivo --
const fileInputRef = ref<HTMLInputElement | null>(null);
const uploadTarget = ref<RetreatPreparationDTO | null>(null);
const uploadingFor = ref<string | null>(null);

function triggerUpload(prep: RetreatPreparationDTO) {
  uploadTarget.value = prep;
  fileInputRef.value?.click();
}

async function onFileChosen(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  const target = uploadTarget.value;
  input.value = '';
  if (!file || !target) return;
  uploadingFor.value = target.id;
  try {
    await retreatPreparationApi.uploadDocument(target.id, file);
    await reload();
  } catch (err) {
    toast({ title: apiErrorMessage(err), variant: 'destructive' });
  } finally {
    uploadingFor.value = null;
  }
}

// -- Editor markdown --
const mdOpen = ref(false);
const mdBusy = ref(false);
const mdForm = reactive({ title: '', content: '' });
const mdEditingDoc = ref<RetreatPreparationDocumentDTO | null>(null);
const mdPrepTarget = ref<RetreatPreparationDTO | null>(null);

function openMarkdownEditor(
  prep: RetreatPreparationDTO,
  doc: RetreatPreparationDocumentDTO | null,
) {
  mdPrepTarget.value = prep;
  mdEditingDoc.value = doc;
  mdForm.title = doc ? doc.fileName.replace(/\.md$/i, '') : '';
  mdForm.content = doc?.content ?? '';
  mdOpen.value = true;
}

async function confirmMarkdown() {
  const doc = mdEditingDoc.value;
  const prep = mdPrepTarget.value;
  mdOpen.value = false;
  mdBusy.value = true;
  try {
    if (doc) {
      await retreatPreparationApi.updateMarkdown(doc.id, {
        title: mdForm.title.trim(),
        content: mdForm.content,
      });
    } else if (prep) {
      await retreatPreparationApi.createMarkdown(prep.id, {
        title: mdForm.title.trim(),
        content: mdForm.content,
      });
    }
    await reload();
  } catch (err) {
    toast({ title: apiErrorMessage(err), variant: 'destructive' });
  } finally {
    mdBusy.value = false;
  }
}
</script>
