<template>
	<div class="p-4 rounded-lg border bg-card">
		<h3 class="text-lg font-semibold mb-4">{{ title }}</h3>

		<form @submit.prevent="handleSubmit" class="space-y-4">
			<!-- Content -->
			<div class="space-y-2">
				<label for="content" class="text-sm font-medium">
					Tu testimonio <span class="text-muted-foreground">*</span>
				</label>
				<textarea
					id="content"
					v-model="formData.content"
					rows="5"
					placeholder="Comparte tu experiencia del retiro..."
					class="w-full px-3 py-2 rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
					:disabled="loading"
				></textarea>
				<div class="flex justify-between text-xs text-muted-foreground">
					<span>{{ contentError || 'Mínimo 10 caracteres' }}</span>
					<span>{{ formData.content.length }} / 2000</span>
				</div>
			</div>

			<!-- Retreat (optional) -->
			<div class="space-y-2">
				<label for="retreat" class="text-sm font-medium">
					Retiro (opcional)
				</label>
				<select
					id="retreat"
					v-model="formData.retreatId"
					class="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
					:disabled="loading"
				>
					<option :value="null">Sin retiro específico</option>
					<option v-for="retreat in retreats" :key="retreat.id" :value="retreat.id">
						{{ retreat.parish }} - {{ formatDateRange(retreat.startDate, retreat.endDate) }}
					</option>
				</select>
			</div>

			<!-- Visibility -->
			<div class="space-y-2">
				<label for="visibility" class="text-sm font-medium">
					Visibilidad
				</label>
				<select
					id="visibility"
					v-model="formData.visibility"
					class="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
					:disabled="loading"
				>
					<option value="private">Privado - Solo yo</option>
					<option value="retreat_participants">Participantes del retiro</option>
					<option value="friends">Amigos</option>
					<option value="public">Público - Todos</option>
				</select>
				<p class="text-xs text-muted-foreground">
					{{ visibilityDescription }}
				</p>
			</div>

			<!-- Allow landing page -->
			<div class="flex items-start gap-2">
				<input
					id="allowLandingPage"
					v-model="formData.allowLandingPage"
					type="checkbox"
					class="mt-1 w-4 h-4 rounded border-input bg-background focus:ring-2 focus:ring-ring"
					:disabled="loading"
				/>
				<div class="space-y-1">
					<label for="allowLandingPage" class="text-sm font-medium cursor-pointer">
						Permitir publicación en landing page
					</label>
					<p class="text-xs text-muted-foreground">
						Si marcas esta opción, tu testimonio podría ser publicado en la página pública del sitio
						(requiere aprobación del administrador)
					</p>
				</div>
			</div>

			<!-- Actions -->
			<div class="flex gap-2 pt-2">
				<button
					type="submit"
					:disabled="!isFormValid || loading"
					class="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
				>
					{{ loading ? 'Guardando...' : submitButtonText }}
				</button>
				<button
					v-if="onCancelCallback"
					type="button"
					@click="onCancelCallback"
					:disabled="loading"
					class="px-4 py-2 border border-input rounded-md font-medium hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
				>
					Cancelar
				</button>
			</div>
		</form>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { TestimonialVisibility } from '@/stores/testimonialStore';
import { useTestimonialStore } from '@/stores/testimonialStore';
import api from '@/services/api';

interface Retreat {
	id: string;
	parish: string;
	startDate: string;
	endDate: string;
}

interface Props {
	editTestimonial?: {
		id: number;
		content: string;
		retreatId?: string | null;
		visibility: TestimonialVisibility;
		allowLandingPage: boolean;
	} | null;
	onCancelCallback?: () => void;
}

const props = withDefaults(defineProps<Props>(), {
	editTestimonial: null,
});

const emit = defineEmits<{
	(e: 'submit', data: {
		content: string;
		retreatId: string | null;
		visibility: TestimonialVisibility;
		allowLandingPage: boolean;
	}): void;
}>();

const testimonialStore = useTestimonialStore();

// State
const loading = ref(false);
const retreats = ref<Retreat[]>([]);

const formData = ref({
	content: '',
	retreatId: null as string | null,
	visibility: testimonialStore.defaultVisibility || 'private' as TestimonialVisibility,
	allowLandingPage: false,
});

// Computed
const title = computed(() => props.editTestimonial ? 'Editar testimonio' : 'Nuevo testimonio');
const submitButtonText = computed(() => props.editTestimonial ? 'Guardar cambios' : 'Publicar testimonio');

const isFormValid = computed(() => {
	return formData.value.content.trim().length >= 10 && formData.value.content.length <= 2000;
});

const contentError = computed(() => {
	const content = formData.value.content;
	if (content.length > 2000) return 'Máximo 2000 caracteres';
	if (content.length > 0 && content.trim().length < 10) return 'Mínimo 10 caracteres';
	return '';
});

const visibilityDescription = computed(() => {
	const descriptions: Record<TestimonialVisibility, string> = {
		private: 'Solo tú podrás ver este testimonio',
		retreat_participants: 'Solo quienes participaron del mismo retiro podrán verlo',
		friends: 'Solo tus amigos aceptados podrán verlo',
		public: 'Cualquier usuario de la plataforma podrá verlo',
	};
	return descriptions[formData.value.visibility];
});

// Methods
const formatDateRange = (startDate: string, endDate: string) => {
	const start = new Date(startDate);
	const end = new Date(endDate);
	const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
	return `${start.toLocaleDateString('es-ES', options)} - ${end.toLocaleDateString('es-ES', options)}`;
};

const handleSubmit = () => {
	if (!isFormValid.value) return;
	emit('submit', {
		content: formData.value.content.trim(),
		retreatId: formData.value.retreatId,
		visibility: formData.value.visibility,
		allowLandingPage: formData.value.allowLandingPage,
	});
};

// Load retreats
const loadRetreats = async () => {
	try {
		const response = await api.get('/retreats');
		retreats.value = response.data;
	} catch (error) {
		console.error('Error loading retreats:', error);
	}
};

// Load edit data if provided
watch(
	() => props.editTestimonial,
	(newVal) => {
		if (newVal) {
			formData.value = {
				content: newVal.content,
				retreatId: newVal.retreatId || null,
				visibility: newVal.visibility,
				allowLandingPage: newVal.allowLandingPage,
			};
		}
	},
	{ immediate: true }
);

onMounted(() => {
	loadRetreats();
	testimonialStore.fetchDefaultVisibility();
});
</script>
