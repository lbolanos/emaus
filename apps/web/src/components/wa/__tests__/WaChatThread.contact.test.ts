import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import WaChatThread from '../WaChatThread.vue';
import type { Participant, WaConversationDto } from '@repo/types';

/**
 * Inbox v1.4: an emergency contact's chat says whose contact it is, offers no
 * templated reply (the dialog defaults to the walker's phone), carries the
 * quick phone editor of the walker and the desktop "expand" toggle.
 */
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      ({
        'waInbox.and': 'y',
        'waInbox.contactOfWalker': `Contacto de emergencia de ${params?.walker}`,
        'waInbox.expandThread': 'Ampliar conversación',
        'waInbox.collapseThread': 'Mostrar la lista',
      })[key] ?? key,
  }),
}));

const contactChat: WaConversationDto = {
  chatJid: '5215522222222@s.whatsapp.net',
  chatPhone: '5215522222222',
  senderKind: 'emergency_contact',
  contact: { name: 'María', relation: 'Mamá', slot: 1 },
  forWalkers: [{ participantId: 'w-juan', firstName: 'Juan', lastName: 'Pérez' }],
  participantId: 'w-juan',
  participantFirstName: 'Juan',
  participantLastName: 'Pérez',
  country: 'MX',
  lastMessageAt: '2026-11-07T10:00:00Z',
  lastMessagePreview: 'hola',
  messageCount: 1,
  unreadCount: 0,
};

const mountThread = (props: Record<string, unknown>) =>
  mount(WaChatThread, {
    props: { messages: [], loading: false, conversation: contactChat, ...props },
    global: { stubs: { ParticipantInfoPopover: true, ParticipantQuickPhoneEditor: true } },
  });

describe('WaChatThread — emergency contact chat (v1.4)', () => {
  it('names the contact and the walker, and hides the templated reply', () => {
    const wrapper = mountThread({});
    expect(wrapper.get('[data-testid="wa-thread-title"]').text()).toContain('Mamá — María');
    expect(wrapper.get('[data-testid="wa-thread-contact-of"]').text()).toBe(
      'Contacto de emergencia de Juan Pérez',
    );
    expect(wrapper.find('[data-testid="wa-reply-template"]').exists()).toBe(false);
    // The deep link still opens the contact's own chat.
    expect(wrapper.find('[data-testid="wa-reply-button"]').exists()).toBe(true);
  });

  it("a walker's chat keeps the templated reply", () => {
    const wrapper = mountThread({
      conversation: { ...contactChat, senderKind: 'walker', contact: null },
    });
    expect(wrapper.get('[data-testid="wa-thread-title"]').text()).toBe('Juan Pérez');
    expect(wrapper.find('[data-testid="wa-thread-contact-of"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="wa-reply-template"]').exists()).toBe(true);
  });

  it('shows the quick phone editor for the walker and emits phones-saved', async () => {
    const walker = { id: 'w-juan', firstName: 'Juan', lastName: 'Pérez' } as Participant;
    const wrapper = mountThread({ popoverParticipant: walker, phoneCountry: 'México' });
    const editor = wrapper.findComponent({ name: 'ParticipantQuickPhoneEditor' });
    expect(editor.exists()).toBe(true);
    expect(editor.props('participant')).toEqual(walker);
    expect(editor.props('country')).toBe('México');
    editor.vm.$emit('saved', {});
    expect(wrapper.emitted('phones-saved')).toHaveLength(1);
  });

  it('toggles "expand conversation"', async () => {
    const wrapper = mountThread({ expanded: false });
    const button = wrapper.get('[data-testid="wa-thread-expand"]');
    expect(button.attributes('aria-label')).toBe('Ampliar conversación');
    expect(button.attributes('aria-pressed')).toBe('false');
    await button.trigger('click');
    expect(wrapper.emitted('toggle-expand')).toHaveLength(1);
    await wrapper.setProps({ expanded: true });
    expect(wrapper.get('[data-testid="wa-thread-expand"]').attributes('aria-label')).toBe('Mostrar la lista');
  });
});
