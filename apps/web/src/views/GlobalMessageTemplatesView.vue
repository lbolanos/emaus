<template>
	<div class="container mx-auto p-6">
		<div class="mb-6">
			<h1 class="text-2xl font-bold text-gray-900">Plantillas de Mensaje Globales</h1>
			<p class="text-gray-600 mt-2">
				Gestiona las plantillas de mensaje que se utilizarán como base para crear nuevos retiros.
			</p>
		</div>

		<!-- Actions Bar -->
		<div class="mb-6 flex flex-wrap gap-3">
			<button
				@click="showCreateModal = true"
				class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
			>
				Nueva Plantilla
			</button>
			<button
				@click="refreshTemplates"
				:disabled="globalMessageTemplateStore.loading"
				class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
			>
				Actualizar
			</button>
		</div>

		<!-- Loading State -->
		<div
			v-if="globalMessageTemplateStore.loading && globalMessageTemplateStore.templates.length === 0"
			class="text-center py-8"
		>
			<div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			<p class="mt-2 text-gray-600">Cargando plantillas...</p>
		</div>

		<!-- Error State -->
		<div
			v-if="globalMessageTemplateStore.error"
			class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4"
		>
			{{ globalMessageTemplateStore.error }}
		</div>

		<!-- Templates Grid -->
		<div v-if="!globalMessageTemplateStore.loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			<div
				v-for="template in globalMessageTemplateStore.templates"
				:key="template.id"
				class="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden"
			>
				<div class="p-6">
					<div class="flex justify-between items-start mb-4">
						<div>
							<h3 class="text-lg font-semibold text-gray-900">{{ template.name }}</h3>
							<span
								:class="[
									'inline-block px-2 py-1 text-xs rounded-full',
									template.isActive
										? 'bg-green-100 text-green-800'
										: 'bg-gray-100 text-gray-800',
								]"
							>
								{{ template.isActive ? 'Activa' : 'Inactiva' }}
							</span>
						</div>
						<span class="text-sm text-gray-500">{{ getTypeLabel(template.type) }}</span>
					</div>

					<div class="mb-4">
						<p class="text-sm text-gray-600 line-clamp-3">
							{{ formatMessagePreview(template.message) }}
						</p>
					</div>

					<div class="flex justify-between items-center">
						<span class="text-xs text-gray-500">
							{{ formatDate(template.createdAt) }}
						</span>
						<div class="flex gap-2">
							<button
								@click="editTemplate(template)"
								class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
								title="Editar"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
									/>
								</svg>
							</button>
							<button
								@click="toggleTemplateStatus(template)"
								:class="[
									'p-2 rounded-lg transition-colors',
									template.isActive
										? 'text-red-600 hover:bg-red-50'
										: 'text-green-600 hover:bg-green-50',
								]"
								:title="template.isActive ? 'Desactivar' : 'Activar'"
							>
								<svg
									v-if="template.isActive"
									class="w-4 h-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<svg
									v-else
									class="w-4 h-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
							</button>
							<button
								@click="deleteTemplate(template)"
								class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
								title="Eliminar"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
									/>
								</svg>
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Empty State -->
		<div
			v-if="!globalMessageTemplateStore.loading && globalMessageTemplateStore.templates.length === 0"
			class="text-center py-12"
		>
			<svg
				class="mx-auto h-12 w-12 text-gray-400"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
				/>
			</svg>
			<h3 class="mt-2 text-sm font-medium text-gray-900">No hay plantillas de mensaje</h3>
			<p class="mt-1 text-sm text-gray-500">
				Comienza creando tu primera plantilla de mensaje global.
			</p>
		</div>

		<!-- Create/Edit Modal -->
		<AddEditGlobalMessageTemplateModal
			v-if="showCreateModal || showEditModal"
			:template="editingTemplate"
			@close="closeModals"
			@saved="handleTemplateSaved"
		/>

		<!-- Confirmation Dialog -->
		<ConfirmationDialog
			:open="showDeleteDialog"
			:title="'Eliminar Plantilla'"
			:message="'¿Estás seguro de que quieres eliminar esta plantilla de mensaje? Esta acción no se puede deshacer.'"
			confirmButtonText="Eliminar"
			cancelButtonText="Cancelar"
			@confirm="confirmDelete"
			@cancel="showDeleteDialog = false"
		/>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useGlobalMessageTemplateStore, type GlobalMessageTemplate } from '@/stores/globalMessageTemplateStore';
import { useAuthStore } from '@/stores/authStore';
import AddEditGlobalMessageTemplateModal from '@/components/AddEditGlobalMessageTemplateModal.vue';
import ConfirmationDialog from '@/components/ConfirmationDialog.vue';

const globalMessageTemplateStore = useGlobalMessageTemplateStore();
const authStore = useAuthStore();

const showCreateModal = ref(false);
const showEditModal = ref(false);
const showDeleteDialog = ref(false);
const editingTemplate = ref<GlobalMessageTemplate | null>(null);
const templateToDelete = ref<GlobalMessageTemplate | null>(null);

const typeLabels: Record<string, string> = {
	WALKER_WELCOME: 'Bienvenida Caminante',
	SERVER_WELCOME: 'Bienvenida Servidor',
	EMERGENCY_CONTACT_VALIDATION: 'Validación Contacto de Emergencia',
	PALANCA_REQUEST: 'Solicitud de Palanca',
	PALANCA_REMINDER: 'Recordatorio de Palanca',
	GENERAL: 'Mensaje General',
	PRE_RETREAT_REMINDER: 'Recordatorio Pre-Retiro',
	PAYMENT_REMINDER: 'Recordatorio de Pago',
	POST_RETREAT_MESSAGE: 'Mensaje Post-Retiro',
	CANCELLATION_CONFIRMATION: 'Confirmación de Cancelación',
	USER_INVITATION: 'Invitación de Usuario',
	PASSWORD_RESET: 'Restablecimiento de Contraseña',
	RETREAT_SHARED_NOTIFICATION: 'Notificación de Retiro Compartido',
};

onMounted(async () => {
	await loadTemplates();
});

const loadTemplates = async () => {
	try {
		await globalMessageTemplateStore.fetchAll();
	} catch (error) {
		console.error('Error loading templates:', error);
	}
};

const refreshTemplates = async () => {
	await loadTemplates();
};

const getTypeLabel = (type: string) => {
	return typeLabels[type] || type;
};

const formatMessagePreview = (message: string) => {
	return message.length > 150 ? message.substring(0, 150) + '...' : message;
};

const formatDate = (dateString: string) => {
	return new Date(dateString).toLocaleDateString('es-ES', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
};

const editTemplate = (template: any) => {
	editingTemplate.value = template;
	showEditModal.value = true;
};

const toggleTemplateStatus = async (template: any) => {
	try {
		await globalMessageTemplateStore.toggleActive(template.id);
	} catch (error) {
		console.error('Error toggling template status:', error);
	}
};

const deleteTemplate = (template: any) => {
	templateToDelete.value = template;
	showDeleteDialog.value = true;
};

const confirmDelete = async () => {
	if (templateToDelete.value) {
		try {
			await globalMessageTemplateStore.delete(templateToDelete.value.id);
			showDeleteDialog.value = false;
			templateToDelete.value = null;
		} catch (error) {
			console.error('Error deleting template:', error);
		}
	}
};

const closeModals = () => {
	showCreateModal.value = false;
	showEditModal.value = false;
	editingTemplate.value = null;
};

const handleTemplateSaved = () => {
	closeModals();
	loadTemplates();
};
</script>

<style scoped>
.line-clamp-3 {
	display: -webkit-box;
	-webkit-line-clamp: 3;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
</style>