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
	Badge,
} from '@repo/ui';
import { UserPlus, UserCheck, Loader2, AlertTriangle, Info } from 'lucide-vue-next';
import BirthdayFields from '@/components/community/BirthdayFields.vue';
import type { MemberCandidate } from '@/services/api';

const props = defineProps<{
	open: boolean;
	communityId: string;
}>();

const emit = defineEmits(['update:open', 'created']);

const communityStore = useCommunityStore();
const { toast } = useToast();

// Flujo en dos fases: el backend responde 409 con el código del conflicto y el
// modal transiciona entre pasos dentro del mismo Dialog.
type Step = 'form' | 'confirm-candidates' | 'already-member';
const step = ref<Step>('form');
const candidates = ref<MemberCandidate[]>([]);
const selectedParticipantId = ref('');
const alreadyMember = ref<{ memberId: string; firstName: string; lastName: string } | null>(null);

// Payload validado de la fase 1; los reenvíos (link / forceNew) lo reutilizan
// añadiendo el flag correspondiente.
interface MemberPayload {
	firstName: string;
	lastName: string;
	email: string;
	cellPhone: string;
	joinedAt?: string;
	birthDate?: string;
}
let basePayload: MemberPayload | null = null;

const formData = ref({
	firstName: '',
	lastName: '',
	email: '',
	cellPhone: '',
	birthDate: '',
	joinedAt: '',
});
// El campo de cumpleaños avisa cuando lo tecleado no forma una fecha real.
const birthdayInvalid = ref(false);

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
		birthDate: '',
		joinedAt: '',
	};
	formErrors.value = {};
	step.value = 'form';
	candidates.value = [];
	selectedParticipantId.value = '';
	alreadyMember.value = null;
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

// Éxito compartido por los tres envíos (nuevo, vincular, forzar nuevo).
const sendCreate = async (payload: Record<string, unknown>) => {
	const result = await communityStore.createMember(props.communityId, payload as any);
	if (result?.linked) {
		// Al vincular, la ficha existente manda: mostrar su nombre real, no lo
		// que se tecleó en el form (que solo sirvió para buscar a la persona).
		const linked = candidates.value.find(
			(c) => c.participantId === selectedParticipantId.value,
		);
		const displayName = linked
			? `${linked.firstName} ${linked.lastName}`
			: `${formData.value.firstName} ${formData.value.lastName}`;
		toast({
			title: 'Miembro agregado',
			description: `${displayName} se vinculó a su ficha existente`,
		});
	} else {
		toast({
			title: 'Miembro creado',
			description: `${formData.value.firstName} ${formData.value.lastName} ha sido agregado a la comunidad`,
		});
	}
	emit('created');
	emit('update:open', false);
	resetForm();
};

// Traduce los 409 del backend a transiciones de paso. Devuelve true cuando el
// error se consumió como transición (sin toast); el resto va al toast genérico.
const handleConflict = (error: any): boolean => {
	if (error?.response?.status !== 409) return false;
	const data = error.response.data ?? {};
	if (data.code === 'EXISTING_PARTICIPANT_FOUND') {
		candidates.value = Array.isArray(data.candidates) ? data.candidates : [];
		selectedParticipantId.value = candidates.value[0]?.participantId ?? '';
		step.value = 'confirm-candidates';
		return true;
	}
	if (data.code === 'ALREADY_MEMBER') {
		alreadyMember.value = data.member ?? null;
		step.value = 'already-member';
		return true;
	}
	if (data.code === 'LINK_TARGET_MISMATCH') {
		toast({
			title: 'La coincidencia cambió',
			description: 'La persona que seleccionaste ya no aparece como coincidencia. Revisa los datos e intenta de nuevo.',
			variant: 'destructive',
		});
		step.value = 'form';
		return true;
	}
	return false;
};

const errorToast = (error: any) => {
	toast({
		title: 'Error',
		description: error.response?.data?.message || error.message || 'No se pudo crear el miembro',
		variant: 'destructive',
	});
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
		const payload: MemberPayload = {
			firstName: formData.value.firstName,
			lastName: formData.value.lastName,
			email: formData.value.email,
			cellPhone: formData.value.cellPhone,
		};
		// Solo enviar joinedAt si el coordinador puso una fecha; si no, el backend
		// usa el default (ahora).
		if (formData.value.joinedAt) payload.joinedAt = formData.value.joinedAt;
		if (formData.value.birthDate) payload.birthDate = formData.value.birthDate;
		basePayload = { ...payload };
		await sendCreate(payload);
	} catch (error: any) {
		console.error('Error creating member:', error);
		if (!handleConflict(error)) {
			errorToast(error);
		}
	} finally {
		isSubmitting.value = false;
	}
};

// Fase 2a: vincular al Participant seleccionado.
const submitLink = async () => {
	if (!selectedParticipantId.value || !basePayload) return;
	isSubmitting.value = true;
	try {
		await sendCreate({ ...basePayload, linkParticipantId: selectedParticipantId.value });
	} catch (error: any) {
		console.error('Error linking member:', error);
		if (!handleConflict(error)) {
			errorToast(error);
		}
	} finally {
		isSubmitting.value = false;
	}
};

// Fase 2b: el admin confirmó que es otra persona — saltar el lookup.
const submitForceNew = async () => {
	if (!basePayload) return;
	isSubmitting.value = true;
	try {
		await sendCreate({ ...basePayload, forceNewParticipant: true });
	} catch (error: any) {
		console.error('Error creating new member:', error);
		if (!handleConflict(error)) {
			errorToast(error);
		}
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
				<template v-if="step === 'form'">
					<DialogTitle class="flex items-center gap-2">
						<UserPlus class="w-5 h-5" />
						Crear nuevo miembro
					</DialogTitle>
					<DialogDescription>
						Agrega un nuevo miembro a la comunidad sin necesidad de un retiro asociado
					</DialogDescription>
				</template>
				<template v-else-if="step === 'confirm-candidates'">
					<DialogTitle class="flex items-center gap-2">
						<AlertTriangle class="w-5 h-5 text-amber-600" />
						¿Ya conocemos a esta persona?
					</DialogTitle>
					<DialogDescription>
						Alguien con ese correo o teléfono ya está registrada. Confirma si es la misma persona.
					</DialogDescription>
				</template>
				<template v-else>
					<DialogTitle class="flex items-center gap-2">
						<Info class="w-5 h-5" />
						Ya es miembro de esta comunidad
					</DialogTitle>
					<DialogDescription>
						El correo o teléfono que capturaste ya pertenece a un miembro.
					</DialogDescription>
				</template>
			</DialogHeader>

			<!-- Paso 1: formulario de alta -->
			<div v-if="step === 'form'" class="space-y-4 py-4">
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

				<BirthdayFields
					id-prefix="new-member-birthday"
					optional-hint
					:model-value="formData.birthDate"
					@update:model-value="formData.birthDate = $event"
					@update:invalid="birthdayInvalid = $event"
				/>

				<!-- Fecha de ingreso (opcional) -->
				<div class="space-y-2">
					<Label for="joinedAt">Fecha de ingreso</Label>
					<Input
						id="joinedAt"
						v-model="formData.joinedAt"
						type="date"
						:disabled="isSubmitting"
					/>
					<p class="text-xs text-muted-foreground">
						Opcional. Desde esta fecha cuentan las reuniones para su asistencia. Si lo dejas vacío, se usa hoy.
					</p>
				</div>
			</div>

			<!-- Paso 2: candidatos a vincular -->
			<div v-else-if="step === 'confirm-candidates'" class="space-y-4 py-4">
				<p class="text-sm text-muted-foreground">
					Encontramos {{ candidates.length }}
					{{ candidates.length === 1 ? 'persona que coincide' : 'personas que coinciden' }}
					con ese correo o teléfono. Si es la misma persona, selecciónala para no duplicar su ficha.
				</p>
				<div class="space-y-2">
					<button
						v-for="c in candidates"
						:key="c.participantId"
						type="button"
						class="w-full text-left border rounded-md p-3 transition-colors"
						:class="selectedParticipantId === c.participantId ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'"
						:disabled="isSubmitting"
						:data-participant-id="c.participantId"
						@click="selectedParticipantId = c.participantId"
					>
						<div class="flex items-center justify-between gap-2">
							<p class="font-medium text-sm">{{ c.firstName }} {{ c.lastName }}</p>
							<Badge variant="outline">
								{{ c.matchedBy === 'email' ? 'coincide por correo' : 'coincide por teléfono' }}
							</Badge>
						</div>
					</button>
				</div>
				<p v-if="candidates.length >= 5" class="text-xs text-muted-foreground">
					Se muestran hasta 5 coincidencias.
				</p>
			</div>

			<!-- Paso alternativo: ya es miembro -->
			<div v-else class="space-y-3 py-4">
				<p class="text-sm">
					<span class="font-medium">{{ alreadyMember?.firstName }} {{ alreadyMember?.lastName }}</span>
					ya es miembro de esta comunidad con ese correo o teléfono.
				</p>
				<p class="text-xs text-muted-foreground">
					Si es otra persona distinta, puedes crear una ficha nueva; ten en cuenta que el alta puede
					rechazarse si el teléfono ya está registrado en esta comunidad.
				</p>
			</div>

			<DialogFooter v-if="step === 'form'">
				<Button
					variant="outline"
					@click="handleClose"
					:disabled="isSubmitting"
				>
					Cancelar
				</Button>
				<Button
					@click="handleSubmit"
					:disabled="isSubmitting || birthdayInvalid"
				>
					<Loader2 v-if="isSubmitting" class="w-4 h-4 mr-2 animate-spin" />
					<UserPlus v-else class="w-4 h-4 mr-2" />
					{{ isSubmitting ? 'Creando...' : 'Crear miembro' }}
				</Button>
			</DialogFooter>

			<!-- Stacked actions: three long-label buttons don't fit a 500px footer row. -->
			<div v-else-if="step === 'confirm-candidates'" class="flex flex-col gap-2">
				<Button
					@click="submitLink"
					:disabled="isSubmitting || !selectedParticipantId"
					class="w-full"
				>
					<Loader2 v-if="isSubmitting" class="w-4 h-4 mr-2 animate-spin" />
					<UserCheck v-else class="w-4 h-4 mr-2" />
					Agregar existente
				</Button>
				<Button
					variant="outline"
					@click="submitForceNew"
					:disabled="isSubmitting"
					class="w-full"
				>
					<Loader2 v-if="isSubmitting" class="w-4 h-4 mr-2 animate-spin" />
					<UserPlus v-else class="w-4 h-4 mr-2" />
					Es otra persona, crear nueva
				</Button>
				<Button
					variant="ghost"
					@click="handleClose"
					:disabled="isSubmitting"
					class="w-full"
				>
					Cancelar
				</Button>
			</div>

			<div v-else class="flex flex-col gap-2">
				<Button
					@click="submitForceNew"
					:disabled="isSubmitting"
					class="w-full"
				>
					<Loader2 v-if="isSubmitting" class="w-4 h-4 mr-2 animate-spin" />
					<UserPlus v-else class="w-4 h-4 mr-2" />
					Es otra persona, crear nueva
				</Button>
				<Button
					variant="ghost"
					@click="handleClose"
					:disabled="isSubmitting"
					class="w-full"
				>
					Cerrar
				</Button>
			</div>
		</DialogContent>
	</Dialog>
</template>
