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

const VISIBILITY_KEY = 'dashboard:visible-sections';
const COLLAPSED_KEY = 'dashboard:collapsed-sections';

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

function loadFromStorage<T extends object>(key: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch (_e) {
    // ignore parse errors
  }
  return { ...defaults };
}

function saveToStorage<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_e) {
    // ignore storage errors
  }
}

export const useDashboardSettingsStore = defineStore('dashboardSettings', () => {
  const visible = ref<SectionRecord>(loadFromStorage(VISIBILITY_KEY, ALL_VISIBLE));
  const collapsed = ref<SectionRecord>(loadFromStorage(COLLAPSED_KEY, ALL_EXPANDED));

  watch(visible, (v) => saveToStorage(VISIBILITY_KEY, v), { deep: true });
  watch(collapsed, (v) => saveToStorage(COLLAPSED_KEY, v), { deep: true });

  function toggleVisible(key: SectionKey) {
    visible.value[key] = !visible.value[key];
  }

  function toggleCollapsed(key: SectionKey) {
    collapsed.value[key] = !collapsed.value[key];
  }

  function resetToDefaults() {
    visible.value = { ...ALL_VISIBLE };
    collapsed.value = { ...ALL_EXPANDED };
  }

  return { visible, collapsed, toggleVisible, toggleCollapsed, resetToDefaults };
});
