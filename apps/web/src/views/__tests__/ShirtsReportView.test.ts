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
const mockUpdateShirtOrderConfirmation = vi.fn();
vi.mock('@/services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getShirtReport: (...args: any[]) => mockGetShirtReport(...args),
  updateShirtOrderConfirmation: (...args: any[]) =>
    mockUpdateShirtOrderConfirmation(...args),
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
    PackageCheck: icon('package-check'),
    Wallet: icon('wallet'),
    MessageSquare: icon('message-square'),
  };
});

const mockToast = vi.fn();
vi.mock('@repo/ui', () => ({
  Input: {
    name: 'Input',
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  Button: { name: 'Button', template: '<button><slot /></button>' },
  Badge: { name: 'Badge', template: '<span><slot /></span>' },
  useToast: () => ({ toast: mockToast }),
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
    shirtOrderConfirmedAt: null,
    cellPhone: null,
    country: null,
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
    shirtOrderConfirmedAt: null,
    cellPhone: null,
    country: null,
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
    mockUpdateShirtOrderConfirmation.mockReset();
    mockToast.mockReset();
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
      // # | Nombre | Playera | Chamarra | Valor | Confirmado | ✓
      expect(headers).toEqual(['#', 'Nombre', 'Playera', 'Chamarra', 'Valor', 'Confirmado', '✓']);
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
      // # | Nombre | Playera | Chamarra | Valor | Confirmado | ✓
      expect(cells[2]).toBe('—');
      expect(cells[3]).toBe('G');
    });

    it('no renderiza badge de tipo en las filas (todos son servidores en la práctica)', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE],
        participants: [
          makeServer({
            firstName: 'Mario',
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')],
          }),
          makeAngelito({
            firstName: 'Lupe',
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'S')],
          }),
        ],
      });
      await flushPromises();
      // Ninguna fila debe contener las palabras Servidor / Angelito (el badge fue removido).
      // Los contadores SERVIDORES/ANGELITOS siguen en el header, no en filas.
      const rowsText = w.findAll('tbody tr').map((r) => r.text()).join(' ');
      expect(rowsText).not.toContain('Servidor');
      expect(rowsText).not.toContain('Angelito');
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

    it('cada fila incluye una columna ✓ vacía para confirmar a mano (pendiente)', async () => {
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

    it('la columna ✓ print-only muestra el ✓ real para los confirmados', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE],
        participants: [
          makeServer({
            firstName: 'Lista',
            shirtOrderConfirmedAt: '2026-09-21 12:00:00.000',
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')],
          }),
        ],
      });
      await flushPromises();
      const lastCell = w.find('tbody tr').findAll('td').at(-1)!;
      expect(lastCell.text().trim()).toBe('✓');
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
    it('muestra mensaje cuando el retiro no tiene equipo servidor', async () => {
      const w = mountView({ shirtTypes: [PLAYERA_TYPE], participants: [] });
      await flushPromises();
      expect(w.text()).toContain('No hay servidores ni angelitos en este retiro');
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

  // ── Confirmación del pedido (chulo del coordinador) ──────────────────────

  describe('confirmación del pedido', () => {
    function makeConfirmedReport() {
      return {
        shirtTypes: [PLAYERA_TYPE],
        participants: [
          makeServer({
            firstName: 'Ya',
            lastName: 'Confirmado',
            shirtOrderConfirmedAt: '2026-09-21 12:00:00.000',
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')],
          }),
          makeServer({
            firstName: 'Todavía',
            lastName: 'No',
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'G')],
          }),
          makeAngelito({
            firstName: 'Angel',
            lastName: 'Confirmado',
            shirtOrderConfirmedAt: '2026-09-21 13:00:00.000',
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'S')],
          }),
        ],
      };
    }

    function chipButton(w: ReturnType<typeof mountView>) {
      return w.findAll('button').find((b) => b.text().includes('Solo sin confirmar'))!;
    }

    // El badge separa el glifo de la leyenda (la leyenda se oculta en móvil),
    // así que el texto crudo trae espacios internos: comparar normalizado.
    function badgeLabel(b: { text: () => string }) {
      return b.text().replace(/\s+/g, '');
    }

    it('muestra la stat card "Confirmados X/Y" contando sobre el total del reporte', async () => {
      const w = mountView(makeConfirmedReport());
      await flushPromises();
      expect(w.text()).toContain('Confirmados');
      expect(w.text()).toContain('2/3');
    });

    it('muestra "Confirmados 0/N" cuando nadie ha confirmado', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE],
        participants: [
          makeServer({ shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')] }),
          makeServer({ firstName: 'Otra', shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'G')] }),
        ],
      });
      await flushPromises();
      expect(w.text()).toContain('0/2');
    });

    it('el badge refleja el estado de cada fila', async () => {
      const w = mountView(makeConfirmedReport());
      await flushPromises();
      const badges = w.findAll('tbody button').map((b) => badgeLabel(b));
      // Orden de filas: Ya Confirmado, Todavía No, Angel Confirmado
      expect(badges[0]).toBe('✓Confirmado');
      expect(badges[1]).toBe('●Sinconfirmar');
      expect(badges[2]).toBe('✓Confirmado');
    });

    it('la leyenda del badge vive en un span ocultable (hidden sm:inline) para móvil', async () => {
      const w = mountView(makeConfirmedReport());
      await flushPromises();
      const badge = w.findAll('tbody button')[0];
      // Glifo siempre visible...
      expect(badge.text().trim()).toContain('✓');
      // ...y la leyenda completa solo a partir del breakpoint sm.
      const label = badge.find('span');
      expect(label.exists()).toBe(true);
      expect(label.attributes('class')).toContain('hidden');
      expect(label.attributes('class')).toContain('sm:inline');
      expect(label.text().trim()).toBe('Confirmado');
    });

    it('dar el chulo llama al PATCH con true y voltea el badge sin refetch', async () => {
      const report = makeConfirmedReport();
      const w = mountView(report);
      await flushPromises();
      mockUpdateShirtOrderConfirmation.mockResolvedValueOnce(undefined);
      const pending = report.participants[1];
      const badge = w.findAll('tbody button')[1];

      await badge.trigger('click');
      // Flush ANTES de asertar: un refetch agregado tras el await del PATCH
      // solo se vería después de que el mock resuelve.
      await flushPromises();

      expect(mockUpdateShirtOrderConfirmation).toHaveBeenCalledWith(
        RETREAT_ID,
        pending.participantId,
        true,
      );
      expect(badgeLabel(w.findAll('tbody button')[1])).toBe('✓Confirmado');
      expect(w.text()).toContain('3/3');
      // Sin refetch del reporte tras el toggle.
      expect(mockGetShirtReport).toHaveBeenCalledTimes(1);
    });

    it('cambiar de retiro en el sidebar recarga el reporte y el toggle patea al retiro nuevo', async () => {
      const report = makeConfirmedReport();
      const w = mountView(report);
      await flushPromises();
      expect(mockGetShirtReport).toHaveBeenCalledTimes(1);

      const retreatStore = useRetreatStore();
      mockGetShirtReport.mockResolvedValueOnce(report);
      retreatStore.selectedRetreatId = 'retreat-nuevo';
      await flushPromises();

      expect(mockGetShirtReport).toHaveBeenCalledTimes(2);
      expect(mockGetShirtReport).toHaveBeenLastCalledWith('retreat-nuevo');

      // El toggle debe escribir contra el retiro activo, no el del montaje.
      const confirmed = report.participants[0];
      await w.findAll('tbody button')[0].trigger('click');
      await flushPromises();
      expect(mockUpdateShirtOrderConfirmation).toHaveBeenCalledWith(
        'retreat-nuevo',
        confirmed.participantId,
        false,
      );
    });

    it('quitar el chulo llama al PATCH con false y vuelve a "● Sin confirmar"', async () => {
      const report = makeConfirmedReport();
      const w = mountView(report);
      await flushPromises();
      mockUpdateShirtOrderConfirmation.mockResolvedValueOnce(undefined);
      const confirmed = report.participants[0];

      await w.findAll('tbody button')[0].trigger('click');
      await flushPromises();

      expect(mockUpdateShirtOrderConfirmation).toHaveBeenCalledWith(
        RETREAT_ID,
        confirmed.participantId,
        false,
      );
      expect(badgeLabel(w.findAll('tbody button')[0])).toBe('●Sinconfirmar');
      expect(w.text()).toContain('1/3');
    });

    it('si el guardado falla, el badge vuelve a su estado anterior y sale un toast', async () => {
      const report = makeConfirmedReport();
      const w = mountView(report);
      await flushPromises();
      mockUpdateShirtOrderConfirmation.mockRejectedValueOnce(new Error('network'));
      const badge = w.findAll('tbody button')[1];

      await badge.trigger('click');
      await flushPromises();

      expect(badgeLabel(w.findAll('tbody button')[1])).toBe('●Sinconfirmar');
      expect(w.text()).toContain('2/3');
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
    });

    it('un doble-tap durante el guardado pendiente solo dispara un PATCH', async () => {
      const report = makeConfirmedReport();
      const w = mountView(report);
      await flushPromises();
      let resolveToggle!: () => void;
      mockUpdateShirtOrderConfirmation.mockImplementationOnce(
        () => new Promise<void>((r) => (resolveToggle = r)),
      );

      await w.findAll('tbody button')[1].trigger('click');
      await w.findAll('tbody button')[1].trigger('click');

      expect(mockUpdateShirtOrderConfirmation).toHaveBeenCalledTimes(1);
      resolveToggle();
      await flushPromises();
      expect(badgeLabel(w.findAll('tbody button')[1])).toBe('✓Confirmado');
    });

    it('"Solo sin confirmar" deja la lista en pendientes y compone AND con la búsqueda', async () => {
      const report = makeConfirmedReport();
      const w = mountView(report);
      await flushPromises();

      await chipButton(w).trigger('click');
      await nextTick();

      expect(w.text()).toContain('Todavía');
      expect(w.text()).not.toContain('Ya Confirmado');
      // El contador siempre cuenta sobre el total del reporte.
      expect(w.text()).toContain('2/3');
      // Chip con el número de pendientes.
      expect(chipButton(w).text()).toContain('1');

      // Composición con la búsqueda: sin match dentro de los pendientes.
      await w.find('input').setValue('ya');
      await nextTick();
      expect(w.text()).toContain('Sin resultados para tu búsqueda');

      // La búsqueda que sí matchea al pendiente lo encuentra.
      await w.find('input').setValue('todavía');
      await nextTick();
      expect(w.text()).toContain('Todavía');
    });

    it('con el filtro activo y todo confirmado, ofrece desactivar el filtro (no limpiar búsqueda)', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE],
        participants: [
          makeServer({
            shirtOrderConfirmedAt: '2026-09-21 12:00:00.000',
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')],
          }),
          makeAngelito({
            shirtOrderConfirmedAt: '2026-09-21 13:00:00.000',
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'S')],
          }),
        ],
      });
      await flushPromises();

      await chipButton(w).trigger('click');
      await nextTick();

      // El filtro vació la tabla, no la búsqueda: el mensaje y el botón
      // tienen que hablar del filtro.
      expect(w.text()).toContain('Todos los pedidos de este retiro están confirmados');
      expect(w.text()).not.toContain('Sin resultados para tu búsqueda');

      const showAll = w.findAll('button').find((b) => b.text() === 'Mostrar todos')!;
      await showAll.trigger('click');
      await nextTick();
      expect(w.text()).toContain('Ana'); // las filas vuelven
    });

    it('el botón de WhatsApp abre la conversación con la lada resuelta del país', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE],
        participants: [
          makeServer({
            firstName: 'Con',
            lastName: 'Teléfono',
            cellPhone: '5551234567',
            country: 'MX',
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')],
          }),
        ],
      });
      await flushPromises();

      const link = w.find('a[href^="https://api.whatsapp.com/send"]');
      expect(link.exists()).toBe(true);
      expect(link.attributes('href')).toBe('https://api.whatsapp.com/send?phone=525551234567');
      expect(link.attributes('title')).toBe('Ver conversación de WhatsApp');
      expect(link.attributes('target')).toBe('_blank');
    });

    it('sin teléfono no se renderiza el link de WhatsApp (no hay link muerto)', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE],
        participants: [
          makeServer({
            firstName: 'Sin',
            lastName: 'Teléfono',
            cellPhone: null,
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')],
          }),
        ],
      });
      await flushPromises();
      expect(w.find('a[href^="https://api.whatsapp.com/send"]').exists()).toBe(false);
    });
  });

  // ── Universo completo + filtro "Requieren camiseta" ─────────────────────

  describe('universo del equipo y filtro "Requieren camiseta"', () => {
    function makeTeamReport() {
      return {
        shirtTypes: [PLAYERA_TYPE],
        participants: [
          makeServer({
            firstName: 'Pide',
            lastName: 'Una',
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')],
          }),
          makeServer({
            firstName: 'Pide',
            lastName: 'Dos',
            shirtOrderConfirmedAt: '2026-09-21 12:00:00.000',
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'G')],
          }),
          // Respondió "no necesito camisetas": sin prendas, pero confirmable.
          makeServer({ firstName: 'NoNecesita', lastName: 'Nada', shirts: [] }),
          makeAngelito({
            firstName: 'AngelSin',
            lastName: 'Prendas',
            shirtOrderConfirmedAt: '2026-09-21 13:00:00.000',
            shirts: [],
          }),
        ],
      };
    }

    function requiringChip(w: ReturnType<typeof mountView>) {
      return w.findAll('button').find((b) => b.text().includes('Requieren camiseta'))!;
    }

    function unconfirmedChip(w: ReturnType<typeof mountView>) {
      return w.findAll('button').find((b) => b.text().includes('Solo sin confirmar'))!;
    }

    it('lista a todo el equipo: quien no pidió prendas también aparece y cuenta en X/Y', async () => {
      const w = mountView(makeTeamReport());
      await flushPromises();

      expect(w.text()).toContain('Equipo servidor del retiro');
      const rows = w.findAll('tbody tr');
      expect(rows).toHaveLength(4);
      expect(w.text()).toContain('NoNecesita');
      expect(w.text()).toContain('AngelSin');
      // X/Y mide sobre el universo completo (2 confirmados de 4).
      expect(w.text()).toContain('2/4');
      expect(w.text()).toMatch(/Mostrando\s+4\s+personas/);
      // Badge del chip = quienes requieren (2 de los 4).
      expect(requiringChip(w).text()).toMatch(/2/);
    });

    it('el chip "Requieren camiseta" estrecha a quienes pidieron ≥1 prenda', async () => {
      const w = mountView(makeTeamReport());
      await flushPromises();

      await requiringChip(w).trigger('click');
      await nextTick();

      expect(w.text()).toContain('Pide Una');
      expect(w.text()).toContain('Pide Dos');
      expect(w.text()).not.toContain('NoNecesita');
      expect(w.text()).not.toContain('AngelSin');
      expect(w.text()).toMatch(/Mostrando\s+2\s+de\s+4\s+personas/);
      // El contador X/Y no se mueve con el filtro.
      expect(w.text()).toContain('2/4');
    });

    it('compone AND con "Solo sin confirmar"', async () => {
      const w = mountView(makeTeamReport());
      await flushPromises();

      await requiringChip(w).trigger('click');
      await unconfirmedChip(w).trigger('click');
      await nextTick();

      // Requieren Y sin confirmar → solo Pide Una.
      expect(w.text()).toContain('Pide Una');
      expect(w.text()).not.toContain('Pide Dos');
      expect(w.text()).not.toContain('NoNecesita');
    });

    it('compone AND con la búsqueda: el sin-prendas no aparece aunque el query lo matchee', async () => {
      const w = mountView(makeTeamReport());
      await flushPromises();

      await requiringChip(w).trigger('click');
      await nextTick();
      await w.find('input').setValue('nonecesita');
      await nextTick();

      expect(w.text()).toContain('Sin resultados para tu búsqueda');
    });

    it('con el chip activo y nadie requiriendo, ofrece "Quitar filtros"', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE],
        participants: [
          makeServer({ firstName: 'Sin', lastName: 'Prendas', shirts: [] }),
          makeAngelito({ firstName: 'Tampoco', lastName: 'Pidió', shirts: [] }),
        ],
      });
      await flushPromises();

      await requiringChip(w).trigger('click');
      await nextTick();

      expect(w.text()).toContain('Nadie coincide con los filtros activos');
      expect(w.text()).not.toContain('Todos los pedidos de este retiro están confirmados');

      const clear = w.findAll('button').find((b) => b.text() === 'Quitar filtros')!;
      await clear.trigger('click');
      await nextTick();
      expect(w.text()).toContain('Sin Prendas');
      expect(w.text()).toContain('Tampoco');
    });

    it('el chulo también funciona sobre una fila sin prendas', async () => {
      const report = makeTeamReport();
      const w = mountView(report);
      await flushPromises();
      mockUpdateShirtOrderConfirmation.mockResolvedValueOnce(undefined);
      const noGarment = report.participants[2]; // NoNecesita Nada
      // Orden de filas = orden de la fixture → el badge 2 es el del sin-prendas.
      const badge = w.findAll('tbody button')[2];

      await badge.trigger('click');
      await flushPromises();

      expect(mockUpdateShirtOrderConfirmation).toHaveBeenCalledWith(
        RETREAT_ID,
        noGarment.participantId,
        true,
      );
      expect(w.text()).toContain('3/4');
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
