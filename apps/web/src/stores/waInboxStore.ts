import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useToast } from '@repo/ui';
import { getSocket } from '@/services/realtime';
import type { WaConversationDto, WaInboxMessageDto, WaLinkDto, WaMediaVariantsDto } from '@repo/types';
import {
  getWaLinkStatus,
  getWaLinks,
  getWaConversations,
  getWaMessages,
  getWaReceiptDataUrl,
  getWaThreadMedia,
  getWaUnreadCount,
  searchWaMessages,
  markWaChatSeen,
  markWaAllSeen,
  startWaLink,
  unlinkWaLink,
  setWaBridgeEnabled,
  terminateWaBridgeAll,
  type WaLinkStatus,
  type WaReceiptDownload,
  type WaSearchResult,
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
  /** Badge del sidebar (v1.1): no leídos totales para el usuario actual. */
  const totalUnread = ref(0);
  const searchResults = ref<WaSearchResult[]>([]);
  const conversations = ref<WaConversationDto[]>([]);
  const activeChatJid = ref<string | null>(null);
  const threadMessages = ref<WaInboxMessageDto[]>([]);
  const loadingLinks = ref(false);
  const loadingConversations = ref(false);
  const loadingThread = ref(false);
  const realtimeConnected = ref(false);
  /** Variantes de imagen por messageId (v1.2): llenado por lotes al abrir el hilo. */
  const mediaByMessageId = ref<Record<string, WaMediaVariantsDto>>({});
  /** Imágenes que el server no pudo devolver (vínculo purgado — media borrada, D9). */
  const mediaUnavailable = ref<Record<string, true>>({});
  const loadingMedia = ref(false);

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
    // Si el lote de thumbnails ya la trajo, no re-descargar (instantáneo).
    const cached = mediaByMessageId.value[messageId];
    if (cached?.large) {
      const c = activeConversation.value;
      return {
        receiptPhoto: cached.large,
        participantId: c?.participantId ?? null,
        participantFirstName: c?.participantFirstName ?? '',
        participantLastName: c?.participantLastName ?? '',
        country: c?.country ?? null,
      };
    }
    return getWaReceiptDataUrl(messageId);
  }

  /**
   * Thumbnails del hilo abierto (v1.2): un solo lote para todas las imágenes
   * pendientes — pedir una por una paraba/levantaba el sync por cada foto.
   */
  async function fetchThreadMedia(retreatId: string) {
    const pending = threadMessages.value
      .filter(
        (m) =>
          m.messageType === 'image' &&
          !mediaByMessageId.value[m.id] &&
          !mediaUnavailable.value[m.id],
      )
      .map((m) => m.id)
      .slice(0, 30);
    if (pending.length === 0 || loadingMedia.value) return;
    loadingMedia.value = true;
    try {
      const data = await getWaThreadMedia(retreatId, pending);
      mediaByMessageId.value = { ...mediaByMessageId.value, ...data.media };
      // Las no devueltas quedan marcadas: placeholder 📎 definitivo (su
      // vínculo fue purgado — la media ya no existe en ningún store).
      const returned = new Set(Object.keys(data.media));
      for (const id of pending) {
        if (!returned.has(id)) mediaUnavailable.value = { ...mediaUnavailable.value, [id]: true };
      }
    } catch {
      // Sin thumbnails la bandeja sigue usable (placeholder 📎).
    } finally {
      loadingMedia.value = false;
    }
  }

  /** Badge del sidebar (v1.1): liviano, apto para polling. */
  async function refreshBadge(retreatId: string) {
    try {
      const data = await getWaUnreadCount(retreatId);
      totalUnread.value = data.total ?? 0;
    } catch {
      // Sin permiso o sin retiro: el badge se queda como esté.
    }
  }

  /** Búsqueda de texto (v1.1). */
  async function searchMessages(retreatId: string, q: string) {
    const data = await searchWaMessages(retreatId, q);
    searchResults.value = data.results ?? [];
    return searchResults.value;
  }

  /** Marca todos los chats como leídos para el usuario (v1.1). */
  async function markAllSeen(retreatId: string) {
    const r = await markWaAllSeen(retreatId);
    conversations.value.forEach((c) => {
      c.unreadCount = 0;
    });
    totalUnread.value = 0;
    return r.marked;
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
    // Thumbnails de las imágenes del hilo (v1.2) — no bloquea la apertura.
    void fetchThreadMedia(retreatId);
    // Marca leído en servidor (timestamp lo decide el API) y refresca badges.
    await markWaChatSeen(retreatId, chatJid).catch(() => {});
    const c = conversations.value.find((x) => x.chatJid === chatJid);
    if (c) c.unreadCount = 0;
    refreshBadge(retreatId).catch(() => {});
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

    const listener = (e: { retreatId: string; newCount?: number; senderName?: string | null; preview?: string | null }) => {
      const active = subscribedRetreatId;
      if (!active || e.retreatId !== active) return;
      fetchConversations(active).catch(() => {});
      refreshBadge(active).catch(() => {});
      // Hilo abierto: refetch del chat activo (los nuevos entrantes aparecen).
      if (activeChatJid.value) {
        fetchThread(active, activeChatJid.value)
          .then(() => fetchThreadMedia(active))
          .catch(() => {});
      }
      // Aviso in-app (v1.1): el staff no vive mirando la bandeja.
      const { toast } = useToast();
      if (e.senderName) {
        toast({
          title: `${e.senderName}`,
          description: e.preview || undefined,
        });
      } else if ((e.newCount ?? 0) > 0) {
        toast({ title: `${e.newCount} mensaje(s) nuevo(s) de caminantes` });
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
    searchResults.value = [];
    mediaByMessageId.value = {};
    mediaUnavailable.value = {};
    activeChatJid.value = null;
  }

  return {
    links,
    inboxEnabled,
    totalUnread,
    searchResults,
    conversations,
    activeChatJid,
    activeConversation,
    threadMessages,
    loadingLinks,
    loadingConversations,
    loadingThread,
    realtimeConnected,
    mediaByMessageId,
    loadingMedia,
    fetchLinks,
    fetchConversations,
    fetchThread,
    fetchThreadMedia,
    openChat,
    linkStatus,
    link,
    unlink,
    setEnabled,
    terminateAll,
    downloadReceipt,
    refreshBadge,
    searchMessages,
    markAllSeen,
    subscribeRealtime,
    reset,
  };
});
