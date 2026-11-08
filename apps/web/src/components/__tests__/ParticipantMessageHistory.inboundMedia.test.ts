/**
 * Inbound WhatsApp images in the participant history (specs/whatsapp-inbox
 * v1.2/v1.3): thumbnails come from the inbox media batch, but ONLY for the
 * visible instance — MessageDialog also mounts a hidden one just to count.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';

const getWaThreadMedia = vi.hoisted(() => vi.fn());
vi.mock('@/services/api', () => ({ getWaThreadMedia }));

vi.mock('@/stores/participantCommunicationStore', () => ({
  useParticipantCommunicationStore: () => ({
    communications: ref([
      {
        id: 'wa-inbox:msg-1',
        participantId: 'p1',
        retreatId: 'r1',
        messageType: 'whatsapp',
        direction: 'inbound',
        waMessageType: 'image',
        recipientContact: '5215511406977',
        messageContent: '',
        sentAt: '2026-11-07T10:00:00Z',
      },
    ]),
    loading: ref(false),
    error: ref(null),
    total: ref(1),
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

describe('ParticipantMessageHistory — inbound WhatsApp media', () => {
  beforeEach(() => {
    getWaThreadMedia.mockReset();
    getWaThreadMedia.mockResolvedValue({ media: { 'msg-1': { thumb: 'data:image/webp;base64,AA', large: '' } }, skipped: 0 });
  });

  it('the hidden counting instance never downloads media', async () => {
    mount(ParticipantMessageHistory, { props: { participantId: 'p1', retreatId: 'r1', visible: false } });
    await flushPromises();
    expect(getWaThreadMedia).not.toHaveBeenCalled();
  });

  it('the visible instance fetches thumbnails with the raw inbox ids', async () => {
    const wrapper = mount(ParticipantMessageHistory, {
      props: { participantId: 'p1', retreatId: 'r1', visible: true },
    });
    await flushPromises();
    expect(getWaThreadMedia).toHaveBeenCalledWith('r1', ['msg-1']);
    expect(wrapper.find('img[alt="Imagen recibida"]').exists()).toBe(true);
  });
});
