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
    Input: { name: 'Input', props: ['modelValue'], template: '<input :value="modelValue" />' },
    // ⋮ de la tarjeta (spec ux-mam-responsabilidades, D9): el menú siempre
    // renderiza sus opciones; cada opción emite `select` al hacer click.
    DropdownMenu: stub('DropdownMenu'),
    DropdownMenuTrigger: stub('DropdownMenuTrigger'),
    DropdownMenuContent: stub('DropdownMenuContent', 'menu-content'),
    DropdownMenuItem: {
      name: 'DropdownMenuItem',
      props: ['disabled'],
      emits: ['select'],
      template: '<div class="menu-item" :data-disabled="disabled ? \'true\' : null" @click="$emit(\'select\')"><slot /></div>',
    },
    DropdownMenuSeparator: stub('DropdownMenuSeparator'),
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
  Pencil: { name: 'Pencil', template: '<svg />' },
  Check: { name: 'Check', template: '<svg />' },
  X: { name: 'X', template: '<svg />' },
  MoreVertical: { name: 'MoreVertical', template: '<svg />' },
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
    props: {
      table: makeTable(withLeader) as any,
      searchHighlight: { matchingIds: [], currentMatchId: null, searching: false },
    },
    global: { mocks: { $t: (k: string) => k } },
  });

afterEach(() => {
  wrapper?.unmount();
  openSpy.mockReset();
});

// deferOpen espera 80 ms antes de abrir (bug reka-ui pointer-events).
const waitDeferOpen = () => new Promise((r) => setTimeout(r, 120));

describe('TableCard — briefing de mesa', () => {
  it('ofrece en el ⋮ una opción de envío por cada líder o colíder', () => {
    wrapper = factory(true);
    const items = wrapper.findAll('[data-testid="table-briefing-item"]');
    expect(items).toHaveLength(1);
    expect(items[0].text()).toContain('tables.briefingSendTo');
  });

  it('sin líderes no hay opción de envío', () => {
    wrapper = factory(false);
    expect(wrapper.findAll('[data-testid="table-briefing-item"]')).toHaveLength(0);
  });

  it('el nombre y el conteo quedan a la vista; el resto va al ⋮', () => {
    wrapper = factory(true);
    expect(wrapper.text()).toContain('Mesa 03');
    expect(wrapper.find('[data-testid="table-card-menu"]').exists()).toBe(true);
    const labels = wrapper.findAll('.menu-item').map((i) => i.text());
    expect(labels).toEqual(expect.arrayContaining(['tables.viewWalkers', 'tables.photoAssign.tableTitle', 'common.delete']));
  });

  it('Eliminar queda deshabilitado mientras la mesa tiene caminantes', () => {
    wrapper = factory(true);
    const del = wrapper.findAll('.menu-item').find((i) => i.text() === 'common.delete');
    expect(del!.attributes('data-disabled')).toBe('true');
  });

  it('al elegir un líder abre el MessageDialog con la plantilla y el roster enriquecido', async () => {
    wrapper = factory(true);
    const leaderItem = wrapper.find('[data-testid="table-briefing-item"]');
    expect(leaderItem.exists()).toBe(true);
    await leaderItem.trigger('click');
    await waitDeferOpen();
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
