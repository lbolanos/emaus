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
const mockSetShirtOrderEstimate = vi.fn();
vi.mock('@/services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getShirtReport: (...args: any[]) => mockGetShirtReport(...args),
  updateShirtOrderConfirmation: (...args: any[]) =>
    mockUpdateShirtOrderConfirmation(...args),
  setShirtOrderEstimate: (...args: any[]) => mockSetShirtOrderEstimate(...args),
}));

// "Estimar caminantes" is gated by retreat:update; each test can flip it.
const perms = vi.hoisted(() => ({ updateRetreat: true }));
vi.mock('@/composables/useAuthPermissions', () => ({
  useAuthPermissions: () => ({
    can: { update: (resource: string) => resource === 'retreat' && perms.updateRetreat },
  }),
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
    Send: icon('send'),
    Copy: icon('copy'),
    Calculator: icon('calculator'),
  };
});

// El dialog real arrastra stores, íconos y componentes fuera de la allowlist
// de este archivo (patrón FollowUpView.test). El stub expone las props que
// importan como data-attributes para poder assertar sobre ellas.
vi.mock('@/components/MessageDialog.vue', () => ({
  default: {
    name: 'MessageDialog',
    props: ['open', 'context', 'retreatId', 'participant', 'forceTemplateType'],
    template: `
      <div
        data-testid="message-dialog"
        :data-open="open ? 'true' : 'false'"
        :data-retreat="retreatId ?? ''"
        :data-template="forceTemplateType ?? ''"
        :data-participant="participant?.id ?? ''"
      />
    `,
  },
}));

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
  // Renders only while open (unlike the global mock): the closed estimate
  // dialog must not add inputs ahead of the search box tests look up first.
  Dialog: {
    name: 'Dialog',
    props: ['open'],
    emits: ['update:open'],
    template: '<div v-if="open" data-testid="estimate-dialog"><slot /></div>',
  },
  DialogContent: { name: 'DialogContent', template: '<div><slot /></div>' },
  DialogHeader: { name: 'DialogHeader', template: '<div><slot /></div>' },
  DialogTitle: { name: 'DialogTitle', template: '<h2><slot /></h2>' },
  DialogDescription: { name: 'DialogDescription', template: '<p><slot /></p>' },
  DialogFooter: { name: 'DialogFooter', template: '<div><slot /></div>' },
  useToast: () => ({ toast: mockToast }),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

import ShirtsReportView from '../ShirtsReportView.vue';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import { api } from '@/services/api';

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
  retreatStore.retreats = [{ id: RETREAT_ID, name: 'Retiro Test', parish: 'Parroquia Test' } as any];
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

// El badge de confirmación se selecciona por su title ("...clic..."): la celda
// también contiene el botón de enviar mensaje, así que el índice crudo en
// findAll('tbody button') ya no identifica al toggle.
function toggleButtons(w: ReturnType<typeof mountView>) {
  return w.findAll('tbody button').filter((b) => (b.attributes('title') ?? '').includes('clic'));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ShirtsReportView', () => {
  beforeEach(() => {
    mockGetShirtReport.mockReset();
    mockUpdateShirtOrderConfirmation.mockReset();
    mockSetShirtOrderEstimate.mockReset();
    mockToast.mockReset();
    perms.updateRetreat = true;
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
      const badges = toggleButtons(w).map((b) => badgeLabel(b));
      // Orden de filas: Ya Confirmado, Todavía No, Angel Confirmado
      expect(badges[0]).toBe('✓Confirmado');
      expect(badges[1]).toBe('●Sinconfirmar');
      expect(badges[2]).toBe('✓Confirmado');
    });

    it('la leyenda del badge vive en un span ocultable (hidden sm:inline) para móvil', async () => {
      const w = mountView(makeConfirmedReport());
      await flushPromises();
      const badge = toggleButtons(w)[0];
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
      const badge = toggleButtons(w)[1];

      await badge.trigger('click');
      // Flush ANTES de asertar: un refetch agregado tras el await del PATCH
      // solo se vería después de que el mock resuelve.
      await flushPromises();

      expect(mockUpdateShirtOrderConfirmation).toHaveBeenCalledWith(
        RETREAT_ID,
        pending.participantId,
        true,
      );
      expect(badgeLabel(toggleButtons(w)[1])).toBe('✓Confirmado');
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
      await toggleButtons(w)[0].trigger('click');
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

      await toggleButtons(w)[0].trigger('click');
      await flushPromises();

      expect(mockUpdateShirtOrderConfirmation).toHaveBeenCalledWith(
        RETREAT_ID,
        confirmed.participantId,
        false,
      );
      expect(badgeLabel(toggleButtons(w)[0])).toBe('●Sinconfirmar');
      expect(w.text()).toContain('1/3');
    });

    it('si el guardado falla, el badge vuelve a su estado anterior y sale un toast', async () => {
      const report = makeConfirmedReport();
      const w = mountView(report);
      await flushPromises();
      mockUpdateShirtOrderConfirmation.mockRejectedValueOnce(new Error('network'));
      const badge = toggleButtons(w)[1];

      await badge.trigger('click');
      await flushPromises();

      expect(badgeLabel(toggleButtons(w)[1])).toBe('●Sinconfirmar');
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

      await toggleButtons(w)[1].trigger('click');
      await toggleButtons(w)[1].trigger('click');

      expect(mockUpdateShirtOrderConfirmation).toHaveBeenCalledTimes(1);
      resolveToggle();
      await flushPromises();
      expect(badgeLabel(toggleButtons(w)[1])).toBe('✓Confirmado');
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
      const badge = toggleButtons(w)[2];

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

  // ── Enviar mensaje de confirmación ───────────────────────────────────────

  describe('envío de mensaje de confirmación', () => {
    function sendButton(w: ReturnType<typeof mountView>) {
      return w.find('[title="Enviar mensaje de confirmación"]');
    }

    function dialogStub(w: ReturnType<typeof mountView>) {
      return w.find('[data-testid="message-dialog"]');
    }

    it('renderiza el botón de envío en cada fila (independiente del teléfono)', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE],
        participants: [
          makeServer({
            cellPhone: '5551234567',
            country: 'MX',
            shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')],
          }),
          makeServer({ firstName: 'Sin', cellPhone: null, shirts: [] }),
        ],
      });
      await flushPromises();

      const buttons = w.findAll('[title="Enviar mensaje de confirmación"]');
      expect(buttons).toHaveLength(2);
    });

    it('el click hidrata la ficha desde el listado del retiro y abre el dialog con la plantilla de confirmación', async () => {
      const report = {
        shirtTypes: [PLAYERA_TYPE],
        participants: [
          makeServer({ shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')] }),
        ],
      };
      const target = report.participants[0];
      const w = mountView(report);
      await flushPromises();

      // El participante completo sale del listado del retiro (includePayments):
      // {participant.paymentRemaining} solo es correcto con payments/debts/
      // shirtSizes cargados.
      vi.mocked(api.get).mockResolvedValueOnce({
        data: [{ id: target.participantId, firstName: 'Ana', lastName: 'López' }],
      });

      await sendButton(w).trigger('click');
      await flushPromises();

      expect(api.get).toHaveBeenCalledWith(
        '/participants',
        expect.objectContaining({
          params: expect.objectContaining({ retreatId: RETREAT_ID, includePayments: true }),
        }),
      );
      const dialog = dialogStub(w);
      expect(dialog.attributes('data-open')).toBe('true');
      expect(dialog.attributes('data-participant')).toBe(target.participantId);
      expect(dialog.attributes('data-template')).toBe('SERVER_SHIRT_CONFIRMATION');
      expect(dialog.attributes('data-retreat')).toBe(RETREAT_ID);
    });

    it('si el participante no viene en el listado, toast destructive y el dialog queda cerrado', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE],
        participants: [makeServer({ shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')] })],
      });
      await flushPromises();

      vi.mocked(api.get).mockResolvedValueOnce({ data: [] });

      await sendButton(w).trigger('click');
      await flushPromises();

      expect(dialogStub(w).attributes('data-open')).toBe('false');
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
    });

    it('el botón queda disabled mientras carga la ficha (guard anti doble-tap)', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE],
        participants: [makeServer({ shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')] })],
      });
      await flushPromises();

      let resolveFetch!: (value: unknown) => void;
      vi.mocked(api.get).mockImplementationOnce(
        () => new Promise((r) => (resolveFetch = r)),
      );

      await sendButton(w).trigger('click');
      expect(sendButton(w).attributes('disabled')).toBeDefined();

      resolveFetch({ data: [] });
      await flushPromises();
      expect(sendButton(w).attributes('disabled')).toBeUndefined();
    });

    it('limpia los filtros heredados del store antes de hidratar (type residual excluiría al angelito)', async () => {
      const report = {
        shirtTypes: [PLAYERA_TYPE],
        participants: [makeAngelito({ shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'S')] })],
      };
      const target = report.participants[0];
      const w = mountView(report);
      await flushPromises();

      // Filtro residual de otra vista (AssignLeaderModal deja type='server'
      // sin limpiar): viaja en la misma query y excluiría al angelito.
      const participantStore = useParticipantStore();
      participantStore.filters.type = 'server';

      vi.mocked(api.get).mockResolvedValueOnce({
        data: [{ id: target.participantId, firstName: 'Beto', lastName: 'Pérez' }],
      });

      await sendButton(w).trigger('click');
      await flushPromises();

      expect(api.get).toHaveBeenCalledWith(
        '/participants',
        expect.objectContaining({
          params: expect.objectContaining({ retreatId: RETREAT_ID, includePayments: true }),
        }),
      );
      expect(api.get).toHaveBeenCalledWith(
        '/participants',
        expect.objectContaining({
          params: expect.not.objectContaining({ type: expect.anything() }),
        }),
      );
      expect(dialogStub(w).attributes('data-open')).toBe('true');
      expect(dialogStub(w).attributes('data-participant')).toBe(target.participantId);
    });

    it('si el retiro cambia mientras carga la ficha, el dialog no abre (sin mezclar retiros)', async () => {
      const report = {
        shirtTypes: [PLAYERA_TYPE],
        participants: [makeServer({ shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')] })],
      };
      const target = report.participants[0];
      const w = mountView(report);
      await flushPromises();

      let resolveFetch!: (value: unknown) => void;
      vi.mocked(api.get).mockImplementationOnce(
        () => new Promise((r) => (resolveFetch = r)),
      );
      await sendButton(w).trigger('click');

      // Cambio de retiro en el sidebar mientras el fetch está pendiente: el
      // watcher recarga el reporte contra el retiro nuevo.
      mockGetShirtReport.mockResolvedValueOnce(report);
      const retreatStore = useRetreatStore();
      retreatStore.selectedRetreatId = 'retreat-nuevo';
      await flushPromises();

      // El fetch resuelve con el participante del retiro viejo: abrir aquí
      // mezclaría esa ficha con el retreatId nuevo.
      resolveFetch({ data: [{ id: target.participantId, firstName: 'Ana', lastName: 'López' }] });
      await flushPromises();

      expect(dialogStub(w).attributes('data-open')).toBe('false');
      expect(dialogStub(w).attributes('data-retreat')).toBe('');
      expect(mockToast).not.toHaveBeenCalled();
      expect(sendButton(w).attributes('disabled')).toBeUndefined();
    });

    it('si el fetch de la ficha falla, el guard se libera y el dialog queda cerrado', async () => {
      const w = mountView({
        shirtTypes: [PLAYERA_TYPE],
        participants: [makeServer({ shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')] })],
      });
      await flushPromises();

      vi.mocked(api.get).mockRejectedValueOnce(new Error('network'));

      await sendButton(w).trigger('click');
      await flushPromises();

      expect(dialogStub(w).attributes('data-open')).toBe('false');
      expect(sendButton(w).attributes('disabled')).toBeUndefined();
    });
  });

  // ── Resumen de pedido (servidores + caminantes + estimado) ───────────────

  describe('resumen de pedido', () => {
    const PLAYERA_WALKER = {
      ...PLAYERA_TYPE,
      availableSizes: ['S', 'M', 'G', 'X', '2'],
      requiredForWalkers: true,
    };

    // Servers order Playera G, M, M (G first on purpose: the summary must
    // still list M before G) and one Chamarra M; one server ordered nothing.
    function makeOrderReport(overrides: Record<string, any> = {}) {
      return {
        shirtTypes: [PLAYERA_WALKER, CHAMARRA_TYPE],
        participants: [
          makeServer({
            firstName: 'Uno',
            shirts: [
              makeShirt(PLAYERA_TYPE.id, 'Playera', 'G'),
              makeShirt(CHAMARRA_TYPE.id, 'Chamarra', 'M', 2),
            ],
          }),
          makeServer({ firstName: 'Dos', shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')] }),
          makeAngelito({ firstName: 'Tres', shirts: [makeShirt(PLAYERA_TYPE.id, 'Playera', 'M')] }),
          makeServer({ firstName: 'Cuatro', shirts: [] }),
        ],
        walkerCount: 10,
        walkerShirts: [
          { size: 'G', count: 6 },
          { size: 'M', count: 4 },
        ],
        estimate: null,
        ...overrides,
      };
    }

    const compact = (t: string) => t.replace(/\s+/g, '');
    const section = (w: ReturnType<typeof mountView>, key: string) =>
      w.find(`[data-testid="order-section-${key}"]`);
    const totalLine = (w: ReturnType<typeof mountView>) =>
      w.find('[data-testid="order-total"]').text();
    const buttonByText = (w: ReturnType<typeof mountView>, text: string) =>
      w.findAll('button').find((b) => b.text().includes(text));

    let writeText: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      // happy-dom ships no clipboard.
      writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
    });

    it('servidores: piezas por prenda con las tallas en orden canónico (M antes que G)', async () => {
      const w = mountView(makeOrderReport());
      await flushPromises();

      const servers = compact(section(w, 'servers').text());
      expect(servers).toContain('3de4personas');
      expect(servers).toContain('Playera3piezasM×2G×1');
      expect(servers).toContain('Chamarra1piezaM×1');
    });

    it('sin prenda marcada para caminantes: su camiseta va en fila propia, no en una del equipo', async () => {
      const w = mountView(
        makeOrderReport({ shirtTypes: [PLAYERA_TYPE, CHAMARRA_TYPE] }),
      );
      await flushPromises();

      const walkers = compact(section(w, 'walkers').text());
      expect(walkers).toContain('Camisetadecaminante10piezasM×4G×6');
      expect(section(w, 'walkers').text()).toContain('Ninguna prenda está marcada para caminantes');
      // The merged total keeps it apart from the servers' Playera.
      const total = compact(section(w, 'total').text());
      expect(total).toContain('Playera3piezasM×2G×1');
      expect(total).toContain('Camisetadecaminante10piezasM×4G×6');
    });

    it('caminantes: conteo de inscritos y sus tallas agregadas', async () => {
      const w = mountView(makeOrderReport());
      await flushPromises();

      const walkers = compact(section(w, 'walkers').text());
      expect(walkers).toContain('10inscritos');
      expect(walkers).toContain('Playera10piezasM×4G×6');
      // Without an estimate there is no estimate section.
      expect(section(w, 'estimate').exists()).toBe(false);
    });

    it('"Total a pedir" suma las fuentes por prenda × talla', async () => {
      const w = mountView(makeOrderReport());
      await flushPromises();

      const total = compact(section(w, 'total').text());
      expect(total).toContain('Playera13piezasM×6G×7');
      expect(total).toContain('Chamarra1piezaM×1');
      expect(totalLine(w)).toContain('Total del pedido: 14 piezas');
    });

    it('con estimado guardado: sección de faltantes y entra al total', async () => {
      const w = mountView(
        makeOrderReport({
          estimate: { expectedWalkers: 40, estimatedShirts: { M: 12, G: 18 } },
        }),
      );
      await flushPromises();

      expect(compact(section(w, 'walkers').text())).toContain('seesperan40');
      const estimate = compact(section(w, 'estimate').text());
      expect(estimate).toContain('faltan~30');
      expect(estimate).toContain('Playera30piezasM×12G×18');
      expect(totalLine(w)).toContain('Total del pedido: 44 piezas');
    });

    it('cuenta sobre el equipo completo: búsqueda y chips no lo mueven', async () => {
      const w = mountView(makeOrderReport());
      await flushPromises();
      const before = w.find('[data-testid="order-summary"]').text();

      await w.find('input').setValue('uno');
      await buttonByText(w, 'Requieren camiseta')!.trigger('click');
      await buttonByText(w, 'Solo sin confirmar')!.trigger('click');
      await nextTick();

      expect(w.find('[data-testid="order-summary"]').text()).toBe(before);
    });

    it('sin tipos de prenda no hay tarjeta; con tipos y sin pedidos avisa y no deja copiar', async () => {
      const none = mountView({ shirtTypes: [], participants: [makeServer()] });
      await flushPromises();
      expect(none.find('[data-testid="order-summary"]').exists()).toBe(false);

      const empty = mountView({ shirtTypes: [PLAYERA_TYPE], participants: [makeServer()] });
      await flushPromises();
      expect(empty.text()).toContain('Aún no hay prendas pedidas en este retiro');
      expect(buttonByText(empty, 'Copiar resumen')!.attributes('disabled')).toBeDefined();
    });

    it('"Copiar resumen" deja el pedido listo para WhatsApp (sin precios) y avisa', async () => {
      const w = mountView(makeOrderReport());
      await flushPromises();

      await buttonByText(w, 'Copiar resumen')!.trigger('click');
      await flushPromises();

      const text: string = writeText.mock.calls[0][0];
      expect(text.split('\n')[0]).toBe('*Pedido de prendas — Parroquia Test* 👕');
      expect(text).toContain('👥 *Equipo servidor* (3 de 4 personas)');
      expect(text).toContain('- Playera (3): M×2, G×1');
      expect(text).toContain('🚶 *Caminantes inscritos* (10 inscritos)');
      expect(text).toContain('📦 *Total a pedir*');
      expect(text).toContain('- Playera (13): M×6, G×7');
      expect(text.trim().split('\n').at(-1)).toBe('*Total: 14 piezas*');
      // WhatsApp, not Markdown: no double asterisks, and no prices for the supplier.
      expect(text).not.toContain('**');
      expect(text).not.toContain('$');
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Resumen copiado' }));
    });

    it('si el portapapeles falla, toast destructive', async () => {
      writeText.mockRejectedValueOnce(new Error('denied'));
      const w = mountView(makeOrderReport());
      await flushPromises();

      await buttonByText(w, 'Copiar resumen')!.trigger('click');
      await flushPromises();

      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    });

    it('"Estimar caminantes" solo aparece con permiso retreat:update', async () => {
      perms.updateRetreat = false;
      const w = mountView(makeOrderReport());
      await flushPromises();
      expect(buttonByText(w, 'Estimar caminantes')).toBeUndefined();
    });

    describe('dialog del estimado', () => {
      async function openDialog(w: ReturnType<typeof mountView>) {
        await buttonByText(w, 'Estimar caminantes')!.trigger('click');
        await nextTick();
        return w.find('[data-testid="estimate-dialog"]');
      }
      const input = (w: ReturnType<typeof mountView>, testid: string) =>
        w.find(`[data-testid="${testid}"]`);

      it('muestra la prenda de los caminantes con una casilla por talla', async () => {
        const w = mountView(makeOrderReport());
        await flushPromises();
        const dialog = await openDialog(w);

        expect(dialog.exists()).toBe(true);
        expect(dialog.text()).toContain('Playera');
        expect(dialog.text()).not.toContain('Chamarra');
        for (const size of ['S', 'M', 'G', 'X', '2']) {
          expect(input(w, `estimate-size-${size}`).exists()).toBe(true);
        }
      });

      it('guardar envía el estimado y actualiza el resumen sin recargar el reporte', async () => {
        mockSetShirtOrderEstimate.mockResolvedValueOnce(undefined);
        const w = mountView(makeOrderReport());
        await flushPromises();
        await openDialog(w);

        await input(w, 'estimate-expected').setValue('40');
        await input(w, `estimate-size-M`).setValue('12');
        await input(w, `estimate-size-G`).setValue('18');
        await buttonByText(w, 'Guardar')!.trigger('click');
        await flushPromises();

        expect(mockSetShirtOrderEstimate).toHaveBeenCalledWith(RETREAT_ID, {
          expectedWalkers: 40,
          estimatedShirts: { M: 12, G: 18 },
        });
        expect(w.find('[data-testid="estimate-dialog"]').exists()).toBe(false);
        expect(compact(section(w, 'estimate').text())).toContain('Playera30piezasM×12G×18');
        expect(totalLine(w)).toContain('Total del pedido: 44 piezas');
        expect(mockGetShirtReport).toHaveBeenCalledTimes(1);
      });

      it('"Repartir" distribuye los faltantes con la proporción de los inscritos', async () => {
        const w = mountView(
          makeOrderReport({
            walkerCount: 3,
            walkerShirts: [
              { size: 'M', count: 1 },
              { size: 'G', count: 1 },
              { size: 'X', count: 1 },
            ],
          }),
        );
        await flushPromises();
        await openDialog(w);

        // 13 expected − 3 registered = 10 missing over three equal sizes:
        // 3.33 each → the leftover piece goes to one of them, never lost.
        await input(w, 'estimate-expected').setValue('13');
        await buttonByText(w, 'Repartir los faltantes')!.trigger('click');
        await nextTick();

        const value = (size: string) =>
          Number((input(w, `estimate-size-${size}`).element as HTMLInputElement).value || 0);
        expect(value('M') + value('G') + value('X')).toBe(10);
        expect([value('M'), value('G'), value('X')].sort()).toEqual([3, 3, 4]);
        expect(value('S')).toBe(0);
      });

      it('sin caminantes esperados, "Repartir" queda deshabilitado', async () => {
        const w = mountView(makeOrderReport());
        await flushPromises();
        await openDialog(w);

        expect(buttonByText(w, 'Repartir los faltantes')!.attributes('disabled')).toBeDefined();
      });

      it('abre con el estimado guardado y "Quitar estimado" lo borra', async () => {
        mockSetShirtOrderEstimate.mockResolvedValueOnce(undefined);
        const w = mountView(
          makeOrderReport({
            estimate: { expectedWalkers: 40, estimatedShirts: { M: 12 } },
          }),
        );
        await flushPromises();
        await openDialog(w);

        expect((input(w, 'estimate-expected').element as HTMLInputElement).value).toBe('40');
        expect(
          (input(w, `estimate-size-M`).element as HTMLInputElement).value,
        ).toBe('12');

        await buttonByText(w, 'Quitar estimado')!.trigger('click');
        await flushPromises();

        expect(mockSetShirtOrderEstimate).toHaveBeenCalledWith(RETREAT_ID, null);
        expect(section(w, 'estimate').exists()).toBe(false);
      });

      it('guardar sin nada escrito borra en vez de guardar un estimado vacío', async () => {
        mockSetShirtOrderEstimate.mockResolvedValueOnce(undefined);
        const w = mountView(makeOrderReport());
        await flushPromises();
        await openDialog(w);

        await buttonByText(w, 'Guardar')!.trigger('click');
        await flushPromises();

        expect(mockSetShirtOrderEstimate).toHaveBeenCalledWith(RETREAT_ID, null);
      });

      it('si el guardado falla: toast destructive y el dialog sigue abierto', async () => {
        mockSetShirtOrderEstimate.mockRejectedValueOnce(new Error('network'));
        const w = mountView(makeOrderReport());
        await flushPromises();
        await openDialog(w);

        await input(w, 'estimate-expected').setValue('40');
        await buttonByText(w, 'Guardar')!.trigger('click');
        await flushPromises();

        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
        expect(w.find('[data-testid="estimate-dialog"]').exists()).toBe(true);
        expect(section(w, 'estimate').exists()).toBe(false);
      });
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
