<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { ChevronsUpDown, Check } from 'lucide-vue-next';

interface ParticipantLike {
  id: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
}

const props = withDefaults(
  defineProps<{
    participants: ParticipantLike[];
    placeholder?: string;
    searchPlaceholder?: string;
    emptyText?: string;
  }>(),
  {
    placeholder: 'Buscar participante...',
    searchPlaceholder: 'Nombre, apellido o apodo...',
    emptyText: 'No se encontraron participantes',
  },
);

// participantId seleccionado (v-model).
const model = defineModel<string>({ default: '' });

const open = ref(false);
const search = ref('');
const searchInput = ref<HTMLInputElement | null>(null);

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

const selectedLabel = computed(() => {
  const p = props.participants.find((x) => x.id === model.value);
  if (!p) return '';
  const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
  return p.nickname ? `${name} (${p.nickname})` : name;
});

const openDropdown = () => {
  search.value = '';
  open.value = true;
  nextTick(() => searchInput.value?.focus());
};

const select = (id: string) => {
  model.value = id;
  open.value = false;
  search.value = '';
};
</script>

<template>
  <div class="relative">
    <button
      v-show="!open"
      type="button"
      :aria-expanded="open"
      class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      @click="openDropdown"
    >
      <span :class="{ 'text-gray-400': !model }" class="truncate">
        {{ selectedLabel || placeholder }}
      </span>
      <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </button>

    <input
      v-show="open"
      ref="searchInput"
      v-model="search"
      type="text"
      :placeholder="searchPlaceholder"
      class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-gray-400 focus:ring-2 focus:ring-ring focus:ring-offset-2"
      @blur="open = false"
      @keydown.esc="open = false"
    />

    <div
      v-if="open"
      class="absolute z-50 mt-1 max-h-[240px] w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
    >
      <button
        v-for="participant in filtered"
        :key="participant.id"
        type="button"
        class="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
        @mousedown.prevent="select(participant.id)"
      >
        <Check class="mr-2 h-4 w-4 shrink-0" :class="model === participant.id ? 'opacity-100' : 'opacity-0'" />
        <span class="truncate">
          {{ participant.firstName }} {{ participant.lastName }}
          <span v-if="participant.nickname" class="text-gray-500">({{ participant.nickname }})</span>
        </span>
      </button>
      <div v-if="filtered.length === 0" class="px-2 py-4 text-center text-sm text-gray-500">
        {{ emptyText }}
      </div>
    </div>
  </div>
</template>
