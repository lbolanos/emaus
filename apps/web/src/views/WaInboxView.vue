<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { MessageCircle, RefreshCw } from 'lucide-vue-next'
import {
  Button,
  Switch,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  useToast,
} from '@repo/ui'
import type { WaInboxMessageDto } from '@repo/types'
import { useRetreatStore } from '@/stores/retreatStore'
import { useAuthStore } from '@/stores/authStore'
import { useAuthPermissions } from '@/composables/useAuthPermissions'
import { useWaInboxStore } from '@/stores/waInboxStore'
import { useParticipantStore } from '@/stores/participantStore'
import PaymentManagement from '@/components/PaymentManagement.vue'
import WaLinkPanel from '@/components/wa/WaLinkPanel.vue'
import WaLinkModal from '@/components/wa/WaLinkModal.vue'
import WaConversationList from '@/components/wa/WaConversationList.vue'
import WaChatThread from '@/components/wa/WaChatThread.vue'
import WaLetterDialog from '@/components/wa/WaLetterDialog.vue'
import MessageDialog from '@/components/MessageDialog.vue'
import { dataUrlToObjectUrl, isPdfDocument } from '@/utils/waMedia'
import { renderPdfFirstPage } from '@/utils/pdfToImage'

/**
 * Bandeja WhatsApp de solo lectura del retiro (specs/whatsapp-inbox).
 * Consolidada: los mensajes de caminantes que llegan a CUALQUIER teléfono
 * vinculado se ven por todo el staff con whatsappInbox:read (D3).
 */

const { t } = useI18n()
const retreatStore = useRetreatStore()
const authStore = useAuthStore()
const { isSuperadmin } = useAuthPermissions()
const { can } = useAuthPermissions()
const store = useWaInboxStore()
const participantStore = useParticipantStore()
const {
  links,
  conversations,
  realtimeConnected,
  loadingConversations,
  inboxEnabled,
  mediaByMessageId,
  rawMediaByMessageId,
} = storeToRefs(store)

const retreatId = computed(
  () => retreatStore.selectedRetreatId || retreatStore.mostRecentRetreat?.id || null,
)
// Zona del retiro para horas/separadores (regla 5 de timezone-handling).
const retreatTimezone = computed(
  () => retreatStore.selectedRetreat?.timezone || 'America/Mexico_City',
)
// Mold de MessageSequencesView: el id del usuario actual decide si el tablero
// muestra el teléfono de cada vínculo.
const myUserId = computed(() => (authStore.user as any)?.id || null)
// FR14: "Registrar como pago" solo para quien puede crear pagos.
const canRegisterPayment = computed(() => can.create('payment'))
// Ficha del caminante (backlog UX): el popover necesita el Participant completo
// — sale del participantStore hidratado con la lista del retiro (con pagos).
const { participants } = storeToRefs(participantStore)
const onlyUnread = ref(false)
const filteredConversations = computed(() =>
  onlyUnread.value ? conversations.value.filter((c) => c.unreadCount > 0) : conversations.value,
)
const emptyListText = computed(() => {
  if (onlyUnread.value && conversations.value.length > 0 && filteredConversations.value.length === 0) {
    return t('waInbox.allRead')
  }
  return links.value.length === 0 ? t('waInbox.noLinks') : t('waInbox.empty')
})
const activeParticipant = computed(() => {
  const pid = store.activeConversation?.participantId
  if (!pid) return null
  return (participantStore.participants || []).find((p) => p.id === pid) ?? null
})
async function onMarkAllSeen() {
  const id = retreatId.value
  if (!id) return
  await store.markAllSeen(id).catch(() => {})
}

const linkModalOpen = ref(false)

async function load() {
  const id = retreatId.value
  if (!id) return
  store.subscribeRealtime(id)
  await Promise.all([store.fetchLinks(id), store.fetchConversations(id), store.refreshBadge(id)])
  // Ficha del caminante (FR ficha): hidratar el participantStore con la lista
  // del retiro (trae pagos) — regla del frontend para MessageDialog/popover.
  participantStore.filters = {}
  participantStore.filters.retreatId = id
  await participantStore.fetchParticipants().catch(() => {})
}

watch(retreatId, () => {
  store.reset()
  void load()
}, { immediate: true })

onBeforeUnmount(() => store.reset())

async function refresh() {
  const id = retreatId.value
  if (!id) return
  await Promise.all([store.fetchLinks(id), store.fetchConversations(id), store.refreshBadge(id)])
}

function formatSearchTime(ts: string | Date): string {
  const date = typeof ts === 'string' ? new Date(ts) : ts
  return date.toLocaleString('es-MX', {
    timeZone: retreatTimezone.value,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// ── Búsqueda de mensajes (v1.1): debounce 300 ms, mínimo 2 caracteres ──
const searchQuery = ref('')
const searching = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(searchQuery, (q) => {
  if (searchTimer) clearTimeout(searchTimer)
  const id = retreatId.value
  if (!id) return
  const trimmed = q.trim()
  if (trimmed.length < 2) {
    store.searchResults = []
    return
  }
  searchTimer = setTimeout(() => {
    searching.value = true
    store
      .searchMessages(id, trimmed)
      .catch(() => {
        store.searchResults = []
      })
      .finally(() => {
        searching.value = false
      })
  }, 300)
})

function onSelectSearchResult(chatJid: string) {
  searchQuery.value = ''
  onSelect(chatJid)
}

function onSelect(chatJid: string) {
  const id = retreatId.value
  if (!id) return
  void store.openChat(id, chatJid)
  // Móvil: el hilo abre en vista exclusiva arriba del viewport.
  if (window.innerWidth < 1024) window.scrollTo({ top: 0 })
}

function onUnlink(linkId: string) {
  const id = retreatId.value
  if (!id) return
  void store.unlink(id, linkId)
}

async function onToggleEnabled(value: boolean | string | number) {
  const id = retreatId.value
  if (!id) return
  await store.setEnabled(id, value === true).catch(() => {
    // El estado real llega en el siguiente refetch del tablero.
    void store.fetchLinks(id)
  })
}

// Terminación en dos pasos: el primer click arma, el segundo ejecuta (D14).
const terminateArmed = ref(false)
let terminateArmTimer: ReturnType<typeof setTimeout> | null = null
async function onTerminateAll() {
  const id = retreatId.value
  if (!id) return
  if (!terminateArmed.value) {
    terminateArmed.value = true
    if (terminateArmTimer) clearTimeout(terminateArmTimer)
    terminateArmTimer = setTimeout(() => {
      terminateArmed.value = false
    }, 4000)
    return
  }
  terminateArmed.value = false
  if (terminateArmTimer) clearTimeout(terminateArmTimer)
  await store.terminateAll(id).catch(() => {})
}

// FR14 (v1.1) + look at the photo before deciding (QA feedback 2026-11-07):
// the on-demand download feeds the large viewer (is it a real receipt?) and
// the payment registration. v1.3: PDFs are rendered to an image first, and
// the created payment is linked to the message (duplicate-payment guard).
const { toast } = useToast()
const paymentRef = ref<InstanceType<typeof PaymentManagement> | null>(null)
/** The payment modal mounts on first use (embedded: no list fetches). */
const paymentMounted = ref(false)
/** Message the open payment modal came from — linked on payment-saved. */
const pendingPaymentMessageId = ref<string | null>(null)
const downloadingReceipt = ref(false)
const photoViewer = ref<{
  dataUrl: string
  participantId: string | null
  participantName: string
  message: WaInboxMessageDto
} | null>(null)

function apiErrorMessage(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
    (err as Error)?.message ||
    fallback
  )
}

function notifyError(description: string): void {
  toast({ title: t('waInbox.title'), description, variant: 'destructive' })
}

const activeConversationName = computed(() => {
  const c = store.activeConversation
  return c ? `${c.participantFirstName} ${c.participantLastName}`.trim() : ''
})

async function downloadReceiptFor(message: { id: string }): Promise<string | null> {
  if (downloadingReceipt.value) return null
  downloadingReceipt.value = true
  try {
    const receipt = await store.downloadReceipt(message.id)
    if (!receipt.participantId) {
      notifyError(t('waInbox.receiptNoParticipant'))
      return null
    }
    return receipt.receiptPhoto
  } catch (err) {
    notifyError(apiErrorMessage(err, t('waInbox.receiptFailed')))
    return null
  } finally {
    downloadingReceipt.value = false
  }
}

/** First page of a PDF document message as a JPEG data-URL (null on failure). */
async function pdfFirstPageFor(message: WaInboxMessageDto): Promise<string | null> {
  if (!isPdfDocument(message.mediaMime, message.mediaFileName)) {
    notifyError(t('waInbox.notPdf'))
    return null
  }
  try {
    const raw = await store.loadRawMedia(message.id)
    return await renderPdfFirstPage(raw.dataUrl)
  } catch (err) {
    notifyError(apiErrorMessage(err, t('waInbox.pdfRenderFailed')))
    return null
  }
}

async function onViewPhoto(message: WaInboxMessageDto) {
  const dataUrl = await downloadReceiptFor(message)
  if (!dataUrl) return
  photoViewer.value = {
    dataUrl,
    participantId: store.activeConversation?.participantId ?? null,
    participantName: activeConversationName.value,
    message,
  }
}

/** Duplicate-payment guard: confirm before paying a receipt twice. */
function confirmNotDuplicate(message: WaInboxMessageDto): boolean {
  if (!message.paymentId) return true
  return window.confirm(
    t('waInbox.paymentRegisteredConfirm', { name: message.paymentRegisteredByName || '' }),
  )
}

async function openPaymentModal(message: WaInboxMessageDto, participantId: string, dataUrl: string) {
  paymentMounted.value = true
  await nextTick()
  pendingPaymentMessageId.value = message.id
  paymentRef.value?.openPaymentForWithReceipt(participantId, dataUrl)
}

async function onRegisterFromPhoto() {
  const viewer = photoViewer.value
  if (!viewer) return
  if (!viewer.participantId) {
    notifyError(t('waInbox.receiptNoParticipant'))
    return
  }
  if (!confirmNotDuplicate(viewer.message)) return
  photoViewer.value = null
  await openPaymentModal(viewer.message, viewer.participantId, viewer.dataUrl)
}

async function onRegisterReceipt(message: WaInboxMessageDto) {
  const participantId = store.activeConversation?.participantId
  if (!participantId) {
    notifyError(t('waInbox.receiptNoParticipant'))
    return
  }
  if (!confirmNotDuplicate(message)) return
  const dataUrl =
    message.messageType === 'document'
      ? await pdfFirstPageFor(message)
      : await downloadReceiptFor(message)
  if (!dataUrl) return
  await openPaymentModal(message, participantId, dataUrl)
}

async function onPaymentSaved(payment: { id: string }) {
  const messageId = pendingPaymentMessageId.value
  const id = retreatId.value
  pendingPaymentMessageId.value = null
  if (!messageId || !id) return
  await store.linkPayment(id, messageId, payment.id).catch(() => {
    notifyError(t('waInbox.linkPaymentFailed'))
  })
}

// ── v1.3: documents and voice notes ──
async function onOpenDocument(message: WaInboxMessageDto) {
  // Open the tab inside the click (popup blockers) and point it at the file
  // once downloaded.
  const tab = window.open('', '_blank')
  try {
    const raw = await store.loadRawMedia(message.id)
    const url = dataUrlToObjectUrl(raw.dataUrl)
    if (tab) tab.location.href = url
    else window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    tab?.close()
    notifyError(apiErrorMessage(err, t('waInbox.mediaFailed')))
  }
}

async function onPlayAudio(message: WaInboxMessageDto) {
  try {
    await store.loadRawMedia(message.id)
  } catch (err) {
    notifyError(apiErrorMessage(err, t('waInbox.mediaFailed')))
  }
}

// ── v1.3: "add as letter" ──
const canAddLetter = computed(() => can.update('letter'))
const letterOpen = ref(false)
const letterMessage = ref<WaInboxMessageDto | null>(null)
const letterAttachment = ref<string | null>(null)
const letterPreparing = ref(false)
const letterSaving = ref(false)
const letterParticipants = computed(() =>
  (participants.value || [])
    .filter((p) => !p.isCancelled)
    .map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es')),
)

async function onAddLetter(message: WaInboxMessageDto) {
  letterMessage.value = message
  letterAttachment.value = null
  letterOpen.value = true
  if (message.messageType !== 'image' && message.messageType !== 'document') return
  letterPreparing.value = true
  try {
    letterAttachment.value =
      message.messageType === 'image'
        ? (await store.downloadReceipt(message.id)).receiptPhoto
        : await pdfFirstPageFor(message)
  } catch (err) {
    notifyError(apiErrorMessage(err, t('waInbox.mediaFailed')))
  } finally {
    letterPreparing.value = false
  }
}

/** File name for the printed image: the document's name, else by image type. */
function letterAttachmentName(message: WaInboxMessageDto, dataUrl: string): string {
  const base = message.mediaFileName?.replace(/\.[^.]+$/, '') || `whatsapp-${message.id.slice(0, 8)}`
  const ext = dataUrl.startsWith('data:image/webp') ? 'webp' : dataUrl.startsWith('data:image/png') ? 'png' : 'jpg'
  return `${base}.${ext}`
}

async function onSubmitLetter(payload: {
  participantId: string
  bodyText: string
  includeAttachment: boolean
}) {
  const id = retreatId.value
  const message = letterMessage.value
  if (!id || !message) return
  letterSaving.value = true
  try {
    const result = await store.addAsLetter(id, message.id, {
      participantId: payload.participantId,
      bodyText: payload.bodyText,
      attachment:
        payload.includeAttachment && letterAttachment.value
          ? {
              fileName: letterAttachmentName(message, letterAttachment.value),
              dataUrl: letterAttachment.value,
            }
          : null,
    })
    const name = letterParticipants.value.find((p) => p.id === payload.participantId)?.name ?? ''
    toast({
      title: t('waInbox.letter.title'),
      description: result.duplicate ? t('waInbox.letter.duplicate') : t('waInbox.letter.saved', { name }),
    })
    letterOpen.value = false
  } catch (err) {
    notifyError(apiErrorMessage(err, t('waInbox.letter.failed')))
  } finally {
    letterSaving.value = false
  }
}

// ── v1.3: templated reply through MessageDialog (mounted without v-if:
// its forceTemplateType watcher needs it mounted before `open` flips). ──
const messageDialogOpen = ref(false)
function onReplyTemplate() {
  if (!activeParticipant.value) {
    notifyError(t('waInbox.receiptNoParticipant'))
    return
  }
  messageDialogOpen.value = true
}
</script>

<template>
  <div class="p-4 md:p-6 flex flex-col gap-4">
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold flex items-center gap-2">
          <MessageCircle class="w-5 h-5" />
          {{ t('waInbox.title') }}
        </h1>
        <p class="text-sm text-muted-foreground">
          {{ t('waInbox.subtitle') }}
          <span
            class="ml-2 inline-flex items-center gap-1"
            :class="realtimeConnected ? 'text-emerald-600' : 'text-muted-foreground'"
          >
            <span class="w-2 h-2 rounded-full" :class="realtimeConnected ? 'bg-emerald-500' : 'bg-gray-400'" />
            {{ realtimeConnected ? t('waInbox.realtimeOn') : t('waInbox.realtimeOff') }}
          </span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" @click="refresh">
          <RefreshCw class="w-4 h-4 mr-1" />
          {{ t('waInbox.refresh') }}
        </Button>
        <Button size="sm" @click="linkModalOpen = true">
          {{ t('waInbox.linkButton') }}
        </Button>
      </div>
    </div>

    <!-- Móvil: las conversaciones van PRIMERO (order-1); el tablero y los
         controles de superadmin pasan al final. En escritorio, orden normal. -->
    <div class="order-2 lg:order-1 flex flex-col gap-4">
      <WaLinkPanel
        :links="links"
        :current-user-id="myUserId"
        :is-superadmin="isSuperadmin"
        @unlink="onUnlink"
      />

      <!-- Activación por retiro (D13) y terminación de servidores (D14):
           SOLO superadmin. El puente consume RAM por cuenta vinculada. -->
      <div
        v-if="isSuperadmin"
        class="rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center gap-3"
        data-testid="wa-superadmin-controls"
      >
        <label class="flex items-center gap-2 text-sm">
          <Switch
            :model-value="inboxEnabled"
            data-testid="wa-enabled-switch"
            @update:model-value="onToggleEnabled"
          />
          <span>{{ t('waInbox.superadmin.activate') }}</span>
        </label>
        <span class="text-xs text-muted-foreground">{{ t('waInbox.superadmin.activateHint') }}</span>
        <Button
          v-if="links.length > 0"
          variant="destructive"
          size="sm"
          class="sm:ml-auto"
          data-testid="wa-terminate-all"
          @click="onTerminateAll"
        >
          {{ terminateArmed ? t('waInbox.superadmin.terminateConfirm') : t('waInbox.superadmin.terminate') }}
        </Button>
      </div>
    </div>

    <!-- Móvil: lista y hilo son EXCLUYENTES — tocar un chat abre solo el hilo
         (con Volver); sin chat activo se ve solo la lista. Escritorio: ambos. -->
    <div class="order-1 lg:order-2 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
      <div :class="store.activeChatJid ? 'hidden lg:block' : 'block'">
        <!-- Búsqueda + filtros (v1.1): reemplaza la lista mientras hay texto. -->
        <input
          v-model="searchQuery"
          type="search"
          :placeholder="t('waInbox.searchPlaceholder')"
          class="w-full mb-2 px-3 py-2 text-sm rounded-lg border bg-background"
          data-testid="wa-search-input"
        />
        <div v-if="searchQuery.trim().length >= 2" class="rounded-lg border overflow-hidden">
          <div v-if="searching" class="p-3 text-sm text-muted-foreground animate-pulse">
            {{ t('waInbox.loading') }}
          </div>
          <div
            v-else-if="store.searchResults.length === 0"
            class="p-3 text-sm text-muted-foreground"
          >
            {{ t('waInbox.searchEmpty') }}
          </div>
          <ul v-else class="divide-y max-h-[60vh] overflow-y-auto">
            <li v-for="r in store.searchResults" :key="r.id">
              <button
                type="button"
                class="w-full text-left px-3 py-2 hover:bg-muted/60"
                @click="onSelectSearchResult(r.chatJid)"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="text-sm font-medium truncate">
                    {{ r.participantFirstName }} {{ r.participantLastName }}
                  </span>
                  <span class="text-xs text-muted-foreground whitespace-nowrap">
                    {{ formatSearchTime(r.timestamp) }}
                  </span>
                </div>
                <div class="text-xs text-muted-foreground truncate">{{ r.body }}</div>
              </button>
            </li>
          </ul>
        </div>
        <template v-else>
          <div
            v-if="conversations.length > 0"
            class="flex items-center justify-between gap-2 mb-2"
          >
            <label class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input v-model="onlyUnread" type="checkbox" class="accent-emerald-600" data-testid="wa-only-unread" />
              <span>{{ t('waInbox.onlyUnread') }}</span>
            </label>
            <button
              v-if="store.totalUnread > 0"
              type="button"
              class="text-xs text-muted-foreground hover:text-foreground hover:underline"
              data-testid="wa-mark-all-seen"
              @click="onMarkAllSeen"
            >
              {{ t('waInbox.markAllSeen') }}
            </button>
          </div>
          <WaConversationList
            :conversations="filteredConversations"
            :active-chat-jid="store.activeChatJid"
            :loading="loadingConversations"
            :empty-text="emptyListText"
            :retreat-timezone="retreatTimezone"
            @select="onSelect"
          />
        </template>
      </div>
      <div :class="store.activeChatJid ? 'block' : 'hidden lg:block'">
        <WaChatThread
          :messages="store.threadMessages"
          :conversation="store.activeConversation"
          :loading="store.loadingThread"
          :can-register-payment="canRegisterPayment"
          :retreat-timezone="retreatTimezone"
          :popover-participant="activeParticipant"
          :retreat-id="retreatId"
          :media-map="mediaByMessageId"
          :raw-media-map="rawMediaByMessageId"
          :can-add-letter="canAddLetter"
          @register-receipt="onRegisterReceipt"
          @view-photo="onViewPhoto"
          @open-document="onOpenDocument"
          @play-audio="onPlayAudio"
          @add-letter="onAddLetter"
          @reply-template="onReplyTemplate"
          @back="store.activeChatJid = null"
        />
      </div>
    </div>

    <WaLinkModal v-model:open="linkModalOpen" :retreat-id="retreatId" @linked="refresh" />

    <!-- FR14: modal de pago reutilizado, montado oculto (el Dialog que abre
         teletransporta a body). openPaymentForWithReceipt lo abre prellenado. -->
    <div class="hidden">
      <PaymentManagement
        v-if="paymentMounted"
        ref="paymentRef"
        embedded
        @payment-saved="onPaymentSaved"
      />
    </div>

    <!-- v1.3: "add as letter" and templated reply. -->
    <WaLetterDialog
      v-model:open="letterOpen"
      :participants="letterParticipants"
      :default-participant-id="store.activeConversation?.participantId ?? null"
      :initial-text="letterMessage?.body ?? ''"
      :attachment-data-url="letterAttachment"
      :preparing-attachment="letterPreparing"
      :saving="letterSaving"
      @submit="onSubmitLetter"
    />
    <MessageDialog
      v-model:open="messageDialogOpen"
      context="retreat"
      :retreat-id="retreatId ?? undefined"
      :participant="activeParticipant"
    />

    <!-- Visor de comprobante (feedback Leo 2026-11-07): ver la foto a tamaño
         grande ANTES de decidir si es un comprobante real. -->
    <Dialog :open="!!photoViewer" @update:open="photoViewer = null">
      <DialogContent class="sm:max-w-lg" data-testid="wa-photo-viewer">
        <DialogHeader>
          <DialogTitle>{{ photoViewer?.participantName || t('waInbox.receiptViewer') }}</DialogTitle>
        </DialogHeader>
        <img
          v-if="photoViewer"
          :src="photoViewer.dataUrl"
          class="w-full rounded-lg border"
          alt="Comprobante"
          data-testid="wa-photo-viewer-img"
        />
        <DialogFooter>
          <Button variant="outline" size="sm" @click="photoViewer = null">
            {{ t('waInbox.close') }}
          </Button>
          <Button
            v-if="photoViewer?.participantId"
            size="sm"
            data-testid="wa-register-from-photo"
            @click="onRegisterFromPhoto"
          >
            {{ t('waInbox.registerPayment') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
