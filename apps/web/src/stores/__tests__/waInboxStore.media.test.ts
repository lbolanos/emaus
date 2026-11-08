import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const api = vi.hoisted(() => ({
  getWaMessages: vi.fn(),
  getWaThreadMedia: vi.fn(),
  getWaRawMedia: vi.fn(),
  linkWaMessagePayment: vi.fn(),
  addWaMessageAsLetter: vi.fn(),
  markWaChatSeen: vi.fn(),
  getWaUnreadCount: vi.fn(),
}));

vi.mock('@/services/realtime', () => ({
  getSocket: () => ({ connected: false, on: vi.fn(), off: vi.fn(), emit: vi.fn() }),
}));
vi.mock('@/services/api', () => ({
  ...api,
  getWaLinks: vi.fn(),
  getWaLinkStatus: vi.fn(),
  getWaConversations: vi.fn(),
  getWaReceiptDataUrl: vi.fn(),
  searchWaMessages: vi.fn(),
  markWaAllSeen: vi.fn(),
  startWaLink: vi.fn(),
  unlinkWaLink: vi.fn(),
  setWaBridgeEnabled: vi.fn(),
  terminateWaBridgeAll: vi.fn(),
}));

import { useWaInboxStore } from '../waInboxStore';

const RETREAT = 'r1';
const message = (i: number, messageType = 'image') => ({
  id: `m${i}`,
  chatJid: '5215511406977@s.whatsapp.net',
  timestamp: new Date(Date.UTC(2026, 10, 7, 10, i)).toISOString(),
  body: null,
  messageType,
});

describe('waInboxStore media (v1.3)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    Object.values(api).forEach((fn) => fn.mockReset());
    api.markWaChatSeen.mockResolvedValue({ ok: true });
    api.getWaUnreadCount.mockResolvedValue({ total: 0 });
    api.getWaThreadMedia.mockResolvedValue({ media: {}, skipped: 0 });
  });

  it('asks thumbnails for the 30 MOST RECENT images of the thread', async () => {
    // API returns newest first; the store keeps the thread chronological.
    const messages = Array.from({ length: 40 }, (_, i) => message(i)).reverse();
    api.getWaMessages.mockResolvedValue({ messages });
    const store = useWaInboxStore();

    await store.openChat(RETREAT, messages[0].chatJid);
    await vi.waitFor(() => expect(api.getWaThreadMedia).toHaveBeenCalled());

    const ids: string[] = api.getWaThreadMedia.mock.calls[0][1];
    expect(ids).toHaveLength(30);
    expect(ids[0]).toBe('m10');
    expect(ids[29]).toBe('m39');
  });

  it('downloads a voice note once per session', async () => {
    api.getWaRawMedia.mockResolvedValue({ dataUrl: 'data:audio/ogg;base64,AA', mime: 'audio/ogg', fileName: null, sizeBytes: 1 });
    const store = useWaInboxStore();

    await store.loadRawMedia('a1');
    await store.loadRawMedia('a1');

    expect(api.getWaRawMedia).toHaveBeenCalledTimes(1);
    expect(store.rawMediaByMessageId.a1.mime).toBe('audio/ogg');
  });

  it('links the payment and refreshes the open thread', async () => {
    api.getWaMessages.mockResolvedValue({ messages: [message(1, 'text')] });
    api.linkWaMessagePayment.mockResolvedValue({ ok: true, paymentId: 'pay-1' });
    const store = useWaInboxStore();
    await store.openChat(RETREAT, message(1).chatJid);
    api.getWaMessages.mockClear();

    await store.linkPayment(RETREAT, 'm1', 'pay-1');

    expect(api.linkWaMessagePayment).toHaveBeenCalledWith('m1', 'pay-1');
    expect(api.getWaMessages).toHaveBeenCalledTimes(1);
  });
});
