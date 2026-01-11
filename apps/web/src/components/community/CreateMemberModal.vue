<script setup lang="ts">
import { ref, watch } from 'vue';
import { useCommunityStore } from '@/stores/communityStore';
import { useToast } from '@repo/ui';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Button,
	Input,
	Label,
} from '@repo/ui';
import { UserPlus, Loader2 } from 'lucide-vue-next';

const props = defineProps<{
	open: boolean;
	communityId: string;
}>();

const emit = defineEmits(['update:open', 'created']);

const communityStore = useCommunityStore();
const { toast } = useToast();

const formData = ref({
	firstName: '',
	lastName: '',
	email: '',
	cellPhone: '',
});

const formErrors = ref<Record<string, string>>({});
const isSubmitting = ref(false);

// Reset form when dialog opens
watch(() => props.open, (isOpen) => {
	if (isOpen) {
		resetForm();
	}
});

const resetForm = () => {
	formData.value = {
		firstName: '',
		lastName: '',
		email: '',
		cellPhone: '',
	};
	formErrors.value = {};
};

const validateForm = (): boolean => {
	formErrors.value = {};

	if (!formData.value.firstName.trim()) {
		formErrors.value.firstName = 'El nombre es requerido';
	}
	if (!formData.value.lastName.trim()) {
		formErrors.value.lastName = 'El apellido es requerido';
	}
	if (!formData.value.email.trim()) {
		formErrors.value.email = 'El email es requerido';
	} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.value.email)) {
		formErrors.value.email = 'Email inválido';
	}
	if (!formData.value.cellPhone.trim()) {
		formErrors.value.cellPhone = 'El teléfono es requerido';
	}

	return Object.keys(formErrors.value).length === 0;
};

const handleSubmit = async () => {
	if (!validateForm()) {
		toast({
			title: 'Error de validación',
			description: 'Por favor corrige los errores en el formulario',
			variant: 'destructive',
		});
		return;
	}

	isSubmitting.value = true;
	try {
		await communityStore.createMember(props.communityId, formData.value);
		toast({
			title: 'Miembro creado',
			description: `${formData.value.firstName} ${formData.value.lastName} ha sido agregado a la comunidad`,
		});
		emit('created');
		emit('update:open', false);
		resetForm();
	} catch (error: any) {
		console.error('Error creating member:', error);
		toast({
			title: 'Error',
			description: error.response?.data?.message || error.message || 'No se pudo crear el miembro',
			variant: 'destructive',
		});
	} finally {
		isSubmitting.value = false;
	}
};

const handleClose = () => {
	if (!isSubmitting.value) {
		emit('update:open', false);
		resetForm();
	}
};
</script>

<template>
	<Dialog :open="open" @update:open="handleClose">
		<DialogContent class="sm:max-w-[500px]">
			<DialogHeader>
				<DialogTitle class="flex items-center gap-2">
					<UserPlus class="w-5 h-5" />
					Crear nuevo miembro
				</DialogTitle>
				<DialogDescription>
					Agrega un nuevo miembro a la comunidad sin necesidad de un retiro asociado
				</DialogDescription>
			</DialogHeader>

			<div class="space-y-4 py-4">
				<!-- First Name -->
				<div class="space-y-2">
					<Label for="firstName">Nombre *</Label>
					<Input
						id="firstName"
						v-model="formData.firstName"
						placeholder="Juan"
						:class="{ 'border-destructive': formErrors.firstName }"
						:disabled="isSubmitting"
					/>
					<p v-if="formErrors.firstName" class="text-sm text-destructive">{{ formErrors.firstName }}</p>
				</div>

				<!-- Last Name -->
				<div class="space-y-2">
					<Label for="lastName">Apellido *</Label>
					<Input
						id="lastName"
						v-model="formData.lastName"
						placeholder="Pérez"
						:class="{ 'border-destructive': formErrors.lastName }"
						:disabled="isSubmitting"
					/>
					<p v-if="formErrors.lastName" class="text-sm text-destructive">{{ formErrors.lastName }}</p>
				</div>

				<!-- Email -->
				<div class="space-y-2">
					<Label for="email">Email *</Label>
					<Input
						id="email"
						v-model="formData.email"
						type="email"
						placeholder="juan@example.com"
						:class="{ 'border-destructive': formErrors.email }"
						:disabled="isSubmitting"
					/>
					<p v-if="formErrors.email" class="text-sm text-destructive">{{ formErrors.email }}</p>
				</div>

				<!-- Cell Phone -->
				<div class="space-y-2">
					<Label for="cellPhone">Teléfono celular *</Label>
					<Input
						id="cellPhone"
						v-model="formData.cellPhone"
						type="tel"
						placeholder="555-1234"
						:class="{ 'border-destructive': formErrors.cellPhone }"
						:disabled="isSubmitting"
					/>
					<p v-if="formErrors.cellPhone" class="text-sm text-destructive">{{ formErrors.cellPhone }}</p>
				</div>
			</div>

			<DialogFooter>
				<Button
					variant="outline"
					@click="handleClose"
					:disabled="isSubmitting"
				>
					Cancelar
				</Button>
				<Button
					@click="handleSubmit"
					:disabled="isSubmitting"
				>
					<Loader2 v-if="isSubmitting" class="w-4 h-4 mr-2 animate-spin" />
					<UserPlus v-else class="w-4 h-4 mr-2" />
					{{ isSubmitting ? 'Creando...' : 'Crear miembro' }}
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
