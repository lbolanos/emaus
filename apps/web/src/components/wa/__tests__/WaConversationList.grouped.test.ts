import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import WaConversationList from '../WaConversationList.vue';
import type { WaConversationDto } from '@repo/types';

/**
 * Inbox v1.4 (D23): conversations grouped by walker — the walker's own chat
 * and their emergency contacts' chats under one entry; a shared contact under
 * both walkers; a one-chat group opens directly.
 */
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      ({
        'waInbox.and': 'y',
        'waInbox.emergencyContact': 'contacto de emergencia',
        'waInbox.walkerChat': 'caminante',
        'waInbox.groupChats': `${params?.count} chats`,
        'waInbox.contactSlot': `Contacto ${params?.slot}`,
      })[key] ?? key,
  }),
}));

const juan = { participantId: 'w-juan', firstName: 'Juan', lastName: 'Pérez' };
const ana = { participantId: 'w-ana', firstName: 'Ana', lastName: 'Pérez' };

function chat(overrides: Partial<WaConversationDto>): WaConversationDto {
  return {
    chatJid: '5215500000000@s.whatsapp.net',
    chatPhone: '5215500000000',
    senderKind: 'walker',
    contact: null,
    forWalkers: [juan],
    participantId: juan.participantId,
    participantFirstName: juan.firstName,
    participantLastName: juan.lastName,
    country: 'MX',
    lastMessageAt: '2026-11-07T10:00:00Z',
    lastMessagePreview: 'hola',
    lastMessageType: 'text',
    messageCount: 1,
    unreadCount: 0,
    ...overrides,
  };
}

const juanChat = chat({ chatJid: '5215511111111@s.whatsapp.net', chatPhone: '5215511111111' });
const momChat = chat({
  chatJid: '5215522222222@s.whatsapp.net',
  chatPhone: '5215522222222',
  senderKind: 'emergency_contact',
  contact: { name: 'María', relation: 'Mamá', slot: 1 },
  lastMessageAt: '2026-11-07T11:00:00Z',
  unreadCount: 2,
});

const mountList = (conversations: WaConversationDto[], extra: Record<string, unknown> = {}) =>
  mount(WaConversationList, {
    props: { conversations, activeChatJid: null, loading: false, emptyText: '', ...extra },
  });

describe('WaConversationList grouped by walker (v1.4)', () => {
  it("groups the walker's chat and the contact's chat, own chat first, unread summed", () => {
    const wrapper = mountList([momChat, juanChat]);
    const group = wrapper.get('[data-testid="wa-group-w-juan"]');
    expect(group.get('[data-testid="wa-group-toggle-w-juan"]').text()).toContain('Juan Pérez');
    expect(group.get('[data-testid="wa-group-unread"]').text()).toBe('2');
    // Open by default: the group has unread messages.
    const rows = group.findAll('[data-testid^="wa-chat-row-"]');
    expect(rows.map((r) => r.attributes('data-testid'))).toEqual([
      'wa-chat-row-5215511111111',
      'wa-chat-row-5215522222222',
    ]);
    expect(rows[1].text()).toContain('Mamá — María');
    expect(rows[1].text()).toContain('contacto de emergencia');
  });

  it('collapses and expands a group by hand', async () => {
    const wrapper = mountList([{ ...momChat, unreadCount: 0 }, juanChat]);
    const toggle = wrapper.get('[data-testid="wa-group-toggle-w-juan"]');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(wrapper.findAll('[data-testid^="wa-chat-row-"]')).toHaveLength(0);
    await toggle.trigger('click');
    expect(wrapper.findAll('[data-testid^="wa-chat-row-"]')).toHaveLength(2);
  });

  it('a contact shared by two siblings shows under both, and selects with that walker', async () => {
    const uncle = chat({
      chatJid: '5215533333333@s.whatsapp.net',
      chatPhone: '5215533333333',
      senderKind: 'emergency_contact',
      contact: { name: 'Pedro', relation: 'Tío', slot: 2 },
      forWalkers: [juan, ana],
      unreadCount: 1,
    });
    const anaChat = chat({
      chatJid: '5215544444444@s.whatsapp.net',
      chatPhone: '5215544444444',
      forWalkers: [ana],
      participantId: ana.participantId,
      participantFirstName: 'Ana',
    });
    const wrapper = mountList([juanChat, anaChat, uncle]);

    const inAna = wrapper.get('[data-testid="wa-group-w-ana"]').get('[data-testid="wa-chat-row-5215533333333"]');
    expect(wrapper.get('[data-testid="wa-group-w-juan"]').find('[data-testid="wa-chat-row-5215533333333"]').exists()).toBe(true);
    await inAna.trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual([uncle.chatJid, 'w-ana']);
  });

  it('a one-chat group is a single row that opens the chat directly', async () => {
    const wrapper = mountList([momChat]);
    expect(wrapper.find('[data-testid="wa-group-toggle-w-juan"]').exists()).toBe(false);
    const row = wrapper.get('[data-testid="wa-chat-row-5215522222222"]');
    expect(row.text()).toContain('Juan Pérez');
    expect(row.get('[data-testid="wa-contact-label"]').text()).toContain('Mamá — María');
    await row.trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual([momChat.chatJid, 'w-juan']);
  });

  it('a couple sharing a phone is one group, and their contacts join it', () => {
    const couple = chat({ forWalkers: [juan, ana], sharedWith: [{ id: 'w-ana', firstName: 'Ana', lastName: 'Pérez' }] });
    const anasMom = chat({
      chatJid: '5215566666666@s.whatsapp.net',
      chatPhone: '5215566666666',
      senderKind: 'emergency_contact',
      contact: { name: '', relation: '', slot: 2 },
      forWalkers: [ana],
      unreadCount: 1,
    });
    const wrapper = mountList([couple, anasMom]);
    const groups = wrapper.findAll('[data-testid^="wa-group-w-"]').filter((g) => !g.attributes('data-testid')!.includes('toggle'));
    expect(groups).toHaveLength(1);
    expect(groups[0].text()).toContain('Juan Pérez y Ana Pérez');
    // No name or relation on record: labeled by slot.
    expect(groups[0].text()).toContain('Contacto 2');
  });

  it('highlights a shared chat only in the group it was opened from', () => {
    const uncle = chat({
      chatJid: '5215533333333@s.whatsapp.net',
      chatPhone: '5215533333333',
      senderKind: 'emergency_contact',
      contact: { name: 'Pedro', relation: 'Tío', slot: 2 },
      forWalkers: [juan, ana],
    });
    const wrapper = mountList([uncle], { activeChatJid: uncle.chatJid, activeWalkerId: 'w-ana' });
    const juanRow = wrapper.get('[data-testid="wa-group-w-juan"]').get('[data-testid="wa-chat-row-5215533333333"]');
    const anaRow = wrapper.get('[data-testid="wa-group-w-ana"]').get('[data-testid="wa-chat-row-5215533333333"]');
    expect(anaRow.classes()).toContain('bg-muted');
    expect(juanRow.classes()).not.toContain('bg-muted');
  });
});
