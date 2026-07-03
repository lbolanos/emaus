import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// ── @repo/ui mock: inputs con fall-through de atributos (id/type/placeholder) ──
vi.mock('@repo/ui', () => ({
  Button: {
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
    props: ['disabled', 'variant', 'size'],
    emits: ['click'],
  },
  Dialog: {
    template: '<div v-if="open"><slot /></div>',
    props: ['open'],
    emits: ['update:open'],
  },
  DialogContent: { template: '<div><slot /></div>' },
  DialogHeader: { template: '<div><slot /></div>' },
  DialogTitle: { template: '<h2><slot /></h2>' },
  DialogFooter: { template: '<div><slot /></div>' },
  Input: {
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @change="$emit(\'change\')" />',
    props: ['modelValue'],
    emits: ['update:modelValue', 'change'],
  },
  Label: { template: '<label><slot /></label>' },
  Textarea: {
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea>',
    props: ['modelValue', 'rows'],
    emits: ['update:modelValue'],
  },
  useToast: () => ({ toast: vi.fn() }),
}));

const createTask = vi.fn().mockResolvedValue({});
const updateTask = vi.fn().mockResolvedValue({});
vi.mock('@/stores/preRetreatTaskStore', () => ({
  usePreRetreatTaskStore: () => ({ createTask, updateTask }),
}));

vi.mock('@/components/ParticipantSelect.vue', () => ({
  default: { name: 'ParticipantSelect', template: '<div class="participant-select-stub" />' },
}));

vi.mock('@/services/api', () => ({ apiErrorMessage: (e: unknown) => String(e) }));

import PreRetreatTaskEditModal from '../PreRetreatTaskEditModal.vue';

function mountModal(props: Record<string, unknown> = {}) {
  return mount(PreRetreatTaskEditModal, {
    props: {
      open: true,
      retreatId: 'retreat-1',
      task: null,
      parentId: null,
      participants: [],
      retreatStartDate: '2026-09-18',
      ...props,
    },
  });
}

describe('PreRetreatTaskEditModal', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('crea una tarea con dueOffsetDays calculado del valor+unidad', async () => {
    const w = mountModal();
    // nombre
    const nameInput = w.find('#prt-name');
    await nameInput.setValue('Confirmar menús');
    // offset: 2 semanas → 14 días
    const numberInput = w.find('input[type="number"]');
    await numberInput.setValue('2');
    await numberInput.trigger('change');
    const unitSelect = w.find('select');
    await unitSelect.setValue('weeks');
    await unitSelect.trigger('change');

    const guardar = w.findAll('button').find((b) => /Guardar/.test(b.text()));
    await guardar!.trigger('click');
    await flushPromises();

    expect(createTask).toHaveBeenCalledTimes(1);
    const [retreatId, payload] = createTask.mock.calls[0];
    expect(retreatId).toBe('retreat-1');
    expect(payload.name).toBe('Confirmar menús');
    expect(payload.dueOffsetDays).toBe(14);
    // dueDate derivada: 2026-09-18 − 14 = 2026-09-04
    expect(payload.dueDate).toBe('2026-09-04');
    expect(payload.parentId).toBeNull();
    expect(payload.responsibleParticipantId).toBeNull();
  });

  it('no guarda si el nombre está vacío', async () => {
    const w = mountModal();
    const guardar = w.findAll('button').find((b) => /Guardar/.test(b.text()));
    await guardar!.trigger('click');
    await flushPromises();
    expect(createTask).not.toHaveBeenCalled();
  });

  it('en modo edición precarga el offset desde dueOffsetDays y llama updateTask', async () => {
    const task = {
      id: 't1',
      retreatId: 'retreat-1',
      name: 'Snacks',
      status: 'in_progress',
      dueOffsetDays: 14,
      dueDate: '2026-09-04',
      sortOrder: 0,
    };
    const w = mountModal({ task });
    // Precargó "Snacks" en el nombre
    expect((w.find('#prt-name').element as HTMLInputElement).value).toBe('Snacks');

    const guardar = w.findAll('button').find((b) => /Guardar/.test(b.text()));
    await guardar!.trigger('click');
    await flushPromises();

    expect(updateTask).toHaveBeenCalledTimes(1);
    const [retreatId, id, payload] = updateTask.mock.calls[0];
    expect(retreatId).toBe('retreat-1');
    expect(id).toBe('t1');
    expect(payload.dueOffsetDays).toBe(14);
    expect(createTask).not.toHaveBeenCalled();
  });

  it('crea una sub-tarea con parentId cuando se pasa parentId', async () => {
    const w = mountModal({ parentId: 'parent-1' });
    await w.find('#prt-name').setValue('Comprar snacks');
    const guardar = w.findAll('button').find((b) => /Guardar/.test(b.text()));
    await guardar!.trigger('click');
    await flushPromises();
    expect(createTask.mock.calls[0][1].parentId).toBe('parent-1');
  });
});
