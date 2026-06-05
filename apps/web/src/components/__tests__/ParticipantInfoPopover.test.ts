import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';

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

vi.mock('@/stores/participantStore', () => ({
  useParticipantStore: () => ({ participants: [enrichedParticipant] }),
}));

const openSpy = vi.fn();
vi.mock('@/composables/useParticipantMessageDialog', () => ({
  useParticipantMessageDialog: () => ({ open: openSpy }),
}));

import ParticipantInfoPopover from '../ParticipantInfoPopover.vue';

function mountPopover(participant: Record<string, any>) {
  return mount(ParticipantInfoPopover, {
    props: { participant: participant as any },
    global: { mocks: { $t: (key: string) => key } },
  });
}

describe('ParticipantInfoPopover', () => {
  let wrapper: VueWrapper;

  afterEach(() => {
    wrapper?.unmount();
    openSpy.mockClear();
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
});
