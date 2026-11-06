<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { MessageCircle, RefreshCw } from 'lucide-vue-next'
import { Button, Switch } from '@repo/ui'
import { useRetreatStore } from '@/stores/retreatStore'
import { useAuthStore } from '@/stores/authStore'
import { useAuthPermissions } from '@/composables/useAuthPermissions'
import { useWaInboxStore } from '@/stores/waInboxStore'
import PaymentManagement from '@/components/PaymentManagement.vue'
import WaLinkPanel from '@/components/wa/WaLinkPanel.vue'
import WaLinkModal from '@/components/wa/WaLinkModal.vue'
import WaConversationList from '@/components/wa/WaConversationList.vue'
import WaChatThread from '@/components/wa/WaChatThread.vue'

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
const { links, conversations, realtimeConnected, loadingConversations, inboxEnabled } =
  storeToRefs(store)

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

const linkModalOpen = ref(false)

async function load() {
  const id = retreatId.value
  if (!id) return
  store.subscribeRealtime(id)
  await Promise.all([store.fetchLinks(id), store.fetchConversations(id)])
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

// FR14 (v1.1): descargar la imagen del mensaje y abrir el modal de pagos con
// el comprobante ya adjunto y el participante prellenado.
const paymentRef = ref<InstanceType<typeof PaymentManagement> | null>(null)
const downloadingReceipt = ref(false)
async function onRegisterReceipt(message: { id: string }) {
  if (downloadingReceipt.value) return
  downloadingReceipt.value = true
  try {
    const receipt = await store.downloadReceipt(message.id)
    if (!receipt.participantId) {
      alert(t('waInbox.receiptNoParticipant'))
      return
    }
    paymentRef.value?.openPaymentForWithReceipt(receipt.participantId, receipt.receiptPhoto)
  } catch (err) {
    const apiMessage =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      (err as Error).message
    alert(apiMessage || t('waInbox.receiptFailed'))
  } finally {
    downloadingReceipt.value = false
  }
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
    <div class="order-1 lg:order-2 flex flex-col gap-4">
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
    <div class="order-2 lg:order-1 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
      <div :class="store.activeChatJid ? 'hidden lg:block' : 'block'">
        <!-- Búsqueda de mensajes (v1.1): reemplaza la lista mientras hay texto. -->
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
                <div class="text-xs text-muted-foreground">
                  {{ formatSearchTime(r.timestamp) }}
                </div>
                <div class="text-sm truncate">{{ r.body }}</div>
              </button>
            </li>
          </ul>
        </div>
        <WaConversationList
          v-else
          :conversations="conversations"
          :active-chat-jid="store.activeChatJid"
          :loading="loadingConversations"
          :empty-text="links.length === 0 ? t('waInbox.noLinks') : t('waInbox.empty')"
          :retreat-timezone="retreatTimezone"
          @select="onSelect"
        />
      </div>
      <div :class="store.activeChatJid ? 'block' : 'hidden lg:block'">
        <WaChatThread
          :messages="store.threadMessages"
          :conversation="store.activeConversation"
          :loading="store.loadingThread"
          :can-register-payment="canRegisterPayment"
          :retreat-timezone="retreatTimezone"
          @register-receipt="onRegisterReceipt"
          @back="store.activeChatJid = null"
        />
      </div>
    </div>

    <WaLinkModal v-model:open="linkModalOpen" :retreat-id="retreatId" @linked="refresh" />

    <!-- FR14: modal de pago reutilizado, montado oculto (el Dialog que abre
         teletransporta a body). openPaymentForWithReceipt lo abre prellenado. -->
    <div class="hidden">
      <PaymentManagement ref="paymentRef" />
    </div>
  </div>
</template>
