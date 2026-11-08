import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import WaLinkModal from '../WaLinkModal.vue';
import { useWaInboxStore } from '@/stores/waInboxStore';

// The global vue-i18n mock returns the raw key; here go the real es.json
// strings this test asserts (the 5 points of the D7 notice).
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'waInbox.consent.title': 'Vincular mi WhatsApp',
        'waInbox.consent.intro': 'Antes de escanear el código, ten claro qué implica vincular tu cuenta:',
        'waInbox.consent.bullet1': 'Durante la ventana del retiro, los mensajes que lleguen a tu WhatsApp pasan por el servidor del sistema. Solo se guardan los de caminantes de este retiro; el resto no se conserva.',
        'waInbox.consent.bullet2': 'Al emparejar, tu teléfono envía el historial reciente al servidor (con tope); se borra al desvincular o 15 días después del retiro.',
        'waInbox.consent.bullet3': 'Usamos un cliente no oficial de WhatsApp, solo de lectura: tu número personal podría ser suspendido. El riesgo es bajo, pero no es cero.',
        'waInbox.consent.bullet4': 'Vincular es voluntario: nadie está obligado. Si no quieres vincular tu número, puedes usar la bandeja como lector.',
        'waInbox.consent.bullet5': 'Lo que llegue a tu número lo verá el equipo del retiro en esta bandeja. Tu número nunca se muestra a los demás miembros.',
        'waInbox.consent.accept': 'Entiendo y quiero vincular mi número',
        'waInbox.consent.continue': 'Continuar',
        'waInbox.cancel': 'Cancelar',
        'waInbox.close': 'Cerrar',
      })[key] ?? key,
  }),
}));

/**
 * The modal cannot show the QR without explicit consent (D7): without the
 * checkbox ticked there is no call to the link API.
 */
vi.mock('@/services/api', () => ({
  startWaLink: vi.fn().mockResolvedValue({
    link: { id: 'link-1', status: 'pending', retreatId: 'r1', userId: 'u1', ownerName: null },
  }),
  getWaLinkStatus: vi.fn().mockResolvedValue({
    status: 'qr',
    qr: 'waid://TEST',
    linkedPhone: null,
    linkedJid: null,
    lastError: null,
    lastSyncAt: null,
  }),
  getWaLinks: vi.fn().mockResolvedValue({ links: [] }),
  getWaConversations: vi.fn().mockResolvedValue({ conversations: [] }),
  getWaMessages: vi.fn().mockResolvedValue({ messages: [] }),
  markWaChatSeen: vi.fn().mockResolvedValue({ ok: true }),
  unlinkWaLink: vi.fn().mockResolvedValue({ ok: true }),
}));

import { startWaLink } from '@/services/api';

const startMock = vi.mocked(startWaLink);

const mountModal = () =>
  mount(WaLinkModal, {
    props: { open: true, retreatId: 'r1' },
    global: {
      stubs: {
        // Minimal stubs of the @repo/ui wrapper (the global setup mock does not
        // cover mounting with the conditional slots this modal uses).
        Dialog: { template: '<div><slot /></div>', props: ['open'] },
        DialogContent: { template: '<div><slot /></div>' },
        DialogHeader: { template: '<div><slot /></div>' },
        DialogTitle: { template: '<div><slot /></div>' },
        DialogDescription: { template: '<div><slot /></div>' },
        DialogFooter: { template: '<div><slot /></div>' },
        Button: { template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>', props: ['disabled'] },
        QrcodeVue: { template: '<div class="qr-stub" />', props: ['value'] },
        Loader2: { template: '<svg />' },
      },
    },
  });

describe('WaLinkModal — consentimiento', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    startMock.mockClear();
  });

  it('shows the 5 notice points (transit, history, ban risk, voluntary, visibility)', () => {
    const wrapper = mountModal();
    const text = wrapper.text();
    expect(text).toContain('servidor del sistema');
    expect(text).toContain('historial reciente');
    expect(text).toContain('suspendido');
    expect(text).toContain('voluntario');
    expect(text).toContain('nunca se muestra');
  });

  it('with the checkbox unticked, Continue is disabled and the API is NOT called', async () => {
    const wrapper = mountModal();
    const buttons = wrapper.findAll('button');
    const continueBtn = buttons.find((b) => b.text().includes('Continuar'));

    expect(continueBtn?.attributes('disabled')).toBeDefined();
    await continueBtn?.trigger('click');
    expect(startMock).not.toHaveBeenCalled();
  });

  it('with the checkbox ticked, Continue calls startWaLink with consentAccepted=true', async () => {
    const wrapper = mountModal();
    await wrapper.find('[data-testid="wa-consent-checkbox"] input').setValue(true);
    await wrapper.find('[data-testid="wa-consent-continue"]').trigger('click');

    await vi.waitFor(() => {
      expect(startMock).toHaveBeenCalledWith('r1', true);
    });
  });
});
