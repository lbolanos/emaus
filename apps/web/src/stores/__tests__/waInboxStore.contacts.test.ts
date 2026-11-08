import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { WaConversationDto } from '@repo/types';

/**
 * Inbox v1.4 store: the walker a chat is about (activeWalkerId, the group it
 * was opened from) and the emergency-contact notice, shown only to users who
 * can see contacts (participant:health).
 */
const mocks = vi.hoisted(() => ({
  handlers: {} as Record<string, ((...args: any[]) => void) | undefined>,
  toast: vi.fn(),
  hasPermission: vi.fn(),
  conversations: [] as WaConversationDto[],
}));

vi.mock('@/services/realtime', () => ({
  getSocket: () => ({
    connected: true,
    on: (event: string, fn: (...args: any[]) => void) => {
      mocks.handlers[event] = fn;
    },
    off: vi.fn(),
    emit: vi.fn(),
  }),
}));
vi.mock('@/services/api', () => ({
  getWaConversations: vi.fn(async () => ({ conversations: mocks.conversations })),
  getWaMessages: vi.fn().mockResolvedValue({ messages: [] }),
  markWaChatSeen: vi.fn().mockResolvedValue({ ok: true }),
  getWaUnreadCount: vi.fn().mockResolvedValue({ total: 0 }),
  getWaThreadMedia: vi.fn().mockResolvedValue({ media: {}, skipped: 0 }),
}));
vi.mock('@repo/ui', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/composables/useAuthPermissions', () => ({
  useAuthPermissions: () => ({ hasPermission: mocks.hasPermission }),
}));
vi.mock('@/i18n', () => ({
  default: { global: { t: (key: string, params?: { count?: number }) => `${key}:${params?.count}` } },
}));

import { useWaInboxStore } from '../waInboxStore';

const uncle: WaConversationDto = {
  chatJid: '5215533333333@s.whatsapp.net',
  chatPhone: '5215533333333',
  senderKind: 'emergency_contact',
  contact: { name: 'Pedro', relation: 'Tío', slot: 2 },
  forWalkers: [
    { participantId: 'w-juan', firstName: 'Juan', lastName: 'Pérez' },
    { participantId: 'w-ana', firstName: 'Ana', lastName: 'Pérez' },
  ],
  participantId: 'w-juan',
  participantFirstName: 'Juan',
  participantLastName: 'Pérez',
  country: 'MX',
  lastMessageAt: '2026-11-07T10:00:00Z',
  lastMessagePreview: 'hola',
  messageCount: 1,
  unreadCount: 0,
};

describe('waInboxStore v1.4', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.toast.mockClear();
    mocks.hasPermission.mockReset();
    mocks.conversations = [uncle];
    Object.keys(mocks.handlers).forEach((k) => delete mocks.handlers[k]);
  });

  it('activeWalkerId follows the group the chat was opened from', async () => {
    const store = useWaInboxStore();
    await store.fetchConversations('r1');

    await store.openChat('r1', uncle.chatJid, 'w-ana');
    expect(store.activeWalkerId).toBe('w-ana');

    // Without a group (search, deep link) or with a walker that is not the
    // chat's: the chat's first walker.
    await store.openChat('r1', uncle.chatJid);
    expect(store.activeWalkerId).toBe('w-juan');
    await store.openChat('r1', uncle.chatJid, 'someone-else');
    expect(store.activeWalkerId).toBe('w-juan');
  });

  it('notifies contact messages only with participant:health', () => {
    const store = useWaInboxStore();
    store.subscribeRealtime('r1');
    const fire = () =>
      mocks.handlers['inbox:changed']?.({ retreatId: 'r1', newCount: 0, senderName: null, contactCount: 2 });

    mocks.hasPermission.mockReturnValue(false);
    fire();
    expect(mocks.toast).not.toHaveBeenCalled();

    mocks.hasPermission.mockReturnValue(true);
    fire();
    expect(mocks.hasPermission).toHaveBeenCalledWith('participant:health');
    expect(mocks.toast).toHaveBeenCalledWith({ title: 'waInbox.toastNewContact:2' });
  });

  it('a walker message keeps its named toast', () => {
    const store = useWaInboxStore();
    store.subscribeRealtime('r1');
    mocks.handlers['inbox:changed']?.({
      retreatId: 'r1',
      newCount: 1,
      senderName: 'Juan Pérez',
      preview: 'ya pagué',
      contactCount: 0,
    });
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith({ title: 'Juan Pérez', description: 'ya pagué' });
  });
});
