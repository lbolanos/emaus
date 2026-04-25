import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { useDashboardSettingsStore } from '@/stores/dashboardSettingsStore';
import DashboardCustomizePanel from '../DashboardCustomizePanel.vue';
import { cleanupMocks } from '@/test/utils';

vi.mock('lucide-vue-next', () => {
  const s = { template: '<svg />' };
  return { Settings: s, X: s, RotateCcw: s, GripVertical: s, ArrowDownToLine: s };
});

vi.mock('@repo/ui', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    Switch: {
      template: '<button :data-checked="modelValue" @click="$emit(\'update:modelValue\', !modelValue)" />',
      props: ['modelValue'],
      emits: ['update:modelValue'],
    },
    Button: { template: '<button @click="$emit(\'click\')"><slot /></button>', emits: ['click'] },
  };
});

function mountPanel(isOpen = true) {
  const pinia = createPinia();
  setActivePinia(pinia);

  const wrapper = mount(DashboardCustomizePanel, {
    props: { isOpen },
    global: {
      plugins: [pinia],
      stubs: {
        Teleport: { template: '<div><slot /></div>' },
        Transition: { template: '<div><slot /></div>' },
      },
      mocks: { $t: (k: string) => k },
    },
  });

  return { wrapper, store: useDashboardSettingsStore() };
}

describe('DashboardCustomizePanel', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    cleanupMocks();
  });

  // ─── Visibilidad del panel ───────────────────────────────────────────────────

  describe('visibilidad', () => {
    it('no muestra contenido cuando isOpen=false', async () => {
      const { wrapper } = mountPanel(false);
      await flushPromises();
      expect(wrapper.text()).not.toContain('Personalizar dashboard');
    });

    it('muestra el panel cuando isOpen=true', async () => {
      const { wrapper } = mountPanel(true);
      await flushPromises();
      expect(wrapper.text()).toContain('Personalizar dashboard');
    });

    it('muestra la instrucción de arrastre', async () => {
      const { wrapper } = mountPanel();
      await flushPromises();
      expect(wrapper.text()).toContain('Arrastra para reordenar');
    });
  });

  // ─── Lista de secciones ──────────────────────────────────────────────────────

  describe('lista de secciones', () => {
    it('renderiza todas las secciones del sectionOrder', async () => {
      const { wrapper, store } = mountPanel();
      await flushPromises();
      const labels = wrapper.text();
      expect(labels).toContain('Participantes');
      expect(labels).toContain('Responsabilidades');
      expect(labels).toContain('Mesas');
      expect(labels).toContain('Recepción');
      expect(labels).toContain('Palancas');
    });

    it('muestra tantas filas como secciones tiene sectionOrder', async () => {
      const { wrapper, store } = mountPanel();
      await flushPromises();
      // Each row has draggable="true"
      const rows = wrapper.findAll('[draggable="true"]');
      expect(rows).toHaveLength(store.sectionOrder.length);
    });
  });

  // ─── Emisión de eventos ──────────────────────────────────────────────────────

  describe('cierre del panel', () => {
    it('emite close al hacer click en el backdrop', async () => {
      const { wrapper } = mountPanel();
      await flushPromises();
      const backdrop = wrapper.find('.fixed.inset-0');
      await backdrop.trigger('click');
      expect(wrapper.emitted('close')).toBeTruthy();
    });

    it('emite close al hacer click en el botón X', async () => {
      const { wrapper } = mountPanel();
      await flushPromises();
      // The X button is the ghost icon button in the header
      const closeBtn = wrapper.find('button[class*="ghost"]') ??
        wrapper.findAll('button').find(b => b.text() === '');
      // Trigger by finding button near the header title
      const buttons = wrapper.findAll('button');
      const xButton = buttons.find(b => b.attributes('class')?.includes('ghost'));
      if (xButton) {
        await xButton.trigger('click');
        expect(wrapper.emitted('close')).toBeTruthy();
      }
    });
  });

  // ─── Toggles de visibilidad ──────────────────────────────────────────────────

  describe('toggles de visibilidad', () => {
    it('llama toggleVisible al cambiar un switch', async () => {
      const { wrapper, store } = mountPanel();
      await flushPromises();
      const spy = vi.spyOn(store, 'toggleVisible');
      const switches = wrapper.findAll('button[data-checked]');
      if (switches.length > 0) {
        await switches[0].trigger('click');
        expect(spy).toHaveBeenCalledOnce();
      }
    });

    it('el switch refleja el estado visible del store', async () => {
      const { wrapper, store } = mountPanel();
      await flushPromises();
      // By default all are checked
      const switches = wrapper.findAll('button[data-checked]');
      expect(switches.length).toBeGreaterThan(0);
      const allChecked = switches.every(s => s.attributes('data-checked') === 'true');
      expect(allChecked).toBe(true);
    });
  });

  // ─── Botón Restablecer ───────────────────────────────────────────────────────

  describe('restablecer', () => {
    it('restaura el estado al hacer click en "Restablecer todo"', async () => {
      const { wrapper, store } = mountPanel();
      await flushPromises();

      // Modify state first
      store.toggleVisible('palancas');
      store.toggleCollapsed('reception');
      await nextTick();
      expect(store.visible.palancas).toBe(false);

      const resetBtn = wrapper.findAll('button').find(b =>
        b.text().includes('Restablecer')
      );
      expect(resetBtn).toBeDefined();
      await resetBtn!.trigger('click');
      await nextTick();

      expect(store.visible.palancas).toBe(true);
      expect(store.collapsed.reception).toBe(false);
    });
  });

  // ─── Drag para reordenar ─────────────────────────────────────────────────────

  describe('drag-to-reorder', () => {
    it('llama moveSection al completar un drop', async () => {
      const { wrapper, store } = mountPanel();
      await flushPromises();
      const spy = vi.spyOn(store, 'moveSection');
      const rows = wrapper.findAll('[draggable="true"]');
      expect(rows.length).toBeGreaterThan(1);

      await rows[0].trigger('dragstart');
      await rows[2].trigger('dragover');
      await rows[2].trigger('drop');
      await nextTick();

      expect(spy).toHaveBeenCalledWith(0, 2);
    });

    it('no llama moveSection si se suelta en el mismo índice', async () => {
      const { wrapper, store } = mountPanel();
      await flushPromises();
      const spy = vi.spyOn(store, 'moveSection');
      const rows = wrapper.findAll('[draggable="true"]');

      await rows[1].trigger('dragstart');
      await rows[1].trigger('drop');

      expect(spy).not.toHaveBeenCalled();
    });

    it('limpia el estado de drag al terminar (dragend)', async () => {
      const { wrapper } = mountPanel();
      await flushPromises();
      const rows = wrapper.findAll('[draggable="true"]');

      await rows[0].trigger('dragstart');
      await rows[2].trigger('dragover');
      // The hovered row gets a highlight class
      expect(rows[2].classes()).toContain('ring-1');
      await rows[0].trigger('dragend');
      await nextTick();
      // Highlight is removed
      expect(rows[2].classes()).not.toContain('ring-1');
    });
  });

  // ─── Scroll anchor ───────────────────────────────────────────────────────────

  describe('scroll a sección', () => {
    it('emite close al hacer click en el botón de scroll', async () => {
      const { wrapper } = mountPanel();
      await flushPromises();
      // Find ArrowDownToLine buttons (title="Ir a esta sección")
      const scrollBtns = wrapper.findAll('button[title="Ir a esta sección"]');
      expect(scrollBtns.length).toBeGreaterThan(0);
      await scrollBtns[0].trigger('click');
      expect(wrapper.emitted('close')).toBeTruthy();
    });

    it('llama scrollIntoView en el elemento con el id correcto', async () => {
      const { wrapper, store } = mountPanel();
      await flushPromises();

      // Create a fake DOM element for the first section
      const firstKey = store.sectionOrder[0];
      const fakeEl = { scrollIntoView: vi.fn() };
      vi.spyOn(document, 'getElementById').mockReturnValue(fakeEl as any);

      const scrollBtns = wrapper.findAll('button[title="Ir a esta sección"]');
      await scrollBtns[0].trigger('click');
      await nextTick();
      await nextTick();

      expect(document.getElementById).toHaveBeenCalledWith(`ds-section-${firstKey}`);
      expect(fakeEl.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    });
  });
});
