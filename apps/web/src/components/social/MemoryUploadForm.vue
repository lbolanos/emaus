<template>
	<div class="space-y-4">
		<!-- Photo Upload -->
		<div class="space-y-2">
			<label class="text-sm font-medium">Foto del Recuerdo</label>
			<div
				v-if="!previewUrl"
				@click="triggerFileInput"
				class="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-secondary/50 transition-colors"
				:class="{ 'border-muted-foreground/50': !dragActive, 'border-primary': dragActive }"
				@dragover.prevent="dragActive = true"
				@dragleave.prevent="dragActive = false"
				@drop.prevent="handleDrop"
			>
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
					class="mx-auto mb-2 text-muted-foreground"
				>
					<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
					<circle cx="8.5" cy="8.5" r="1.5"></circle>
					<polyline points="21 15 16 10 5 21"></polyline>
				</svg>
				<p class="text-sm text-muted-foreground mb-1">
					Haz clic o arrastra una foto aquí
				</p>
				<p class="text-xs text-muted-foreground">JPG, PNG (máx. 5MB)</p>
				<input
					ref="fileInput"
					type="file"
					accept="image/jpeg,image/png,image/webp"
					class="hidden"
					@change="handleFileSelect"
				/>
			</div>

			<!-- Preview -->
			<div v-else class="relative">
				<img
					:src="previewUrl"
					alt="Vista previa"
					class="w-full h-48 object-cover rounded-lg"
				/>
				<button
					@click="removePhoto"
					class="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 hover:bg-background shadow-sm"
					title="Eliminar foto"
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
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</div>
		</div>

		<!-- Music Playlist URL -->
		<div class="space-y-2">
			<label class="text-sm font-medium">Playlist de Música (opcional)</label>
			<div class="flex gap-2">
				<input
					v-model="musicUrl"
					type="url"
					placeholder="https://open.spotify.com/playlist/..."
					class="flex-1 px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
				/>
				<button
					v-if="musicUrl"
					@click="musicUrl = ''"
					class="p-2 rounded-md border hover:bg-secondary"
					title="Limpiar"
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
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</div>
			<p class="text-xs text-muted-foreground">
				Añade un enlace a Spotify, YouTube Music, u otra plataforma
			</p>
		</div>

		<!-- Save button -->
		<button
			@click="handleSave"
			:disabled="loading || (!hasChanges && !currentPhotoUrl)"
			class="w-full py-2 px-4 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
		>
			{{ loading ? 'Guardando...' : 'Guardar Recuerdos' }}
		</button>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { uploadRetreatMemoryPhoto, updateRetreatMemory } from '@/services/api';
import { useToast } from '@repo/ui';

interface Props {
	retreatId: string;
	currentPhotoUrl?: string;
	currentMusicUrl?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	(e: 'saved', data: { memoryPhotoUrl?: string; musicPlaylistUrl?: string }): void;
	(e: 'cancel'): void;
}>();

const { toast } = useToast();

const fileInput = ref<HTMLInputElement | null>(null);
const dragActive = ref(false);
const previewUrl = ref('');
const photoData = ref('');
const musicUrl = ref(props.currentMusicUrl || '');
const loading = ref(false);

const hasChanges = computed(() => {
	return photoData.value !== '' || musicUrl.value !== (props.currentMusicUrl || '');
});

// Initialize preview with current photo
watch(() => props.currentPhotoUrl, (newUrl) => {
	if (newUrl && !photoData.value) {
		previewUrl.value = newUrl;
	}
}, { immediate: true });

const triggerFileInput = () => {
	fileInput.value?.click();
};

const handleFileSelect = (e: Event) => {
	const target = e.target as HTMLInputElement;
	const file = target.files?.[0];
	if (file) {
		processFile(file);
	}
};

const handleDrop = (e: DragEvent) => {
	dragActive.value = false;
	const file = e.dataTransfer?.files[0];
	if (file && file.type.startsWith('image/')) {
		processFile(file);
	}
};

const processFile = (file: File) => {
	// Validate size (5MB max)
	if (file.size > 5 * 1024 * 1024) {
		toast({
			title: 'Archivo muy grande',
			description: 'La imagen no puede superar los 5MB',
			variant: 'destructive',
		});
		return;
	}

	// Validate type
	if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
		toast({
			title: 'Formato no válido',
			description: 'Solo se permiten JPG, PNG y WebP',
			variant: 'destructive',
		});
		return;
	}

	const reader = new FileReader();
	reader.onload = (e) => {
		photoData.value = e.target?.result as string;
		previewUrl.value = photoData.value;
	};
	reader.readAsDataURL(file);
};

const removePhoto = () => {
	previewUrl.value = '';
	photoData.value = '';
	if (fileInput.value) {
		fileInput.value.value = '';
	}
};

const handleSave = async () => {
	loading.value = true;

	try {
		let savedPhotoUrl = props.currentPhotoUrl;
		let savedMusicUrl = props.currentMusicUrl;

		// Upload photo if changed
		if (photoData.value && photoData.value !== props.currentPhotoUrl) {
			const result = await uploadRetreatMemoryPhoto(props.retreatId, photoData.value);
			savedPhotoUrl = result.memoryPhotoUrl;
		}

		// Update music URL if changed
		if (musicUrl.value !== props.currentMusicUrl) {
			const result = await updateRetreatMemory(props.retreatId, {
				musicPlaylistUrl: musicUrl.value || undefined,
			});
			savedMusicUrl = result.musicPlaylistUrl;
		}

		toast({
			title: 'Recuerdos guardados',
			description: 'Los recuerdos del retiro se han guardado correctamente',
		});

		emit('saved', {
			memoryPhotoUrl: savedPhotoUrl,
			musicPlaylistUrl: savedMusicUrl,
		});
	} catch (error: any) {
		// Don't show error for 404 - retreat doesn't exist
		if (error.response?.status !== 404) {
			toast({
				title: 'Error al guardar',
				description: error.message || 'No se pudieron guardar los recuerdos',
				variant: 'destructive',
			});
		}
		emit('cancel');
	} finally {
		loading.value = false;
	}
};
</script>
