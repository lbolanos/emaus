import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock del singleton de realtime (molde messageSequenceStore.realtime.test.ts).
const socketHandlers: Record<string, ((...args: any[]) => void) | undefined> = {};
const emitMock = vi.fn();
const offMock = vi.fn((event: string) => {
  socketHandlers[event] = undefined;
});
const onMock = vi.fn((event: string, fn: (...args: any[]) => void) => {
  socketHandlers[event] = fn;
});
const fakeSocket = {
  connected: true,
  on: onMock,
  off: offMock,
  emit: emitMock,
};

vi.mock('@/services/realtime', () => ({
  getSocket: () => fakeSocket,
}));

vi.mock('@/services/api', () => ({
  getWaLinks: vi.fn().mockResolvedValue({ links: [] }),
  getWaConversations: vi.fn().mockResolvedValue({ conversations: [] }),
  getWaMessages: vi.fn().mockResolvedValue({ messages: [] }),
  markWaChatSeen: vi.fn().mockResolvedValue({ ok: true }),
  startWaLink: vi.fn(),
  unlinkWaLink: vi.fn().mockResolvedValue({ ok: true }),
}));

import { useWaInboxStore } from '../waInboxStore';
import { getWaLinks, getWaConversations, getWaMessages, markWaChatSeen } from '@/services/api';

const linksMock = vi.mocked(getWaLinks);
const conversationsMock = vi.mocked(getWaConversations);
const messagesMock = vi.mocked(getWaMessages);
const seenMock = vi.mocked(markWaChatSeen);

describe('waInboxStore.subscribeRealtime', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    emitMock.mockClear();
    onMock.mockClear();
    offMock.mockClear();
    linksMock.mockClear();
    conversationsMock.mockClear();
    messagesMock.mockClear();
    seenMock.mockClear();
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
    fakeSocket.connected = true;
  });

  it('emite inbox:subscribe con el retreatId', () => {
    const store = useWaInboxStore();
    store.subscribeRealtime('retreat-1');

    expect(emitMock).toHaveBeenCalledWith('inbox:subscribe', 'retreat-1', expect.any(Function));
  });

  it('marca realtimeConnected=true cuando el servidor acepta', () => {
    const store = useWaInboxStore();
    store.subscribeRealtime('retreat-1');
    const ack = emitMock.mock.calls[0][2] as (ok: boolean) => void;
    ack(true);

    expect(store.realtimeConnected).toBe(true);
  });

  it('re-join al reconectar y refetch de conversaciones en inbox:changed', async () => {
    conversationsMock.mockResolvedValue({ conversations: [] });
    messagesMock.mockResolvedValue({ messages: [] });
    const store = useWaInboxStore();
    store.subscribeRealtime('retreat-1');

    const join = socketHandlers['connect'] as () => void;
    join();
    expect(emitMock).toHaveBeenCalledTimes(2);

    const listener = socketHandlers['inbox:changed'] as (e: { retreatId: string }) => void;
    listener({ retreatId: 'retreat-1' });
    await vi.waitFor(() => {
      expect(conversationsMock).toHaveBeenCalledWith('retreat-1');
    });
  });

  it('ignora eventos de otro retiro', () => {
    const store = useWaInboxStore();
    store.subscribeRealtime('retreat-1');
    conversationsMock.mockClear();

    const listener = socketHandlers['inbox:changed'] as (e: { retreatId: string }) => void;
    listener({ retreatId: 'retreat-OTRO' });

    expect(conversationsMock).not.toHaveBeenCalled();
  });

  it('unsubscribe emite inbox:unsubscribe y desengancha handlers', () => {
    const store = useWaInboxStore();
    store.subscribeRealtime('retreat-1');
    emitMock.mockClear();

    const unsubscribe = (store as unknown as { reset: () => void }).reset;
    unsubscribe();

    expect(emitMock).toHaveBeenCalledWith('inbox:unsubscribe', 'retreat-1');
    expect(socketHandlers['inbox:changed']).toBeUndefined();
    expect(store.realtimeConnected).toBe(false);
  });
});

describe('waInboxStore.openChat', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    messagesMock.mockClear();
    seenMock.mockClear();
  });

  it('carga el hilo, marca seen en el servidor y limpia el badge local', async () => {
    messagesMock.mockResolvedValue({
      messages: [
        { id: 'm2', chatJid: 'chat-a', timestamp: '2026-11-05T15:02:00Z', body: 'segundo', messageType: 'text' },
        { id: 'm1', chatJid: 'chat-a', timestamp: '2026-11-05T15:00:00Z', body: 'primero', messageType: 'text' },
      ],
    });
    const store = useWaInboxStore();
    store.conversations = [
      {
        chatJid: 'chat-a',
        chatPhone: '5215512345678',
        participantId: 'p1',
        participantFirstName: 'Ana',
        participantLastName: 'López',
        country: 'MX',
        lastMessageAt: '2026-11-05T15:02:00Z',
        lastMessagePreview: 'segundo',
        messageCount: 2,
        unreadCount: 2,
      },
    ];

    await store.openChat('retreat-1', 'chat-a');

    // El hilo queda en orden cronológico (el API manda DESC, el store invierte).
    expect(store.threadMessages.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(store.activeChatJid).toBe('chat-a');
    expect(seenMock).toHaveBeenCalledWith('retreat-1', 'chat-a');
    expect(store.conversations[0].unreadCount).toBe(0);
  });
});
