import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock the realtime singleton. The store imports getSocket from this module.
const socketHandlers: Record<string, ((...args: any[]) => void) | undefined> = {};
const emitMock = vi.fn();
const offMock = vi.fn((event: string, _fn: any) => {
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

// Mock the api service: only the two fetchers the realtime listener refetches.
vi.mock('@/services/api', () => ({
  getSequenceQueue: vi.fn().mockResolvedValue([]),
  getSequenceStats: vi
    .fn()
    .mockResolvedValue({ stats: {}, issues: [], issuesTotal: 0 }),
}));

// Import after mocks so they are in effect.
import { useMessageSequenceStore } from '../messageSequenceStore';
import { getSequenceQueue, getSequenceStats } from '@/services/api';

const queueMock = vi.mocked(getSequenceQueue);
const statsMock = vi.mocked(getSequenceStats);

describe('messageSequenceStore.subscribeRealtime', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    emitMock.mockClear();
    onMock.mockClear();
    offMock.mockClear();
    queueMock.mockClear();
    statsMock.mockClear();
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
    fakeSocket.connected = true;
  });

  // ─── Subscribe & join ─────────────────────────────────────────────────────

  it('emits sequences:subscribe with the retreatId on connect', () => {
    const store = useMessageSequenceStore();
    store.subscribeRealtime('retreat-1');

    expect(emitMock).toHaveBeenCalledWith(
      'sequences:subscribe',
      'retreat-1',
      expect.any(Function),
    );
  });

  it('marks realtimeConnected=true when the server acks the subscription', () => {
    const store = useMessageSequenceStore();
    store.subscribeRealtime('retreat-1');

    const [, , ack] = emitMock.mock.calls.find((c) => c[0] === 'sequences:subscribe')!;
    ack(true);
    expect(store.realtimeConnected).toBe(true);
  });

  it('keeps realtimeConnected=false when the server rejects the subscription', () => {
    const store = useMessageSequenceStore();
    store.subscribeRealtime('retreat-1');

    const [, , ack] = emitMock.mock.calls.find((c) => c[0] === 'sequences:subscribe')!;
    ack(false);
    expect(store.realtimeConnected).toBe(false);
  });

  // ─── Event routing ─────────────────────────────────────────────────────────

  it('refetches queue and stats when the event matches the subscribed retreat', () => {
    const store = useMessageSequenceStore();
    store.subscribeRealtime('retreat-1');

    socketHandlers['sequences:queue-changed']?.({
      retreatId: 'retreat-1',
      action: 'dispatched',
      scheduledMessageIds: ['sm-1'],
    });

    expect(queueMock).toHaveBeenCalledWith('retreat-1');
    expect(statsMock).toHaveBeenCalledWith('retreat-1');
  });

  it('ignores queue-changed events for other retreats (room isolation safety)', () => {
    const store = useMessageSequenceStore();
    store.subscribeRealtime('retreat-1');

    socketHandlers['sequences:queue-changed']?.({
      retreatId: 'retreat-OTHER',
      action: 'enqueued',
      scheduledMessageIds: ['sm-x'],
    });

    expect(queueMock).not.toHaveBeenCalled();
    expect(statsMock).not.toHaveBeenCalled();
  });

  // ─── Unsubscribe ──────────────────────────────────────────────────────────

  it('unsubscribe emits sequences:unsubscribe with the retreatId', () => {
    const store = useMessageSequenceStore();
    const unsubscribe = store.subscribeRealtime('retreat-1');

    unsubscribe();

    expect(emitMock).toHaveBeenCalledWith('sequences:unsubscribe', 'retreat-1');
  });

  it('unsubscribe removes listeners and clears connected state', () => {
    const store = useMessageSequenceStore();
    const unsubscribe = store.subscribeRealtime('retreat-1');
    // Simulate server ack so realtimeConnected flips to true first.
    const [, , ack] = emitMock.mock.calls.find((c) => c[0] === 'sequences:subscribe')!;
    ack(true);
    expect(store.realtimeConnected).toBe(true);

    unsubscribe();

    expect(offMock).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(offMock).toHaveBeenCalledWith('sequences:queue-changed', expect.any(Function));
    expect(store.realtimeConnected).toBe(false);
  });

  // ─── Retreat switch (MessageSequencesView behavior) ───────────────────────

  it('after unsubscribe + resubscribe to a different retreat, only the new retreat refetches', () => {
    const store = useMessageSequenceStore();
    const unsubOld = store.subscribeRealtime('retreat-1');
    unsubOld();
    store.subscribeRealtime('retreat-2');

    // Event for the old retreat must not trigger a refetch.
    socketHandlers['sequences:queue-changed']?.({
      retreatId: 'retreat-1',
      action: 'dispatched',
      scheduledMessageIds: ['sm-1'],
    });
    expect(queueMock).not.toHaveBeenCalled();

    // Event for the new retreat does.
    socketHandlers['sequences:queue-changed']?.({
      retreatId: 'retreat-2',
      action: 'enqueued',
      scheduledMessageIds: ['sm-2'],
    });
    expect(queueMock).toHaveBeenCalledWith('retreat-2');
    expect(statsMock).toHaveBeenCalledWith('retreat-2');
  });
});
