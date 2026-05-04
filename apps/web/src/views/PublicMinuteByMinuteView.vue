<template>
  <div class="min-h-dvh bg-gray-950 text-white p-4 sm:p-6 md:p-10 select-none">
    <!-- Header -->
    <header class="flex items-baseline justify-between mb-6">
      <div>
        <h1 class="text-2xl md:text-4xl font-bold tracking-tight">
          {{ data?.retreat.parish ?? 'Retiro' }}
        </h1>
        <p class="text-gray-400 text-sm md:text-base mt-1">
          <span v-if="currentDayLabel">{{ currentDayLabel }} · </span>{{ fmtClock(now) }}
          <span v-if="loading" class="ml-2 text-gray-600">· cargando…</span>
        </p>
      </div>
      <div class="text-right text-xs text-gray-500">
        <div v-if="wsConnected" class="text-emerald-400">● en vivo</div>
        <div v-else>Auto-refresh cada 60s</div>
        <div v-if="lastRefresh">Última: {{ fmtClock(lastRefresh) }}</div>
      </div>
    </header>

    <!-- AHORA prominent banner -->
    <section
      v-if="active"
      class="rounded-2xl bg-emerald-700/20 border-2 border-emerald-500 px-6 py-5 md:px-10 md:py-8 mb-6 shadow-lg"
    >
      <div class="text-emerald-300 font-bold uppercase tracking-widest text-xs md:text-sm mb-2 flex items-center gap-2">
        <span class="inline-block w-3 h-3 bg-emerald-400 rounded-full animate-pulse"></span>
        AHORA · {{ fmtTime(active.startTime) }} – {{ fmtTime(active.endTime) }}
      </div>
      <div class="text-3xl md:text-6xl font-bold leading-tight">{{ active.name }}</div>
      <div class="mt-2 md:mt-3 text-base md:text-2xl text-gray-300">
        <span v-if="active.responsabilityName" class="text-blue-300">🎤 {{ active.responsabilityName }}</span>
        <span v-if="active.location" class="ml-3">📍 {{ active.location }}</span>
      </div>
    </section>

    <section
      v-else-if="!loading && data && currentDayItems.length"
      class="rounded-2xl bg-gray-800 border-2 border-gray-700 px-6 py-5 md:px-10 md:py-8 mb-6"
    >
      <div class="text-gray-400 uppercase tracking-widest text-xs md:text-sm mb-2">
        En transición
      </div>
      <div class="text-xl md:text-3xl text-gray-300">
        {{ nextLabel || 'Esperando próximo item' }}
      </div>
    </section>

    <!-- Próximos items -->
    <section v-if="upcoming.length" class="space-y-2">
      <h2 class="text-gray-400 uppercase tracking-widest text-xs md:text-sm mb-2">
        A continuación
      </h2>
      <ul class="divide-y divide-gray-800 border border-gray-800 rounded-xl overflow-hidden bg-gray-900">
        <li
          v-for="(item, idx) in upcoming"
          :key="item.id"
          class="flex items-center gap-3 md:gap-5 px-4 py-3 md:px-6 md:py-4"
        >
          <div class="text-xl md:text-3xl font-mono font-bold w-20 md:w-28 shrink-0 text-gray-200">
            {{ fmtTime(item.startTime) }}
          </div>
          <div class="text-xs md:text-sm text-gray-500 w-12 md:w-16 shrink-0 text-right">
            +{{ minutesUntil(item.startTime) }}m
          </div>
          <div class="flex-1 min-w-0">
            <div
              :class="idx === 0 ? 'text-base md:text-2xl font-semibold' : 'text-sm md:text-xl text-gray-300'"
              class="truncate"
            >
              {{ item.name }}
            </div>
            <div v-if="item.responsabilityName" class="text-xs md:text-sm text-blue-300 truncate">
              🎤 {{ item.responsabilityName }}
            </div>
          </div>
        </li>
      </ul>
    </section>

    <!-- Items completados (resumen) -->
    <section v-if="completed.length" class="mt-6 text-xs md:text-sm text-gray-500">
      Completados hoy: {{ completed.length }}
      <span v-if="totalToday" class="ml-1 text-gray-600">/ {{ totalToday }}</span>
    </section>

    <!-- Estados de error / loading inicial -->
    <div v-if="error" class="text-red-400 text-center mt-12 text-lg">
      {{ error }}
    </div>
    <div v-if="loading && !data" class="text-gray-500 text-center mt-12 text-lg">
      Cargando…
    </div>

    <!-- Live update toast (efímero, 2s) -->
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-300 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="liveToast"
        class="fixed bottom-6 right-6 bg-emerald-600/95 text-white px-4 py-2 rounded-lg shadow-lg text-sm md:text-base font-medium flex items-center gap-2 z-50"
        role="status"
        aria-live="polite"
      >
        <span class="text-base">⚡</span>
        <span>{{ liveToast }}</span>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { retreatScheduleApi } from '@/services/api';
import { getSocket } from '@/services/realtime';

interface Props {
  slug: string;
}
const props = defineProps<Props>();

type Item = {
  id: string;
  day: number;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  name: string;
  type: string;
  status: 'pending' | 'active' | 'completed' | 'delayed' | 'skipped';
  location: string | null;
  responsabilityName: string | null;
};
type Data = {
  retreat: { id: string; parish: string; startDate: string; endDate: string };
  items: Item[];
};

const data = ref<Data | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const lastRefresh = ref<number | null>(null);
const wsConnected = ref(false);
const now = ref(Date.now());
const liveToast = ref<string | null>(null);
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let detachWs: (() => void) | null = null;
let subscribedRetreatId: string | null = null;

function showLiveToast(message: string) {
  liveToast.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    liveToast.value = null;
    toastTimer = null;
  }, 2000);
}

async function refresh() {
  if (!props.slug) return;
  loading.value = true;
  error.value = null;
  try {
    data.value = await retreatScheduleApi.publicGetMam(props.slug);
    lastRefresh.value = Date.now();
  } catch (err: any) {
    if (err?.response?.status === 404) {
      error.value = 'Este retiro no existe o no es público.';
    } else {
      error.value = 'No se pudo cargar el horario. Reintentando…';
    }
  } finally {
    loading.value = false;
  }
}

/**
 * Subscribe to the public schedule room. Server validates `slug` → `isPublic`
 * → joins us to `public:retreat:<id>:schedule`. Handlers below patch the
 * local state on each event so the projector reflects coordinator actions
 * within ~100ms instead of waiting up to 30s for the next poll.
 */
function setupRealtime() {
  const socket = getSocket();

  const join = () => {
    socket.emit(
      'public:schedule:subscribe',
      props.slug,
      (result: { ok: boolean; retreatId?: string }) => {
        wsConnected.value = !!result.ok;
        if (result.ok && result.retreatId) {
          subscribedRetreatId = result.retreatId;
        }
      },
    );
  };
  if (socket.connected) join();
  socket.on('connect', join);

  // Patch local items without a full refetch when possible — keeps the WS
  // path cheap. Fall back to refresh() for `schedule:updated` (generic
  // change of unknown shape) and `schedule:delay` (timing recalc).
  const onStarted = (e: { retreatId: string; itemId: string; actualStartTime: string }) => {
    if (e.retreatId !== subscribedRetreatId || !data.value) return;
    const it = data.value.items.find((x) => x.id === e.itemId);
    if (it) it.status = 'active';
    showLiveToast('Actualización en vivo');
  };
  const onCompleted = (e: { retreatId: string; itemId: string; actualEndTime: string }) => {
    if (e.retreatId !== subscribedRetreatId || !data.value) return;
    const it = data.value.items.find((x) => x.id === e.itemId);
    if (it) it.status = 'completed';
    showLiveToast('Actualización en vivo');
  };
  const onUpdated = (e: { retreatId: string; itemId: string }) => {
    if (e.retreatId !== subscribedRetreatId) return;
    void refresh();
    showLiveToast('Actualización en vivo');
  };
  const onDelay = (e: { retreatId: string; itemId: string; minutesDelta: number }) => {
    if (e.retreatId !== subscribedRetreatId) return;
    void refresh();
    showLiveToast('Horario ajustado');
  };

  socket.on('schedule:item-started', onStarted);
  socket.on('schedule:item-completed', onCompleted);
  socket.on('schedule:updated', onUpdated);
  socket.on('schedule:delay', onDelay);

  detachWs = () => {
    if (subscribedRetreatId) {
      socket.emit('public:schedule:unsubscribe', subscribedRetreatId);
    }
    socket.off('connect', join);
    socket.off('schedule:item-started', onStarted);
    socket.off('schedule:item-completed', onCompleted);
    socket.off('schedule:updated', onUpdated);
    socket.off('schedule:delay', onDelay);
    wsConnected.value = false;
  };
}

onMounted(() => {
  void refresh();
  setupRealtime();
  // Polling kept as a fallback at a slower cadence (60s instead of 30s).
  // Catches: WS reconnection edge cases, items shifting time without an
  // explicit event, and clock drift on long-running projector sessions.
  refreshTimer = setInterval(() => void refresh(), 60_000);
  clockTimer = setInterval(() => { now.value = Date.now(); }, 30_000);
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  if (clockTimer) clearInterval(clockTimer);
  if (toastTimer) clearTimeout(toastTimer);
  detachWs?.();
});

// ── Derived state ─────────────────────────────────────────────────────────────

/**
 * The currently-active item is whatever the coordinator marked as active in
 * the editor (status === 'active'). Falls back to a time-window check if no
 * item is explicitly active — covers retreats where the coordinator didn't
 * use the start/complete buttons.
 */
const active = computed<Item | null>(() => {
  if (!data.value) return null;
  const explicit = data.value.items.find((i) => i.status === 'active');
  if (explicit) return explicit;
  const t = now.value;
  return (
    data.value.items.find((i) => {
      const s = new Date(i.startTime).getTime();
      const e = new Date(i.endTime).getTime();
      return s <= t && t <= e && i.status !== 'completed' && i.status !== 'skipped';
    }) ?? null
  );
});

/** Items happening today (or, if no items today, the closest upcoming day). */
const currentDayItems = computed<Item[]>(() => {
  if (!data.value || !data.value.items.length) return [];
  // Pick the day that contains "now" — or the next future day if none.
  const day = activeDay.value;
  if (day === null) return [];
  return data.value.items
    .filter((i) => i.day === day)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
});

const activeDay = computed<number | null>(() => {
  if (!data.value || !data.value.items.length) return null;
  const t = now.value;

  // Highest-priority signal: the day of the explicitly-active item (the one
  // the coordinator clicked ▶). Solves the case where Día N ends late (e.g.
  // 23:50) and Día N+1 starts early (e.g. 02:30), so both day-ranges contain
  // `now` — without this, the older day wins by Map iteration order even
  // though the active item belongs to the newer day.
  const explicitActive = data.value.items.find((i) => i.status === 'active');
  if (explicitActive) return explicitActive.day;

  // Day whose first item start ≤ now ≤ last item end
  const grouped = new Map<number, { first: number; last: number }>();
  for (const i of data.value.items) {
    const s = new Date(i.startTime).getTime();
    const e = new Date(i.endTime).getTime();
    const cur = grouped.get(i.day);
    if (!cur) grouped.set(i.day, { first: s, last: e });
    else grouped.set(i.day, { first: Math.min(cur.first, s), last: Math.max(cur.last, e) });
  }
  // Find day containing now. When multiple days overlap (Día N late items
  // overlap with Día N+1 early items), prefer the LATER day — its content
  // is more relevant to "what's coming next".
  let containingDay: number | null = null;
  for (const [day, range] of grouped) {
    if (range.first <= t && t <= range.last) {
      if (containingDay === null || day > containingDay) containingDay = day;
    }
  }
  if (containingDay !== null) return containingDay;
  // Else: next future day
  let bestDay: number | null = null;
  let bestStart = Infinity;
  for (const [day, range] of grouped) {
    if (range.first > t && range.first < bestStart) {
      bestStart = range.first;
      bestDay = day;
    }
  }
  if (bestDay !== null) return bestDay;
  // Else: most recent past day (retreat finished, but still show last day)
  let pastDay: number | null = null;
  let pastEnd = -Infinity;
  for (const [day, range] of grouped) {
    if (range.last > pastEnd) {
      pastEnd = range.last;
      pastDay = day;
    }
  }
  return pastDay;
});

const currentDayLabel = computed<string>(() => {
  const day = activeDay.value;
  if (day === null || !data.value) return '';
  const items = currentDayItems.value;
  if (!items.length) return `Día ${day}`;
  // Use the first item's date in local time
  const d = new Date(items[0].startTime);
  const dateStr = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  return `Día ${day} · ${dateStr}`;
});

const upcoming = computed<Item[]>(() => {
  const t = now.value;
  // Next 5 items today that haven't started yet (or are pending past their start time)
  return currentDayItems.value
    .filter((i) => {
      if (i.status === 'completed' || i.status === 'skipped') return false;
      if (i.id === active.value?.id) return false;
      const s = new Date(i.startTime).getTime();
      return s >= t || i.status === 'pending' || i.status === 'delayed';
    })
    .filter((i) => new Date(i.endTime).getTime() > t)
    .slice(0, 5);
});

const completed = computed<Item[]>(() =>
  currentDayItems.value.filter((i) => i.status === 'completed'),
);

const totalToday = computed<number>(() => currentDayItems.value.length);

const nextLabel = computed<string | null>(() => {
  if (upcoming.value.length === 0) return null;
  return `Próximo: ${upcoming.value[0].name} a las ${fmtTime(upcoming.value[0].startTime)}`;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtClock(t: number | null): string {
  if (!t) return '';
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function minutesUntil(iso: string): number {
  const diff = new Date(iso).getTime() - now.value;
  return Math.max(0, Math.round(diff / 60_000));
}
</script>
