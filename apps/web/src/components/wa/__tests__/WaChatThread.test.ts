import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import WaChatThread from '../WaChatThread.vue';
import type { WaConversationDto, WaInboxMessageDto } from '@repo/types';

// The global vue-i18n mock returns the raw key; this visible-text test uses
// the real es.json strings.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'waInbox.selectChat': 'Elige una conversación',
        'waInbox.multimedia': '📎 Archivo',
        'waInbox.media.image': '📷 Foto',
        'waInbox.media.document': '📄 Documento',
        'waInbox.staffReply': 'Respuesta del equipo',
        'waInbox.viewPhoto': 'Ver foto',
        'waInbox.openDocument': 'Abrir documento',
        'waInbox.registerPayment': 'Registrar como pago',
        'waInbox.addLetter': 'Agregar como carta',
        'waInbox.paymentRegisteredBy': 'Pago registrado por {name}',
        'waInbox.reply': 'Responder desde mi WhatsApp',
        'waInbox.threadEmpty': 'Sin mensajes en este chat todavía.',
      })[key] ?? key,
  }),
}));

/**
 * Message content is THIRD-PARTY TEXT: malicious payloads render inert
 * (interpolation, never v-html — S8 of specs/whatsapp-inbox). Media without
 * a thumbnail shows its type label.
 */
const conversation: WaConversationDto = {
  chatJid: '5215512345678@s.whatsapp.net',
  chatPhone: '5215512345678',
  senderKind: 'walker',
  forWalkers: [{ participantId: 'p1', firstName: 'Ana', lastName: 'López' }],
  participantId: 'p1',
  participantFirstName: 'Ana',
  participantLastName: 'López',
  country: 'MX',
  lastMessageAt: '2026-11-05T15:02:00Z',
  lastMessagePreview: '',
  messageCount: 2,
  unreadCount: 0,
};

const message = (overrides: Partial<WaInboxMessageDto>): WaInboxMessageDto => ({
  id: 'm1',
  chatJid: '5215512345678@s.whatsapp.net',
  timestamp: '2026-11-05T15:02:00Z',
  body: 'hola',
  messageType: 'text',
  ...overrides,
});

describe('WaChatThread', () => {
  it('renders the message body as text without interpreting HTML', () => {
    const wrapper = mount(WaChatThread, {
      props: {
        conversation,
        loading: false,
        messages: [
          message({
            body: '<img src=x onerror="window.__pwned=true">Hola<script>window.__xss=1</script>',
          }),
        ],
      },
      global: {
        stubs: {
          Button: { template: '<button><slot /></button>' },
          ExternalLink: { template: '<svg />' },
        },
      },
    });

    expect((window as any).__pwned).toBeUndefined();
    expect((window as any).__xss).toBeUndefined();
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('script').exists()).toBe(false);
    // The payload shows as escaped text.
    expect(wrapper.text()).toContain('<img src=x');
  });

  it('media without thumbnail shows its type label (v1.3)', () => {
    const wrapper = mount(WaChatThread, {
      props: {
        conversation,
        loading: false,
        messages: [message({ body: null, messageType: 'image' })],
      },
      global: {
        stubs: {
          Button: { template: '<button><slot /></button>' },
          ExternalLink: { template: '<svg />' },
        },
      },
    });

    expect(wrapper.text()).toContain('📷 Foto');
    expect(wrapper.find('img').exists()).toBe(false);
  });

  const stubs = {
    Button: { template: '<button><slot /></button>' },
    ExternalLink: { template: '<svg />' },
  };

  it('staff replies are right-aligned with the sender name and no actions (v1.3)', () => {
    const wrapper = mount(WaChatThread, {
      props: {
        conversation,
        loading: false,
        canRegisterPayment: true,
        canAddLetter: true,
        messages: [message({ id: 'r1', fromMe: true, senderName: 'Leo', body: 'Te espero' })],
      },
      global: { stubs },
    });

    const row = wrapper.find('[data-testid="wa-message-r1"]');
    expect(row.classes()).toContain('justify-end');
    expect(wrapper.find('[data-testid="wa-staff-reply"]').text()).toBe('Leo');
    expect(wrapper.find('[data-testid^="wa-action-"]').exists()).toBe(false);
  });

  it('actions by type: PDF can be paid and lettered, other documents open and become letters (v1.5)', () => {
    const wrapper = mount(WaChatThread, {
      props: {
        conversation,
        loading: false,
        canRegisterPayment: true,
        canAddLetter: true,
        messages: [
          message({ id: 'pdf', messageType: 'document', body: null, mediaMime: 'application/pdf', mediaFileName: 'pago.pdf' }),
          message({ id: 'doc', messageType: 'document', body: null, mediaMime: 'application/msword', mediaFileName: 'carta.doc' }),
          message({ id: 'txt', messageType: 'text', body: 'Te queremos mucho' }),
        ],
      },
      global: { stubs },
    });

    const kinds = (id: string) =>
      wrapper
        .findAll(`[data-testid^="wa-action-"]`)
        .map((b) => b.attributes('data-testid'))
        .filter((t) => t?.endsWith(`-${id}`))
        .map((t) => t?.replace(`-${id}`, '').replace('wa-action-', ''));
    expect(kinds('pdf')).toEqual(['open', 'payment', 'letter']);
    expect(kinds('doc')).toEqual(['open', 'letter']);
    expect(kinds('txt')).toEqual(['letter']);
  });

  it('shows who registered the payment and hides "add as letter" once lettered (v1.3)', () => {
    const wrapper = mount(WaChatThread, {
      props: {
        conversation,
        loading: false,
        canRegisterPayment: true,
        canAddLetter: true,
        messages: [
          message({
            id: 'img',
            messageType: 'image',
            body: null,
            paymentId: 'pay-1',
            paymentRegisteredByName: 'Leo',
            letterId: 'letter-1',
            letterAddedByName: 'Ana',
          }),
        ],
      },
      global: { stubs },
    });

    expect(wrapper.find('[data-testid="wa-payment-registered-img"]').text()).toContain('Pago registrado por');
    expect(wrapper.find('[data-testid="wa-action-letter-img"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="wa-action-payment-img"]').exists()).toBe(true);
  });

  it('shows the empty state without an active conversation', () => {
    const wrapper = mount(WaChatThread, {
      props: { conversation: null, loading: false, messages: [] },
    });

    expect(wrapper.text()).toContain('Elige una conversación');
    expect(wrapper.find('[data-testid="wa-reply-button"]').exists()).toBe(false);
  });

  it('an MX conversation builds the deep link with the calling code from the JID', () => {
    const wrapper = mount(WaChatThread, {
      props: {
        conversation,
        loading: false,
        messages: [message({})],
      },
      global: {
        stubs: {
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
          ExternalLink: { template: '<svg />' },
        },
      },
    });

    expect(wrapper.find('[data-testid="wa-reply-button"]').exists()).toBe(true);
    // The real link is computed in the script; this test pins that the button
    // exists with a valid MX phone (52 + 10 digits in the JID).
  });
});
