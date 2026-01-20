<template>
	<div class="p-4 rounded-lg border bg-card overflow-hidden">
		<!-- Header: Retreat info -->
		<div class="flex items-start justify-between gap-3 mb-3">
			<div class="min-w-0 flex-1">
				<h4 class="font-semibold text-base">{{ retreat.parish }}</h4>
				<p class="text-sm text-muted-foreground">{{ formatDateRange(retreat.startDate, retreat.endDate) }}</p>
			</div>
			<!-- Retreat type badge -->
			<span v-if="retreat.retreat_type" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary flex-shrink-0">
				{{ retreatTypeLabel }}
			</span>
		</div>

		<!-- Memory Photo -->
		<div v-if="retreat.memoryPhotoUrl" class="mb-3 -mx-4 -mt-4">
			<img
				:src="retreat.memoryPhotoUrl"
				alt="Foto del recuerdo"
				class="w-full h-48 object-cover"
			/>
		</div>

		<!-- Music Playlist -->
		<div v-if="retreat.musicPlaylistUrl" class="mb-3">
			<a
				:href="retreat.musicPlaylistUrl"
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-secondary hover:bg-secondary/80 transition-colors text-sm"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M9 18V5l12-2v13"></path>
					<circle cx="6" cy="18" r="3"></circle>
					<circle cx="18" cy="16" r="3"></circle>
				</svg>
				<span>Escuchar música del retiro</span>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
					<polyline points="15 3 21 3 21 9"></polyline>
					<line x1="10" y1="14" x2="21" y2="3"></line>
				</svg>
			</a>
		</div>

		<!-- Empty state -->
		<div v-if="!retreat.memoryPhotoUrl && !retreat.musicPlaylistUrl" class="text-center py-6 text-muted-foreground">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="48"
				height="48"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="mx-auto mb-2 opacity-50"
			>
				<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
				<circle cx="8.5" cy="8.5" r="1.5"></circle>
				<polyline points="21 15 16 10 5 21"></polyline>
			</svg>
			<p class="text-sm">No hay recuerdos añadidos aún</p>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Retreat } from '@repo/types';

interface Props {
	retreat: Retreat;
}

const props = defineProps<Props>();

const retreatTypeLabel = computed(() => {
	const labels: Record<string, string> = {
		men: 'Hombres',
		women: 'Mujeres',
		couples: 'Parejas',
		effeta: 'Effeta',
	};
	return labels[props.retreat.retreat_type || ''] || '';
});

const formatDateRange = (startDate: Date | string, endDate: Date | string) => {
	const start = new Date(startDate);
	const end = new Date(endDate);

	const options: Intl.DateTimeFormatOptions = {
		month: 'short',
		day: 'numeric',
	};

	if (start.getFullYear() !== end.getFullYear()) {
		options.year = 'numeric';
	}

	const startStr = start.toLocaleDateString('es-ES', options);
	const endStr = end.toLocaleDateString('es-ES', { ...options, year: 'numeric' });

	return `${startStr} - ${endStr}`;
};
</script>
