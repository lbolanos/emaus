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

		<!-- Memory Photos (carousel) -->
		<div v-if="hasPhotos" class="mb-3 -mx-4 overflow-hidden">
			<MemoryPhotoCarousel :photos="retreat.memoryPhotos" :fallback-url="retreat.memoryPhotoUrl" />
		</div>

		<!-- Manual Memory Songs -->
		<div v-if="manualSongs.length" class="mb-3 space-y-2">
			<a
				v-for="song in manualSongs"
				:key="song.id"
				:href="song.url"
				target="_blank"
				rel="noopener noreferrer"
				class="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary hover:bg-secondary/80 transition-colors text-sm"
				:class="{ 'ring-1 ring-primary/40': song.isPrimary }"
			>
				<Music class="w-4 h-4 flex-shrink-0" />
				<span class="flex-1 min-w-0 truncate">{{ song.title || 'Escuchar música del retiro' }}</span>
				<Star v-if="song.isPrimary" class="w-3.5 h-3.5 flex-shrink-0 fill-primary text-primary" />
				<ExternalLink class="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
			</a>
		</div>

		<!-- MAM Songs (música usada en las charlas y actividades) -->
		<div v-if="mamSongs.length" class="mb-3">
			<p class="text-xs font-medium text-muted-foreground mb-1.5">Música del minuto a minuto</p>
			<div class="space-y-1.5">
				<a
					v-for="song in mamSongs"
					:key="song.id"
					:href="song.url"
					target="_blank"
					rel="noopener noreferrer"
					class="flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary/60 hover:bg-secondary transition-colors text-sm"
				>
					<Music class="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
					<span class="flex-1 min-w-0 truncate">{{ song.title || song.url }}</span>
					<ExternalLink class="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
				</a>
			</div>
		</div>

		<!-- Empty state -->
		<div v-if="!hasPhotos && !manualSongs.length && !mamSongs.length" class="text-center py-6 text-muted-foreground">
			<ImageIcon class="mx-auto mb-2 opacity-50 w-12 h-12" />
			<p class="text-sm">No hay recuerdos añadidos aún</p>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Retreat, RetreatMemorySong } from '@repo/types';
import { Music, Star, ExternalLink, Image as ImageIcon } from 'lucide-vue-next';
import MemoryPhotoCarousel from './MemoryPhotoCarousel.vue';

interface Props {
	retreat: Retreat;
}

const props = defineProps<Props>();

const hasPhotos = computed(
	() => (props.retreat.memoryPhotos?.length ?? 0) > 0 || !!props.retreat.memoryPhotoUrl,
);

type SongView = Pick<RetreatMemorySong, 'id' | 'url' | 'title' | 'isPrimary'>;

// Manual songs (added by hand): primary first; fall back to the legacy single
// playlist URL for old retreats with no gallery rows.
const manualSongs = computed<SongView[]>(() => {
	const manual = (props.retreat.memorySongs ?? []).filter((s) => s.source !== 'mam');
	if (manual.length) {
		return [...manual].sort((a, b) => {
			if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
			return a.sortOrder - b.sortOrder;
		});
	}
	if (props.retreat.musicPlaylistUrl) {
		return [{ id: 'legacy', url: props.retreat.musicPlaylistUrl, title: null, isPrimary: true }];
	}
	return [];
});

// MAM songs (música de las charlas/actividades importada del minuto a minuto).
const mamSongs = computed<SongView[]>(() =>
	[...(props.retreat.memorySongs ?? [])]
		.filter((s) => s.source === 'mam')
		.sort((a, b) => a.sortOrder - b.sortOrder),
);

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
