import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises, VueWrapper } from '@vue/test-utils';

// Simula el ancho del viewport para el guard de desktop (matchMedia md+).
function setViewport(isDesktop: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: isDesktop }) as any;
}

// --- Mocks locales ---------------------------------------------------------
vi.mock('@repo/ui', () => ({
  Popover: { name: 'Popover', props: ['open'], template: '<div class="popover"><slot /></div>' },
  PopoverTrigger: { name: 'PopoverTrigger', props: ['asChild'], template: '<div class="popover-trigger"><slot /></div>' },
  PopoverContent: { name: 'PopoverContent', props: ['side', 'align'], template: '<div class="popover-content"><slot /></div>' },
  Button: { name: 'Button', props: ['variant', 'size'], template: '<button class="ui-button"><slot /></button>' },
}));

vi.mock('lucide-vue-next', () => ({
  Info: { name: 'Info', template: '<svg class="icon-info" />' },
  MessageCircle: { name: 'MessageCircle', template: '<svg class="icon-msg" />' },
}));

vi.mock('@/components/TagBadge.vue', () => ({
  default: { name: 'TagBadge', props: ['tag', 'removable'], template: '<span class="tag-badge">{{ tag?.name }}</span>' },
}));

// Store con el participante enriquecido (tags + invitador), indexado por id.
const enrichedParticipant = {
  id: 'p-1',
  id_on_retreat: 4,
  firstName: 'Miguel',
  lastName: 'Cavazos',
  nickname: 'Mike',
  type: 'walker',
  cellPhone: '8112122644',
  homePhone: '4422434781',
  workPhone: '',
  parish: 'San Judas Tadeo',
  email: 'miguel@test.com',
  invitedBy: 'Octavio',
  isInvitedByEmausMember: true,
  inviterCellPhone: '4423713389',
  inviterHomePhone: '-', // placeholder: debe filtrarse
  inviterWorkPhone: '',
  inviterEmail: 'inv@test.com',
  retreatBed: { floor: 1, roomNumber: '1', bedNumber: '1' },
  tags: [{ id: 'pt-1', tag: { id: 't-1', name: 'Hermanos', color: '#ff0000' } }],
};

// Participante con palancas y saldo (v1.1): esas secciones son estáticas,
// salen del roster del store sin fetch.
const palancasParticipant = {
  id: 'p-2',
  firstName: 'Lucía',
  lastName: 'Fernández',
  type: 'walker',
  cellPhone: '5599887766',
  palancasRequested: true,
  palancasReceivedCount: 4,
  palancasReceived: null,
  palancasCoordinator: 'María G.',
  palancasNotes: 'Faltan las de la tía',
  paymentRemaining: 500,
};

// Servidor sin datos de invitador (caso típico): solo nombre + teléfono.
const serverParticipant = {
  id: 's-1',
  firstName: 'Ernesto',
  lastName: 'Lopez',
  type: 'server',
  cellPhone: '5512345678',
  isInvitedByEmausMember: false, // por sí solo NO debe disparar la sección Invitador
};

vi.mock('@/stores/participantStore', () => ({
  useParticipantStore: () => ({ participants: [enrichedParticipant, serverParticipant, palancasParticipant] }),
}));

const openSpy = vi.fn();
vi.mock('@/composables/useParticipantMessageDialog', () => ({
  useParticipantMessageDialog: () => ({ open: openSpy }),
}));

// Timeline CRM (v1.1): notas con autor, hitos (stage_change) y enviados.
const timelineMock = vi.fn();
vi.mock('@/services/api', () => ({
  getParticipantTimeline: (...args: unknown[]) => timelineMock(...args),
}));

import ParticipantInfoPopover from '../ParticipantInfoPopover.vue';

function mountPopover(participant: Record<string, any>, props: Record<string, any> = {}) {
  return mount(ParticipantInfoPopover, {
    props: { participant: participant as any, ...props },
    global: { mocks: { $t: (key: string) => key } },
  });
}

describe('ParticipantInfoPopover', () => {
  let wrapper: VueWrapper;

  // El popover (root del componente) cuya prop `open` refleja popoverOpen.
  const popoverOpen = () => wrapper.findComponent({ name: 'Popover' }).props('open');
  // El <span> que envuelve la pastilla y dispara onPillClick (clase única md:gap-0.5).
  const pillTrigger = () => wrapper.findAll('span').find((s) => s.classes().includes('md:gap-0.5'))!;

  afterEach(() => {
    wrapper?.unmount();
    openSpy.mockClear();
    timelineMock.mockReset();
    vi.useRealTimers();
  });

  it('enriquece desde el store: muestra tags, teléfonos del participante e invitador', () => {
    // La pastilla solo trae id/nombre; los tags/invitador vienen del store.
    wrapper = mountPopover({ id: 'p-1', firstName: 'Miguel', lastName: 'Cavazos', cellPhone: '' });
    const text = wrapper.text();

    // Tag enriquecido
    expect(wrapper.find('.tag-badge').exists()).toBe(true);
    expect(text).toContain('Hermanos');
    // Teléfono del participante (del store)
    expect(text).toContain('8112122644');
    // Invitador
    expect(text).toContain('Octavio');
    expect(text).toContain('4423713389');
    expect(text).toContain('inv@test.com');
  });

  it('filtra teléfonos placeholder sin dígitos ("-")', () => {
    wrapper = mountPopover({ id: 'p-1', firstName: 'Miguel', lastName: 'Cavazos' });
    const telHrefs = wrapper.findAll('a[href^="tel:"]').map((a) => a.attributes('href'));
    expect(telHrefs).not.toContain('tel:-');
  });

  it('el botón "Mandar mensaje" abre el diálogo con el participante enriquecido', async () => {
    wrapper = mountPopover({ id: 'p-1', firstName: 'Miguel', lastName: 'Cavazos' });
    const btn = wrapper.findAll('.ui-button').find((b) => b.text().includes('tables.detail.sendMessage'));
    expect(btn).toBeTruthy();
    await btn!.trigger('click');
    await wrapper.vm.$nextTick();
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0]).toMatchObject({ id: 'p-1', invitedBy: 'Octavio' });
  });

  it('cae al objeto de la pastilla cuando el participante no está en el store', () => {
    wrapper = mountPopover({ id: 'unknown', firstName: 'Ana', lastName: 'Ruiz', cellPhone: '5551234567' });
    const text = wrapper.text();
    expect(text).toContain('Ana');
    expect(text).toContain('5551234567');
    // No hay tags ni invitador para el fallback
    expect(wrapper.find('.tag-badge').exists()).toBe(false);
  });

  it('NO muestra la sección Invitador para un servidor sin datos de invitador', () => {
    // isInvitedByEmausMember=false por sí solo no debe abrir la sección.
    wrapper = mountPopover({ id: 's-1', firstName: 'Ernesto', lastName: 'Lopez' });
    const text = wrapper.text();
    expect(text).toContain('Ernesto');
    expect(text).toContain('5512345678');
    expect(text).not.toContain('tables.detail.inviter');
  });

  describe('disparador por clic en la pastilla', () => {
    it('en desktop, un clic en la pastilla abre el popover tras ~200ms', async () => {
      setViewport(true);
      vi.useFakeTimers();
      wrapper = mountPopover({ id: 'p-1', firstName: 'Miguel', lastName: 'Cavazos' });

      expect(popoverOpen()).toBe(false);
      await pillTrigger().trigger('click');
      expect(popoverOpen()).toBe(false); // aún no: hay gracia para distinguir doble clic

      vi.advanceTimersByTime(200);
      await wrapper.vm.$nextTick();
      expect(popoverOpen()).toBe(true);
    });

    it('un doble clic NO abre el popover (se reserva para desasignar)', async () => {
      setViewport(true);
      vi.useFakeTimers();
      wrapper = mountPopover({ id: 'p-1', firstName: 'Miguel', lastName: 'Cavazos' });

      await pillTrigger().trigger('click'); // arma el timer
      await pillTrigger().trigger('click'); // segundo clic: lo cancela
      vi.advanceTimersByTime(300);
      await wrapper.vm.$nextTick();
      expect(popoverOpen()).toBe(false);
    });

    it('en móvil, un toque/clic en la pastilla NO abre el popover (se reserva para tap-to-assign)', async () => {
      setViewport(false);
      vi.useFakeTimers();
      wrapper = mountPopover({ id: 'p-1', firstName: 'Miguel', lastName: 'Cavazos' });

      await pillTrigger().trigger('click');
      vi.advanceTimersByTime(300);
      await wrapper.vm.$nextTick();
      expect(popoverOpen()).toBe(false);
    });
  });

  // Variante 'icon' (bandeja de WhatsApp de secuencias): botón ⓘ suelto. La
  // apertura/cierre real la maneja el PopoverTrigger de reka-ui (mismo camino
  // que el ⓘ móvil de la pastilla); acá se fija el cableado estructural y que
  // la pastilla NO se renderice.
  describe("variante 'icon' (bandeja de secuencias)", () => {
    it('renderiza el botón ⓘ suelto y SIN pastilla (no hay slot ni gracia de doble clic)', () => {
      wrapper = mountPopover({ id: 'p-1', firstName: 'Miguel', lastName: 'Cavazos' }, { variant: 'icon' });
      const btn = wrapper
        .findAll('button')
        .find((b) => b.attributes('title') === 'sequences.participantDetail');
      expect(btn).toBeTruthy();
      expect(wrapper.findAll('span').some((s) => s.classes().includes('md:gap-0.5'))).toBe(false);
    });

    it('el ⓘ va dentro del PopoverTrigger y queda visible también en desktop', () => {
      wrapper = mountPopover({ id: 'p-1', firstName: 'Miguel', lastName: 'Cavazos' }, { variant: 'icon' });
      const triggerBtn = wrapper.find('.popover-trigger button');
      expect(triggerBtn.exists()).toBe(true);
      // El ⓘ de la pastilla se auto-oculta en md+; este no debe hacerlo.
      expect(triggerBtn.classes().join(' ')).not.toContain('md:opacity-0');
      expect(triggerBtn.classes().join(' ')).not.toContain('md:pointer-events-none');
    });

    it('regresión: la variante default sigue siendo pastilla con ⓘ móvil oculto en desktop', () => {
      wrapper = mountPopover({ id: 'p-1', firstName: 'Miguel', lastName: 'Cavazos' });
      expect(pillTrigger()).toBeTruthy();
      const triggerBtn = wrapper.find('.popover-trigger button');
      expect(triggerBtn.exists()).toBe(true);
      expect(triggerBtn.classes().join(' ')).toContain('md:opacity-0');
    });
  });

  // Contexto CRM (v1.1): palancas/seguimiento/saldo estáticos del roster +
  // notas y enviados del timeline, fetcheados AL ABRIR el popover.
  describe('contexto CRM (v1.1)', () => {
    const timelineEvents = [
      { id: 'e-3', type: 'note', at: '2026-10-05T10:00:00.000Z', title: 'Nota', detail: 'Le escribió su mamá, quiere ir', actorName: 'Ana' },
      { id: 'e-2', type: 'message', at: '2026-10-03T10:00:00.000Z', title: 'WhatsApp enviado', detail: null, actorName: 'Leo', meta: { templateName: 'Bienvenida' } },
      { id: 'e-1', type: 'stage_change', at: '2026-10-01T10:00:00.000Z', title: 'Etapa: contactado', detail: null, actorName: null, meta: {} },
    ];

    const openPopover = async (w: VueWrapper) => {
      w.findComponent({ name: 'Popover' }).vm.$emit('update:open', true);
      await flushPromises();
    };

    it('al abrir, fetchea el timeline y muestra notas con autor, enviados y última etapa', async () => {
      timelineMock.mockResolvedValueOnce(timelineEvents);
      wrapper = mountPopover(
        { id: 'p-1', firstName: 'Miguel', lastName: 'Cavazos' },
        { variant: 'icon', retreatId: 'r-1' },
      );
      // Antes de abrir: nada de la ficha viva todavía (fetch-on-open).
      expect(timelineMock).not.toHaveBeenCalled();

      await openPopover(wrapper);
      expect(timelineMock).toHaveBeenCalledWith('r-1', 'p-1');
      const text = wrapper.text();
      // Nota con autor
      expect(text).toContain('Le escribió su mamá, quiere ir');
      expect(text).toContain('Ana');
      // Enviado con plantilla
      expect(text).toContain('Bienvenida');
      // Última etapa (seguimiento)
      expect(text).toContain('Etapa: contactado');
      expect(text).toContain('tables.detail.recentNotes');
      expect(text).toContain('tables.detail.recentMessages');
    });

    it('si el timeline falla, la ficha estática sigue y aparece el aviso (sin secciones vacías)', async () => {
      timelineMock.mockRejectedValueOnce(new Error('boom'));
      wrapper = mountPopover(
        { id: 'p-x', firstName: 'Rosa', lastName: 'Díaz' },
        { variant: 'icon', retreatId: 'r-1' },
      );
      await openPopover(wrapper);
      const text = wrapper.text();
      expect(text).toContain('tables.detail.insightsError');
      expect(text).not.toContain('tables.detail.recentNotes');
      // La ficha estática no se rompe
      expect(text).toContain('Rosa');
    });

    it('muestra palancas y saldo del roster sin abrir (estático, sin fetch)', () => {
      wrapper = mountPopover({ id: 'p-2', firstName: 'Lucía', lastName: 'Fernández' });
      expect(timelineMock).not.toHaveBeenCalled();
      const text = wrapper.text();
      expect(text).toContain('tables.detail.palancas');
      expect(text).toContain('tables.detail.palancasCoordinator');
      expect(text).toContain('María G.');
      expect(text).toContain('4');
      expect(text).toContain('Faltan las de la tía');
      // Saldo formateado (formatCurrency es-MX/MXN)
      expect(text).toContain('tables.detail.balance');
      expect(text).toContain('$500');
    });

    it('participante sin palancas ni saldo: la sección no se renderiza', () => {
      wrapper = mountPopover({ id: 'p-1', firstName: 'Miguel', lastName: 'Cavazos' });
      expect(wrapper.text()).not.toContain('tables.detail.palancas');
      expect(wrapper.text()).not.toContain('tables.detail.balance');
    });
  });
});
