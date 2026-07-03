<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { isMeaninglessNickname } from '@/utils/participant';

interface ParticipantLike {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  nickname?: string | null;
}

const props = defineProps<{
  /** Etiqueta ya resuelta del responsable (servidor y/o texto libre). Vacío = sin asignar. */
  label: string;
  /** Servidores del retiro para el picker. */
  participants: ParticipantLike[];
  /** Sin permiso de gestión el chip es solo lectura. */
  canManage: boolean;
  /** Hay un responsable asignado (para ofrecer "Quitar"). */
  hasResponsible: boolean;
}>();

const emit = defineEmits<{ assign: [participantId: string | null] }>();

const open = ref(false);
const search = ref('');
const root = ref<HTMLElement | null>(null);
const panelEl = ref<HTMLElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
// Desplazamiento horizontal para que el panel no se salga del viewport (móvil).
const panelShift = ref(0);

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return props.participants;
  return props.participants.filter((p) => {
    const first = (p.firstName || '').toLowerCase();
    const last = (p.lastName || '').toLowerCase();
    const nick = (p.nickname || '').toLowerCase();
    return first.includes(q) || last.includes(q) || nick.includes(q) || `${first} ${last}`.includes(q);
  });
});

function toggle() {
  if (!props.canManage) return;
  open.value = !open.value;
  if (open.value) {
    search.value = '';
    panelShift.value = 0;
    nextTick(() => {
      // preventScroll: sin esto el navegador móvil hace scroll para traer el
      // input a la vista y "se mueve toda la pantalla" al abrir el picker.
      searchInput.value?.focus({ preventScroll: true });
      // Si el panel se sale por la derecha, lo empujamos a la izquierda.
      const r = panelEl.value?.getBoundingClientRect();
      if (r) {
        const overflow = r.right - (window.innerWidth - 8);
        if (overflow > 0) panelShift.value = -overflow;
      }
    });
  }
}

function select(id: string | null) {
  emit('assign', id);
  open.value = false;
}

function onDocMouseDown(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('mousedown', onDocMouseDown);
  else document.removeEventListener('mousedown', onDocMouseDown);
});
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown));
</script>

<template>
  <span ref="root" class="relative inline-flex">
    <!-- Solo lectura -->
    <span v-if="!canManage">
      <span v-if="label">👤 {{ label }}</span>
      <span v-else class="italic text-gray-400">👤 Sin asignar</span>
    </span>

    <!-- Gestionable: chip que abre el picker -->
    <button
      v-else
      type="button"
      class="inline-flex items-center rounded px-1 -mx-1 hover:bg-gray-100"
      :class="label ? '' : 'italic text-gray-400 hover:text-gray-600'"
      @click.stop="toggle"
    >
      👤 {{ label || 'Sin asignar' }}
    </button>

    <div
      v-if="open"
      ref="panelEl"
      class="absolute left-0 top-full z-50 mt-1 w-64 max-w-[calc(100vw-1rem)] rounded-md border bg-white p-1 shadow-lg"
      :style="panelShift ? { transform: `translateX(${panelShift}px)` } : undefined"
      @click.stop
    >
      <input
        ref="searchInput"
        v-model="search"
        type="text"
        placeholder="Buscar servidor…"
        class="mb-1 w-full rounded border border-gray-200 px-2 py-1.5 text-base sm:text-sm outline-none focus:border-purple-400"
        @keydown.esc="open = false"
      />
      <div class="max-h-56 overflow-y-auto">
        <button
          v-if="hasResponsible"
          type="button"
          class="flex w-full items-center rounded px-2 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
          @mousedown.prevent="select(null)"
        >
          ✕ Quitar responsable
        </button>
        <button
          v-for="p in filtered"
          :key="p.id"
          type="button"
          class="flex w-full items-center rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
          @mousedown.prevent="select(p.id)"
        >
          {{ p.firstName }} {{ p.lastName }}
          <span v-if="!isMeaninglessNickname(p.nickname)" class="ml-1 text-gray-400">
            ({{ p.nickname }})
          </span>
        </button>
        <p v-if="filtered.length === 0" class="px-2 py-3 text-center text-xs text-gray-400">
          No hay servidores
        </p>
      </div>
    </div>
  </span>
</template>
