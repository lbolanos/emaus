import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';

// ---------------------------------------------------------------------------
// API mocks
// ---------------------------------------------------------------------------
const mockGetParticipantsByRetreat = vi.fn();
const mockGetParticipantAvailability = vi.fn();
const mockGetParticipantAssignedSlots = vi.fn();
const mockSetParticipantAvailability = vi.fn();

vi.mock('@/services/api', () => ({
  getParticipantsByRetreat: (...args: any[]) => mockGetParticipantsByRetreat(...args),
  santisimoApi: {
    getParticipantAvailability: (...args: any[]) => mockGetParticipantAvailability(...args),
    getParticipantAssignedSlots: (...args: any[]) => mockGetParticipantAssignedSlots(...args),
    setParticipantAvailability: (...args: any[]) => mockSetParticipantAvailability(...args),
  },
}));

// ---------------------------------------------------------------------------
// Store mocks
// ---------------------------------------------------------------------------
vi.mock('@/stores/retreatStore', () => ({
  useRetreatStore: () => ({
    selectedRetreatId: 'retreat-1',
    selectedRetreat: {
      startDate: '2026-06-05T00:00:00.000Z',
      endDate: '2026-06-07T00:00:00.000Z',
    },
  }),
}));

// ---------------------------------------------------------------------------
// Component mocks — heavy dependencies
// ---------------------------------------------------------------------------
vi.mock('@/components/ParticipantList.vue', () => ({
  default: {
    name: 'ParticipantList',
    template: '<div class="participant-list-stub" />',
    props: ['type', 'columnsToShowInTable', 'columnsToShowInForm', 'columnsToEditInForm', 'defaultFilters'],
  },
}));

vi.mock('@/components/AngelitoAvailabilityEditor.vue', () => ({
  default: {
    name: 'AngelitoAvailabilityEditor',
    template: '<div class="angelito-editor-stub" />',
    props: ['modelValue', 'minDate', 'maxDate'],
    emits: ['update:modelValue'],
  },
}));

// ---------------------------------------------------------------------------
// @repo/ui override — adds conditional Dialog + missing Tabs/Badge stubs.
// The global setup.ts stub for Dialog ignores the `open` prop; override it
// here so we can test whether the dialog is open or closed.
// ---------------------------------------------------------------------------
vi.mock('@repo/ui', () => ({
  Dialog: {
    name: 'Dialog',
    props: ['open'],
    emits: ['update:open'],
    template: '<div v-if="open"><slot /></div>',
  },
  DialogContent: {
    name: 'DialogContent',
    template: '<div class="dialog-content"><slot /></div>',
  },
  DialogHeader: {
    name: 'DialogHeader',
    template: '<div><slot /></div>',
  },
  DialogTitle: {
    name: 'DialogTitle',
    template: '<h2><slot /></h2>',
  },
  Button: {
    name: 'Button',
    props: ['variant', 'size', 'disabled'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  Badge: {
    name: 'Badge',
    props: ['variant', 'class'],
    template: '<span class="badge"><slot /></span>',
  },
  Tabs: {
    name: 'Tabs',
    props: ['defaultValue'],
    emits: ['update:modelValue'],
    template: '<div><slot /></div>',
  },
  TabsList: {
    name: 'TabsList',
    template: '<div><slot /></div>',
  },
  TabsTrigger: {
    name: 'TabsTrigger',
    props: ['value'],
    template: '<button><slot /></button>',
  },
  TabsContent: {
    name: 'TabsContent',
    props: ['value'],
    template: '<div><slot /></div>',
  },
  useToast: () => ({ toast: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// lucide-vue-next — add CheckCircle2 which is missing from the global setup
// ---------------------------------------------------------------------------
vi.mock('lucide-vue-next', async () => {
  // Re-use every icon from the global mock, but also add CheckCircle2
  const existingMock = await vi.importActual<Record<string, any>>('lucide-vue-next').catch(() => ({}));
  return {
    // icons already in setup.ts
    ChevronLeft: { name: 'ChevronLeft', template: '<svg></svg>' },
    LogOut: { name: 'LogOut', template: '<svg></svg>' },
    Users: { name: 'Users', template: '<svg></svg>' },
    Loader2: { name: 'Loader2', template: '<svg class="loader2"></svg>' },
    CheckCircle: { name: 'CheckCircle', template: '<svg></svg>' },
    // Required by AngelitosView but absent from global mock
    CheckCircle2: { name: 'CheckCircle2', template: '<svg class="check-circle-2"></svg>' },
    // Spread remaining to avoid warnings from other imports in transitive deps
    ...Object.fromEntries(
      Object.keys(existingMock)
        .filter((k) => !['CheckCircle2', 'CheckCircle', 'Loader2'].includes(k))
        .map((k) => [k, { name: k, template: '<svg></svg>' }]),
    ),
  };
});

// ---------------------------------------------------------------------------
// Import the component AFTER all vi.mock() calls
// ---------------------------------------------------------------------------
import AngelitosView from '../AngelitosView.vue';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAngelito(id: string, firstName: string, lastName: string) {
  return { id, firstName, lastName, isCancelled: false };
}

function makeMountOptions(pinia: ReturnType<typeof createPinia>) {
  return {
    global: {
      plugins: [pinia],
      mocks: { $t: (k: string) => k },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AngelitosView', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);

    mockGetParticipantsByRetreat.mockResolvedValue([]);
    mockGetParticipantAvailability.mockResolvedValue([]);
    mockGetParticipantAssignedSlots.mockResolvedValue([]);
    mockSetParticipantAvailability.mockResolvedValue({});
  });

  // -------------------------------------------------------------------------
  describe('Carga inicial', () => {
    it('llama a getParticipantsByRetreat con type partial_server al montar', async () => {
      const wrapper = mount(AngelitosView, makeMountOptions(pinia));
      await flushPromises();

      expect(mockGetParticipantsByRetreat).toHaveBeenCalledWith('retreat-1', 'partial_server');
      wrapper.unmount();
    });

    it('no muestra la tabla si no hay angelitos', async () => {
      mockGetParticipantsByRetreat.mockResolvedValue([]);

      const wrapper = mount(AngelitosView, makeMountOptions(pinia));
      await flushPromises();

      expect(wrapper.find('table').exists()).toBe(false);
      wrapper.unmount();
    });

    it('muestra la tabla cuando hay angelitos cargados', async () => {
      mockGetParticipantsByRetreat.mockResolvedValue([
        makeAngelito('p1', 'Ana', 'García'),
      ]);
      mockGetParticipantAvailability.mockResolvedValue([]);

      const wrapper = mount(AngelitosView, makeMountOptions(pinia));
      await flushPromises();

      expect(wrapper.find('table').exists()).toBe(true);
      wrapper.unmount();
    });
  });

  // -------------------------------------------------------------------------
  describe('Tabla de angelitos', () => {
    async function mountWithAngelitos() {
      mockGetParticipantsByRetreat.mockResolvedValue([
        makeAngelito('p1', 'Ana', 'García'),
        makeAngelito('p2', 'Luis', 'Pérez'),
      ]);

      // p1 has no blocks, p2 has 2 blocks
      mockGetParticipantAvailability.mockImplementation(
        (_retreatId: string, participantId: string) => {
          if (participantId === 'p2') {
            return Promise.resolve([
              { id: 'b1', startTime: '2026-06-05T08:00:00.000Z', endTime: '2026-06-05T10:00:00.000Z' },
              { id: 'b2', startTime: '2026-06-05T14:00:00.000Z', endTime: '2026-06-05T16:00:00.000Z' },
            ]);
          }
          return Promise.resolve([]);
        },
      );

      const wrapper = mount(AngelitosView, makeMountOptions(pinia));
      await flushPromises();
      return wrapper;
    }

    it('muestra badge "Sin horario" para angelitos con 0 bloques', async () => {
      const wrapper = await mountWithAngelitos();

      // "Sin horario" is hardcoded text in the template (not an i18n key)
      expect(wrapper.text()).toContain('Sin horario');
      wrapper.unmount();
    });

    it('muestra "X bloque(s)" para angelitos con bloques configurados', async () => {
      const wrapper = await mountWithAngelitos();

      expect(wrapper.text()).toContain('2 bloque(s)');
      wrapper.unmount();
    });

    it('muestra botón "Configurar" (openEditor key) para angelitos sin horario', async () => {
      const wrapper = await mountWithAngelitos();

      const buttons = wrapper.findAll('button');
      const configureBtn = buttons.find((b) =>
        b.text().includes('angelitos.availabilityStatus.openEditor'),
      );
      expect(configureBtn).toBeDefined();
      wrapper.unmount();
    });

    it('muestra botón "Editar" (editEditor key) para angelitos con horario', async () => {
      const wrapper = await mountWithAngelitos();

      const buttons = wrapper.findAll('button');
      const editBtn = buttons.find((b) =>
        b.text().includes('angelitos.availabilityStatus.editEditor'),
      );
      expect(editBtn).toBeDefined();
      wrapper.unmount();
    });

    it('muestra resumen: "N de M angelitos con horario" (i18n key de summary)', async () => {
      const wrapper = await mountWithAngelitos();

      // The summary text uses t('angelitos.availabilityStatus.summary', {...}),
      // which the $t mock returns as the key string.
      expect(wrapper.text()).toContain('angelitos.availabilityStatus.summary');
      wrapper.unmount();
    });

    it('no incluye angelitos cancelados en la lista', async () => {
      mockGetParticipantsByRetreat.mockResolvedValue([
        makeAngelito('p1', 'Ana', 'García'),
        { id: 'c1', firstName: 'Carlos', lastName: 'Cancelado', isCancelled: true },
      ]);
      mockGetParticipantAvailability.mockResolvedValue([]);

      const wrapper = mount(AngelitosView, makeMountOptions(pinia));
      await flushPromises();

      expect(wrapper.text()).toContain('Ana García');
      expect(wrapper.text()).not.toContain('Carlos Cancelado');
      wrapper.unmount();
    });
  });

  // -------------------------------------------------------------------------
  describe('openEditor', () => {
    async function mountWithOneAngelito() {
      mockGetParticipantsByRetreat.mockResolvedValue([
        makeAngelito('p1', 'Ana', 'García'),
      ]);
      mockGetParticipantAvailability.mockResolvedValue([]);
      mockGetParticipantAssignedSlots.mockResolvedValue([]);

      const wrapper = mount(AngelitosView, makeMountOptions(pinia));
      await flushPromises();
      return wrapper;
    }

    it('el dialog está cerrado antes de hacer click en el botón', async () => {
      const wrapper = await mountWithOneAngelito();

      expect(wrapper.find('.dialog-content').exists()).toBe(false);
      wrapper.unmount();
    });

    it('abre el dialog cuando se hace click en el botón', async () => {
      const wrapper = await mountWithOneAngelito();

      const btn = wrapper.findAll('button').find((b) =>
        b.text().includes('angelitos.availabilityStatus.openEditor'),
      );
      expect(btn).toBeDefined();
      await btn!.trigger('click');
      await flushPromises();

      expect(wrapper.find('.dialog-content').exists()).toBe(true);
      wrapper.unmount();
    });

    it('llama a getParticipantAvailability y getParticipantAssignedSlots al abrir', async () => {
      const wrapper = await mountWithOneAngelito();

      // Reset call counts to isolate the openEditor calls from loadStatuses
      mockGetParticipantAvailability.mockClear();
      mockGetParticipantAssignedSlots.mockClear();

      const btn = wrapper.findAll('button').find((b) =>
        b.text().includes('angelitos.availabilityStatus.openEditor'),
      );
      await btn!.trigger('click');
      await flushPromises();

      expect(mockGetParticipantAvailability).toHaveBeenCalledWith('retreat-1', 'p1');
      expect(mockGetParticipantAssignedSlots).toHaveBeenCalledWith('retreat-1', 'p1');
      wrapper.unmount();
    });

    it('muestra el nombre del angelito en el título del dialog', async () => {
      const wrapper = await mountWithOneAngelito();

      const btn = wrapper.findAll('button').find((b) =>
        b.text().includes('angelitos.availabilityStatus.openEditor'),
      );
      await btn!.trigger('click');
      await flushPromises();

      expect(wrapper.find('.dialog-content').text()).toContain('Ana García');
      wrapper.unmount();
    });
  });

  // -------------------------------------------------------------------------
  describe('saveAvailability', () => {
    async function openEditorForP1() {
      mockGetParticipantsByRetreat.mockResolvedValue([
        makeAngelito('p1', 'Ana', 'García'),
      ]);
      // Initially no blocks → openEditor key shown
      mockGetParticipantAvailability.mockResolvedValue([]);
      mockGetParticipantAssignedSlots.mockResolvedValue([]);

      const wrapper = mount(AngelitosView, makeMountOptions(pinia));
      await flushPromises();

      // Open the editor
      const configureBtn = wrapper.findAll('button').find((b) =>
        b.text().includes('angelitos.availabilityStatus.openEditor'),
      );
      await configureBtn!.trigger('click');
      await flushPromises();

      return wrapper;
    }

    it('llama a setParticipantAvailability con los bloques actuales', async () => {
      const wrapper = await openEditorForP1();

      // Click the save button inside the dialog
      const saveBtn = wrapper.findAll('button').find((b) =>
        b.text().includes('angelitos.availabilityStatus.saveAvailability'),
      );
      expect(saveBtn).toBeDefined();
      await saveBtn!.trigger('click');
      await flushPromises();

      expect(mockSetParticipantAvailability).toHaveBeenCalledWith(
        'retreat-1',
        'p1',
        expect.any(Array),
      );
      wrapper.unmount();
    });

    it('actualiza status.blocks localmente después de guardar', async () => {
      // p1 has 1 block returned by getParticipantAvailability after openEditor
      mockGetParticipantsByRetreat.mockResolvedValue([
        makeAngelito('p1', 'Ana', 'García'),
      ]);
      mockGetParticipantAvailability.mockResolvedValue([
        { id: 'b1', startTime: '2026-06-05T08:00:00.000Z', endTime: '2026-06-05T10:00:00.000Z' },
      ]);
      mockGetParticipantAssignedSlots.mockResolvedValue([]);

      const wrapper = mount(AngelitosView, makeMountOptions(pinia));
      await flushPromises();

      // Open the editor — at this point the table shows 1 bloque(s)
      const editBtn = wrapper.findAll('button').find((b) =>
        b.text().includes('angelitos.availabilityStatus.editEditor'),
      );
      await editBtn!.trigger('click');
      await flushPromises();

      // Save
      const saveBtn = wrapper.findAll('button').find((b) =>
        b.text().includes('angelitos.availabilityStatus.saveAvailability'),
      );
      await saveBtn!.trigger('click');
      await flushPromises();

      // The row for p1 should still show "1 bloque(s)" (same blocks as loaded)
      expect(wrapper.text()).toContain('1 bloque(s)');
      wrapper.unmount();
    });

    it('cierra el dialog después de guardar con éxito', async () => {
      const wrapper = await openEditorForP1();

      expect(wrapper.find('.dialog-content').exists()).toBe(true);

      const saveBtn = wrapper.findAll('button').find((b) =>
        b.text().includes('angelitos.availabilityStatus.saveAvailability'),
      );
      await saveBtn!.trigger('click');
      await flushPromises();

      expect(wrapper.find('.dialog-content').exists()).toBe(false);
      wrapper.unmount();
    });
  });

  // -------------------------------------------------------------------------
  describe('Estado de carga', () => {
    it('muestra skeleton loader (Loader2) mientras loading === true', async () => {
      // Create a promise we control so we can inspect mid-flight state
      let resolveParticipants!: (v: any[]) => void;
      const pendingParticipants = new Promise<any[]>((res) => {
        resolveParticipants = res;
      });
      mockGetParticipantsByRetreat.mockReturnValue(pendingParticipants);

      const wrapper = mount(AngelitosView, makeMountOptions(pinia));

      // While the promise is still pending, loading should be true.
      // El mock de Loader2 en setup.ts usa template '<svg class="animate-spin">',
      // por eso buscamos svg.animate-spin o la ausencia de la tabla.
      await wrapper.vm.$nextTick();
      expect(wrapper.find('table').exists()).toBe(false);

      // Resolve and clean up
      resolveParticipants([]);
      await flushPromises();
      wrapper.unmount();
    });

    it('oculta el skeleton loader después de que la carga termina', async () => {
      mockGetParticipantsByRetreat.mockResolvedValue([]);

      const wrapper = mount(AngelitosView, makeMountOptions(pinia));
      await flushPromises();

      // After loading completes the skeleton (which contains Loader2) is gone
      // The table panel with loading=false and statuses.length===0 also won't render
      // so the whole loading div should be absent
      expect(wrapper.text()).not.toContain('Cargando...');
      wrapper.unmount();
    });
  });
});
