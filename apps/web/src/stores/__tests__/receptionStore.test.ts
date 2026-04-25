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

// Import after mocks so the mock is in effect.
import { useReceptionStore } from '../receptionStore';

describe('receptionStore.subscribeRealtime', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    emitMock.mockClear();
    onMock.mockClear();
    offMock.mockClear();
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
    fakeSocket.connected = true;
  });

  // ─── Subscribe & join ─────────────────────────────────────────────────────

  it('emits reception:subscribe with the retreatId on connect', () => {
    const store = useReceptionStore();
    store.subscribeRealtime('retreat-1', {});

    expect(emitMock).toHaveBeenCalledWith('reception:subscribe', 'retreat-1', expect.any(Function));
  });

  it('marks connected=true when server acks the subscription', () => {
    const store = useReceptionStore();
    store.subscribeRealtime('retreat-1', {});

    const [, , ack] = emitMock.mock.calls.find((c) => c[0] === 'reception:subscribe')!;
    ack(true);
    expect(store.connected).toBe(true);
  });

  it('keeps connected=false when server rejects the subscription', () => {
    const store = useReceptionStore();
    store.subscribeRealtime('retreat-1', {});

    const [, , ack] = emitMock.mock.calls.find((c) => c[0] === 'reception:subscribe')!;
    ack(false);
    expect(store.connected).toBe(false);
  });

  // ─── Event routing ─────────────────────────────────────────────────────────

  it('fires onCheckin when the event matches the subscribed retreat', () => {
    const store = useReceptionStore();
    const onCheckin = vi.fn();
    store.subscribeRealtime('retreat-1', { onCheckin });

    socketHandlers['reception:checkin']?.({
      retreatId: 'retreat-1',
      participantId: 'p1',
      checkedIn: true,
      checkedInAt: '2026-04-23T12:00:00.000Z',
    });

    expect(onCheckin).toHaveBeenCalledTimes(1);
  });

  it('ignores checkin events for other retreats (room isolation safety)', () => {
    const store = useReceptionStore();
    const onCheckin = vi.fn();
    store.subscribeRealtime('retreat-1', { onCheckin });

    socketHandlers['reception:checkin']?.({
      retreatId: 'retreat-OTHER',
      participantId: 'p1',
      checkedIn: true,
      checkedInAt: null,
    });

    expect(onCheckin).not.toHaveBeenCalled();
  });

  it('fires onBagMade when the event matches the subscribed retreat', () => {
    const store = useReceptionStore();
    const onBagMade = vi.fn();
    store.subscribeRealtime('retreat-1', { onBagMade });

    socketHandlers['reception:bag-made']?.({
      retreatId: 'retreat-1',
      participantId: 'p1',
      bagMade: true,
    });

    expect(onBagMade).toHaveBeenCalledTimes(1);
  });

  // ─── Unsubscribe ──────────────────────────────────────────────────────────

  it('unsubscribe emits reception:unsubscribe with the retreatId', () => {
    const store = useReceptionStore();
    const unsubscribe = store.subscribeRealtime('retreat-1', {});

    unsubscribe();

    expect(emitMock).toHaveBeenCalledWith('reception:unsubscribe', 'retreat-1');
  });

  it('unsubscribe removes listeners and clears connected state', () => {
    const store = useReceptionStore();
    const onCheckin = vi.fn();
    const unsubscribe = store.subscribeRealtime('retreat-1', { onCheckin });
    // Simulate server ack so connected flips to true first.
    const [, , ack] = emitMock.mock.calls.find((c) => c[0] === 'reception:subscribe')!;
    ack(true);
    expect(store.connected).toBe(true);

    unsubscribe();

    expect(offMock).toHaveBeenCalledWith('reception:checkin', expect.any(Function));
    expect(offMock).toHaveBeenCalledWith('reception:bag-made', expect.any(Function));
    expect(store.connected).toBe(false);
  });

  // ─── Retreat switch (RecepcionView behavior) ──────────────────────────────

  it('after unsubscribe + resubscribe to a different retreat, only the new retreat fires handlers', () => {
    const store = useReceptionStore();
    const oldHandler = vi.fn();
    const newHandler = vi.fn();

    const unsubOld = store.subscribeRealtime('retreat-1', { onCheckin: oldHandler });
    unsubOld();
    store.subscribeRealtime('retreat-2', { onCheckin: newHandler });

    // Event for old retreat must not fire the new handler.
    socketHandlers['reception:checkin']?.({
      retreatId: 'retreat-1',
      participantId: 'p1',
      checkedIn: true,
      checkedInAt: null,
    });
    expect(newHandler).not.toHaveBeenCalled();

    // Event for new retreat fires the new handler.
    socketHandlers['reception:checkin']?.({
      retreatId: 'retreat-2',
      participantId: 'p2',
      checkedIn: true,
      checkedInAt: null,
    });
    expect(newHandler).toHaveBeenCalledTimes(1);
    expect(oldHandler).not.toHaveBeenCalled();
  });
});
