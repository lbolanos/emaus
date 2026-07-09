<template>
  <div class="min-h-screen bg-gray-50 flex flex-col">
    <header class="bg-gray-900 text-white py-4 px-6 shadow">
      <div class="max-w-3xl mx-auto">
        <h1 class="text-xl font-semibold flex items-center gap-2">
          <span>📖</span>
          {{ t('preparations.publicHeading') }}
        </h1>
        <p class="text-sm text-gray-300">
          {{ data?.retreat.parish ? `${data.retreat.parish} · ` : '' }}{{ t('preparations.publicSubheading') }}
        </p>
      </div>
    </header>

    <main class="flex-1 max-w-3xl mx-auto w-full p-4 md:p-6 space-y-6">
      <div v-if="loading" class="text-gray-500 text-center py-12">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="loadError" class="border border-red-200 bg-red-50 text-red-700 rounded p-4">
        {{ loadError }}
      </div>

      <template v-else-if="data">
        <div v-if="!data.preparations.length" class="text-center text-gray-600 py-12">
          {{ t('preparations.noPublicEntries') }}
        </div>

        <template v-else>
          <!-- Próxima preparación: acceso directo al documento -->
          <section
            v-if="nextSession"
            class="border-2 border-blue-500 rounded-lg bg-white p-5 shadow-sm space-y-3"
          >
            <div class="text-xs font-bold uppercase tracking-wide text-blue-600">
              {{ t('preparations.nextPreparation') }}
            </div>
            <div>
              <h2 class="text-lg font-semibold">
                <span v-if="nextSession.weekNumber" class="text-blue-700">
                  {{ t('preparations.week') }} {{ nextSession.weekNumber }} —
                </span>
                {{ nextSession.title }}
              </h2>
              <p class="text-sm text-gray-600 first-letter:uppercase">
                {{ formatLongDate(nextSession.date!) }}
                <span v-if="nextSession.time"> · {{ formatTime(nextSession.time) }}</span>
              </p>
            </div>
            <div v-if="nextSession.documents?.length" class="flex flex-wrap gap-2">
              <template v-for="doc in nextSession.documents" :key="doc.id">
                <a
                  v-if="doc.kind === 'file'"
                  :href="doc.url"
                  target="_blank"
                  rel="noopener"
                  :download="doc.fileName"
                  class="inline-flex items-center gap-2 rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700"
                >
                  <FileDown class="h-4 w-4" />
                  {{ t('preparations.downloadDocument') }} — {{ doc.fileName }}
                </a>
                <button
                  v-else
                  class="inline-flex items-center gap-2 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700"
                  @click="openReader(doc)"
                >
                  <FileText class="h-4 w-4" />
                  {{ t('preparations.viewText') }} — {{ doc.fileName.replace(/\.md$/i, '') }}
                </button>
              </template>
            </div>
            <p v-else class="text-sm text-gray-500 italic">
              {{ t('preparations.noDocumentsYet') }}
            </p>
          </section>

          <!-- Calendario completo -->
          <section class="space-y-2">
            <div
              v-for="prep in data.preparations"
              :key="prep.id"
              class="border rounded-lg bg-white p-4"
              :class="[
                prep.type === 'break' ? 'border-amber-300 bg-amber-50' : '',
                isPast(prep) ? 'opacity-60' : '',
                nextSession && prep.id === nextSession.id ? 'ring-2 ring-blue-400' : '',
              ]"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-3">
                  <span
                    v-if="prep.type === 'session'"
                    class="inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-2.5 py-0.5 text-xs font-semibold"
                  >
                    {{ t('preparations.week') }} {{ prep.weekNumber ?? '–' }}
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center rounded-full bg-amber-200 text-amber-900 px-2.5 py-0.5 text-xs font-semibold"
                  >
                    {{ t('preparations.break') }}
                  </span>
                  <div>
                    <div class="font-medium">{{ prep.title }}</div>
                    <div class="text-sm text-gray-500 first-letter:uppercase">
                      <template v-if="prep.date">{{ formatLongDate(prep.date) }}</template>
                      <span v-if="prep.time"> · {{ formatTime(prep.time) }}</span>
                      <span v-if="prep.type === 'break'"> — {{ t('preparations.breakNotice') }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div
                v-if="prep.type === 'session' && prep.documents?.length"
                class="mt-2 flex flex-wrap gap-2"
              >
                <template v-for="doc in prep.documents" :key="doc.id">
                  <a
                    v-if="doc.kind === 'file'"
                    :href="doc.url"
                    target="_blank"
                    rel="noopener"
                    :download="doc.fileName"
                    class="inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-sm bg-gray-50 hover:bg-blue-50 text-blue-700"
                  >
                    <FileDown class="h-4 w-4" />
                    {{ doc.fileName }}
                  </a>
                  <button
                    v-else
                    class="inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-sm bg-gray-50 hover:bg-emerald-50 text-emerald-700"
                    @click="openReader(doc)"
                  >
                    <FileText class="h-4 w-4" />
                    {{ doc.fileName.replace(/\.md$/i, '') }}
                  </button>
                </template>
              </div>
            </div>
          </section>
        </template>
      </template>
    </main>

    <!-- Lector de documentos de texto -->
    <div
      v-if="readerDoc"
      class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      @click.self="readerDoc = null"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col">
        <div class="flex items-center justify-between border-b px-4 py-3">
          <h3 class="font-semibold">{{ readerDoc.fileName.replace(/\.md$/i, '') }}</h3>
          <button class="text-gray-400 hover:text-gray-700" @click="readerDoc = null">
            <X class="h-5 w-5" />
          </button>
        </div>
        <!-- eslint-disable-next-line vue/no-v-html — contenido sanitizado con DOMPurify -->
        <div class="prose prose-sm max-w-none p-4 overflow-y-auto" v-html="readerHtml" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { FileDown, FileText, X } from 'lucide-vue-next';
import { renderMarkdown } from '@/composables/useMarkdown';
import {
  retreatPreparationApi,
  type PublicRetreatPreparationsDTO,
  type RetreatPreparationDTO,
  type RetreatPreparationDocumentDTO,
} from '@/services/api';

const props = defineProps<{ slug: string }>();

const { t } = useI18n();

const loading = ref(true);
const loadError = ref('');
const data = ref<PublicRetreatPreparationsDTO | null>(null);

onMounted(async () => {
  try {
    data.value = await retreatPreparationApi.getPublic(props.slug);
  } catch {
    loadError.value = t('preparations.notFound');
  } finally {
    loading.value = false;
  }
});

// "Hoy" del navegador como YYYY-MM-DD (comparación date-only, sin shift TZ).
function todayYmd(): string {
  const d = new Date();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function isPast(prep: RetreatPreparationDTO): boolean {
  return !!prep.date && prep.date < todayYmd();
}

// Próxima sesión: la primera con fecha >= hoy (incluye la de hoy).
const nextSession = computed(() => {
  const today = todayYmd();
  return (
    data.value?.preparations.find(
      (p) => p.type === 'session' && !!p.date && p.date >= today,
    ) ?? null
  );
});

function formatLongDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  return d.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return m === 0 ? `${hh} ${ampm}` : `${hh}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// -- Lector de textos markdown --
const readerDoc = ref<RetreatPreparationDocumentDTO | null>(null);
const readerHtml = computed(() =>
  readerDoc.value ? renderMarkdown(readerDoc.value.content ?? '') : '',
);

function openReader(doc: RetreatPreparationDocumentDTO) {
  readerDoc.value = doc;
}
</script>
