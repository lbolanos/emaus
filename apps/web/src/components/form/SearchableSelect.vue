<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { normalizeText } from '@/utils/participantSearch'

export interface SearchableOption {
  value: string
  label: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: SearchableOption[]
    placeholder?: string
    searchPlaceholder?: string
    disabled?: boolean
    id?: string
    /** Options rendered before the user types. Keeps the DOM small on phones. */
    maxVisible?: number
    hintMore?: string
    emptyText?: string
  }>(),
  {
    placeholder: '',
    searchPlaceholder: 'Buscar...',
    disabled: false,
    id: undefined,
    maxVisible: 60,
    hintMore: 'Escribe para ver más opciones',
    emptyText: 'Sin resultados',
  },
)

const emit = defineEmits<{ 'update:modelValue': [string] }>()

// `class` (and anything else the form passes) belongs on the trigger, not on the
// positioning wrapper: that is what paints the red border on a validation error.
defineOptions({ inheritAttrs: false })

const open = ref(false)
const query = ref('')
const rootEl = ref<HTMLElement | null>(null)
const searchEl = ref<HTMLInputElement | null>(null)

// Accent- and case-insensitive so "mexico" matches "México".
const fold = (value: string) => normalizeText(value).trim()

const selectedLabel = computed(
  () => props.options.find((o) => o.value === props.modelValue)?.label ?? '',
)

const matches = computed(() => {
  const q = fold(query.value)
  if (!q) return props.options
  return props.options.filter((o) => fold(o.label).includes(q) || fold(o.value) === q)
})

const visibleOptions = computed(() => matches.value.slice(0, props.maxVisible))
const hiddenCount = computed(() => matches.value.length - visibleOptions.value.length)

const listId = computed(() => `${props.id ?? 'searchable-select'}-listbox`)

async function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (!open.value) return
  query.value = ''
  await nextTick()
  searchEl.value?.focus()
}

function choose(value: string) {
  emit('update:modelValue', value)
  open.value = false
  query.value = ''
}

// Escape must close only this dropdown: the registration form lives inside a
// reka-ui Dialog that closes on Escape, and letting it through would throw the
// user out of the whole wizard.
function onEscape(event: KeyboardEvent) {
  if (!open.value) return
  event.stopPropagation()
  open.value = false
}

function onPointerDownOutside(event: Event) {
  const target = event.target as Node | null
  if (target && rootEl.value?.contains(target)) return
  open.value = false
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onPointerDownOutside, true)
  } else {
    document.removeEventListener('pointerdown', onPointerDownOutside, true)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDownOutside, true)
})
</script>

<template>
  <div ref="rootEl" class="relative" @keydown.esc="onEscape">
    <button
      v-bind="$attrs"
      :id="props.id"
      type="button"
      role="combobox"
      :aria-expanded="open"
      :aria-controls="listId"
      :disabled="props.disabled"
      class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
      @click="toggle"
    >
      <span :class="selectedLabel ? '' : 'text-muted-foreground'" class="truncate text-left">
        {{ selectedLabel || props.placeholder }}
      </span>
      <svg
        class="ml-2 h-4 w-4 shrink-0 opacity-50"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- In flow on phones so the dialog's own scroll shows it whole; floating from
         `md` up, where there is room for a classic dropdown. A portal would fight
         the Dialog's focus trap, so the list stays inside the form. -->
    <div
      v-if="open"
      class="z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-md md:absolute md:left-0 md:right-0 md:top-full"
    >
      <div class="border-b p-2">
        <input
          ref="searchEl"
          v-model="query"
          type="text"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          :placeholder="props.searchPlaceholder"
          class="h-9 w-full rounded-md border border-input bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
        />
      </div>
      <ul
        :id="listId"
        role="listbox"
        class="max-h-[40vh] overflow-y-auto overscroll-contain py-1"
        style="-webkit-overflow-scrolling: touch"
      >
        <li
          v-for="option in visibleOptions"
          :key="option.value"
          role="option"
          :aria-selected="option.value === props.modelValue"
          class="cursor-pointer px-3 py-2.5 text-base sm:text-sm"
          :class="
            option.value === props.modelValue ? 'bg-accent font-medium' : 'hover:bg-accent/60'
          "
          @mousedown.prevent
          @click="choose(option.value)"
        >
          {{ option.label }}
        </li>
        <li v-if="!visibleOptions.length" class="px-3 py-2.5 text-sm text-muted-foreground">
          {{ props.emptyText }}
        </li>
        <li v-else-if="hiddenCount > 0" class="px-3 py-2 text-xs text-muted-foreground">
          {{ props.hintMore }}
        </li>
      </ul>
    </div>
  </div>
</template>
