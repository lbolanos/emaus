<template>
	<div v-if="slides.length" class="relative group/carousel">
		<img
			:src="slides[currentIndex]"
			:alt="`Foto del recuerdo ${currentIndex + 1}`"
			:class="['w-full object-cover cursor-zoom-in', heightClass]"
			@click="openLightbox"
		/>

		<!-- Controls (only when more than one photo) -->
		<template v-if="slides.length > 1">
			<button
				type="button"
				class="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-background/70 hover:bg-background shadow-sm transition-opacity"
				:aria-label="'Foto anterior'"
				@click.stop="prev"
			>
				<ChevronLeft class="w-5 h-5" />
			</button>
			<button
				type="button"
				class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-background/70 hover:bg-background shadow-sm transition-opacity"
				:aria-label="'Foto siguiente'"
				@click.stop="next"
			>
				<ChevronRight class="w-5 h-5" />
			</button>

			<!-- Counter -->
			<span
				class="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-background/70 text-xs font-medium"
			>
				{{ currentIndex + 1 }}/{{ slides.length }}
			</span>

			<!-- Dots -->
			<div class="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
				<button
					v-for="(_, i) in slides"
					:key="i"
					type="button"
					class="w-2 h-2 rounded-full transition-colors"
					:class="i === currentIndex ? 'bg-primary' : 'bg-background/60 hover:bg-background'"
					:aria-label="`Ir a la foto ${i + 1}`"
					@click.stop="currentIndex = i"
				/>
			</div>
		</template>

		<!-- Lightbox (maximized view) -->
		<Teleport to="body">
			<div
				v-if="lightboxOpen"
				class="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
				role="dialog"
				aria-modal="true"
				aria-label="Foto del recuerdo ampliada"
				@click.self="closeLightbox"
			>
				<img
					:src="slides[currentIndex]"
					:alt="`Foto del recuerdo ${currentIndex + 1}`"
					class="max-h-[90vh] max-w-[92vw] object-contain rounded"
				/>

				<!-- Close -->
				<button
					type="button"
					class="absolute top-3 right-3 p-2 rounded-full bg-white/15 hover:bg-white/30 text-white"
					aria-label="Cerrar"
					@click="closeLightbox"
				>
					<X class="w-5 h-5" />
				</button>

				<template v-if="slides.length > 1">
					<button
						type="button"
						class="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/15 hover:bg-white/30 text-white"
						aria-label="Foto anterior"
						@click.stop="prev"
					>
						<ChevronLeft class="w-6 h-6" />
					</button>
					<button
						type="button"
						class="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/15 hover:bg-white/30 text-white"
						aria-label="Foto siguiente"
						@click.stop="next"
					>
						<ChevronRight class="w-6 h-6" />
					</button>
					<span
						class="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/15 text-white text-sm font-medium"
					>
						{{ currentIndex + 1 }}/{{ slides.length }}
					</span>
				</template>
			</div>
		</Teleport>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { ChevronLeft, ChevronRight, X } from 'lucide-vue-next';
import type { RetreatMemoryPhoto } from '@repo/types';

interface Props {
	photos?: RetreatMemoryPhoto[];
	// Legacy single photo URL, used when no gallery photos exist (old retreats).
	fallbackUrl?: string | null;
	heightClass?: string;
}

const props = withDefaults(defineProps<Props>(), {
	photos: () => [],
	fallbackUrl: null,
	heightClass: 'h-48',
});

const currentIndex = ref(0);
const lightboxOpen = ref(false);

// Primary photo first, then by sortOrder. Falls back to the legacy single URL.
const slides = computed<string[]>(() => {
	if (props.photos && props.photos.length) {
		return [...props.photos]
			.sort((a, b) => {
				if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
				return a.sortOrder - b.sortOrder;
			})
			.map((p) => p.url);
	}
	return props.fallbackUrl ? [props.fallbackUrl] : [];
});

// Keep the index in range when the underlying photos change.
watch(slides, (s) => {
	if (currentIndex.value >= s.length) currentIndex.value = 0;
});

const next = () => {
	currentIndex.value = (currentIndex.value + 1) % slides.value.length;
};
const prev = () => {
	currentIndex.value = (currentIndex.value - 1 + slides.value.length) % slides.value.length;
};

const onKeydown = (e: KeyboardEvent) => {
	if (e.key === 'Escape') closeLightbox();
	else if (e.key === 'ArrowRight') next();
	else if (e.key === 'ArrowLeft') prev();
};

const openLightbox = () => {
	lightboxOpen.value = true;
	window.addEventListener('keydown', onKeydown);
};
const closeLightbox = () => {
	lightboxOpen.value = false;
	window.removeEventListener('keydown', onKeydown);
};

onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>
