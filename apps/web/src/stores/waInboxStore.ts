import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { getSocket } from '@/services/realtime';
import type { WaConversationDto, WaInboxMessageDto, WaLinkDto } from '@repo/types';
import {
  getWaLinkStatus,
  getWaLinks,
  getWaConversations,
  getWaMessages,
  getWaReceiptDataUrl,
  markWaChatSeen,
  startWaLink,
  unlinkWaLink,
  setWaBridgeEnabled,
  terminateWaBridgeAll,
  type WaLinkStatus,
  type WaReceiptDownload,
} from '@/services/api';

/**
 * Estado de la bandeja WhatsApp de solo lectura (specs/whatsapp-inbox).
 * El realtime replica el patrón de messageSequenceStore: join con ack,
 * re-join al reconectar y refetch en `inbox:changed`.
 */
export const useWaInboxStore = defineStore('waInbox', () => {
  const links = ref<WaLinkDto[]>([]);
  /** Activación del retiro (D13) — viene en la respuesta de links. */
  const inboxEnabled = ref(false);
  const conversations = ref<WaConversationDto[]>([]);
  const activeChatJid = ref<string | null>(null);
  const threadMessages = ref<WaInboxMessageDto[]>([]);
  const loadingLinks = ref(false);
  const loadingConversations = ref(false);
  const loadingThread = ref(false);
  const realtimeConnected = ref(false);

  let subscribedRetreatId: string | null = null;
  let unsubscribeRealtime: (() => void) | null = null;

  const activeConversation = computed(
    () => conversations.value.find((c) => c.chatJid === activeChatJid.value) ?? null,
  );

  async function fetchLinks(retreatId: string) {
    loadingLinks.value = true;
    try {
      const data = await getWaLinks(retreatId);
      links.value = data.links ?? [];
      inboxEnabled.value = data.enabled ?? false;
    } finally {
      loadingLinks.value = false;
    }
  }

  /** Activación por retiro — SOLO superadmin (D13). */
  async function setEnabled(retreatId: string, enabled: boolean) {
    await setWaBridgeEnabled(retreatId, enabled);
    inboxEnabled.value = enabled;
    if (!enabled) {
      // Al apagar se terminan las sesiones: limpiar el tablero local.
      links.value = [];
      conversations.value = [];
      threadMessages.value = [];
      activeChatJid.value = null;
    }
  }

  /** Terminar todos los servidores del puente — SOLO superadmin (D14). */
  async function terminateAll(retreatId: string) {
    const r = await terminateWaBridgeAll(retreatId, true);
    links.value = [];
    conversations.value = [];
    threadMessages.value = [];
    activeChatJid.value = null;
    inboxEnabled.value = false;
    return r.terminated;
  }

  /** FR14 (v1.1): descargar la imagen de un mensaje para usarla de comprobante. */
  async function downloadReceipt(messageId: string): Promise<WaReceiptDownload> {
    return getWaReceiptDataUrl(messageId);
  }

  async function fetchConversations(retreatId: string) {
    loadingConversations.value = true;
    try {
      const data = await getWaConversations(retreatId);
      conversations.value = data.conversations ?? [];
    } finally {
      loadingConversations.value = false;
    }
  }

  async function fetchThread(retreatId: string, chatJid: string, before?: string) {
    loadingThread.value = true;
    try {
      const data = await getWaMessages(retreatId, chatJid, before);
      if (before) {
        // Paginación hacia atrás: prepend manteniendo orden cronológico.
        threadMessages.value = [...(data.messages ?? []).reverse(), ...threadMessages.value];
      } else {
        threadMessages.value = [...(data.messages ?? [])].reverse();
      }
      return data.messages ?? [];
    } finally {
      loadingThread.value = false;
    }
  }

  async function openChat(retreatId: string, chatJid: string) {
    activeChatJid.value = chatJid;
    await fetchThread(retreatId, chatJid);
    // Marca leído en servidor (timestamp lo decide el API) y refresca badges.
    await markWaChatSeen(retreatId, chatJid).catch(() => {});
    const c = conversations.value.find((x) => x.chatJid === chatJid);
    if (c) c.unreadCount = 0;
  }

  async function linkStatus(linkId: string): Promise<WaLinkStatus> {
    return getWaLinkStatus(linkId);
  }

  async function link(retreatId: string, consentAccepted: boolean): Promise<WaLinkDto> {
    const data = await startWaLink(retreatId, consentAccepted);
    return data.link;
  }

  async function unlink(retreatId: string, linkId: string) {
    await unlinkWaLink(linkId);
    await fetchLinks(retreatId);
    await fetchConversations(retreatId).catch(() => {});
  }

  function subscribeRealtime(retreatId: string) {
    const socket = getSocket();
    subscribedRetreatId = retreatId;

    const join = () => {
      socket.emit('inbox:subscribe', retreatId, (ok: boolean) => {
        realtimeConnected.value = !!ok;
      });
    };

    if (socket.connected) join();
    socket.on('connect', join);

    const listener = (e: { retreatId: string }) => {
      const active = subscribedRetreatId;
      if (!active || e.retreatId !== active) return;
      fetchConversations(active).catch(() => {});
      // Hilo abierto: refetch del chat activo (los nuevos entrantes aparecen).
      if (activeChatJid.value) {
        fetchThread(active, activeChatJid.value).catch(() => {});
      }
    };

    socket.on('inbox:changed', listener);

    unsubscribeRealtime = function unsubscribe() {
      socket.emit('inbox:unsubscribe', retreatId);
      socket.off('connect', join);
      socket.off('inbox:changed', listener);
      realtimeConnected.value = false;
      subscribedRetreatId = null;
      unsubscribeRealtime = null;
    };
  }

  function reset() {
    unsubscribeRealtime?.();
    links.value = [];
    conversations.value = [];
    threadMessages.value = [];
    activeChatJid.value = null;
  }

  return {
    links,
    inboxEnabled,
    conversations,
    activeChatJid,
    activeConversation,
    threadMessages,
    loadingLinks,
    loadingConversations,
    loadingThread,
    realtimeConnected,
    fetchLinks,
    fetchConversations,
    fetchThread,
    openChat,
    linkStatus,
    link,
    unlink,
    setEnabled,
    terminateAll,
    downloadReceipt,
    subscribeRealtime,
    reset,
  };
});
