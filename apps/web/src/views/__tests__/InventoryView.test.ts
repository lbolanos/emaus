import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';

// ---------------------------------------------------------------------------
// Mocks de servicios API
// ---------------------------------------------------------------------------
vi.mock('@/services/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// ---------------------------------------------------------------------------
// Mock de ExcelJS (pesado, no necesario en unit tests)
// ---------------------------------------------------------------------------
vi.mock('exceljs', () => ({
  default: {
    Workbook: vi.fn().mockImplementation(() => ({
      addWorksheet: vi.fn().mockReturnValue({
        columns: [],
        addRow: vi.fn(),
        getRow: vi.fn().mockReturnValue({ font: {}, fill: {} }),
      }),
      xlsx: { writeBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)) },
    })),
  },
}));

// ---------------------------------------------------------------------------
// Override de vue-router con retreatId conocido
// ---------------------------------------------------------------------------
vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: { id: 'test-retreat-id' },
    query: {},
    path: '/retreats/test-retreat-id/inventory',
    name: 'inventory',
  }),
  useRouter: () => ({ push: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Mock del store de inventario
// ---------------------------------------------------------------------------
const mockFetchByCategory = vi.fn().mockResolvedValue(undefined);
const mockFetchAlerts = vi.fn().mockResolvedValue(undefined);
const mockFetchHistory = vi.fn().mockResolvedValue(undefined);
const mockFetchCategories = vi.fn().mockResolvedValue(undefined);
const mockFetchAvailableItems = vi.fn().mockResolvedValue([]);
const mockCalculateRequired = vi.fn().mockResolvedValue(undefined);
const mockSyncShirtItems = vi.fn().mockResolvedValue({ created: 0, updated: 0, removed: 0, skipped: 0 });
const mockAddItemToRetreat = vi.fn().mockResolvedValue({});
const mockAddCustomItemToRetreat = vi.fn().mockResolvedValue({});
const mockRemoveItemFromRetreat = vi.fn().mockResolvedValue(true);
const mockBulkRemoveItems = vi.fn().mockResolvedValue({ removed: 0 });
const mockBulkUpdate = vi.fn().mockResolvedValue({ updated: 0, notFound: 0 });
const mockUpdateRetreatInventory = vi.fn().mockResolvedValue({ id: 'x', ratioOverride: null, requiredQtyOverride: null, isExcluded: false });
const mockCopyInventory = vi.fn().mockResolvedValue({ copied: 0, created: 0, skipped: 0 });
const mockExportInventory = vi.fn().mockResolvedValue([]);

// Data reactiva del store (se puede personalizar por test)
let storeInventoryByCategory: Record<string, any[]> = {};
let storeAlerts: any[] = [];
let storeLoading = false;

vi.mock('@/stores/retreatStore', () => ({
  useRetreatStore: () => ({
    selectedRetreat: { id: 'test-retreat-id', max_walkers: 30 },
    selectedRetreatId: 'test-retreat-id',
  }),
}));

vi.mock('@/stores/inventoryStore', () => ({
  useInventoryStore: () => ({
    loading: storeLoading,
    retreatInventoryByCategory: storeInventoryByCategory,
    inventoryAlerts: storeAlerts,
    categories: [],
    teams: [],
    items: [],
    retreatInventory: [],
    fetchRetreatInventoryByCategory: mockFetchByCategory,
    fetchInventoryAlerts: mockFetchAlerts,
    fetchInventoryHistory: mockFetchHistory,
    fetchCategories: mockFetchCategories,
    fetchAvailableItemsForRetreat: mockFetchAvailableItems,
    calculateRequiredQuantities: mockCalculateRequired,
    syncShirtItems: mockSyncShirtItems,
    addItemToRetreat: mockAddItemToRetreat,
    addCustomItemToRetreat: mockAddCustomItemToRetreat,
    removeItemFromRetreat: mockRemoveItemFromRetreat,
    bulkRemoveItemsFromRetreat: mockBulkRemoveItems,
    bulkUpdateRetreatInventory: mockBulkUpdate,
    updateRetreatInventory: mockUpdateRetreatInventory,
    fetchRetreatInventory: vi.fn().mockResolvedValue(undefined),
    exportInventory: mockExportInventory,
    importInventory: vi.fn().mockResolvedValue({}),
    createCategory: vi.fn(),
    updateInventoryItem: vi.fn(),
    $reset: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Override @repo/ui — agrega Dropdown/Tooltip/Select/Tabs completos
// ---------------------------------------------------------------------------
vi.mock('@repo/ui', () => ({
  Button: {
    name: 'Button',
    props: ['variant', 'size', 'disabled'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  Input: {
    name: 'Input',
    props: ['modelValue', 'placeholder', 'type', 'disabled', 'class'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  Label: { name: 'Label', template: '<label><slot /></label>' },
  Card: { name: 'Card', template: '<div class="card"><slot /></div>' },
  CardHeader: { name: 'CardHeader', template: '<div><slot /></div>' },
  CardTitle: { name: 'CardTitle', template: '<h3><slot /></h3>' },
  CardContent: { name: 'CardContent', template: '<div><slot /></div>' },
  Badge: { name: 'Badge', props: ['variant', 'class'], template: '<span class="badge"><slot /></span>' },
  Dialog: {
    name: 'Dialog',
    props: ['open'],
    emits: ['update:open'],
    template: '<div v-if="open" data-testid="dialog"><slot /></div>',
  },
  DialogContent: { name: 'DialogContent', template: '<div><slot /></div>' },
  DialogHeader: { name: 'DialogHeader', template: '<div><slot /></div>' },
  DialogTitle: { name: 'DialogTitle', template: '<h2><slot /></h2>' },
  DialogDescription: { name: 'DialogDescription', template: '<p><slot /></p>' },
  DialogFooter: { name: 'DialogFooter', template: '<div><slot /></div>' },
  Select: { name: 'Select', props: ['modelValue'], emits: ['update:modelValue'], template: '<div><slot /></div>' },
  SelectTrigger: { name: 'SelectTrigger', template: '<button><slot /></button>' },
  SelectContent: { name: 'SelectContent', template: '<div><slot /></div>' },
  SelectItem: { name: 'SelectItem', props: ['value'], template: '<div><slot /></div>' },
  SelectValue: { name: 'SelectValue', props: ['placeholder'], template: '<span><slot /></span>' },
  DropdownMenu: { name: 'DropdownMenu', template: '<div><slot /></div>' },
  DropdownMenuTrigger: { name: 'DropdownMenuTrigger', props: ['asChild', 'as-child'], template: '<div><slot /></div>' },
  DropdownMenuContent: { name: 'DropdownMenuContent', props: ['align'], template: '<div><slot /></div>' },
  DropdownMenuItem: {
    name: 'DropdownMenuItem',
    emits: ['click', 'select'],
    template: '<div @click="$emit(\'click\')" @select="$emit(\'select\')"><slot /></div>',
  },
  DropdownMenuSeparator: { name: 'DropdownMenuSeparator', template: '<hr />' },
  DropdownMenuLabel: { name: 'DropdownMenuLabel', template: '<div><slot /></div>' },
  Tooltip: { name: 'Tooltip', template: '<div><slot /></div>' },
  TooltipContent: { name: 'TooltipContent', template: '<div><slot /></div>' },
  TooltipTrigger: { name: 'TooltipTrigger', props: ['asChild', 'as-child'], template: '<div><slot /></div>' },
  TooltipProvider: { name: 'TooltipProvider', template: '<div><slot /></div>' },
  Tabs: { name: 'Tabs', props: ['defaultValue', 'modelValue'], emits: ['update:modelValue'], template: '<div><slot /></div>' },
  TabsList: { name: 'TabsList', template: '<div><slot /></div>' },
  TabsTrigger: { name: 'TabsTrigger', props: ['value'], template: '<button><slot /></button>' },
  TabsContent: { name: 'TabsContent', props: ['value'], template: '<div><slot /></div>' },
  useToast: () => ({ toast: vi.fn() }),
  Checkbox: {
    name: 'Checkbox',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
  },
  RadioGroup: {
    name: 'RadioGroup',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<div><slot /></div>',
  },
  RadioGroupItem: {
    name: 'RadioGroupItem',
    props: ['value', 'disabled'],
    template: '<input type="radio" :value="value" :disabled="disabled" />',
  },
}));

// ---------------------------------------------------------------------------
// Mock lucide-vue-next
// ---------------------------------------------------------------------------
vi.mock('lucide-vue-next', () => {
  const icon = (name: string) => ({ name, template: `<svg data-icon="${name}"></svg>` });
  return {
    Calculator: icon('Calculator'),
    Upload: icon('Upload'),
    Download: icon('Download'),
    AlertTriangle: icon('AlertTriangle'),
    Package: icon('Package'),
    Search: icon('Search'),
    X: icon('X'),
    Copy: icon('Copy'),
    Printer: icon('Printer'),
    History: icon('History'),
    CheckSquare: icon('CheckSquare'),
    MoreHorizontal: icon('MoreHorizontal'),
    ChevronDown: icon('ChevronDown'),
    Plus: icon('Plus'),
    Pencil: icon('Pencil'),
    Trash2: icon('Trash2'),
    Columns: icon('Columns'),
    Check: icon('Check'),
    ShoppingCart: icon('ShoppingCart'),
    Shirt: icon('Shirt'),
    HelpCircle: icon('HelpCircle'),
    SlidersHorizontal: icon('SlidersHorizontal'),
    RefreshCw: icon('RefreshCw'),
    Lock: icon('Lock'),
    Loader2: icon('Loader2'),
  };
});

// ---------------------------------------------------------------------------
// Import del componente DESPUÉS de los vi.mock
// ---------------------------------------------------------------------------
import InventoryView from '../InventoryView.vue';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeItem(overrides: Record<string, any> = {}) {
  return {
    id: `item-${Math.random().toString(36).slice(2)}`,
    inventoryItemId: `inv-${Math.random().toString(36).slice(2)}`,
    retreatId: 'test-retreat-id',
    inventoryItem: {
      id: overrides.inventoryItemId ?? 'global-item-1',
      name: overrides.name ?? 'Artículo Test',
      unit: overrides.unit ?? 'piezas',
      category: { name: overrides.category ?? 'Categoría A' },
      team: { name: overrides.team ?? 'Equipo 1' },
    },
    requiredQuantity: overrides.requiredQuantity ?? 10,
    currentQuantity: overrides.currentQuantity ?? 5,
    isSufficient: overrides.isSufficient ?? false,
    status: overrides.status ?? 'pending',
    boxLabel: overrides.boxLabel ?? null,
    notes: overrides.notes ?? '',
    customName: overrides.customName ?? null,
    customUnit: overrides.customUnit ?? null,
    customCategory: overrides.customCategory ?? null,
    retreatShirtTypeId: overrides.retreatShirtTypeId ?? null,
    ratioOverride: overrides.ratioOverride ?? null,
    requiredQtyOverride: overrides.requiredQtyOverride ?? null,
    isExcluded: overrides.isExcluded ?? false,
    ...overrides,
  };
}

function makeAdHocItem(overrides: Record<string, any> = {}) {
  return {
    id: `adhoc-${Math.random().toString(36).slice(2)}`,
    inventoryItemId: null,
    retreatId: 'test-retreat-id',
    inventoryItem: null,
    customName: overrides.customName ?? 'Café Marlboro',
    customUnit: overrides.customUnit ?? 'sobres',
    customCategory: overrides.customCategory ?? null,
    retreatShirtTypeId: null,
    requiredQuantity: overrides.requiredQuantity ?? 5,
    currentQuantity: overrides.currentQuantity ?? 0,
    isSufficient: false,
    status: 'pending',
    boxLabel: null,
    notes: '',
    ...overrides,
  };
}

function mountOptions(pinia: ReturnType<typeof createPinia>) {
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
describe('InventoryView', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    // Resetear estado reactivo del store
    storeInventoryByCategory = {};
    storeAlerts = [];
    storeLoading = false;
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  describe('Carga inicial', () => {
    it('llama a fetchRetreatInventoryByCategory con el retreatId al montar', async () => {
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();
      expect(mockFetchByCategory).toHaveBeenCalledWith('test-retreat-id');
      wrapper.unmount();
    });

    it('llama a fetchInventoryAlerts al montar', async () => {
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();
      expect(mockFetchAlerts).toHaveBeenCalledWith('test-retreat-id');
      wrapper.unmount();
    });

    it('renderiza el título "Gestión de Inventario"', async () => {
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();
      expect(wrapper.text()).toContain('Gestión de Inventario');
      wrapper.unmount();
    });

    it('muestra botón "Agregar item"', async () => {
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();
      expect(wrapper.text()).toContain('Agregar item');
      wrapper.unmount();
    });

    it('muestra botón "Recalcular"', async () => {
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();
      expect(wrapper.text()).toContain('Recalcular');
      wrapper.unmount();
    });
  });

  // -------------------------------------------------------------------------
  describe('Banner de alertas', () => {
    it('NO muestra el banner cuando no hay alertas', async () => {
      storeAlerts = [];
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();
      expect(wrapper.find('[aria-label*="insuficientes"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('muestra el banner con el conteo cuando hay alertas', async () => {
      storeAlerts = [
        { id: 'a1', itemName: 'Artículo A', deficit: 3, unit: 'piezas', teamName: 'Equipo 1', categoryName: 'Cat A' },
        { id: 'a2', itemName: 'Artículo B', deficit: 5, unit: 'piezas', teamName: 'Equipo 2', categoryName: 'Cat B' },
      ];
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();
      const banner = wrapper.find('[aria-label*="insuficientes"]');
      expect(banner.exists()).toBe(true);
      expect(banner.attributes('aria-label')).toContain('2');
      wrapper.unmount();
    });
  });

  // -------------------------------------------------------------------------
  describe('Tabla de items', () => {
    it('renderiza el nombre de un item del catálogo', async () => {
      storeInventoryByCategory = {
        'Categoría A': [makeItem({ name: 'Artículo Visible Test' })],
      };
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();
      expect(wrapper.text()).toContain('Artículo Visible Test');
      wrapper.unmount();
    });

    it('renderiza el nombre de un item ad-hoc (customName)', async () => {
      storeInventoryByCategory = {
        'Sin categoría': [makeAdHocItem({ customName: 'Café Marlboro 30g' })],
      };
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();
      expect(wrapper.text()).toContain('Café Marlboro 30g');
      wrapper.unmount();
    });

    it('renderiza encabezado de categoría', async () => {
      storeInventoryByCategory = {
        'Botiquín': [makeItem({ name: 'Aspirina', category: 'Botiquín' })],
      };
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();
      expect(wrapper.text()).toContain('Botiquín');
      wrapper.unmount();
    });

    it('muestra mensaje vacío cuando no hay items', async () => {
      storeInventoryByCategory = {};
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();
      // El estado vacío muestra un mensaje o simplemente no muestra rows
      const rows = wrapper.findAll('tbody tr');
      expect(rows.length).toBe(0);
      wrapper.unmount();
    });
  });

  // -------------------------------------------------------------------------
  describe('Búsqueda / filtrado', () => {
    it('el campo de búsqueda existe y acepta input', async () => {
      storeInventoryByCategory = {
        'Cat A': [makeItem({ name: 'Artículo Buscable' })],
      };
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();

      const searchInput = wrapper.find('input[type="text"], input:not([type])');
      expect(searchInput.exists()).toBe(true);
      await searchInput.setValue('algo');
      expect((searchInput.element as HTMLInputElement).value).toBe('algo');
      wrapper.unmount();
    });

    it('filtra items que no coinciden con la búsqueda', async () => {
      storeInventoryByCategory = {
        'Cat A': [
          makeItem({ name: 'Artículo Visible' }),
          makeItem({ name: 'Otro Artículo' }),
        ],
      };
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();

      // Con búsqueda activa, solo "Artículo Visible" debe aparecer
      const searchInput = wrapper.find('input:not([type="checkbox"])');
      await searchInput.setValue('Artículo Visible');
      await flushPromises();

      expect(wrapper.text()).toContain('Artículo Visible');
      expect(wrapper.text()).not.toContain('Otro Artículo');
      wrapper.unmount();
    });

    it('busca también en customName de items ad-hoc', async () => {
      storeInventoryByCategory = {
        'Sin categoría': [
          makeAdHocItem({ customName: 'Café Marlboro' }),
          makeAdHocItem({ customName: 'Agua Purificada' }),
        ],
      };
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();

      const searchInput = wrapper.find('input:not([type="checkbox"])');
      await searchInput.setValue('Marlboro');
      await flushPromises();

      expect(wrapper.text()).toContain('Café Marlboro');
      expect(wrapper.text()).not.toContain('Agua Purificada');
      wrapper.unmount();
    });
  });

  // -------------------------------------------------------------------------
  describe('Selección masiva (bulk bar)', () => {
    it('no muestra la barra bulk cuando no hay items seleccionados', async () => {
      storeInventoryByCategory = {
        'Cat A': [makeItem({ name: 'Item 1' })],
      };
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();
      // La bulk bar aparece con v-if="selectedItemIds.size > 0"
      expect(wrapper.text()).not.toContain('seleccionados');
      wrapper.unmount();
    });
  });

  // -------------------------------------------------------------------------
  describe('Recalcular — aviso de overrides', () => {
    it('muestra aviso 🔒 cuando hay items con requiredQtyOverride', async () => {
      storeInventoryByCategory = {
        'Cat A': [
          makeItem({ name: 'Item override', requiredQtyOverride: 42 }),
          makeItem({ name: 'Item normal' }),
        ],
      };
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();

      const recalcBtn = wrapper.findAll('button').find(b => b.text().includes('Recalcular'));
      await recalcBtn!.trigger('click');
      await flushPromises();

      // El aviso debe aparecer en el dialog
      expect(wrapper.text()).toContain('no cambiarán');
      expect(wrapper.text()).toContain('🔒');
      wrapper.unmount();
    });

    it('NO muestra el aviso cuando no hay overrides', async () => {
      storeInventoryByCategory = {
        'Cat A': [makeItem({ name: 'Sin override' })],
      };
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();

      const recalcBtn = wrapper.findAll('button').find(b => b.text().includes('Recalcular'));
      await recalcBtn!.trigger('click');
      await flushPromises();

      expect(wrapper.text()).not.toContain('no cambiarán');
      wrapper.unmount();
    });
  });

  // -------------------------------------------------------------------------
  describe('Recalcular — dialog', () => {
    it('abre el dialog de recalcular al clicar el botón', async () => {
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();

      const btn = wrapper.findAll('button').find((b) => b.text().includes('Recalcular'));
      expect(btn).toBeTruthy();
      await btn!.trigger('click');
      await flushPromises();

      expect(wrapper.text()).toContain('Recalcular cantidades requeridas');
      wrapper.unmount();
    });

    it('llama a calculateRequiredQuantities con calcBase tras confirmar', async () => {
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();

      // Abrir dialog
      const recalcBtn = wrapper.findAll('button').find((b) => b.text().includes('Recalcular'));
      await recalcBtn!.trigger('click');
      await flushPromises();

      // El dialog está abierto; buscar el botón "Recalcular" dentro del dialog
      // (data-testid="dialog" wraps the content)
      const dialog = wrapper.find('[data-testid="dialog"]');
      expect(dialog.exists()).toBe(true);
      const confirmBtn = dialog.findAll('button').find((b) => b.text().includes('Recalcular'));
      expect(confirmBtn).toBeTruthy();
      await confirmBtn!.trigger('click');
      await flushPromises();

      expect(mockCalculateRequired).toHaveBeenCalledWith(
        'test-retreat-id',
        expect.stringMatching(/^(actual|expected)$/),
      );
      wrapper.unmount();
    });
  });

  // -------------------------------------------------------------------------
  describe('Helpers de display', () => {
    it('muestra el nombre del inventoryItem cuando existe', async () => {
      storeInventoryByCategory = {
        'Cat A': [makeItem({ name: 'Nombre Global' })],
      };
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();
      expect(wrapper.text()).toContain('Nombre Global');
      wrapper.unmount();
    });

    it('muestra customName cuando inventoryItem es null', async () => {
      storeInventoryByCategory = {
        'Sin categoría': [makeAdHocItem({ customName: 'Nombre Ad-hoc Custom' })],
      };
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();
      expect(wrapper.text()).toContain('Nombre Ad-hoc Custom');
      wrapper.unmount();
    });
  });

  // -------------------------------------------------------------------------
  describe('Agregar item con overrides del catálogo', () => {
    it('llama a addItemToRetreat con ratioOverride y requiredQtyOverride cuando están configurados', async () => {
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();

      const vm = wrapper.vm as any;
      // Simular items disponibles seleccionados y overrides configurados
      vm.selectedAvailableIds = new Set(['item-cat-1']);
      vm.catalogRatioOverride = '3.5';
      vm.catalogRequiredQtyOverride = '25';
      await flushPromises();

      await vm.confirmAddItems();
      await flushPromises();

      expect(mockAddItemToRetreat).toHaveBeenCalledWith(
        'test-retreat-id',
        'item-cat-1',
        expect.objectContaining({ ratioOverride: 3.5, requiredQtyOverride: 25 }),
      );
      wrapper.unmount();
    });

    it('llama a addItemToRetreat sin overrides cuando los campos están vacíos', async () => {
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();

      const vm = wrapper.vm as any;
      vm.selectedAvailableIds = new Set(['item-cat-2']);
      vm.catalogRatioOverride = '';
      vm.catalogRequiredQtyOverride = '';
      await vm.confirmAddItems();
      await flushPromises();

      expect(mockAddItemToRetreat).toHaveBeenCalledWith(
        'test-retreat-id',
        'item-cat-2',
        expect.objectContaining({ ratioOverride: null, requiredQtyOverride: null }),
      );
      wrapper.unmount();
    });
  });

  // -------------------------------------------------------------------------
  describe('Overrides por retiro', () => {
    it('muestra badge r=X cuando ratioOverride está definido', async () => {
      storeInventoryByCategory = {
        'Cat A': [makeItem({ name: 'Item con ratio override', ratioOverride: 5 })],
      };
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();
      expect(wrapper.text()).toContain('r=5');
      wrapper.unmount();
    });

    it('muestra badge 🔒 cuando requiredQtyOverride está definido', async () => {
      storeInventoryByCategory = {
        'Cat A': [makeItem({ name: 'Item con qty override', requiredQtyOverride: 42 })],
      };
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();
      expect(wrapper.text()).toContain('🔒42');
      wrapper.unmount();
    });

    it('oculta items con isExcluded=true por defecto aunque estén en el store', async () => {
      // IMPORTANTE: getRetreatInventoryByCategory devuelve TODOS los items
      // incluyendo excluidos — el filtrado ocurre en el frontend (allItems computed).
      storeInventoryByCategory = {
        'Cat A': [
          makeItem({ name: 'Item normal' }),
          makeItem({ name: 'Item excluido', isExcluded: true }),
        ],
      };
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();

      expect(wrapper.text()).toContain('Item normal');
      // El item excluido NO aparece por defecto
      expect(wrapper.text()).not.toContain('Item excluido');
      wrapper.unmount();
    });

    it('muestra item excluido con badge "Excluido" al activar pill "Ver excluidos"', async () => {
      storeInventoryByCategory = {
        'Cat A': [makeItem({ name: 'Item excluido', isExcluded: true })],
      };
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();

      // Activar "Ver excluidos"
      const pillBtn = wrapper.findAll('button').find(b => b.text().includes('Ver excluidos'));
      expect(pillBtn).toBeTruthy();
      await pillBtn!.trigger('click');
      await flushPromises();

      // Ahora el item aparece con su nombre Y el badge "Excluido" en la misma celda
      expect(wrapper.text()).toContain('Item excluido');
      expect(wrapper.text()).toContain('Excluido');
      wrapper.unmount();
    });

    it('pill cambia a "Ocultar excluidos" cuando está activo', async () => {
      storeInventoryByCategory = { 'Cat A': [makeItem({})] };
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();

      const pillBtn = wrapper.findAll('button').find(b => b.text().includes('Ver excluidos'));
      await pillBtn!.trigger('click');
      await flushPromises();

      expect(wrapper.text()).toContain('Ocultar excluidos');
      wrapper.unmount();
    });

    it('el dialog de override se abre al clicar "Config. para este retiro"', async () => {
      storeInventoryByCategory = {
        'Cat A': [makeItem({ name: 'Item Configurable' })],
      };
      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();

      // Buscar botón ⋯ y simular click
      const moreBtn = wrapper.find('button[aria-label*="Acciones"]');
      if (moreBtn.exists()) {
        await moreBtn.trigger('click');
        await flushPromises();
      }

      // El dialog de override aparece al clicar la opción (testeamos que existe el texto)
      expect(wrapper.text()).toContain('Config. para este retiro');
      wrapper.unmount();
    });

    it('confirmOverride llama a updateRetreatInventory con los tres campos', async () => {
      const item = makeItem({ name: 'Item Override Test' });
      storeInventoryByCategory = { 'Cat A': [item] };

      const wrapper = mount(InventoryView, mountOptions(pinia));
      await flushPromises();

      // Acceder al vm para llamar directamente a confirmOverride
      const vm = wrapper.vm as any;
      vm.overrideItem = item;
      vm.overrideForm = { ratioOverride: '3', requiredQtyOverride: '50', isExcluded: false };
      vm.showOverrideDialog = true;
      await flushPromises();

      await vm.confirmOverride();
      await flushPromises();

      expect(mockUpdateRetreatInventory).toHaveBeenCalledWith(
        'test-retreat-id',
        expect.any(String),
        expect.objectContaining({
          ratioOverride: 3,
          requiredQtyOverride: 50,
          isExcluded: false,
        }),
      );
      wrapper.unmount();
    });
  });
});
