<template>
	<div ref="rootEl" class="relative w-full">
		<div class="relative">
			<Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
			<Input
				:model-value="modelValue ?? ''"
				type="text"
				autocomplete="street-address"
				:placeholder="placeholder"
				class="pl-9 pr-3"
				:class="{ 'border-red-500': error }"
				role="combobox"
				:aria-expanded="open"
				aria-autocomplete="list"
				@update:model-value="onInput"
				@keydown="onKeydown"
				@focus="onFocus"
			/>
			<Loader2 v-if="loading" class="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
		</div>

		<ul
			v-if="open && suggestions.length > 0"
			class="absolute z-50 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-md border bg-white shadow-lg py-1"
			role="listbox"
		>
			<li
				v-for="(suggestion, index) in suggestions"
				:key="`${suggestion.address.latitude},${suggestion.address.longitude},${index}`"
				role="option"
				:aria-selected="index === activeIndex"
				class="px-3 py-2 cursor-pointer text-sm"
				:class="index === activeIndex ? 'bg-gray-100' : 'hover:bg-gray-50'"
				@mousedown.prevent="select(suggestion)"
				@mousemove="activeIndex = index"
			>
				<span class="block text-gray-900">{{ suggestion.primary }}</span>
				<span v-if="suggestion.secondary" class="block text-xs text-gray-500">{{ suggestion.secondary }}</span>
			</li>
		</ul>
	</div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { Input } from '@repo/ui';
import { Loader2, Search } from 'lucide-vue-next';
import { searchPhoton, type PhotonSuggestion } from '@/services/photon';

const props = withDefaults(
	defineProps<{
		modelValue?: string | null;
		placeholder?: string;
		error?: boolean;
		/** Sesgo de resultados; por defecto prioriza México (comunidad madre). */
		biasLat?: number;
		biasLon?: number;
		biasZoom?: number;
	}>(),
	{
		modelValue: '',
		placeholder: 'Buscar dirección...',
		error: false,
		biasLat: 19.4326,
		biasLon: -99.1332,
		biasZoom: 9,
	},
);

const emit = defineEmits<{
	(e: 'update:modelValue', value: string): void;
	(e: 'select', address: PhotonSuggestion['address']): void;
}>();

const suggestions = ref<PhotonSuggestion[]>([]);
const open = ref(false);
const activeIndex = ref(-1);
const loading = ref(false);
const rootEl = ref<HTMLElement | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let controller: AbortController | null = null;

const close = () => {
	open.value = false;
	activeIndex.value = -1;
};

const onFocus = () => {
	if (suggestions.value.length > 0) open.value = true;
};

const onInput = (value: string) => {
	emit('update:modelValue', value ?? '');
	if (debounceTimer) clearTimeout(debounceTimer);
	if ((value ?? '').trim().length < 3) {
		close();
		suggestions.value = [];
		return;
	}
	debounceTimer = setTimeout(async () => {
		controller?.abort();
		controller = new AbortController();
		loading.value = true;
		try {
			const results = await searchPhoton(value, {
				signal: controller.signal,
				limit: 6,
				lat: props.biasLat,
				lon: props.biasLon,
				zoom: props.biasZoom,
			});
			suggestions.value = results;
			activeIndex.value = results.length > 0 ? 0 : -1;
			open.value = results.length > 0;
		} catch {
			// Abortada por una búsqueda nueva o fallo de red: dejar la lista como está.
		} finally {
			loading.value = false;
		}
	}, 300);
};

const select = (suggestion: PhotonSuggestion) => {
	emit('update:modelValue', suggestion.primary);
	emit('select', suggestion.address);
	suggestions.value = [];
	close();
};

const onKeydown = (event: KeyboardEvent) => {
	if (!open.value || suggestions.value.length === 0) {
		if (event.key === 'Escape') close();
		return;
	}
	if (event.key === 'ArrowDown') {
		event.preventDefault();
		activeIndex.value = (activeIndex.value + 1) % suggestions.value.length;
	} else if (event.key === 'ArrowUp') {
		event.preventDefault();
		activeIndex.value = activeIndex.value <= 0 ? suggestions.value.length - 1 : activeIndex.value - 1;
	} else if (event.key === 'Enter') {
		event.preventDefault();
		const suggestion = suggestions.value[activeIndex.value >= 0 ? activeIndex.value : 0];
		if (suggestion) select(suggestion);
	} else if (event.key === 'Escape') {
		event.preventDefault();
		close();
	}
};

const onDocClick = (event: MouseEvent) => {
	if (rootEl.value && !rootEl.value.contains(event.target as Node)) close();
};
document.addEventListener('mousedown', onDocClick);

onBeforeUnmount(() => {
	document.removeEventListener('mousedown', onDocClick);
	if (debounceTimer) clearTimeout(debounceTimer);
	controller?.abort();
});
</script>
