import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export type SectionKey =
  | 'primaryStats'
  | 'bagsReport'
  | 'reception'
  | 'assignmentStats'
  | 'tableAssignments'
  | 'responsibilities'
  | 'palancas'
  | 'registrationLinks'
  | 'additionalInfo'
  | 'inventoryAlerts';

type SectionRecord = Record<SectionKey, boolean>;

const BASE_VISIBILITY_KEY = 'dashboard:visible-sections';
const COLLAPSED_KEY = 'dashboard:collapsed-sections';
const ORDER_KEY = 'dashboard:section-order';

const ALL_VISIBLE: SectionRecord = {
  primaryStats: true,
  bagsReport: true,
  reception: true,
  assignmentStats: true,
  tableAssignments: true,
  responsibilities: true,
  palancas: true,
  registrationLinks: true,
  additionalInfo: true,
  inventoryAlerts: true,
};

const ALL_EXPANDED: SectionRecord = {
  primaryStats: false,
  bagsReport: false,
  reception: false,
  assignmentStats: false,
  tableAssignments: false,
  responsibilities: false,
  palancas: false,
  registrationLinks: false,
  additionalInfo: false,
  inventoryAlerts: false,
};

export const DEFAULT_ORDER: SectionKey[] = [
  'registrationLinks',
  'primaryStats',
  'responsibilities',
  'tableAssignments',
  'assignmentStats',
  'reception',
  'palancas',
  'bagsReport',
  'additionalInfo',
  'inventoryAlerts',
];

function loadFromStorage<T extends object>(key: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch (_e) {
    // ignore parse/storage errors
  }
  return { ...defaults };
}

function loadOrderFromStorage(key: string, defaults: SectionKey[]): SectionKey[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_e) {
    // ignore parse/storage errors
  }
  return [...defaults];
}

function saveToStorage<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_e) {
    // ignore storage quota/availability errors
  }
}

export const useDashboardSettingsStore = defineStore('dashboardSettings', () => {
  const visibilityKey = ref(BASE_VISIBILITY_KEY);
  const visible = ref<SectionRecord>(loadFromStorage(BASE_VISIBILITY_KEY, ALL_VISIBLE));
  const collapsed = ref<SectionRecord>(loadFromStorage(COLLAPSED_KEY, ALL_EXPANDED));
  const sectionOrder = ref<SectionKey[]>(loadOrderFromStorage(ORDER_KEY, DEFAULT_ORDER));

  watch(visible, (v) => saveToStorage(visibilityKey.value, v), { deep: true });
  watch(collapsed, (v) => saveToStorage(COLLAPSED_KEY, v), { deep: true });
  watch(sectionOrder, (v) => saveToStorage(ORDER_KEY, v), { deep: true });

  function loadVisibilityForRetreat(retreatId: string) {
    saveToStorage(visibilityKey.value, visible.value);
    const newKey = `${BASE_VISIBILITY_KEY}:${retreatId}`;
    visibilityKey.value = newKey;
    visible.value = loadFromStorage(newKey, ALL_VISIBLE);
  }

  function toggleVisible(key: SectionKey) {
    visible.value[key] = !visible.value[key];
  }

  function toggleCollapsed(key: SectionKey) {
    collapsed.value[key] = !collapsed.value[key];
  }

  function moveSection(fromIndex: number, toIndex: number) {
    const arr = [...sectionOrder.value];
    arr.splice(toIndex, 0, arr.splice(fromIndex, 1)[0]);
    sectionOrder.value = arr;
  }

  function resetToDefaults() {
    visible.value = { ...ALL_VISIBLE };
    collapsed.value = { ...ALL_EXPANDED };
    sectionOrder.value = [...DEFAULT_ORDER];
  }

  return {
    visible,
    collapsed,
    sectionOrder,
    loadVisibilityForRetreat,
    toggleVisible,
    toggleCollapsed,
    moveSection,
    resetToDefaults,
  };
});
