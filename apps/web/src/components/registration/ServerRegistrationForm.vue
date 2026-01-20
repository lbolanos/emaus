<script setup lang="ts">
import { ref, computed } from 'vue';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { Button } from '@repo/ui';
import { Input } from '@repo/ui';
import { Label } from '@repo/ui';
import { useToast } from '@repo/ui';
import { checkParticipantExists } from '@/services/api';
import type { Participant } from '@repo/types';

const props = defineProps<{
	retreatId: string;
}>();

const emit = defineEmits<{
	(e: 'registered', participant: Participant): void;
	(e: 'cancel'): void;
}>();

const { toast } = useToast();

// Form state
const email = ref('');
const existingParticipant = ref<Participant | null>(null);
const showVerificationForm = ref(false);
const showNewRegistrationForm = ref(false);
const loading = ref(false);
const searching = ref(false);

// Verification form state
const verifiedData = ref({
	firstName: '',
	lastName: '',
	nickname: '',
	cellPhone: '',
	confirmEmail: false,
});

// Validation
const emailValid = computed(() => {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email.value);
});

async function checkEmail() {
	if (!emailValid.value) {
		toast({
			title: 'Correo inválido',
			description: 'Por favor ingresa un correo electrónico válido',
			variant: 'destructive',
		});
		return;
	}

	searching.value = true;
	try {
		const response = await checkParticipantExists(email.value);

		if (response.exists && response.participant) {
			// Found existing participant - show verification form
			existingParticipant.value = response.participant;
			verifiedData.value.firstName = response.participant.firstName;
			verifiedData.value.lastName = response.participant.lastName;
			verifiedData.value.nickname = response.participant.nickname || '';
			verifiedData.value.cellPhone = response.participant.cellPhone || '';
			showVerificationForm.value = true;
			showNewRegistrationForm.value = false;

			toast({
				title: 'Participante encontrado',
				description: response.message || 'Se encontró un registro existente',
			});
		} else {
			// No existing participant - show new registration form
			showVerificationForm.value = false;
			showNewRegistrationForm.value = true;

			toast({
				title: 'Nuevo registro',
				description: 'No se encontró un registro existente. Por favor completa el formulario de registro.',
			});
		}
	} catch (error: any) {
		toast({
			title: 'Error al buscar',
			description: error.response?.data?.message || 'Ocurrió un error al buscar el participante',
			variant: 'destructive',
		});
	} finally {
		searching.value = false;
	}
}

async function confirmExistingRegistration() {
	if (!existingParticipant.value) return;

	if (!verifiedData.value.confirmEmail) {
		toast({
			title: 'Confirmación requerida',
			description: 'Por favor confirma que este es tu correo electrónico',
			variant: 'destructive',
		});
		return;
	}

	loading.value = true;
	try {
		// The API will reuse the existing participant and create history
		// We just need to call the create participant endpoint with verified data
		const response = await fetch('/api/participants/new', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({
				retreatId: props.retreatId,
				type: 'server',
				email: email.value,
				// Include other verified data for update
				firstName: verifiedData.value.firstName,
				lastName: verifiedData.value.lastName,
				nickname: verifiedData.value.nickname,
				cellPhone: verifiedData.value.cellPhone,
			}),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Error al registrar');
		}

		const result = await response.json();
		toast({
			title: 'Registro exitoso',
			description: 'Te has registrado como servidor exitosamente',
		});
		emit('registered', result);
	} catch (error: any) {
		toast({
			title: 'Error al registrar',
			description: error.message || 'Ocurrió un error al procesar el registro',
			variant: 'destructive',
		});
	} finally {
		loading.value = false;
	}
}

function cancel() {
	emit('cancel');
}

function resetForm() {
	email.value = '';
	existingParticipant.value = null;
	showVerificationForm.value = false;
	showNewRegistrationForm.value = false;
	verifiedData.value = {
		firstName: '',
		lastName: '',
		nickname: '',
		cellPhone: '',
		confirmEmail: false,
	};
}
</script>

<template>
	<div class="w-full max-w-2xl mx-auto space-y-6">
		<!-- Step 1: Email Lookup -->
		<Card v-if="!showVerificationForm && !showNewRegistrationForm">
			<CardHeader>
				<CardTitle>Registro de Servidor</CardTitle>
			</CardHeader>
			<CardContent class="space-y-4">
				<p class="text-sm text-muted-foreground">
					Ingresa tu correo electrónico para verificar si ya tienes un registro en el sistema.
				</p>
				<div class="space-y-2">
					<Label for="email">Correo Electrónico</Label>
					<Input
						id="email"
						v-model="email"
						type="email"
						placeholder="tu.correo@ejemplo.com"
						:disabled="searching"
						@keyup.enter="checkEmail"
					/>
				</div>
				<div class="flex gap-2">
					<Button @click="checkEmail" :disabled="searching || !emailValid" class="flex-1">
						<span v-if="searching">Buscando...</span>
						<span v-else>Buscar</span>
					</Button>
					<Button variant="outline" @click="cancel">Cancelar</Button>
				</div>
			</CardContent>
		</Card>

		<!-- Step 2a: Verify Existing Participant -->
		<Card v-if="showVerificationForm && existingParticipant">
			<CardHeader>
				<CardTitle>Verificar Datos</CardTitle>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
					<p class="text-sm font-medium mb-2">Se encontró un registro existente:</p>
					<div class="text-sm space-y-1">
						<p><span class="font-medium">Nombre:</span> {{ existingParticipant.firstName }} {{ existingParticipant.lastName }}</p>
						<p><span class="font-medium">Correo:</span> {{ existingParticipant.email }}</p>
						<p><span class="font-medium">Retiro anterior:</span> {{ existingParticipant.retreatId }}</p>
						<p class="text-xs text-muted-foreground mt-2">
							Vamos a registrar tu participación en este nuevo retiro. Tu historial se mantendrá actualizado.
						</p>
					</div>
				</div>

				<div class="space-y-3">
					<div>
						<Label for="verify-firstName">Nombre</Label>
						<Input id="verify-firstName" v-model="verifiedData.firstName" />
					</div>
					<div>
						<Label for="verify-lastName">Apellidos</Label>
						<Input id="verify-lastName" v-model="verifiedData.lastName" />
					</div>
					<div>
						<Label for="verify-nickname">Apodo (opcional)</Label>
						<Input id="verify-nickname" v-model="verifiedData.nickname" />
					</div>
					<div>
						<Label for="verify-cellPhone">Teléfono Celular</Label>
						<Input id="verify-cellPhone" v-model="verifiedData.cellPhone" />
					</div>
					<div class="flex items-center space-x-2 pt-2">
						<input
							id="confirm-email"
							type="checkbox"
							v-model="verifiedData.confirmEmail"
							class="h-4 w-4 rounded border-gray-300"
						/>
						<Label for="confirm-email" class="text-sm font-normal cursor-pointer">
							Confirmo que <strong>{{ email }}</strong> es mi correo electrónico
						</Label>
					</div>
				</div>

				<div class="flex gap-2">
					<Button @click="confirmExistingRegistration" :disabled="loading || !verifiedData.confirmEmail" class="flex-1">
						<span v-if="loading">Procesando...</span>
						<span v-else>Confirmar Registro</span>
					</Button>
					<Button variant="outline" @click="resetForm">Atrás</Button>
				</div>
			</CardContent>
		</Card>

		<!-- Step 2b: New Registration Flow -->
		<Card v-if="showNewRegistrationForm">
			<CardHeader>
				<CardTitle>Registro Nuevo</CardTitle>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
					<p class="text-sm">
						No se encontró un registro previo para <strong>{{ email }}</strong>.
					</p>
					<p class="text-sm mt-2">
						Por favor completa el formulario de registro completo. Esto sugiere que es tu primera vez participando con nosotros.
					</p>
				</div>

				<div class="flex gap-2">
					<Button @click="resetForm" variant="outline" class="flex-1">
						Corregir Correo
					</Button>
					<Button @click="cancel" variant="outline">
						Cancelar
					</Button>
				</div>

				<div class="border-t pt-4">
					<p class="text-sm text-muted-foreground mb-4">
						El formulario de registro completo se mostrará aquí (Step1PersonalInfo, Step2AddressInfo, etc.)
					</p>
					<!-- TODO: Integrate with existing multi-step registration form -->
					<Button @click="cancel" class="w-full">
						Ir al Formulario Completo
					</Button>
				</div>
			</CardContent>
		</Card>
	</div>
</template>
