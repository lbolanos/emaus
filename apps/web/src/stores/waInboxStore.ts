import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useToast } from '@repo/ui';
import i18n from '@/i18n';
import { getSocket } from '@/services/realtime';
import { useAuthPermissions } from '@/composables/useAuthPermissions';
import type {
  WaConversationDto,
  WaInboxMessageDto,
  WaLinkDto,
  WaMediaVariantsDto,
  WaRawMediaDto,
} from '@repo/types';
import {
  getWaLinkStatus,
  getWaLinks,
  getWaConversations,
  getWaMessages,
  getWaReceiptDataUrl,
  getWaThreadMedia,
  getWaRawMedia,
  linkWaMessagePayment,
  addWaMessageAsLetter,
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
 * State of the read-only WhatsApp inbox (specs/whatsapp-inbox).
 * Realtime follows the messageSequenceStore pattern: join with ack, re-join
 * on reconnect and refetch on `inbox:changed`.
 */
export const useWaInboxStore = defineStore('waInbox', () => {
  const links = ref<WaLinkDto[]>([]);
  /** Retreat activation (D13) — comes with the links response. */
  const inboxEnabled = ref(false);
  /** Sidebar badge (v1.1): total unread for the current user. */
  const totalUnread = ref(0);
  const searchResults = ref<WaSearchResult[]>([]);
  const conversations = ref<WaConversationDto[]>([]);
  const activeChatJid = ref<string | null>(null);
  const threadMessages = ref<WaInboxMessageDto[]>([]);
  const loadingLinks = ref(false);
  const loadingConversations = ref(false);
  const loadingThread = ref(false);
  const realtimeConnected = ref(false);
  /** Image variants by messageId (v1.2): filled in batches when a thread opens. */
  const mediaByMessageId = ref<Record<string, WaMediaVariantsDto>>({});
  /** Images the server could not return (purged link — media gone, D9). */
  const mediaUnavailable = ref<Record<string, true>>({});
  const loadingMedia = ref(false);

  let subscribedRetreatId: string | null = null;
  let unsubscribeRealtime: (() => void) | null = null;

  const activeConversation = computed(
    () => conversations.value.find((c) => c.chatJid === activeChatJid.value) ?? null,
  );

  /** Group the active chat was opened from (v1.4): a contact may belong to two walkers. */
  const openedFromWalkerId = ref<string | null>(null);
  /**
   * Walker the active chat is about (v1.4): prefills payment, letter and the
   * profile. The group it was opened from when that walker is one of the
   * chat's, else the chat's first walker.
   */
  const activeWalkerId = computed<string | null>(() => {
    const c = activeConversation.value;
    if (!c) return null;
    const chosen = openedFromWalkerId.value;
    if (chosen && (c.forWalkers ?? []).some((w) => w.participantId === chosen)) return chosen;
    return c.participantId ?? null;
  });

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

  /** Per-retreat activation — superadmin ONLY (D13). */
  async function setEnabled(retreatId: string, enabled: boolean) {
    await setWaBridgeEnabled(retreatId, enabled);
    inboxEnabled.value = enabled;
    if (!enabled) {
      // Turning it off terminates the sessions: clear the local board.
      links.value = [];
      conversations.value = [];
      threadMessages.value = [];
      activeChatJid.value = null;
    }
  }

  /** Terminate every bridge session — superadmin ONLY (D14). */
  async function terminateAll(retreatId: string) {
    const r = await terminateWaBridgeAll(retreatId, true);
    links.value = [];
    conversations.value = [];
    threadMessages.value = [];
    activeChatJid.value = null;
    inboxEnabled.value = false;
    return r.terminated;
  }

  /** FR14 (v1.1): download a message's image to use it as a receipt. */
  async function downloadReceipt(messageId: string): Promise<WaReceiptDownload> {
    // Already brought by the thumbnail batch: no re-download (instant).
    const cached = mediaByMessageId.value[messageId];
    if (cached?.large) {
      const c = activeConversation.value;
      return {
        receiptPhoto: cached.large,
        participantId: activeWalkerId.value,
        participantFirstName: c?.participantFirstName ?? '',
        participantLastName: c?.participantLastName ?? '',
        country: c?.country ?? null,
      };
    }
    return getWaReceiptDataUrl(messageId);
  }

  /**
   * Thumbnails of the open thread (v1.2): one batch for every pending image
   * (cached server side) instead of a request per photo.
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
      // threadMessages is chronological: the batch takes the MOST RECENT 30,
      // the ones on screen when the thread opens.
      .slice(-30);
    if (pending.length === 0 || loadingMedia.value) return;
    loadingMedia.value = true;
    try {
      const data = await getWaThreadMedia(retreatId, pending);
      mediaByMessageId.value = { ...mediaByMessageId.value, ...data.media };
      // Images not returned are marked: their type label stays for good (the
      // link was purged — the media no longer exists in any store).
      const returned = new Set(Object.keys(data.media));
      for (const id of pending) {
        if (!returned.has(id)) mediaUnavailable.value = { ...mediaUnavailable.value, [id]: true };
      }
    } catch {
      // Without thumbnails the inbox stays usable (type labels).
    } finally {
      loadingMedia.value = false;
    }
  }

  /** v1.3: voice notes and documents, downloaded once per session. */
  const rawMediaByMessageId = ref<Record<string, WaRawMediaDto>>({});
  async function loadRawMedia(messageId: string): Promise<WaRawMediaDto> {
    const cached = rawMediaByMessageId.value[messageId];
    if (cached) return cached;
    const media = await getWaRawMedia(messageId);
    rawMediaByMessageId.value = { ...rawMediaByMessageId.value, [messageId]: media };
    return media;
  }

  /** v1.3: after saving a payment from a message, link it (anti-duplicates). */
  async function linkPayment(retreatId: string, messageId: string, paymentId: string) {
    await linkWaMessagePayment(messageId, paymentId);
    if (activeChatJid.value) await fetchThread(retreatId, activeChatJid.value);
  }

  /** v1.3: "add as letter". */
  async function addAsLetter(
    retreatId: string,
    messageId: string,
    payload: Parameters<typeof addWaMessageAsLetter>[1],
  ) {
    const result = await addWaMessageAsLetter(messageId, payload);
    if (activeChatJid.value) await fetchThread(retreatId, activeChatJid.value);
    return result;
  }

  /** Sidebar badge (v1.1): lightweight, fit for polling. */
  async function refreshBadge(retreatId: string) {
    try {
      const data = await getWaUnreadCount(retreatId);
      totalUnread.value = data.total ?? 0;
    } catch {
      // No permission or no retreat: the badge stays as it is.
    }
  }

  /** Text search (v1.1). */
  async function searchMessages(retreatId: string, q: string) {
    const data = await searchWaMessages(retreatId, q);
    searchResults.value = data.results ?? [];
    return searchResults.value;
  }

  /** Marks every chat as read for the user (v1.1). */
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
        // Backwards pagination: prepend keeping chronological order.
        threadMessages.value = [...(data.messages ?? []).reverse(), ...threadMessages.value];
      } else {
        threadMessages.value = [...(data.messages ?? [])].reverse();
      }
      return data.messages ?? [];
    } finally {
      loadingThread.value = false;
    }
  }

  async function openChat(retreatId: string, chatJid: string, walkerId: string | null = null) {
    activeChatJid.value = chatJid;
    openedFromWalkerId.value = walkerId;
    await fetchThread(retreatId, chatJid);
    // Thumbnails of the thread's images (v1.2) — does not block opening it.
    void fetchThreadMedia(retreatId);
    // Mark read on the server (the API decides the timestamp) and refresh badges.
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

    const listener = (e: {
      retreatId: string;
      newCount?: number;
      senderName?: string | null;
      preview?: string | null;
      contactCount?: number;
    }) => {
      const active = subscribedRetreatId;
      if (!active || e.retreatId !== active) return;
      fetchConversations(active).catch(() => {});
      refreshBadge(active).catch(() => {});
      // Open thread: refetch the active chat (new messages show up).
      if (activeChatJid.value) {
        fetchThread(active, activeChatJid.value)
          .then(() => fetchThreadMedia(active))
          .catch(() => {});
      }
      // In-app notice (v1.1): the staff does not live staring at the inbox.
      const { toast } = useToast();
      const t = i18n.global.t;
      if (e.senderName) {
        toast({
          title: `${e.senderName}`,
          description: e.preview || undefined,
        });
      } else if ((e.newCount ?? 0) > 0) {
        toast({ title: t('waInbox.toastNewWalker', { count: e.newCount }) });
      }
      // v1.4: emergency contacts arrive as a bare count (the room is shared
      // with users who cannot see them); only those who can get the notice.
      if ((e.contactCount ?? 0) > 0 && useAuthPermissions().hasPermission('participant:health')) {
        toast({ title: t('waInbox.toastNewContact', { count: e.contactCount }) });
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
    rawMediaByMessageId.value = {};
    activeChatJid.value = null;
    openedFromWalkerId.value = null;
  }

  return {
    links,
    inboxEnabled,
    totalUnread,
    searchResults,
    conversations,
    activeChatJid,
    activeConversation,
    activeWalkerId,
    threadMessages,
    loadingLinks,
    loadingConversations,
    loadingThread,
    realtimeConnected,
    mediaByMessageId,
    rawMediaByMessageId,
    loadingMedia,
    loadRawMedia,
    linkPayment,
    addAsLetter,
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
