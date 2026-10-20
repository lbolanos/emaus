import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, VueWrapper, flushPromises, enableAutoUnmount } from '@vue/test-utils';

const renameTable = vi.fn();
vi.mock('@/stores/tableMesaStore', () => ({
  useTableMesaStore: () => ({
    renameTable,
    unassignLeader: vi.fn(),
    unassignWalkerFromTable: vi.fn(),
    assignLeader: vi.fn(),
    assignWalkerToTable: vi.fn(),
  }),
}));

vi.mock('@/stores/participantStore', () => ({
  useParticipantStore: () => ({ participants: [] }),
}));

vi.mock('@/composables/useParticipantMessageDialog', () => ({
  useParticipantMessageDialog: () => ({ open: vi.fn() }),
}));

const toast = vi.fn();
vi.mock('@repo/ui', () => {
  const stub = (name: string) => ({ name, template: `<div class="${name}"><slot /></div>` });
  return {
    Card: stub('Card'),
    CardContent: stub('CardContent'),
    CardHeader: stub('CardHeader'),
    CardTitle: stub('CardTitle'),
    Button: {
      name: 'Button',
      props: ['variant', 'size', 'title', 'type', 'disabled'],
      emits: ['click'],
      template:
        '<button :type="type || \'button\'" :title="title" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
    },
    // Real <input> root, like @repo/ui's Input, so focus/selection can be checked.
    Input: {
      name: 'Input',
      props: ['modelValue', 'disabled'],
      emits: ['update:modelValue'],
      template:
        '<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    },
    Popover: stub('Popover'),
    PopoverTrigger: stub('PopoverTrigger'),
    PopoverContent: stub('PopoverContent'),
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
    DropdownMenu: stub('DropdownMenu'),
    DropdownMenuTrigger: stub('DropdownMenuTrigger'),
    DropdownMenuContent: stub('DropdownMenuContent'),
    DropdownMenuItem: stub('DropdownMenuItem'),
    DropdownMenuSeparator: stub('DropdownMenuSeparator'),
    useToast: () => ({ toast }),
  };
});

vi.mock('lucide-vue-next', () => ({
  Trash2: { name: 'Trash2', template: '<svg />' },
  Eye: { name: 'Eye', template: '<svg />' },
  Camera: { name: 'Camera', template: '<svg />' },
  Send: { name: 'Send', template: '<svg />' },
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

enableAutoUnmount(afterEach);

const factory = (name = 'Mesa 3'): VueWrapper<any> =>
  mount(TableCard, {
    props: {
      table: { id: 't-1', name, retreatId: 'r-1', lider: null, colider1: null, colider2: null, walkers: [] } as any,
    },
    attachTo: document.body,
    global: { mocks: { $t: (k: string) => k } },
  });

const openEditor = async (wrapper: VueWrapper<any>) => {
  await wrapper.find('[data-testid="table-name-edit"]').trigger('click');
  await flushPromises();
  return wrapper.find('[data-testid="table-name-input"]');
};

afterEach(() => {
  renameTable.mockReset();
  toast.mockReset();
});

describe('TableCard — editar el número de la mesa', () => {
  it('abre el editor con el nombre actual y el número ya seleccionado', async () => {
    const wrapper = factory('Mesa 3');
    const input = await openEditor(wrapper);

    const el = input.element as HTMLInputElement;
    expect(el.value).toBe('Mesa 3');
    expect(document.activeElement).toBe(el);
    expect(el.value.slice(el.selectionStart!, el.selectionEnd!)).toBe('3');
    // On narrow cards the action buttons would cover save/cancel, so they hide while editing.
    expect(wrapper.find('button[title="common.delete"]').exists()).toBe(false);
  });

  it('guarda el nombre nuevo normalizado y cierra el editor', async () => {
    renameTable.mockResolvedValue({ id: 't-1', name: 'Mesa 12' });
    const wrapper = factory('Mesa 3');
    const input = await openEditor(wrapper);

    await input.setValue('  Mesa   12 ');
    await wrapper.find('[data-testid="table-name-form"]').trigger('submit');
    await flushPromises();

    expect(renameTable).toHaveBeenCalledWith('t-1', 'Mesa 12');
    expect(wrapper.find('[data-testid="table-name-form"]').exists()).toBe(false);
  });

  it('no llama al API si el nombre no cambió', async () => {
    const wrapper = factory('Mesa 3');
    await openEditor(wrapper);

    await wrapper.find('[data-testid="table-name-form"]').trigger('submit');
    await flushPromises();

    expect(renameTable).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="table-name-form"]').exists()).toBe(false);
  });

  it('Escape cancela sin guardar', async () => {
    const wrapper = factory('Mesa 3');
    const input = await openEditor(wrapper);

    await input.setValue('Mesa 9');
    await input.trigger('keydown', { key: 'Escape' });

    expect(renameTable).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="table-name-form"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Mesa 3');
  });

  it('si el nombre ya existe avisa y deja el editor abierto', async () => {
    renameTable.mockRejectedValue({ response: { status: 409, data: { message: 'Table name already in use' } } });
    const wrapper = factory('Mesa 3');
    const input = await openEditor(wrapper);

    await input.setValue('Mesa 4');
    await wrapper.find('[data-testid="table-name-form"]').trigger('submit');
    await flushPromises();

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'tables.rename.duplicate', variant: 'destructive' }),
    );
    expect(wrapper.find('[data-testid="table-name-form"]').exists()).toBe(true);
  });
});
