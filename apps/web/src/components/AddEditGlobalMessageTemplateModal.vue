<template>
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
		<div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
			<div class="p-6 border-b border-gray-200">
				<h2 class="text-xl font-semibold text-gray-900">
					{{ template ? 'Editar Plantilla' : 'Nueva Plantilla' }}
				</h2>
			</div>

			<form @submit.prevent="handleSubmit" class="p-6 space-y-6">
				<!-- Name -->
				<div>
					<label for="name" class="block text-sm font-medium text-gray-700 mb-2">
						Nombre de la Plantilla
					</label>
					<input
						id="name"
						v-model="formData.name"
						type="text"
						required
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						:disabled="loading"
					/>
				</div>

				<!-- Type -->
				<div>
					<label for="type" class="block text-sm font-medium text-gray-700 mb-2">
						Tipo de Mensaje
					</label>
					<select
						id="type"
						v-model="formData.type"
						required
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						:disabled="loading"
					>
						<option value="">Selecciona un tipo</option>
						<option value="WALKER_WELCOME">Bienvenida Caminante</option>
						<option value="SERVER_WELCOME">Bienvenida Servidor</option>
						<option value="EMERGENCY_CONTACT_VALIDATION">Validación Contacto de Emergencia</option>
						<option value="PALANCA_REQUEST">Solicitud de Palanca</option>
						<option value="PALANCA_REMINDER">Recordatorio de Palanca</option>
						<option value="GENERAL">Mensaje General</option>
						<option value="PRE_RETREAT_REMINDER">Recordatorio Pre-Retiro</option>
						<option value="PAYMENT_REMINDER">Recordatorio de Pago</option>
						<option value="POST_RETREAT_MESSAGE">Mensaje Post-Retiro</option>
						<option value="CANCELLATION_CONFIRMATION">Confirmación de Cancelación</option>
						<option value="USER_INVITATION">Invitación de Usuario</option>
						<option value="PASSWORD_RESET">Restablecimiento de Contraseña</option>
						<option value="RETREAT_SHARED_NOTIFICATION">Notificación de Retiro Compartido</option>
						<option value="BIRTHDAY_MESSAGE">Mensaje de Cumpleaños</option>
					</select>
				</div>

				<!-- Message -->
				<div>
					<label for="message" class="block text-sm font-medium text-gray-700 mb-2">
						Mensaje
					</label>
					<textarea
						id="message"
						v-model="formData.message"
						rows="12"
						required
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
						:disabled="loading"
						placeholder="Escribe el mensaje aquí. Puedes usar variables como {participant.nickname}, {retreat.startDate}, etc."
					/>
					<p class="mt-2 text-sm text-gray-500">
						Variables disponibles: {participant.nickname}, {participant.hora_llegada},
						{retreat.startDate}, {retreat.name}, {retreat.cost}, {retreat.paymentInfo},
						{retreat.thingsToBringNotes}, {retreat.fecha_limite_palanca}, {retreat.next_meeting_date},
						{custom_message}, {user.name}, {inviterName}, {shareLink}, {resetToken}
					</p>
				</div>

				<!-- Active Status -->
				<div v-if="template">
					<label class="flex items-center">
						<input
							v-model="formData.isActive"
							type="checkbox"
							class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
							:disabled="loading"
						/>
						<span class="ml-2 text-sm text-gray-700">Plantilla activa</span>
					</label>
				</div>

				<!-- Preview -->
				<div v-if="formData.message" class="border-t pt-4">
					<h3 class="text-sm font-medium text-gray-700 mb-2">Vista Previa</h3>
					<div class="bg-gray-50 p-4 rounded-lg border">
						<div class="whitespace-pre-wrap text-sm" v-html="previewMessage"></div>
					</div>
				</div>

				<!-- Actions -->
				<div class="flex justify-end gap-3 pt-4 border-t">
					<button
						type="button"
						@click="$emit('close')"
						class="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
						:disabled="loading"
					>
						Cancelar
					</button>
					<button
						type="submit"
						class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
						:disabled="loading || !isFormValid"
					>
						{{ loading ? 'Guardando...' : (template ? 'Actualizar' : 'Crear') }}
					</button>
				</div>
			</form>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useGlobalMessageTemplateStore } from '@/stores/globalMessageTemplateStore';
import { markdownToSafeHtml } from '@/utils/sanitize';

interface Props {
	template?: {
		id: string;
		name: string;
		type: string;
		message: string;
		isActive: boolean;
	} | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	close: [];
	saved: [];
}>();

const globalMessageTemplateStore = useGlobalMessageTemplateStore();

const loading = ref(false);
const formData = ref({
	name: '',
	type: '',
	message: '',
	isActive: true,
});

const isFormValid = computed(() => {
	return formData.value.name.trim() && formData.value.type && formData.value.message.trim();
});

const previewMessage = computed(() => {
	let message = formData.value.message;

	// Replace common variables with sample values for preview
	const replacements = {
		'{participant.nickname}': 'Juan Pérez',
		'{participant.hora_llegada}': '3:00 PM',
		'{retreat.startDate}': '15 de marzo de 2024',
		'{retreat.name}': 'Parroquia San José',
		'{retreat.cost}': '50',
		'{retreat.paymentInfo}': 'Transferencia bancaria',
		'{retreat.thingsToBringNotes}': 'Ropa cómoda, Biblia, cuaderno',
		'{retreat.fecha_limite_palanca}': '10 de marzo de 2024',
		'{retreat.next_meeting_date}': '22 de marzo de 2024',
		'{custom_message}': 'Este es un mensaje personalizado',
		'{user.name}': 'María González',
		'{inviterName}': 'Carlos López',
		'{shareLink}': 'https://ejemplo.com/invitacion',
		'{resetToken}': 'https://ejemplo.com/reset-password',
	};

	Object.entries(replacements).forEach(([key, value]) => {
		message = message.replace(new RegExp(key, 'g'), value);
	});

	// Convert basic markdown to HTML for preview with sanitization
	return markdownToSafeHtml(message);
});

// Initialize form data
watch(
	() => props.template,
	(template) => {
		if (template) {
			formData.value = {
				name: template.name,
				type: template.type,
				message: template.message,
				isActive: template.isActive,
			};
		} else {
			formData.value = {
				name: '',
				type: '',
				message: '',
				isActive: true,
			};
		}
	},
	{ immediate: true }
);

const handleSubmit = async () => {
	if (!isFormValid.value) return;

	loading.value = true;

	try {
		if (props.template) {
			await globalMessageTemplateStore.update(props.template.id, formData.value);
		} else {
			await globalMessageTemplateStore.create(formData.value);
		}
		emit('saved');
	} catch (error) {
		console.error('Error saving template:', error);
	} finally {
		loading.value = false;
	}
};
</script>