import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, VueWrapper, flushPromises } from '@vue/test-utils';

// --- Spy del singleton del MessageDialog -----------------------------------
const openSpy = vi.fn();
vi.mock('@/composables/useParticipantMessageDialog', () => ({
  useParticipantMessageDialog: () => ({ open: openSpy }),
}));

// Store con participantes enriquecidos (contactos de emergencia que el payload
// de mesas no trae). El walker 'w-1' aquí tiene EC2; el objeto de la mesa no.
const enrichedWalker = {
  id: 'w-1',
  firstName: 'Pedro',
  lastName: 'Ramírez',
  type: 'walker',
  cellPhone: '555-100-2000',
  emergencyContact1Name: 'Ana Ramírez',
  emergencyContact1Relation: 'Esposa',
  emergencyContact1CellPhone: '555-100-2001',
  emergencyContact2Name: 'Luis Ramírez',
  emergencyContact2Relation: 'Hermano',
  emergencyContact2CellPhone: '555-100-2002',
};
vi.mock('@/stores/participantStore', () => ({
  useParticipantStore: () => ({ participants: [enrichedWalker] }),
}));

vi.mock('@/stores/tableMesaStore', () => ({
  useTableMesaStore: () => ({
    unassignLeader: vi.fn(),
    unassignWalkerFromTable: vi.fn(),
    assignLeader: vi.fn(),
    assignWalkerToTable: vi.fn(),
  }),
}));

vi.mock('@repo/ui', () => {
  const stub = (name: string, cls = '') => ({
    name,
    template: `<div class="${cls || name}"><slot /></div>`,
  });
  return {
    Card: stub('Card'),
    CardContent: stub('CardContent'),
    CardHeader: stub('CardHeader'),
    CardTitle: stub('CardTitle'),
    Button: { name: 'Button', props: ['variant', 'size', 'title'], template: '<button class="ui-button" :title="title"><slot /></button>' },
    // Popover siempre renderiza su contenido para poder hacer click en la lista.
    Popover: { name: 'Popover', props: ['open'], template: '<div class="popover"><slot /></div>' },
    PopoverTrigger: { name: 'PopoverTrigger', props: ['asChild'], template: '<div class="popover-trigger"><slot /></div>' },
    PopoverContent: { name: 'PopoverContent', props: ['align'], template: '<div class="popover-content"><slot /></div>' },
    Dialog: stub('Dialog'),
    DialogContent: stub('DialogContent'),
    DialogHeader: stub('DialogHeader'),
    DialogTitle: stub('DialogTitle'),
    Table: stub('Table'),
    TableBody: stub('TableBody'),
    TableCell: stub('TableCell'),
    TableHead: stub('TableHead'),
    TableHeader: stub('TableHeader'),
    TableRow: stub('TableRow'),
    useToast: () => ({ toast: vi.fn() }),
  };
});

vi.mock('lucide-vue-next', () => ({
  Trash2: { name: 'Trash2', template: '<svg />' },
  Eye: { name: 'Eye', template: '<svg />' },
  Camera: { name: 'Camera', template: '<svg />' },
  Send: { name: 'Send', template: '<svg class="icon-send" />' },
}));

vi.mock('./ServerDropZone.vue', () => ({ default: { name: 'ServerDropZone', template: '<div />' } }));
vi.mock('@/components/ParticipantTooltip.vue', () => ({ default: { name: 'ParticipantTooltip', template: '<div><slot /></div>' } }));
vi.mock('@/components/ParticipantInfoPopover.vue', () => ({ default: { name: 'ParticipantInfoPopover', template: '<div><slot /></div>' } }));
vi.mock('@/components/PhotoAssignmentDialog.vue', () => ({ default: { name: 'PhotoAssignmentDialog', template: '<div />' } }));

import TableCard from '@/views/TableCard.vue';

const makeTable = (withLeader: boolean) => ({
  id: 't-1',
  name: 'Mesa 03',
  lider: withLeader
    ? { id: 'l-1', firstName: 'Juan', lastName: 'Pérez', type: 'server', cellPhone: '555-999-0000' }
    : null,
  colider1: null,
  colider2: null,
  // El walker del payload de mesas NO trae el contacto de emergencia 2.
  walkers: [{ id: 'w-1', firstName: 'Pedro', lastName: 'Ramírez', type: 'walker', cellPhone: '555-100-2000' }],
});

let wrapper: VueWrapper<any>;
const factory = (withLeader = true) =>
  mount(TableCard, {
    props: { table: makeTable(withLeader) as any, searchQuery: '' },
    global: { mocks: { $t: (k: string) => k } },
  });

afterEach(() => {
  wrapper?.unmount();
  openSpy.mockReset();
});

describe('TableCard — briefing de mesa', () => {
  it('muestra el botón de briefing cuando hay al menos un líder', () => {
    wrapper = factory(true);
    expect(wrapper.find('.icon-send').exists()).toBe(true);
  });

  it('oculta el botón de briefing cuando no hay líderes', () => {
    wrapper = factory(false);
    expect(wrapper.find('.icon-send').exists()).toBe(false);
  });

  it('al elegir un líder abre el MessageDialog con la plantilla y el roster enriquecido', async () => {
    wrapper = factory(true);
    // El botón de la lista de líderes dentro del PopoverContent.
    const leaderBtn = wrapper.find('.popover-content button');
    expect(leaderBtn.exists()).toBe(true);
    await leaderBtn.trigger('click');
    await flushPromises();

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [participant, opts] = openSpy.mock.calls[0];
    expect(participant.id).toBe('l-1');
    expect(opts.templateType).toBe('TABLE_LEADER_BRIEFING');
    expect(opts.tableData.name).toBe('Mesa 03');
    // El walker se enriqueció desde el store → trae EC2 aunque el payload no.
    const w = opts.tableData.walkers[0];
    expect(w.emergencyContact1CellPhone).toBe('555-100-2001');
    expect(w.emergencyContact2Name).toBe('Luis Ramírez');
    expect(w.emergencyContact2CellPhone).toBe('555-100-2002');
  });
});
