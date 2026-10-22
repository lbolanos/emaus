<template>
  <div class="min-h-screen bg-stone-100 px-4 py-6 text-slate-800">
    <!-- Loading -->
    <div v-if="loading" class="mx-auto max-w-3xl" data-testid="album-loading" aria-busy="true">
      <div class="animate-pulse rounded-3xl bg-stone-50 p-5 shadow-sm ring-1 ring-stone-200">
        <div class="mb-3 h-3 w-40 rounded bg-stone-200"></div>
        <div class="mb-4 h-8 w-3/4 rounded bg-stone-200"></div>
        <div class="mb-4 h-10 w-full rounded bg-stone-200"></div>
        <div class="h-64 w-full rounded-2xl bg-stone-200"></div>
      </div>
    </div>

    <!-- Not found / error -->
    <div
      v-else-if="errorMessage"
      class="mx-auto mt-16 max-w-md rounded-3xl bg-stone-50 p-8 text-center shadow-sm ring-1 ring-stone-200"
      role="alert"
      data-testid="album-error"
    >
      <p class="text-lg font-semibold text-slate-800">{{ errorMessage }}</p>
    </div>

    <!-- Album -->
    <main v-else-if="album" class="mx-auto max-w-3xl">
      <div class="rounded-3xl bg-stone-50 p-4 shadow-sm ring-1 ring-stone-200 sm:p-6">
        <p class="text-xs font-bold uppercase tracking-widest text-amber-600" data-testid="album-eyebrow">
          {{ eyebrow }}
        </p>
        <h1 class="mt-1 text-3xl font-extrabold leading-tight text-slate-800 sm:text-4xl">
          Conozcamos nuestros nombres
        </h1>
        <p
          class="mt-3 inline-block rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800"
          data-testid="album-count"
        >
          {{ countLabel }}
        </p>

        <!-- Toolbar -->
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" :class="btnClass" @click="resetZoom">Foto completa</button>
          <button
            type="button"
            :class="[btnClass, showDots ? 'border-green-300 bg-green-100 text-green-800' : '']"
            :aria-pressed="showDots"
            data-testid="toggle-dots"
            @click="showDots = !showDots"
          >
            {{ showDots ? 'Ocultar puntos' : 'Mostrar puntos' }}
          </button>
          <div class="flex items-center gap-1" role="group" aria-label="Zoom">
            <button
              type="button"
              :class="btnClass"
              aria-label="Alejar"
              :disabled="zoom <= MIN_ZOOM"
              data-testid="zoom-out"
              @click="changeZoom(-ZOOM_STEP)"
            >
              −
            </button>
            <span class="min-w-[3.5rem] text-center text-sm font-semibold tabular-nums" data-testid="zoom-label">
              {{ Math.round(zoom * 100) }} %
            </span>
            <button
              type="button"
              :class="btnClass"
              aria-label="Acercar"
              :disabled="zoom >= MAX_ZOOM"
              data-testid="zoom-in"
              @click="changeZoom(ZOOM_STEP)"
            >
              +
            </button>
          </div>
          <input
            v-model="query"
            type="search"
            placeholder="Buscar por nombre…"
            aria-label="Buscar por nombre"
            class="min-w-0 flex-1 basis-40 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
            data-testid="album-search"
            @keydown.enter.prevent="selectFirstMatch"
          />
        </div>

        <p class="mt-3 text-sm text-slate-600">
          En computador: pase el cursor sobre un rostro. En celular: toque la foto para acercarse y luego
          toque un rostro, o búsquelo por nombre.
        </p>

        <!-- Photo -->
        <div
          ref="frame"
          class="mt-4 max-h-[75vh] overflow-y-auto rounded-2xl bg-white ring-1 ring-stone-200"
          :class="zoom <= MIN_ZOOM ? 'overflow-x-hidden' : 'overflow-x-auto'"
          data-testid="album-frame"
        >
          <div class="relative" :style="{ width: `${zoom * 100}%` }" @click="onPhotoClick">
            <img
              :src="album.photoUrl"
              :alt="`Foto de la reunión ${album.meetingTitle}`"
              class="block h-auto w-full select-none"
              draggable="false"
            />
            <button
              v-for="(tag, index) in album.tags"
              :key="index"
              :ref="(el) => setFaceRef(index, el)"
              type="button"
              :aria-label="`Identificar ${tag.name}`"
              :data-testid="`face-${index}`"
              :style="faceStyle(tag)"
              class="group absolute rounded-md focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500"
              :class="[
                selected === index ? 'z-20 ring-4 ring-green-500' : 'z-10',
                matchSet.has(index) ? '' : 'opacity-30',
              ]"
              @click.stop="select(index, false)"
            >
              <span
                v-if="showDots"
                class="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-500 shadow"
                data-testid="face-dot"
              ></span>
              <span
                class="pointer-events-none absolute whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs font-semibold text-white shadow-lg"
                :class="[
                  ...labelClasses(tag),
                  selected === index ? 'block' : 'hidden group-hover:block group-focus-visible:block',
                ]"
              >
                {{ tag.name }}
              </span>
            </button>
          </div>
        </div>

        <p v-if="album.tags.length === 0" class="mt-3 text-center text-sm text-slate-600" data-testid="album-empty">
          Aún no hay nombres en esta foto
        </p>

        <!-- Status card -->
        <div
          class="mt-4 rounded-2xl border border-stone-200 bg-white p-4"
          aria-live="polite"
          data-testid="album-status"
        >
          <template v-if="selectedTag">
            <p class="text-xs font-semibold uppercase tracking-wide text-green-700">Integrante seleccionado</p>
            <p class="text-xl font-bold text-slate-800">{{ selectedTag.name }}</p>
          </template>
          <template v-else>
            <p class="font-semibold text-slate-800">Seleccione un rostro o un nombre</p>
            <p class="text-sm text-slate-600">Para identificar a los integrantes</p>
          </template>
        </div>

        <!-- List -->
        <details v-if="album.tags.length > 0" class="mt-4 rounded-2xl border border-stone-200 bg-white" data-testid="album-list">
          <!-- list-none + hidden webkit marker: the ▾ glyph is the only disclosure sign -->
          <summary class="cursor-pointer select-none list-none rounded-2xl px-4 py-3 text-sm font-semibold text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-600 [&::-webkit-details-marker]:hidden">
            <span class="flex items-center justify-between gap-2">
              <span>Ver y buscar en la lista de {{ album.tags.length }} integrantes</span>
              <span class="shrink-0" aria-hidden="true">▾</span>
            </span>
          </summary>
          <p v-if="matches.length === 0" class="px-4 pb-3 text-sm text-slate-600">Sin resultados</p>
          <ul class="max-h-64 overflow-auto px-2 pb-2">
            <li v-for="index in matches" :key="index">
              <button
                type="button"
                class="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-green-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-600"
                :class="selected === index ? 'bg-green-100 font-semibold' : ''"
                :data-testid="`list-item-${index}`"
                @click="select(index, true)"
              >
                {{ album.tags[index].name }}
              </button>
            </li>
          </ul>
        </details>

        <p class="mt-4 text-xs text-slate-500">
          Para volver a la vista general, pulse «100 %». Puede mover horizontalmente la foto cuando está
          ampliada.
        </p>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue';
import { useRoute } from 'vue-router';
import { getPublicMeetingAlbum, type PublicMeetingAlbum } from '@/services/api';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  boxToPercent,
  clampZoom,
  labelPlacement,
  searchTagIndexes,
} from '@/utils/albumGeometry';

const btnClass =
  'rounded-full border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-stone-100 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600';

const route = useRoute();

const album = ref<PublicMeetingAlbum | null>(null);
const loading = ref(true);
const errorMessage = ref('');
const zoom = ref(MIN_ZOOM);
const DOTS_KEY = 'album-show-dots';
const readDots = (): boolean => {
  try {
    return sessionStorage.getItem(DOTS_KEY) === '1';
  } catch {
    return false;
  }
};
const showDots = ref(readDots());
watch(showDots, (value) => {
  try {
    sessionStorage.setItem(DOTS_KEY, value ? '1' : '0');
  } catch {
    // storage unavailable: keep in-memory state only
  }
});
const query = ref('');
const selected = ref<number | null>(null);
const frame = ref<HTMLElement | null>(null);
const faceRefs = new Map<number, HTMLElement>();

let robotsMeta: HTMLMetaElement | null = null;
let previousTitle = '';

const matches = computed(() => (album.value ? searchTagIndexes(album.value.tags, query.value) : []));
const matchSet = computed(() => new Set(matches.value));
const selectedTag = computed(() =>
  album.value && selected.value !== null ? (album.value.tags[selected.value] ?? null) : null,
);

const countLabel = computed(() => {
  const n = album.value?.tags.length ?? 0;
  return `${n} ${n === 1 ? 'integrante' : 'integrantes'}`;
});

const eyebrow = computed(() => {
  if (!album.value) return '';
  const { communityName, startDate, timezone } = album.value;
  let day = '';
  try {
    const date = new Date(startDate);
    if (!isNaN(date.getTime())) {
      day = date
        .toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: timezone || undefined })
        .toUpperCase();
    }
  } catch {
    day = '';
  }
  const name = communityName.toUpperCase();
  return day ? `${name} · ${day}` : name;
});

function faceStyle(tag: { box: [number, number, number, number] }) {
  const r = boxToPercent(tag.box);
  return { left: `${r.left}%`, top: `${r.top}%`, width: `${r.width}%`, height: `${r.height}%` };
}

function labelClasses(tag: { box: [number, number, number, number] }): string[] {
  const p = labelPlacement(tag.box);
  return [
    p.vertical === 'above' ? 'bottom-full mb-1' : 'top-full mt-1',
    p.horizontal === 'right' ? 'right-0' : p.horizontal === 'left' ? 'left-0' : 'left-1/2 -translate-x-1/2',
  ];
}

function setFaceRef(index: number, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement) faceRefs.set(index, el);
  else faceRefs.delete(index);
}

function changeZoom(delta: number) {
  zoom.value = clampZoom(zoom.value + delta);
}

function resetZoom() {
  zoom.value = MIN_ZOOM;
  if (frame.value) {
    frame.value.scrollLeft = 0;
    frame.value.scrollTop = 0;
  }
}

// Tapping the photo background zooms in (mobile); faces stop propagation.
function onPhotoClick() {
  if (zoom.value < 2) zoom.value = 2;
}

function select(index: number, scroll: boolean) {
  selected.value = index;
  if (scroll) {
    // Zoom in enough that the face is comfortably visible, then scroll to it after layout.
    if (zoom.value < 2) zoom.value = 2;
    setTimeout(() => {
      const el = faceRefs.get(index);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      }
      el?.focus({ preventScroll: true });
    }, 0);
  }
}

function selectFirstMatch() {
  if (query.value.trim() && matches.value.length > 0) select(matches.value[0], true);
}

onMounted(async () => {
  robotsMeta = document.createElement('meta');
  robotsMeta.setAttribute('name', 'robots');
  robotsMeta.setAttribute('content', 'noindex');
  document.head.appendChild(robotsMeta);
  previousTitle = document.title;

  try {
    const token = String(route.params.token ?? '');
    album.value = await getPublicMeetingAlbum(token);
    document.title = `Conozcamos nuestros nombres · ${album.value.communityName}`;
  } catch (err: any) {
    errorMessage.value =
      err?.response?.status === 404
        ? 'Este álbum no existe o ya no está disponible.'
        : 'No pudimos cargar el álbum. Intente de nuevo más tarde.';
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  robotsMeta?.remove();
  robotsMeta = null;
  if (previousTitle) document.title = previousTitle;
});
</script>
