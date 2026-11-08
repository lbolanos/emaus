<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui'
import type { WaRawMediaDto } from '@repo/types'
import { renderPdfPages } from '@/utils/pdfToImage'
import { WA_DOCUMENT_ICON, dataUrlToObjectUrl, dataUrlToText, waDocumentKind } from '@/utils/waMedia'

/**
 * File viewer of the WhatsApp inbox (specs/whatsapp-inbox v1.5, D26): a
 * document or video opens big inside the app when the browser can show it —
 * PDF page by page (pdf.js), image, plain text, video — and anything else
 * (Word, PowerPoint, Excel, OpenDocument, HEIC…) is offered as a download
 * with its real name, so the system opens it with its application.
 *
 * The server verified the type from the bytes and refused HTML, SVG, macros
 * and executables; nothing here renders a file as a page (no iframe, no
 * navigation to a blob) and blobs only carry safe types.
 */
const MAX_PDF_PAGES = 20

const props = defineProps<{
  open: boolean
  loading: boolean
  /** Server refusal or download failure (shown instead of the file). */
  error: string | null
  media: WaRawMediaDto | null
  /** Name shown while loading or when the server sent none. */
  fallbackName: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const { t } = useI18n()

const previewKind = computed(() => props.media?.previewKind ?? 'download')
const fileName = computed(() => props.media?.fileName || props.fallbackName)
const kind = computed(() => waDocumentKind(props.media?.mime, fileName.value))
const sizeLabel = computed(() => {
  const bytes = props.media?.sizeBytes ?? 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
})

// Object URL for the download link and the video (revoked on change/close).
const objectUrl = ref<string | null>(null)
function releaseObjectUrl(): void {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
  objectUrl.value = null
}

const text = ref('')
const pdfPages = ref<string[]>([])
const pdfTotal = ref(0)
const pdfRendering = ref(false)
const pdfFailed = ref(false)
let renderToken = 0

async function renderPdf(dataUrl: string): Promise<void> {
  const token = ++renderToken
  pdfRendering.value = true
  try {
    await renderPdfPages(dataUrl, {
      maxPages: MAX_PDF_PAGES,
      isCancelled: () => token !== renderToken,
      onPage: (page, _n, total) => {
        if (token !== renderToken) return
        pdfTotal.value = total
        pdfPages.value = [...pdfPages.value, page]
      },
    })
  } catch {
    if (token === renderToken) pdfFailed.value = true
  } finally {
    if (token === renderToken) pdfRendering.value = false
  }
}

watch(
  () => props.media,
  (media) => {
    renderToken++
    releaseObjectUrl()
    text.value = ''
    pdfPages.value = []
    pdfTotal.value = 0
    pdfFailed.value = false
    pdfRendering.value = false
    if (!media) return
    objectUrl.value = dataUrlToObjectUrl(media.dataUrl, media.mime)
    if (media.previewKind === 'text') text.value = dataUrlToText(media.dataUrl)
    else if (media.previewKind === 'pdf') void renderPdf(media.dataUrl)
  },
  { immediate: true },
)

watch(
  () => props.open,
  (open) => {
    // Closing stops a PDF still rendering; the parent drops the media.
    if (!open) renderToken++
  },
)

onBeforeUnmount(() => {
  renderToken++
  releaseObjectUrl()
})
</script>

<template>
  <Dialog :open="open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="sm:max-w-3xl max-h-[92dvh] flex flex-col" data-testid="wa-file-viewer">
      <DialogHeader>
        <DialogTitle class="break-all pr-6">
          {{ WA_DOCUMENT_ICON[kind] }} {{ fileName }}
        </DialogTitle>
        <DialogDescription v-if="media">
          {{ t(`waInbox.viewer.kind.${kind}`) }} · {{ sizeLabel }}
        </DialogDescription>
      </DialogHeader>

      <div class="flex-1 min-h-0 overflow-y-auto">
        <div v-if="loading" class="p-6 text-sm text-muted-foreground animate-pulse" data-testid="wa-file-loading">
          {{ t('waInbox.viewer.loading') }}
        </div>
        <div
          v-else-if="error"
          class="p-4 rounded-md border border-amber-300 bg-amber-50 text-sm text-amber-900"
          data-testid="wa-file-error"
        >
          {{ error }}
        </div>

        <template v-else-if="media">
          <img
            v-if="previewKind === 'image'"
            :src="media.dataUrl"
            class="w-full rounded-md border object-contain"
            :alt="fileName"
            data-testid="wa-file-image"
          />

          <div v-else-if="previewKind === 'pdf'" class="space-y-3" data-testid="wa-file-pdf">
            <img
              v-for="(page, index) in pdfPages"
              :key="index"
              :src="page"
              class="w-full rounded-md border bg-white"
              :alt="t('waInbox.viewer.page', { n: index + 1 })"
            />
            <div v-if="pdfRendering" class="text-sm text-muted-foreground animate-pulse">
              {{ t('waInbox.viewer.renderingPages', { done: pdfPages.length, total: pdfTotal || '…' }) }}
            </div>
            <p v-if="!pdfRendering && pdfTotal > MAX_PDF_PAGES" class="text-xs text-muted-foreground">
              {{ t('waInbox.viewer.pdfTruncated', { shown: MAX_PDF_PAGES, total: pdfTotal }) }}
            </p>
            <p v-if="pdfFailed" class="text-sm text-amber-800" data-testid="wa-file-pdf-failed">
              {{ t('waInbox.viewer.pdfFailed') }}
            </p>
          </div>

          <!-- Third-party text: interpolation only, never v-html (S8). -->
          <pre
            v-else-if="previewKind === 'text'"
            class="whitespace-pre-wrap break-words text-sm rounded-md border bg-muted/30 p-3"
            data-testid="wa-file-text"
          >{{ text }}</pre>

          <video
            v-else-if="previewKind === 'video' && objectUrl"
            :src="objectUrl"
            controls
            playsinline
            class="w-full max-h-[70dvh] rounded-md bg-black"
            data-testid="wa-file-video"
          />

          <!-- Word, PowerPoint, Excel…: the browser cannot show them. -->
          <div
            v-else
            class="flex flex-col items-center gap-3 p-6 text-center"
            data-testid="wa-file-download-only"
          >
            <span class="text-5xl" aria-hidden="true">{{ WA_DOCUMENT_ICON[kind] }}</span>
            <p class="text-sm text-muted-foreground max-w-sm">{{ t('waInbox.viewer.downloadHint') }}</p>
          </div>
        </template>
      </div>

      <DialogFooter class="flex-wrap gap-2">
        <Button variant="outline" size="sm" @click="emit('update:open', false)">
          {{ t('waInbox.close') }}
        </Button>
        <!-- A real link (not a scripted click): the tap itself starts the
             download, which iOS Safari requires. -->
        <a
          v-if="media && objectUrl && !error"
          :href="objectUrl"
          :download="fileName"
          rel="noopener"
          class="inline-flex items-center justify-center rounded-md bg-primary px-3 h-9 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          data-testid="wa-file-download"
        >
          {{ previewKind === 'download' ? t('waInbox.viewer.downloadOpen') : t('waInbox.viewer.download') }}
        </a>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
