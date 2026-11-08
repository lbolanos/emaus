import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import WaChatThread from '../WaChatThread.vue';
import type { WaConversationDto, WaInboxMessageDto } from '@repo/types';

/**
 * Inbox v1.5 (D26): a document shows what it is, a tap on a document or a
 * video opens the file viewer, and any document can become a letter (payments
 * still take only images and PDFs).
 */
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'waInbox.viewer.kind.word': 'Documento de Word',
        'waInbox.openDocument': 'Abrir documento',
        'waInbox.playVideo': 'Ver video',
        'waInbox.addLetter': 'Agregar como carta',
        'waInbox.registerPayment': 'Registrar como pago',
      })[key] ?? key,
  }),
}));

const conversation: WaConversationDto = {
  chatJid: '5215511111111@s.whatsapp.net',
  chatPhone: '5215511111111',
  senderKind: 'walker',
  forWalkers: [{ participantId: 'p1', firstName: 'Juan', lastName: 'Pérez' }],
  participantId: 'p1',
  participantFirstName: 'Juan',
  participantLastName: 'Pérez',
  country: 'MX',
  lastMessageAt: '2026-11-08T10:00:00Z',
  lastMessagePreview: null,
  messageCount: 2,
  unreadCount: 0,
};

const docx: WaInboxMessageDto = {
  id: 'm-docx',
  chatJid: conversation.chatJid,
  timestamp: '2026-11-08T10:00:00Z',
  body: null,
  messageType: 'document',
  mediaMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  mediaFileName: 'Carta para Juan.docx',
};
const video: WaInboxMessageDto = { ...docx, id: 'm-video', messageType: 'video', mediaMime: 'video/mp4', mediaFileName: null };

const mountThread = () =>
  mount(WaChatThread, {
    props: {
      conversation,
      messages: [docx, video],
      loading: false,
      canRegisterPayment: true,
      canAddLetter: true,
    },
    global: { stubs: { ParticipantInfoPopover: true, ParticipantQuickPhoneEditor: true } },
  });

describe('WaChatThread — documents and videos (v1.5)', () => {
  it('a Word document shows its name and kind, opens the viewer and can become a letter', async () => {
    const wrapper = mountThread();
    const bubble = wrapper.get('[data-testid="wa-message-m-docx"]');
    expect(bubble.get('[data-testid="wa-document"]').text()).toContain('Carta para Juan.docx');
    expect(bubble.text()).toContain('Documento de Word');
    expect(bubble.find('[data-testid="wa-action-letter-m-docx"]').exists()).toBe(true);
    // Payments only take images and PDFs.
    expect(bubble.find('[data-testid="wa-action-payment-m-docx"]').exists()).toBe(false);

    await bubble.get('button').trigger('click');
    expect(wrapper.emitted('open-document')?.[0]).toEqual([docx]);
  });

  it('a video offers "watch" and opens the viewer on tap', async () => {
    const wrapper = mountThread();
    const bubble = wrapper.get('[data-testid="wa-message-m-video"]');
    await bubble.get('[data-testid="wa-action-open-m-video"]').trigger('click');
    await bubble.get('button').trigger('click');
    expect(wrapper.emitted('open-document')).toEqual([[video], [video]]);
  });
});
