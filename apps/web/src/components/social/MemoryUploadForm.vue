<template>
	<div class="space-y-6">
		<!-- ===================== PHOTOS ===================== -->
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<label class="text-sm font-medium">Fotos del Recuerdo</label>
				<span class="text-xs text-muted-foreground">{{ photos.length }}/{{ MAX_PHOTOS }}</span>
			</div>

			<div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
				<!-- Existing photos -->
				<div
					v-for="photo in sortedPhotos"
					:key="photo.id"
					class="relative aspect-square rounded-lg overflow-hidden border group"
					:class="{ 'ring-2 ring-primary': photo.isPrimary }"
				>
					<img :src="photo.url" alt="Foto del recuerdo" class="w-full h-full object-cover" />

					<!-- Primary badge -->
					<span
						v-if="photo.isPrimary"
						class="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-medium"
					>
						Principal
					</span>

					<!-- Actions overlay -->
					<div
						class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
					>
						<button
							v-if="!photo.isPrimary"
							type="button"
							class="p-1.5 rounded-full bg-background/90 hover:bg-background"
							title="Marcar como principal"
							@click="makePrimaryPhoto(photo.id)"
						>
							<Star class="w-4 h-4" />
						</button>
						<button
							type="button"
							class="p-1.5 rounded-full bg-background/90 hover:bg-background text-destructive"
							title="Eliminar foto"
							@click="removePhoto(photo.id)"
						>
							<Trash2 class="w-4 h-4" />
						</button>
					</div>
				</div>

				<!-- Add tile -->
				<button
					v-if="photos.length < MAX_PHOTOS"
					type="button"
					:disabled="uploading"
					class="aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-secondary/50 hover:border-primary transition-colors disabled:opacity-50"
					@click="triggerFileInput"
				>
					<Loader2 v-if="uploading" class="w-6 h-6 animate-spin" />
					<Plus v-else class="w-6 h-6" />
					<span class="text-[10px]">{{ uploading ? 'Subiendo...' : 'Agregar' }}</span>
				</button>
			</div>
			<p class="text-xs text-muted-foreground">JPG, PNG o WebP. Las fotos grandes se reducen solas. La principal se muestra primero en "Mis Retiros".</p>
			<p v-if="tablePhotos.length" class="text-xs text-muted-foreground">
				Las fotos de las mesas ({{ tablePhotos.length }}) se gestionan desde la vista de Mesas.
			</p>
		</div>

		<!-- ===================== SONGS ===================== -->
		<div class="space-y-2">
			<label class="text-sm font-medium">Música del Recuerdo</label>

			<div v-for="song in manualSongs" :key="song.id" class="flex items-center gap-2">
				<button
					type="button"
					class="p-1.5 rounded-md border flex-shrink-0"
					:class="song.isPrimary ? 'text-primary border-primary' : 'text-muted-foreground hover:bg-secondary'"
					:title="song.isPrimary ? 'Canción principal' : 'Marcar como principal'"
					@click="makePrimarySong(song.id)"
				>
					<Star class="w-4 h-4" :class="{ 'fill-primary': song.isPrimary }" />
				</button>
				<input
					v-model="song.title"
					type="text"
					placeholder="Título (opcional)"
					class="w-32 px-2 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
					@change="saveSong(song)"
				/>
				<input
					v-model="song.url"
					type="url"
					placeholder="https://open.spotify.com/..."
					class="flex-1 min-w-0 px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
					@change="saveSong(song)"
				/>
				<button
					type="button"
					class="p-2 rounded-md border hover:bg-secondary text-destructive flex-shrink-0"
					title="Eliminar canción"
					@click="removeSong(song.id)"
				>
					<Trash2 class="w-4 h-4" />
				</button>
			</div>

			<!-- Add new song -->
			<div v-if="manualSongs.length < MAX_SONGS" class="flex items-center gap-2 pt-1">
				<Music class="w-4 h-4 text-muted-foreground flex-shrink-0 ml-1" />
				<input
					v-model="newSongTitle"
					type="text"
					placeholder="Título (opcional)"
					class="w-32 px-2 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
				/>
				<input
					v-model="newSongUrl"
					type="url"
					placeholder="Añade un enlace a Spotify, YouTube..."
					class="flex-1 min-w-0 px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
					@keyup.enter="addSong"
				/>
				<button
					type="button"
					:disabled="!newSongUrl"
					class="p-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex-shrink-0"
					title="Agregar canción"
					@click="addSong"
				>
					<Plus class="w-4 h-4" />
				</button>
			</div>
		</div>

		<!-- ============ MÚSICA DEL MINUTO A MINUTO ============ -->
		<div class="space-y-2 border-t pt-4">
			<label class="text-sm font-medium">Música del minuto a minuto</label>
			<p class="text-xs text-muted-foreground">
				Trae la música asignada a las charlas y actividades del minuto a minuto. Disponible
				cuando el retiro haya terminado.
			</p>

			<button
				type="button"
				:disabled="!isPast || importing"
				class="inline-flex items-center gap-2 py-2 px-3 rounded-md border bg-background hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
				:title="isPast ? '' : 'Disponible cuando el retiro termine'"
				@click="importFromMam"
			>
				<Loader2 v-if="importing" class="w-4 h-4 animate-spin" />
				<Download v-else class="w-4 h-4" />
				{{ importing ? 'Importando...' : 'Importar música del minuto a minuto' }}
			</button>

			<!-- Imported MAM songs (read-only list, deletable) -->
			<div v-if="mamSongs.length" class="space-y-1.5 pt-1">
				<div
					v-for="song in mamSongs"
					:key="song.id"
					class="flex items-center gap-2 text-sm"
				>
					<Music class="w-4 h-4 text-muted-foreground flex-shrink-0 ml-1" />
					<a
						:href="song.url"
						target="_blank"
						rel="noopener noreferrer"
						class="flex-1 min-w-0 truncate hover:underline"
					>{{ song.title || song.url }}</a>
					<button
						type="button"
						class="p-2 rounded-md border hover:bg-secondary text-destructive flex-shrink-0"
						title="Eliminar canción del MAM"
						@click="removeSong(song.id)"
					>
						<Trash2 class="w-4 h-4" />
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { pickFiles } from '@/utils/filePicker';
import { MAX_PHOTO_SOURCE_BYTES, PHOTO_MAX_SIDE, resizeImageToDataUrl } from '@/utils/imageResize';
import { Star, Trash2, Plus, Loader2, Music, Download } from 'lucide-vue-next';
import { useToast } from '@repo/ui';
import type { RetreatMemoryPhoto, RetreatMemorySong } from '@repo/types';
import {
	getRetreatMemories,
	addRetreatMemoryPhoto,
	deleteRetreatMemoryPhoto,
	setPrimaryRetreatMemoryPhoto,
	addRetreatMemorySong,
	updateRetreatMemorySong,
	deleteRetreatMemorySong,
	setPrimaryRetreatMemorySong,
	importRetreatMemorySongsFromMam,
} from '@/services/api';
import { apiErrorMessage } from '@/services/apiError';

const MAX_PHOTOS = 30;
const MAX_SONGS = 30;

interface Props {
	retreatId: string;
	currentPhotoUrl?: string;
	currentMusicUrl?: string;
	retreatEndDate?: string | Date | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	(e: 'saved', data: { memoryPhotoUrl?: string; musicPlaylistUrl?: string }): void;
}>();

const { toast } = useToast();

const photos = ref<RetreatMemoryPhoto[]>([]);
// Table group photos (source 'table') ride along in the same list; they are
// uploaded and edited from the Tables view, not from this grid.
const tablePhotos = ref<RetreatMemoryPhoto[]>([]);
const songs = ref<RetreatMemorySong[]>([]);
const uploading = ref(false);
const importing = ref(false);
const newSongUrl = ref('');
const newSongTitle = ref('');

const byPrimaryThenOrder = <T extends { isPrimary: boolean; sortOrder: number }>(a: T, b: T) => {
	if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
	return a.sortOrder - b.sortOrder;
};

const sortedPhotos = computed(() => [...photos.value].sort(byPrimaryThenOrder));
// Manual songs are editable; MAM-imported songs are managed via the import button.
const manualSongs = computed(() =>
	songs.value.filter((s) => s.source !== 'mam').sort(byPrimaryThenOrder),
);
const mamSongs = computed(() =>
	songs.value.filter((s) => s.source === 'mam').sort((a, b) => a.sortOrder - b.sortOrder),
);

// The retreat is "past" once its end date (YYYY-MM-DD) is before today. The
// backend is authoritative; this only gates the button for UX.
const isPast = computed(() => {
	const end = props.retreatEndDate;
	if (!end) return false;
	const endYmd = end instanceof Date ? end.toLocaleDateString('en-CA') : String(end).slice(0, 10);
	const todayYmd = new Date().toLocaleDateString('en-CA');
	return endYmd < todayYmd;
});

const emitDerived = () => {
	emit('saved', {
		memoryPhotoUrl: photos.value.find((p) => p.isPrimary)?.url,
		musicPlaylistUrl: songs.value.find((s) => s.isPrimary)?.url,
	});
};

const applyMemories = (memories: { photos: RetreatMemoryPhoto[]; songs: RetreatMemorySong[] }) => {
	photos.value = memories.photos.filter((p) => p.source !== 'table');
	tablePhotos.value = memories.photos.filter((p) => p.source === 'table');
	songs.value = memories.songs;
};

const load = async () => {
	try {
		applyMemories(await getRetreatMemories(props.retreatId));
	} catch (error) {
		toast({ title: 'Error al cargar recuerdos', description: apiErrorMessage(error), variant: 'destructive' });
	}
};

onMounted(load);

const triggerFileInput = async () => {
	// El input se crea al vuelo: sobrevive al hot-reload y a Safari.
	await handleFiles(await pickFiles({ accept: 'image/jpeg,image/png,image/webp', multiple: true }));
};

const validateFile = (file: File): boolean => {
	if (file.size > MAX_PHOTO_SOURCE_BYTES) {
		toast({ title: 'Archivo muy grande', description: `${file.name} supera los 30MB`, variant: 'destructive' });
		return false;
	}
	if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
		toast({ title: 'Formato no válido', description: `${file.name}: solo JPG, PNG y WebP`, variant: 'destructive' });
		return false;
	}
	return true;
};

const handleFiles = async (files: File[]) => {
	if (!files.length) return;

	const valid = files.filter(validateFile);
	// Only as many as there are free slots; the server would reject the rest one by one.
	const toUpload = valid.slice(0, Math.max(0, MAX_PHOTOS - photos.value.length));
	const failed: string[] = [];
	let firstError: unknown;
	uploading.value = true;
	try {
		// One at a time: decoding several large photos at once can exhaust a phone's memory.
		for (const file of toUpload) {
			try {
				const photoData = await resizeImageToDataUrl(file, { maxSide: PHOTO_MAX_SIDE });
				await addRetreatMemoryPhoto(props.retreatId, photoData);
			} catch (error) {
				// Keep going: the photos already uploaded must not look lost.
				failed.push(file.name);
				firstError ??= error;
			}
		}
	} finally {
		await load();
		emitDerived();
		uploading.value = false;
	}

	// One toast per batch: an error that hits every photo (an expired session)
	// would otherwise fire one per file.
	if (failed.length) {
		toast({
			title:
				failed.length === 1 ? `No se pudo subir ${failed[0]}` : `No se pudieron subir ${failed.length} fotos`,
			description:
				failed.length === 1
					? apiErrorMessage(firstError)
					: `${failed.join(', ')}. ${apiErrorMessage(firstError)}`,
			variant: 'destructive',
		});
	}
	const skipped = valid.length - toUpload.length;
	if (skipped > 0) {
		toast({
			title: `Máximo ${MAX_PHOTOS} fotos por retiro`,
			description: `No se subieron ${skipped} foto(s) por falta de espacio.`,
			variant: 'destructive',
		});
	}
};

const removePhoto = async (photoId: string) => {
	try {
		await deleteRetreatMemoryPhoto(props.retreatId, photoId);
		await load();
		emitDerived();
	} catch (error) {
		toast({ title: 'Error al eliminar', description: apiErrorMessage(error), variant: 'destructive' });
	}
};

const makePrimaryPhoto = async (photoId: string) => {
	try {
		const memories = await setPrimaryRetreatMemoryPhoto(props.retreatId, photoId);
		applyMemories(memories);
		emitDerived();
	} catch (error) {
		toast({ title: 'Error', description: apiErrorMessage(error), variant: 'destructive' });
	}
};

const addSong = async () => {
	if (!newSongUrl.value) return;
	try {
		await addRetreatMemorySong(props.retreatId, {
			url: newSongUrl.value,
			title: newSongTitle.value || undefined,
		});
		newSongUrl.value = '';
		newSongTitle.value = '';
		await load();
		emitDerived();
	} catch (error) {
		toast({ title: 'Error al agregar canción', description: apiErrorMessage(error), variant: 'destructive' });
	}
};

const saveSong = async (song: RetreatMemorySong) => {
	if (!song.url) return;
	try {
		await updateRetreatMemorySong(props.retreatId, song.id, {
			url: song.url,
			title: song.title || undefined,
		});
		emitDerived();
	} catch (error) {
		toast({ title: 'Error al guardar canción', description: apiErrorMessage(error), variant: 'destructive' });
	}
};

const removeSong = async (songId: string) => {
	try {
		await deleteRetreatMemorySong(props.retreatId, songId);
		await load();
		emitDerived();
	} catch (error) {
		toast({ title: 'Error al eliminar', description: apiErrorMessage(error), variant: 'destructive' });
	}
};

const makePrimarySong = async (songId: string) => {
	try {
		const memories = await setPrimaryRetreatMemorySong(props.retreatId, songId);
		applyMemories(memories);
		emitDerived();
	} catch (error) {
		toast({ title: 'Error', description: apiErrorMessage(error), variant: 'destructive' });
	}
};

const importFromMam = async () => {
	importing.value = true;
	try {
		const result = await importRetreatMemorySongsFromMam(props.retreatId);
		songs.value = result.songs;
		toast({
			title: 'Música importada',
			description:
				result.imported > 0
					? `Se importaron ${result.imported} canción(es) del minuto a minuto` +
						(result.skipped > 0 ? ` (${result.skipped} ya existían)` : '')
					: 'No hay canciones nuevas en el minuto a minuto',
		});
	} catch (error) {
		toast({ title: 'Error al importar', description: apiErrorMessage(error), variant: 'destructive' });
	} finally {
		importing.value = false;
	}
};
</script>
