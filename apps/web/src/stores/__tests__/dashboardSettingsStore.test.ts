import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { nextTick } from 'vue';
import { useDashboardSettingsStore, DEFAULT_ORDER } from '../dashboardSettingsStore';
import { cleanupMocks } from '@/test/utils';

function makeStore() {
  return useDashboardSettingsStore();
}

describe('dashboardSettingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    cleanupMocks();
  });

  // ─── Estado inicial ──────────────────────────────────────────────────────────

  describe('estado inicial', () => {
    it('todas las secciones son visibles por defecto', () => {
      const store = makeStore();
      expect(Object.values(store.visible).every(Boolean)).toBe(true);
    });

    it('ninguna sección está colapsada por defecto', () => {
      const store = makeStore();
      expect(Object.values(store.collapsed).every(v => v === false)).toBe(true);
    });

    it('el orden inicial coincide con DEFAULT_ORDER', () => {
      const store = makeStore();
      expect(store.sectionOrder).toEqual(DEFAULT_ORDER);
    });
  });

  // ─── toggleVisible ───────────────────────────────────────────────────────────

  describe('toggleVisible', () => {
    it('oculta una sección visible', () => {
      const store = makeStore();
      store.toggleVisible('palancas');
      expect(store.visible.palancas).toBe(false);
    });

    it('muestra una sección oculta', () => {
      const store = makeStore();
      store.toggleVisible('palancas');
      store.toggleVisible('palancas');
      expect(store.visible.palancas).toBe(true);
    });

    it('persiste el cambio en localStorage', async () => {
      const store = makeStore();
      store.loadVisibilityForRetreat('r-1');
      store.toggleVisible('bagsReport');
      await nextTick();
      const saved = JSON.parse(localStorage.getItem('dashboard:visible-sections:r-1') ?? '{}');
      expect(saved.bagsReport).toBe(false);
    });
  });

  // ─── toggleCollapsed ─────────────────────────────────────────────────────────

  describe('toggleCollapsed', () => {
    it('colapsa una sección expandida', () => {
      const store = makeStore();
      store.toggleCollapsed('reception');
      expect(store.collapsed.reception).toBe(true);
    });

    it('expande una sección colapsada', () => {
      const store = makeStore();
      store.toggleCollapsed('reception');
      store.toggleCollapsed('reception');
      expect(store.collapsed.reception).toBe(false);
    });

    it('persiste el estado en localStorage', async () => {
      const store = makeStore();
      store.toggleCollapsed('tableAssignments');
      await nextTick();
      const saved = JSON.parse(localStorage.getItem('dashboard:collapsed-sections') ?? '{}');
      expect(saved.tableAssignments).toBe(true);
    });
  });

  // ─── moveSection ─────────────────────────────────────────────────────────────

  describe('moveSection', () => {
    it('mueve el elemento del índice 0 al índice 2', () => {
      const store = makeStore();
      const original = [...store.sectionOrder];
      store.moveSection(0, 2);
      expect(store.sectionOrder[2]).toBe(original[0]);
      expect(store.sectionOrder[0]).toBe(original[1]);
      expect(store.sectionOrder[1]).toBe(original[2]);
    });

    it('no altera el orden si from === to', () => {
      const store = makeStore();
      const before = [...store.sectionOrder];
      store.moveSection(3, 3);
      expect(store.sectionOrder).toEqual(before);
    });

    it('mantiene la misma longitud tras el movimiento', () => {
      const store = makeStore();
      const len = store.sectionOrder.length;
      store.moveSection(0, len - 1);
      expect(store.sectionOrder).toHaveLength(len);
    });

    it('persiste el nuevo orden en localStorage', async () => {
      const store = makeStore();
      store.moveSection(0, 1);
      await nextTick();
      const saved = JSON.parse(localStorage.getItem('dashboard:section-order') ?? '[]');
      expect(saved).toHaveLength(store.sectionOrder.length);
      expect(saved[0]).toBe(store.sectionOrder[0]);
    });
  });

  // ─── loadVisibilityForRetreat ────────────────────────────────────────────────

  describe('loadVisibilityForRetreat', () => {
    it('carga configuración específica del retiro desde localStorage', () => {
      const allTrue = Object.fromEntries(DEFAULT_ORDER.map(k => [k, true]));
      localStorage.setItem(
        'dashboard:visible-sections:retreat-abc',
        JSON.stringify({ ...allTrue, palancas: false, bagsReport: false })
      );

      const store = makeStore();
      store.loadVisibilityForRetreat('retreat-abc');

      expect(store.visible.palancas).toBe(false);
      expect(store.visible.bagsReport).toBe(false);
      expect(store.visible.reception).toBe(true);
    });

    it('aplica ALL_VISIBLE para un retiro sin configuración guardada', () => {
      const store = makeStore();
      store.toggleVisible('palancas');
      store.loadVisibilityForRetreat('retiro-nuevo-sin-config');
      expect(Object.values(store.visible).every(Boolean)).toBe(true);
    });

    it('guarda el estado del retiro anterior al cambiar', () => {
      const store = makeStore();
      store.loadVisibilityForRetreat('retreat-1');
      store.toggleVisible('bagsReport');

      store.loadVisibilityForRetreat('retreat-2');

      const saved = JSON.parse(
        localStorage.getItem('dashboard:visible-sections:retreat-1') ?? '{}'
      );
      expect(saved.bagsReport).toBe(false);
    });

    it('los retiros tienen visibilidades independientes', () => {
      const store = makeStore();

      store.loadVisibilityForRetreat('retreat-a');
      store.toggleVisible('palancas');

      store.loadVisibilityForRetreat('retreat-b');
      expect(store.visible.palancas).toBe(true); // retreat-b = all visible

      store.loadVisibilityForRetreat('retreat-a');
      expect(store.visible.palancas).toBe(false); // retreat-a persisted
    });
  });

  // ─── resetToDefaults ─────────────────────────────────────────────────────────

  describe('resetToDefaults', () => {
    it('restaura visibilidad, colapso y orden a sus valores por defecto', () => {
      const store = makeStore();
      store.toggleVisible('palancas');
      store.toggleCollapsed('reception');
      store.moveSection(0, 4);

      store.resetToDefaults();

      expect(store.visible.palancas).toBe(true);
      expect(store.collapsed.reception).toBe(false);
      expect(store.sectionOrder).toEqual(DEFAULT_ORDER);
    });
  });

  // ─── Restauración desde localStorage ────────────────────────────────────────

  describe('restauración desde localStorage al inicializar', () => {
    it('recupera visibilidad guardada', () => {
      const allTrue = Object.fromEntries(DEFAULT_ORDER.map(k => [k, true]));
      localStorage.setItem(
        'dashboard:visible-sections',
        JSON.stringify({ ...allTrue, palancas: false })
      );
      const store = makeStore();
      expect(store.visible.palancas).toBe(false);
      expect(store.visible.reception).toBe(true);
    });

    it('recupera orden guardado', () => {
      const customOrder = [...DEFAULT_ORDER].reverse();
      localStorage.setItem('dashboard:section-order', JSON.stringify(customOrder));
      const store = makeStore();
      expect(store.sectionOrder).toEqual(customOrder);
    });

    it('ignora localStorage con JSON inválido y usa defaults', () => {
      localStorage.setItem('dashboard:visible-sections', 'not-valid-json{');
      const store = makeStore();
      expect(Object.values(store.visible).every(Boolean)).toBe(true);
    });

    it('ignora un order guardado que no es array', () => {
      localStorage.setItem('dashboard:section-order', JSON.stringify({ not: 'an array' }));
      const store = makeStore();
      expect(store.sectionOrder).toEqual(DEFAULT_ORDER);
    });
  });

  // ─── Merge legacy sectionOrder con keys nuevas ──────────────────────────────
  // Cubre el bug: si un usuario guardó sectionOrder antes de añadir secciones
  // nuevas (Minuto a Minuto, Santísimo+angelitos), las nuevas keys nunca
  // aparecían en "Personalizar dashboard". El merge debe appendearlas.

  describe('merge de sectionOrder con keys nuevas en DEFAULT_ORDER', () => {
    it('appendea secciones nuevas al final del orden guardado', () => {
      // Simula un orden viejo (sin las dos secciones añadidas en V2)
      const legacy = DEFAULT_ORDER.filter(
        (k) => k !== 'minutoAMinuto' && k !== 'santisimo',
      );
      localStorage.setItem('dashboard:section-order', JSON.stringify(legacy));

      const store = makeStore();
      // Las legacy aparecen en su posición original
      expect(store.sectionOrder.slice(0, legacy.length)).toEqual(legacy);
      // Las nuevas se appendean
      expect(store.sectionOrder).toContain('minutoAMinuto');
      expect(store.sectionOrder).toContain('santisimo');
      expect(store.sectionOrder).toHaveLength(DEFAULT_ORDER.length);
    });

    it('preserva el orden personalizado del usuario', () => {
      const custom = [
        'palancas',
        'reception',
        'primaryStats',
      ] as const;
      localStorage.setItem('dashboard:section-order', JSON.stringify(custom));

      const store = makeStore();
      // Las primeras 3 mantienen el orden custom
      expect(store.sectionOrder.slice(0, 3)).toEqual(custom);
    });

    it('descarta keys obsoletas que ya no existen en DEFAULT_ORDER', () => {
      // 'oldRemovedKey' fue eliminada en una versión posterior del esquema
      const stale = ['palancas', 'oldRemovedKey', 'reception'];
      localStorage.setItem('dashboard:section-order', JSON.stringify(stale));

      const store = makeStore();
      expect(store.sectionOrder).not.toContain('oldRemovedKey');
      // Las válidas se conservan
      expect(store.sectionOrder).toContain('palancas');
      expect(store.sectionOrder).toContain('reception');
    });

    it('expone las dos secciones nuevas en DEFAULT_ORDER', () => {
      // Guardia contra regresiones: si alguien quita una key del default,
      // este test grita.
      expect(DEFAULT_ORDER).toContain('minutoAMinuto');
      expect(DEFAULT_ORDER).toContain('santisimo');
    });
  });

  // ─── Visibilidad y colapso para keys recién añadidas ────────────────────────

  describe('keys nuevas (minutoAMinuto, santisimo)', () => {
    it('están visibles por defecto', () => {
      const store = makeStore();
      expect(store.visible.minutoAMinuto).toBe(true);
      expect(store.visible.santisimo).toBe(true);
    });

    it('no están colapsadas por defecto', () => {
      const store = makeStore();
      expect(store.collapsed.minutoAMinuto).toBe(false);
      expect(store.collapsed.santisimo).toBe(false);
    });

    it('reciben default cuando localStorage solo tiene keys legacy', () => {
      const allTrueLegacy = {
        primaryStats: false,
        palancas: false,
      };
      localStorage.setItem(
        'dashboard:visible-sections',
        JSON.stringify(allTrueLegacy),
      );

      const store = makeStore();
      // Las legacy persisten su valor stored
      expect(store.visible.primaryStats).toBe(false);
      expect(store.visible.palancas).toBe(false);
      // Las nuevas reciben el default (true) gracias al spread con ALL_VISIBLE
      expect(store.visible.minutoAMinuto).toBe(true);
      expect(store.visible.santisimo).toBe(true);
    });
  });
});
