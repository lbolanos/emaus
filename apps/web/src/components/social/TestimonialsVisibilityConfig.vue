<template>
	<div class="p-4 rounded-lg border bg-card space-y-4">
		<h3 class="font-semibold">Visibilidad por defecto de mis testimonios</h3>
		<p class="text-sm text-muted-foreground">
			Configura quién podrá ver tus nuevos testimonios por defecto. Siempre podrás cambiar esto al crear cada testimonio.
		</p>

		<select
			v-model="selectedVisibility"
			:disabled="loading"
			@change="handleSave"
			class="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
		>
			<option value="private">Privado - Solo yo</option>
			<option value="retreat_participants">Participantes del retiro</option>
			<option value="friends">Amigos</option>
			<option value="public">Público - Todos</option>
		</select>

		<p v-if="saveMessage" class="text-sm" :class="saveSuccess ? 'text-green-600' : 'text-red-600'">
			{{ saveMessage }}
		</p>
	</div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import type { TestimonialVisibility } from '@/stores/testimonialStore';
import { useTestimonialStore } from '@/stores/testimonialStore';

interface Props {
	modelValue?: TestimonialVisibility;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	(e: 'update:modelValue', value: TestimonialVisibility): void;
}>();

const testimonialStore = useTestimonialStore();

// State
const loading = ref(false);
const saveMessage = ref('');
const saveSuccess = ref(false);
const selectedVisibility = ref<TestimonialVisibility>('private');

// Methods
const handleSave = async () => {
	try {
		loading.value = true;
		saveMessage.value = '';
		await testimonialStore.setDefaultVisibility(selectedVisibility.value);
		saveMessage.value = 'Configuración guardada';
		saveSuccess.value = true;
		emit('update:modelValue', selectedVisibility.value);

		// Clear message after 3 seconds
		setTimeout(() => {
			saveMessage.value = '';
		}, 3000);
	} catch (error: any) {
		saveMessage.value = error.message || 'Error al guardar la configuración';
		saveSuccess.value = false;
	} finally {
		loading.value = false;
	}
};

// Watch for modelValue changes from parent
watch(
	() => props.modelValue,
	(newValue) => {
		if (newValue) {
			selectedVisibility.value = newValue;
		}
	},
	{ immediate: true }
);

onMounted(async () => {
	try {
		await testimonialStore.fetchDefaultVisibility();
		selectedVisibility.value = testimonialStore.defaultVisibility;
		emit('update:modelValue', testimonialStore.defaultVisibility);
	} catch (error) {
		console.error('Error loading default visibility:', error);
	}
});
</script>
