import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import WaChatThread from '../WaChatThread.vue';
import type { WaConversationDto, WaInboxMessageDto } from '@repo/types';

// El mock global de vue-i18n devuelve la key cruda; para este test de texto
// visible usamos las cadenas reales de es.json.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'waInbox.selectChat': 'Elige una conversación',
        'waInbox.multimedia': '📎 Multimedia (ábreselo en WhatsApp)',
        'waInbox.reply': 'Responder desde mi WhatsApp',
        'waInbox.threadEmpty': 'Sin mensajes en este chat todavía.',
      })[key] ?? key,
  }),
}));

/**
 * El contenido de los mensajes es TEXTO DE TERCEROS: payloads maliciosos se
 * renderizan inertes (interpolación, jamás v-html — S8 de specs/whatsapp-inbox).
 * La multimedia no se descarga: placeholder con el tipo (D9).
 */
const conversation: WaConversationDto = {
  chatJid: '5215512345678@s.whatsapp.net',
  chatPhone: '5215512345678',
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
  it('muestra el cuerpo del mensaje como texto sin interpretar HTML', () => {
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
    // El payload se ve como texto escapado.
    expect(wrapper.text()).toContain('<img src=x');
  });

  it('multimedia: placeholder en lugar de contenido (D9)', () => {
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

    expect(wrapper.text()).toContain('📎 Multimedia');
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('sin conversación activa muestra el estado vacío', () => {
    const wrapper = mount(WaChatThread, {
      props: { conversation: null, loading: false, messages: [] },
    });

    expect(wrapper.text()).toContain('Elige una conversación');
    expect(wrapper.find('[data-testid="wa-reply-button"]').exists()).toBe(false);
  });

  it('conversación con país MX arma el deep link con lada desde el JID', () => {
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
    // El link real se calcula en el script; este test fija que el botón existe
    // con un teléfono MX válido (52 + 10 dígitos en el JID).
  });
});
