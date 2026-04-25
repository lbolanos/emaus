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

const mockUpdateBagMade = vi.fn().mockResolvedValue(undefined);
vi.mock('@/services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  updateBagMade: (...args: any[]) => mockUpdateBagMade(...args),
}));

vi.mock('lucide-vue-next', () => {
  const icon = (name: string) => ({ name, template: `<svg data-icon="${name}"></svg>` });
  return {
    Droplets: icon('droplets'), Shirt: icon('shirt'), Smartphone: icon('smartphone'),
    Gift: icon('gift'), Mail: icon('mail'), ChevronDown: icon('chevron-down'),
    ChevronUp: icon('chevron-up'), Printer: icon('printer'), Package: icon('package'),
    Search: icon('search'), X: icon('x'), CheckCircle2: icon('check-circle-2'),
    Circle: icon('circle'), ListFilter: icon('list-filter'),
  };
});

vi.mock('@repo/ui', () => ({
  Checkbox: {
    name: 'Checkbox',
    template: '<button role="checkbox" :aria-checked="String(modelValue)" @click="$emit(\'update:modelValue\', !modelValue)" />',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  Input: {
    name: 'Input',
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  Progress: {
    name: 'Progress',
    template: '<div role="progressbar" :data-value="modelValue" />',
    props: ['modelValue'],
  },
  Button: { name: 'Button', template: '<button><slot /></button>' },
  Badge:  { name: 'Badge',  template: '<span><slot /></span>' },
  useToast: () => ({ toast: vi.fn() }),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

import BagsReportView from '../BagsReportView.vue';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';

const RETREAT_ID = 'retreat-abc-123';
const CHECKLIST_KEY = `bags-checklist-v1:${RETREAT_ID}`;

function makeWalker(overrides: Record<string, any> = {}) {
  const rand = Math.random().toString(36).slice(2, 8);
  return {
    id: `w-${rand}`,
    firstName: 'Ana',
    lastName: 'García',
    type: 'walker',
    tshirtSize: 'M',
    tableMesa: { name: 'Mesa 1' },
    id_on_retreat: 1,
    bagMade: false,
    ...overrides,
  };
}

function mountView(walkers: any[] = []) {
  const pinia = createPinia();
  setActivePinia(pinia);

  const retreatStore = useRetreatStore(pinia);
  retreatStore.retreats = [{ id: RETREAT_ID, name: 'Retiro Test' } as any];
  retreatStore.selectedRetreatId = RETREAT_ID;
  retreatStore.fetchRetreats = vi.fn().mockResolvedValue([]);

  const participantStore = useParticipantStore(pinia);
  participantStore.participants = walkers;
  participantStore.fetchParticipants = vi.fn().mockResolvedValue(walkers);

  return mount(BagsReportView, {
    global: {
      plugins: [pinia],
      stubs: { teleport: { template: '<div><slot /></div>' } },
    },
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BagsReportView', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUpdateBagMade.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanupMocks();
  });

  // ── Checklist ────────────────────────────────────────────────────────────

  describe('checklist – rendering', () => {
    it('renders the checklist card with all 5 items', () => {
      const w = mountView();
      expect(w.text()).toContain('Checklist de contenido');
      expect(w.text()).toContain('Agua bendita');
      expect(w.text()).toContain('Playera');
      expect(w.text()).toContain('Celulares');
      expect(w.text()).toContain('Palancas');
      expect(w.text()).toContain('Invitación para otro retiro');
    });

    it('shows 0/5 and 0% progress initially', () => {
      const w = mountView();
      expect(w.text()).toContain('0/5');
      expect(w.text()).toContain('0%');
    });
  });

  describe('checklist – interaction', () => {
    it('marks an item checked on click and updates counter', async () => {
      const w = mountView();
      await flushPromises(); // wait for onMounted to set currentRetreatId
      const checkboxes = w.findAll('[role="checkbox"]');
      await checkboxes[0].trigger('click');
      await nextTick();
      expect(w.text()).toContain('1/5');
    });

    it('unchecks a previously checked item', async () => {
      const w = mountView();
      await flushPromises();
      const cb = w.findAll('[role="checkbox"]')[0];
      await cb.trigger('click');
      await nextTick();
      await cb.trigger('click');
      await nextTick();
      expect(w.text()).toContain('0/5');
    });

    it('collapses to compact chip when all 5 items are checked', async () => {
      const w = mountView();
      await flushPromises();
      for (const cb of w.findAll('[role="checkbox"]')) {
        await cb.trigger('click');
        await nextTick();
      }
      // Auto-collapse fires: checklist hides and shows the compact chip
      expect(w.text()).toContain('Contenido listo');
      expect(w.text()).not.toContain('Agua bendita');
    });
  });

  describe('checklist – collapse / expand', () => {
    it('hides items when header is clicked', async () => {
      const w = mountView();
      await flushPromises();
      await w.find('.cursor-pointer.select-none').trigger('click');
      await nextTick();
      expect(w.text()).not.toContain('Agua bendita');
    });

    it('shows items again on second click', async () => {
      const w = mountView();
      await flushPromises();
      const header = w.find('.cursor-pointer.select-none');
      await header.trigger('click');
      await nextTick();
      await header.trigger('click');
      await nextTick();
      expect(w.text()).toContain('Agua bendita');
    });
  });

  describe('checklist – auto-collapse and compact chip', () => {
    it('collapses automatically when all items are checked', async () => {
      const w = mountView();
      await flushPromises();
      for (const cb of w.findAll('[role="checkbox"]')) {
        await cb.trigger('click');
        await nextTick();
      }
      expect(w.text()).not.toContain('Agua bendita');
      expect(w.text()).toContain('Contenido listo');
    });

    it('expands checklist again when compact chip is clicked', async () => {
      const w = mountView();
      await flushPromises();
      for (const cb of w.findAll('[role="checkbox"]')) {
        await cb.trigger('click');
        await nextTick();
      }
      const chip = w.find('button.rounded-full');
      await chip.trigger('click');
      await nextTick();
      expect(w.text()).toContain('Agua bendita');
    });
  });

  describe('checklist – localStorage persistence', () => {
    it('persists checked state to localStorage', async () => {
      const w = mountView();
      await flushPromises();
      await w.findAll('[role="checkbox"]')[0].trigger('click');
      await nextTick();
      const stored = JSON.parse(localStorage.getItem(CHECKLIST_KEY) ?? '[]');
      expect(stored).toContain('agua');
    });

    it('restores checked state from localStorage on mount', async () => {
      localStorage.setItem(CHECKLIST_KEY, JSON.stringify(['agua', 'playera']));
      const w = mountView();
      await nextTick();
      expect(w.text()).toContain('2/5');
    });

    it('uses a per-retreat key so different retreats are independent', async () => {
      localStorage.setItem('bags-checklist-v1:retreat-A', JSON.stringify(['agua']));

      const pinia = createPinia();
      setActivePinia(pinia);
      const retreatStore = useRetreatStore(pinia);
      retreatStore.retreats = [{ id: 'retreat-B', name: 'Retiro B' } as any];
      retreatStore.selectedRetreatId = 'retreat-B';
      retreatStore.fetchRetreats = vi.fn().mockResolvedValue([]);
      const participantStore = useParticipantStore(pinia);
      participantStore.participants = [];
      participantStore.fetchParticipants = vi.fn().mockResolvedValue([]);

      const w = mount(BagsReportView, {
        global: { plugins: [pinia], stubs: { teleport: { template: '<div><slot /></div>' } } },
      });
      await nextTick();
      expect(w.text()).toContain('0/5');
    });
  });

  // ── Progress hero ────────────────────────────────────────────────────────

  describe('progress hero', () => {
    it('progress bar reflects completion ratio', () => {
      const walkers = [
        makeWalker({ bagMade: true,  id_on_retreat: 1 }),
        makeWalker({ bagMade: false, id_on_retreat: 2 }),
      ];
      const w = mountView(walkers);
      const bar = w.find('[role="progressbar"]');
      expect(bar.exists()).toBe(true);
      expect(bar.attributes('data-value')).toBe('50');
    });

    it('shows 100% progress when all bags are done', () => {
      const walkers = [
        makeWalker({ bagMade: true, id_on_retreat: 1 }),
        makeWalker({ bagMade: true, id_on_retreat: 2 }),
      ];
      const w = mountView(walkers);
      expect(w.find('[role="progressbar"]').attributes('data-value')).toBe('100');
    });

    it('shows 0% when no bags are done', () => {
      const w = mountView([makeWalker({ bagMade: false, id_on_retreat: 1 })]);
      expect(w.find('[role="progressbar"]').attributes('data-value')).toBe('0');
    });
  });

  // ── Size summary ─────────────────────────────────────────────────────────

  describe('size summary', () => {
    it('shows correct display label for each size code', () => {
      const w = mountView([
        makeWalker({ tshirtSize: 'S', id_on_retreat: 1 }),
        makeWalker({ tshirtSize: 'G', id_on_retreat: 2 }),
        makeWalker({ tshirtSize: 'X', id_on_retreat: 3 }),
        makeWalker({ tshirtSize: '2', id_on_retreat: 4 }),
      ]);
      expect(w.text()).toContain('L');
      expect(w.text()).toContain('XL');
      expect(w.text()).toContain('XXL');
    });

    it('groups participants with missing size under "Sin talla"', () => {
      const w = mountView([
        makeWalker({ tshirtSize: null, id_on_retreat: 1 }),
        makeWalker({ tshirtSize: '',   id_on_retreat: 2 }),
      ]);
      expect(w.text()).toContain('Sin talla');
    });

    it('excludes servers from walker count', () => {
      const w = mountView([
        makeWalker({ tshirtSize: 'M', id_on_retreat: 1 }),
        { ...makeWalker({ tshirtSize: 'G' }), type: 'server' },
      ]);
      // totalWalkers should be 1 (only the walker, not the server)
      const hero = w.find('[role="progressbar"]');
      expect(hero.exists()).toBe(true);
      expect(w.text()).toContain('1'); // total appears in stats
      expect(w.text()).not.toContain('L'); // G→L from server excluded
    });

    it('hides size section when there are no walkers', () => {
      const w = mountView([]);
      // When no walkers, sizeSummary is empty → no size badges rendered
      expect(w.text()).not.toContain('Sin talla');
      expect(w.text()).not.toContain('XXL');
    });
  });

  // ── Search ───────────────────────────────────────────────────────────────

  describe('search', () => {
    it('filters rows by first name', async () => {
      const w = mountView([
        makeWalker({ firstName: 'María',  id_on_retreat: 1 }),
        makeWalker({ firstName: 'Carlos', id_on_retreat: 2 }),
      ]);
      await nextTick();
      await w.find('input').setValue('maría');
      await nextTick();
      expect(w.text()).toContain('María');
      expect(w.text()).not.toContain('Carlos');
    });

    it('filters rows by mesa name', async () => {
      const w = mountView([
        makeWalker({ tableMesa: { name: 'Mesa Roja' }, id_on_retreat: 1 }),
        makeWalker({ tableMesa: { name: 'Mesa Azul' }, id_on_retreat: 2 }),
      ]);
      await nextTick();
      await w.find('input').setValue('roja');
      await nextTick();
      expect(w.text()).toContain('Mesa Roja');
      expect(w.text()).not.toContain('Mesa Azul');
    });

    it('filters rows by id_on_retreat number', async () => {
      const w = mountView([
        makeWalker({ firstName: 'Ana',  id_on_retreat: 42 }),
        makeWalker({ firstName: 'Luis', id_on_retreat: 7  }),
      ]);
      await nextTick();
      await w.find('input').setValue('42');
      await nextTick();
      expect(w.text()).toContain('Ana');
      expect(w.text()).not.toContain('Luis');
    });

    it('is case-insensitive', async () => {
      const w = mountView([makeWalker({ firstName: 'ROSA', id_on_retreat: 1 })]);
      await nextTick();
      await w.find('input').setValue('rosa');
      await nextTick();
      expect(w.text()).toContain('ROSA');
    });

    it('shows empty-state message when no results match', async () => {
      const w = mountView([makeWalker({ id_on_retreat: 1 })]);
      await nextTick();
      await w.find('input').setValue('zzznotexists');
      await nextTick();
      expect(w.text()).toContain('Sin resultados para tu búsqueda');
    });

    it('clears search when X button is clicked', async () => {
      const w = mountView([makeWalker({ firstName: 'Sofía', id_on_retreat: 1 })]);
      await nextTick();
      await w.find('input').setValue('zzznotexists');
      await nextTick();
      const clearBtn = w.find('button[class*="absolute"][class*="right"]');
      await clearBtn.trigger('click');
      await nextTick();
      expect(w.text()).toContain('Sofía');
    });
  });

  // ── Filter tabs ──────────────────────────────────────────────────────────

  describe('filter tabs', () => {
    it('shows all walkers on default "Todos" tab', () => {
      const w = mountView([
        makeWalker({ bagMade: true,  id_on_retreat: 1 }),
        makeWalker({ bagMade: false, id_on_retreat: 2 }),
      ]);
      expect(w.findAll('tbody tr').length).toBe(2);
    });

    it('filters to only pending when "Pendientes" tab is active', async () => {
      const w = mountView([
        makeWalker({ firstName: 'Hecha',     bagMade: true,  id_on_retreat: 1 }),
        makeWalker({ firstName: 'Pendiente', bagMade: false, id_on_retreat: 2 }),
      ]);
      await nextTick();
      const tabs = w.findAll('.bg-gray-100 button');
      await tabs[1].trigger('click');
      await nextTick();
      expect(w.text()).toContain('Pendiente');
      expect(w.text()).not.toContain('Hecha');
    });

    it('filters to only done when "Realizadas" tab is active', async () => {
      const w = mountView([
        makeWalker({ firstName: 'Hecha',    bagMade: true,  id_on_retreat: 1 }),
        makeWalker({ firstName: 'SinBolsa', bagMade: false, id_on_retreat: 2 }),
      ]);
      await nextTick();
      // Find button containing "Realizadas" text
      const realizadasBtn = w.findAll('button').find(b => b.text().includes('Realizadas'))
      expect(realizadasBtn).toBeDefined()
      await realizadasBtn!.trigger('click');
      await nextTick();
      expect(w.text()).toContain('Hecha');
      expect(w.text()).not.toContain('SinBolsa');
    });

    it('shows correct counts on each tab badge', () => {
      const w = mountView([
        makeWalker({ bagMade: true,  id_on_retreat: 1 }),
        makeWalker({ bagMade: true,  id_on_retreat: 2 }),
        makeWalker({ bagMade: false, id_on_retreat: 3 }),
      ]);
      const tabText = w.find('.bg-gray-100').text();
      expect(tabText).toContain('3'); // Todos
      expect(tabText).toContain('2'); // Realizadas
      expect(tabText).toContain('1'); // Pendientes
    });
  });

  // ── BagMade toggle ───────────────────────────────────────────────────────

  describe('bagMade toggle', () => {
    // The toggle button has title "Marcar como realizada" or "Desmarcar"
    const getBagBtn = (w: ReturnType<typeof mountView>) =>
      w.find('button[title*="eali"]') // matches "realizada" and "Desmarcar" (title="Desmarcar")
      || w.findAll('button').at(-1)!;   // fallback: last button in component

    it('calls updateBagMade with correct args on click', async () => {
      const walker = makeWalker({ bagMade: false, id_on_retreat: 1 });
      const w = mountView([walker]);
      await flushPromises();
      await w.find('button[title="Marcar como realizada"]').trigger('click');
      await nextTick();
      expect(mockUpdateBagMade).toHaveBeenCalledWith(RETREAT_ID, walker.id, true);
    });

    it('toggles from true to false', async () => {
      const walker = makeWalker({ bagMade: true, id_on_retreat: 1 });
      const w = mountView([walker]);
      await flushPromises();
      await w.find('button[title="Desmarcar"]').trigger('click');
      await nextTick();
      expect(mockUpdateBagMade).toHaveBeenCalledWith(RETREAT_ID, walker.id, false);
    });

    it('applies green row style when bagMade is true', () => {
      const w = mountView([makeWalker({ bagMade: true, id_on_retreat: 1 })]);
      expect(w.find('tbody tr').classes().join(' ')).toMatch(/green/);
    });

    it('reverts optimistic update when API call fails', async () => {
      mockUpdateBagMade.mockRejectedValueOnce(new Error('Network error'));
      const walker = makeWalker({ bagMade: false, id_on_retreat: 1 });
      const w = mountView([walker]);
      await flushPromises();
      await w.find('button[title="Marcar como realizada"]').trigger('click');
      await flushPromises();
      expect(w.find('tbody tr').classes().join(' ')).not.toMatch(/bg-green/);
    });

    it('does not call API twice when clicking while in-flight', async () => {
      let resolve!: () => void;
      mockUpdateBagMade.mockReturnValueOnce(new Promise(r => { resolve = r; }));

      const walker = makeWalker({ bagMade: false, id_on_retreat: 1 });
      const w = mountView([walker]);
      await flushPromises();

      const btn = w.find('button[title="Marcar como realizada"]');
      await btn.trigger('click');
      await btn.trigger('click');
      await nextTick();

      expect(mockUpdateBagMade).toHaveBeenCalledTimes(1);
      resolve();
    });
  });

  // ── Empty state ──────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows filter message when no walkers exist', () => {
      expect(mountView([]).text()).toContain('No hay caminantes en este filtro');
    });

    it('shows search message when query yields no results', async () => {
      const w = mountView([makeWalker({ id_on_retreat: 1 })]);
      await nextTick();
      await w.find('input').setValue('zzznomatch');
      await nextTick();
      expect(w.text()).toContain('Sin resultados para tu búsqueda');
    });

    it('shows "Limpiar filtros" link when there is an active search', async () => {
      const w = mountView([makeWalker({ id_on_retreat: 1 })]);
      await nextTick();
      await w.find('input').setValue('zzznomatch');
      await nextTick();
      expect(w.text()).toContain('Limpiar filtros');
    });
  });

  // ── Table footer ─────────────────────────────────────────────────────────

  describe('table footer', () => {
    it('shows total count when all rows are visible', () => {
      const w = mountView([makeWalker({ id_on_retreat: 1 }), makeWalker({ id_on_retreat: 2 })]);
      // "Mostrando 2  caminantes" — template has whitespace between the number and word
      expect(w.text()).toMatch(/Mostrando\s+2\s+caminantes/);
    });

    it('shows filtered count with "de N" when search is active', async () => {
      const w = mountView([
        makeWalker({ firstName: 'Ana',   id_on_retreat: 1 }),
        makeWalker({ firstName: 'Pedro', id_on_retreat: 2 }),
      ]);
      await nextTick();
      await w.find('input').setValue('ana');
      await nextTick();
      expect(w.text()).toContain('de 2');
    });
  });

  // ── Print ────────────────────────────────────────────────────────────────

  describe('print', () => {
    it('calls window.print when print button is clicked', async () => {
      const spy = vi.spyOn(window, 'print').mockImplementation(() => {});
      const w = mountView();
      await w.find('[title="Imprimir reporte"]').trigger('click');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  // ── Data loading ─────────────────────────────────────────────────────────

  describe('data loading', () => {
    it('calls fetchRetreats when store is empty', async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const retreatStore = useRetreatStore(pinia);
      retreatStore.retreats = [];
      retreatStore.fetchRetreats = vi.fn().mockResolvedValue([]);
      const participantStore = useParticipantStore(pinia);
      participantStore.fetchParticipants = vi.fn().mockResolvedValue([]);

      mount(BagsReportView, {
        global: { plugins: [pinia], stubs: { teleport: { template: '<div><slot /></div>' } } },
      });
      await nextTick();
      expect(retreatStore.fetchRetreats).toHaveBeenCalled();
    });

    it('sets retreatId filter and calls fetchParticipants on mount', async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const retreatStore = useRetreatStore(pinia);
      retreatStore.retreats = [{ id: 'r-xyz', name: 'Test' } as any];
      retreatStore.selectedRetreatId = 'r-xyz';
      retreatStore.fetchRetreats = vi.fn();
      const participantStore = useParticipantStore(pinia);
      participantStore.fetchParticipants = vi.fn().mockResolvedValue([]);

      mount(BagsReportView, {
        global: { plugins: [pinia], stubs: { teleport: { template: '<div><slot /></div>' } } },
      });
      await nextTick();
      await nextTick();
      expect(participantStore.fetchParticipants).toHaveBeenCalled();
      expect(participantStore.filters.retreatId).toBe('r-xyz');
    });
  });
});
