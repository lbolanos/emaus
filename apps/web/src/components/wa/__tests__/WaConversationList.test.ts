import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import WaConversationList from '../WaConversationList.vue';
import type { WaConversationDto } from '@repo/types';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) =>
      ({
        'waInbox.and': 'y',
        'waInbox.you': 'Tú',
        'waInbox.awaitingReply': 'Sin responder',
        'waInbox.answeredBy': `Respondió ${params?.name ?? ''}`,
        'waInbox.media.image': '📷 Foto',
      })[key] ?? key,
  }),
}));

const base: WaConversationDto = {
  chatJid: '5215511406977@s.whatsapp.net',
  chatPhone: '5215511406977',
  participantId: 'p1',
  participantFirstName: 'Ana',
  participantLastName: 'López',
  country: 'MX',
  lastMessageAt: '2026-11-07T10:00:00Z',
  lastMessagePreview: null,
  lastMessageType: 'image',
  messageCount: 2,
  unreadCount: 0,
};

const mountList = (conversation: WaConversationDto) =>
  mount(WaConversationList, {
    props: { conversations: [conversation], activeChatJid: null, loading: false, emptyText: '' },
  });

describe('WaConversationList (v1.3)', () => {
  it('labels media by type and flags chats awaiting a reply', () => {
    const wrapper = mountList({ ...base, awaitingReply: true });
    expect(wrapper.text()).toContain('📷 Foto');
    expect(wrapper.find('[data-testid="wa-awaiting-reply"]').exists()).toBe(true);
  });

  it('shows who answered and prefixes the staff reply preview', () => {
    const wrapper = mountList({
      ...base,
      lastMessagePreview: 'Te esperamos',
      lastMessageType: 'text',
      lastMessageFromMe: true,
      lastReplyByName: 'Leo',
      awaitingReply: false,
    });
    expect(wrapper.text()).toContain('Leo: Te esperamos');
    expect(wrapper.find('[data-testid="wa-answered-by"]').text()).toContain('Respondió Leo');
  });

  it('names both walkers when a couple shares the phone', () => {
    const wrapper = mountList({
      ...base,
      sharedWith: [{ id: 'p2', firstName: 'Beto', lastName: 'Ruiz' }],
    });
    expect(wrapper.text()).toContain('Ana López y Beto Ruiz');
  });
});
