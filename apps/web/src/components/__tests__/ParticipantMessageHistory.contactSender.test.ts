/**
 * Participant history (specs/whatsapp-inbox v1.4): an inbound WhatsApp message
 * written by an emergency contact names the contact; the walker's own stays
 * as before.
 */
import { describe, it, expect, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';

vi.mock('@/services/api', () => ({ getWaThreadMedia: vi.fn().mockResolvedValue({ media: {}, skipped: 0 }) }));
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      ({
        'waInbox.contactSender': `${params?.contact} (contacto de emergencia)`,
        'waInbox.emergencyContact': 'contacto de emergencia',
      })[key] ?? key,
  }),
}));

const inbound = (id: string, extra: Record<string, unknown>) => ({
  id: `wa-inbox:${id}`,
  participantId: 'p1',
  retreatId: 'r1',
  messageType: 'whatsapp',
  direction: 'inbound',
  waMessageType: 'text',
  recipientContact: '5215522222222',
  messageContent: 'hola',
  sentAt: '2026-11-07T10:00:00Z',
  ...extra,
});

vi.mock('@/stores/participantCommunicationStore', () => ({
  useParticipantCommunicationStore: () => ({
    communications: ref([
      inbound('mom', { senderKind: 'emergency_contact', contactName: 'María', contactRelation: 'Mamá' }),
      inbound('own', { senderKind: 'walker', recipientContact: '5215511111111' }),
    ]),
    loading: ref(false),
    error: ref(null),
    total: ref(2),
    limit: ref(20),
    offset: ref(0),
    fetchParticipantCommunications: vi.fn().mockResolvedValue(undefined),
    formatDate: (d: string) => String(d),
    formatMessageContent: (c: string) => c,
    getMessageTypeLabel: () => 'WhatsApp',
    getMessageTypeIcon: () => '📱',
    getMessageTypeColor: () => '',
    clearCommunications: vi.fn(),
  }),
}));

import ParticipantMessageHistory from '../ParticipantMessageHistory.vue';

describe('ParticipantMessageHistory — emergency contact sender (v1.4)', () => {
  it('labels only the contact message', async () => {
    const wrapper = mount(ParticipantMessageHistory, {
      props: { participantId: 'p1', retreatId: 'r1', visible: true },
    });
    await flushPromises();
    const labels = wrapper.findAll('[data-testid="history-contact-sender"]');
    expect(labels).toHaveLength(1);
    expect(labels[0].text()).toContain('Mamá — María (contacto de emergencia)');
    expect(wrapper.text()).toContain('+5215511111111');
  });
});
