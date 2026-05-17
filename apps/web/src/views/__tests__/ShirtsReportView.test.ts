import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { cleanupMocks } from '@/test/utils';

// ── Global mocks ────────────────────────────────────────────────────────────

vi.mock('axios', () => ({
  create: vi.fn(() => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  })),
  defaults: { baseURL: '', withCredentials: false },
}));

vi.mock('@/utils/csrf', () => ({
  setupCsrfInterceptor: vi.fn(),
  getCsrfToken: vi.fn(async () => 'mock-csrf-token'),
}));

vi.mock('@/config/runtimeConfig', () => ({
  getApiUrl: vi.fn(() => 'http://localhost:3001/api'),
}));

vi.mock('@/services/telemetryService', () => ({
  telemetryService: {
    isTelemetryActive: vi.fn(() => false),
    trackApiCallTime: vi.fn(),
    trackError: vi.fn(),
  },
}));

const mockGetShirtReport = vi.fn();
vi.mock('@/services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getShirtReport: (...args: any[]) => mockGetShirtReport(...args),
}));

vi.mock('lucide-vue-next', () => {
  const icon = (name: string) => ({ name, template: `<svg data-icon="${name}"></svg>` });
  return {
    Shirt: icon('shirt'),
    Printer: icon('printer'),
    Search: icon('search'),
    X: icon('x'),
    Users: icon('users'),
    Sparkles: icon('sparkles'),
    Package: icon('package'),
  };
});

vi.mock('@repo/ui', () => ({
  Input: {
    name: 'Input',
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  Button: { name: 'Button', template: '<button><slot /></button>' },
  Badge: { name: 'Badge', template: '<span><slot /></span>' },
  useToast: () => ({ toast: vi.fn() }),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

import ShirtsReportView from '../ShirtsReportView.vue';
import { useRetreatStore } from '@/stores/retreatStore';

const RETREAT_ID = 'retreat-shirts-test';

const PLAYERA_TYPE = { id: 'st-playera', name: 'Playera', color: 'white', sortOrder: 1 };
const CHAMARRA_TYPE = { id: 'st-chamarra', name: 'Chamarra', color: null, sortOrder: 2 };

function makeServer(overrides: Record<string, any> = {}) {
  return {
    participantId: 'p-' + Math.random().toString(36).slice(2, 8),
    firstName: 'Ana',
    lastName: 'López',
    idOnRetreat: 10,
    type: 'server' as const,
    shirts: [],
    ...overrides,
  };
}

function makeAngelito(overrides: Record<string, any> = {}) {
  return {
    participantId: 'p-' + Math.random().toString(36).slice(2, 8),
    firstName: 'Beto',
    lastName: 'Pérez',
    idOnRetreat: 11,
    type: 'partial_server' as const,
    shirts: [],
    ...overrides,
  };
}

function makeShirt(typeId: string, name: string, size: string, sortOrder = 1) {
  return { shirtTypeId: typeId, shirtTypeName: name, color: null, sortOrder, size };
}

function mountView(report: { shirtTypes: any[]; participants: any[] } | null = null) {
  const pinia = createPinia();
  setActivePinia(pinia);

  const retreatStore = useRetreatStore(pinia);
  retreatStore.retreats = [{ id: RETREAT_ID, name: 'Retiro Test' } as any];
  retreatStore.selectedRetreatId = RETREAT_ID;
  retreatStore.fetchRetreats = vi.fn().mockResolvedValue([]);

  if (report !== null) {
    mockGetShirtReport.mockResolvedValueOnce(report);
  } else {
    mockGetShirtReport.mockResolvedValueOnce({ shirtTypes: [], participants: [] });
  }

  return mount(ShirtsReportView, {
    global: {
      plugins: [pinia],
      stubs: { teleport: { template: '<div><slot /></div>' } },
    },
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ShirtsReportView', () => {
  beforeEach(() => {
    mockGetShirtReport.mockReset();
  });

  afterEach(() => {
    cleanupMocks();
  });

  // ── Carga inicial ────────────────────────────────────────────────────────

  describe('carga de datos', () => {
    it('llama getShirtReport con el retreatId del store al montar', async () => {
      mountView({ shirtTypes: [], participants: [] });
      await flushPromises();
      expect(mockGetShirtReport).toHaveBeenCalledWith(RETREAT_ID);
    });

    it('llama fetchRetreats cuando el store viene vacío', async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const retreatStore = useRetreatStore(pinia);
      retreatStore.retreats = [];
      retreatStore.fetchRetreats = vi.fn().mockResolvedValue([]);
      mockGetShirtReport.mockResolvedValueOnce({ shirtTypes: [], participants: [] });

      mount(ShirtsReportView, {
        global: { plugins: [pinia], stubs: { teleport: { template: '<div><slot /></div>' } } },
      });
      await flushPromises();
      expect(retreatStore.fetchRetreats).toHaveBeenCalled();
    });
  });

  // ── Encabezado y totales ─────────────────────────────────────────────────

  describe('header con totales', () => {
    it('cuenta servidores, angelitos y prendas correctamente', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE, CHAMARRA_TYPE],
        participants: [
          makeServer({
            shirts: [
              makeShirt(PLAYERA_TYPE.id, 'Playera', 'M'),
              makeShirt(CHAMARRA_TYPE.id, 'Chamarra', 'G', 2),
            ],
          }),
          makeServer({ firstName: 'Carla', shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'S')] }),
          makeAngelito({ shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'X')] }),
        ],
      });
      await flushPromises();

      const text = w.text();
      expect(text).toContain('Servidores');
      expect(text).toContain('Angelitos');
      expect(text).toContain('Prendas');
      // 2 servidores, 1 angelito, 4 prendas — verificable contando spans del header
      expect(text).toMatch(/2[\s\S]*Servidores/);
      expect(text).toMatch(/1[\s\S]*Angelitos/);
      expect(text).toMatch(/4[\s\S]*Prendas/);
    });

    it('muestra cero cuando no hay datos', async () => {
      const w = mountView({ shirtTypes: [], participants: [] });
      await flushPromises();
      expect(w.text()).toMatch(/0[\s\S]*Servidores/);
      expect(w.text()).toMatch(/0[\s\S]*Angelitos/);
      expect(w.text()).toMatch(/0[\s\S]*Prendas/);
    });
  });

  // ── Tabla ────────────────────────────────────────────────────────────────

  describe('tabla', () => {
    it('renderiza una columna por cada tipo de playera respetando el orden', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE, CHAMARRA_TYPE],
        participants: [makeServer({ shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')] })],
      });
      await flushPromises();
      const headers = w.findAll('thead th').map((th) => th.text());
      // # | Nombre | Tipo | Playera | Chamarra | ✓
      expect(headers).toEqual(['#', 'Nombre', 'Tipo', 'Playera', 'Chamarra', '✓']);
    });

    it('muestra la talla en la columna correcta y "—" cuando no pidió ese tipo', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE, CHAMARRA_TYPE],
        participants: [
          makeServer({ shirts: [makeShirt(CHAMARRA_TYPE.id, 'Chamarra', 'G', 2)] }),
        ],
      });
      await flushPromises();

      const cells = w.findAll('tbody tr:first-child td').map((td) => td.text().trim());
      // # | Nombre | Tipo | Playera | Chamarra | ✓
      expect(cells[3]).toBe('—');
      expect(cells[4]).toBe('G');
    });

    it('muestra badge "Servidor" para type=server', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE],
        participants: [
          makeServer({
            firstName: 'Mario',
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')],
          }),
        ],
      });
      await flushPromises();
      const row = w.find('tbody tr');
      expect(row.text()).toContain('Servidor');
      expect(row.text()).not.toContain('Angelito');
    });

    it('muestra badge "Angelito" para type=partial_server', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE],
        participants: [
          makeAngelito({
            firstName: 'Lupe',
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'S')],
          }),
        ],
      });
      await flushPromises();
      const row = w.find('tbody tr');
      expect(row.text()).toContain('Angelito');
    });

    it('renderiza idOnRetreat o "—" cuando es null', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE],
        participants: [
          makeServer({ idOnRetreat: 42, shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')] }),
          makeServer({
            firstName: 'NoNum',
            idOnRetreat: null,
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'S')],
          }),
        ],
      });
      await flushPromises();
      const rows = w.findAll('tbody tr');
      expect(rows[0].findAll('td')[0].text().trim()).toBe('42');
      expect(rows[1].findAll('td')[0].text().trim()).toBe('—');
    });

    it('cada fila incluye una columna ✓ vacía para confirmar a mano', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE],
        participants: [makeServer({ shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')] })],
      });
      await flushPromises();
      const lastCell = w.find('tbody tr').findAll('td').at(-1)!;
      // El cuadrito de confirmar es un span vacío con borde
      expect(lastCell.find('span').exists()).toBe(true);
      expect(lastCell.text().trim()).toBe('');
    });
  });

  // ── Búsqueda ─────────────────────────────────────────────────────────────

  describe('búsqueda', () => {
    function makeReport() {
      return {
        shirtTypes: [PLAYERA_TYPE],
        participants: [
          makeServer({
            firstName: 'María',
            lastName: 'Silva',
            idOnRetreat: 1,
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')],
          }),
          makeServer({
            firstName: 'Carlos',
            lastName: 'Ruiz',
            idOnRetreat: 42,
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'G')],
          }),
        ],
      };
    }

    it('filtra por nombre (insensible a mayúsculas)', async () => {
      const w = mountView(makeReport());
      await flushPromises();
      await w.find('input').setValue('maría');
      await nextTick();
      expect(w.text()).toContain('María');
      expect(w.text()).not.toContain('Carlos');
    });

    it('filtra por idOnRetreat', async () => {
      const w = mountView(makeReport());
      await flushPromises();
      await w.find('input').setValue('42');
      await nextTick();
      expect(w.text()).toContain('Carlos');
      expect(w.text()).not.toContain('María');
    });

    it('filtra por talla', async () => {
      const w = mountView(makeReport());
      await flushPromises();
      await w.find('input').setValue('g');
      await nextTick();
      expect(w.text()).toContain('Carlos');
      expect(w.text()).not.toContain('María');
    });

    it('muestra mensaje de "Sin resultados" cuando no hay match', async () => {
      const w = mountView(makeReport());
      await flushPromises();
      await w.find('input').setValue('zzznoexiste');
      await nextTick();
      expect(w.text()).toContain('Sin resultados para tu búsqueda');
    });

    it('limpia el query al hacer click en el botón X', async () => {
      const w = mountView(makeReport());
      await flushPromises();
      await w.find('input').setValue('zzznoexiste');
      await nextTick();
      const clearBtn = w.find('button[class*="absolute"][class*="right"]');
      await clearBtn.trigger('click');
      await nextTick();
      expect(w.text()).toContain('María');
      expect(w.text()).toContain('Carlos');
    });
  });

  // ── Estado vacío ─────────────────────────────────────────────────────────

  describe('estado vacío', () => {
    it('muestra mensaje cuando no hay servidores ni angelitos con pedidos', async () => {
      const w = mountView({ shirtTypes: [PLAYERA_TYPE], participants: [] });
      await flushPromises();
      expect(w.text()).toContain('Ningún servidor o angelito ha pedido prendas');
    });
  });

  // ── Footer ───────────────────────────────────────────────────────────────

  describe('footer', () => {
    it('muestra el conteo de personas y total de prendas', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE],
        participants: [
          makeServer({ shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')] }),
          makeServer({ firstName: 'Otra', shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'G')] }),
        ],
      });
      await flushPromises();
      expect(w.text()).toMatch(/Mostrando\s+2\s+personas/);
      expect(w.text()).toContain('2 prendas pedidas');
    });

    it('agrega "de N" cuando la búsqueda filtra resultados', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE],
        participants: [
          makeServer({
            firstName: 'Ana',
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')],
          }),
          makeServer({
            firstName: 'Pedro',
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'G')],
          }),
        ],
      });
      await flushPromises();
      await w.find('input').setValue('ana');
      await nextTick();
      expect(w.text()).toContain('de 2');
    });
  });

  // ── Imprimir ─────────────────────────────────────────────────────────────

  describe('imprimir', () => {
    it('llama window.print al hacer click en el botón', async () => {
      const spy = vi.spyOn(window, 'print').mockImplementation(() => {});
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE],
        participants: [makeServer({ shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')] })],
      });
      await flushPromises();
      await w.find('[title="Imprimir reporte"]').trigger('click');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
