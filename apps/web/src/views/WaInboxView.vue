<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { MessageCircle, RefreshCw } from 'lucide-vue-next'
import { Button } from '@repo/ui'
import { useRetreatStore } from '@/stores/retreatStore'
import { useAuthStore } from '@/stores/authStore'
import { useWaInboxStore } from '@/stores/waInboxStore'
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
const store = useWaInboxStore()
const { links, conversations, realtimeConnected, loadingConversations } = storeToRefs(store)

const retreatId = computed(
  () => retreatStore.selectedRetreatId || retreatStore.mostRecentRetreat?.id || null,
)
// Mold de MessageSequencesView: el id del usuario actual decide si el tablero
// muestra el teléfono de cada vínculo.
const myUserId = computed(() => (authStore.user as any)?.id || null)

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
  await Promise.all([store.fetchLinks(id), store.fetchConversations(id)])
}

function onSelect(chatJid: string) {
  const id = retreatId.value
  if (!id) return
  void store.openChat(id, chatJid)
}

function onUnlink(linkId: string) {
  const id = retreatId.value
  if (!id) return
  void store.unlink(id, linkId)
}
</script>

<template>
  <div class="p-4 md:p-6 space-y-4">
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

    <WaLinkPanel
      :links="links"
      :current-user-id="myUserId"
      @unlink="onUnlink"
    />

    <div class="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
      <WaConversationList
        :conversations="conversations"
        :active-chat-jid="store.activeChatJid"
        :loading="loadingConversations"
        :empty-text="links.length === 0 ? t('waInbox.noLinks') : t('waInbox.empty')"
        @select="onSelect"
      />
      <WaChatThread
        :messages="store.threadMessages"
        :conversation="store.activeConversation"
        :loading="store.loadingThread"
      />
    </div>

    <WaLinkModal v-model:open="linkModalOpen" :retreat-id="retreatId" @linked="refresh" />
  </div>
</template>
