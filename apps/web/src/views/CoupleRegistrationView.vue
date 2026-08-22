<script setup lang="ts">
/**
 * Wizard público de registro de PAREJA (retiros retreat_type='couples').
 *
 * Un solo submit crea a ambos cónyuges vinculados (POST /participants/couple/new).
 * Reutiliza los componentes Step del registro individual: los datos personales y
 * de salud se capturan por cónyuge; dirección, contactos de emergencia (con
 * toggle para separarlos) e invitador se capturan una vez y se copian a ambos.
 * El tipo (walker/server) viene de la URL, igual que en el flujo individual.
 */
import { computed, reactive, ref, watch, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useToast } from '@repo/ui'
import { z } from 'zod'
import { validatePhoneForCountry, phoneValidationMessage, normalizeEmail } from '@repo/types'
import { useParticipantStore } from '@/stores/participantStore'
import { getApiUrl } from '@/config/runtimeConfig'
import { getRecaptchaToken, RECAPTCHA_ACTIONS } from '@/services/recaptcha'

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui'
import { Label } from '@repo/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui'
import Step1PersonalInfo from '@/components/registration/Step1PersonalInfo.vue'
import Step2AddressInfo from '@/components/registration/Step2AddressInfo.vue'
import Step3ServiceInfo from '@/components/registration/Step3ServiceInfo.vue'
import Step4EmergencyContact from '@/components/registration/Step4EmergencyContact.vue'
import Step5ServerInfo from '@/components/registration/Step5ServerInfo.vue'
import { Input } from '@repo/ui'

const props = defineProps<{ retreatId?: string; slug?: string; type: string }>()

const { t } = useI18n()
const { toast } = useToast()
const route = useRoute()
const participantStore = useParticipantStore()

const isTestMode = computed(() => route.query.test === 'true')
const registrationType = computed<'walker' | 'server'>(() =>
	props.type === 'server' ? 'server' : 'walker',
)
const isWalker = computed(() => registrationType.value === 'walker')

const isLoading = ref(true)
const retreatData = ref<any>(null)
const validRetreatId = ref(props.retreatId || '')
const showSuccessScreen = ref(false)
const isSubmitting = ref(false)

const retreatCountry = computed<string | undefined>(() => retreatData.value?.country || undefined)
const mealChargesEnabled = computed(() => Number(retreatData.value?.mealCost) > 0)
const isRegistrationClosed = computed(() => Boolean(retreatData.value?.isRegistrationClosed))

// ---------- Estado del formulario ----------

const spouseInitial = () => ({
	firstName: '',
	lastName: '',
	nickname: '',
	birthDate: '',
	maritalStatus: 'C' as const,
	parish: '',
	homePhone: '',
	workPhone: '',
	cellPhone: '',
	email: '',
	occupation: '',
	acceptedPrivacyNotice: false,
	snores: undefined as boolean | undefined,
	hasMedication: undefined as boolean | undefined,
	medicationDetails: '',
	medicationSchedule: '',
	hasDietaryRestrictions: undefined as boolean | undefined,
	dietaryRestrictionsDetails: '',
	hasDisability: undefined as boolean | undefined,
	disabilitySupport: '',
	sacraments: (registrationType.value === 'server'
		? ['baptism', 'communion', 'confirmation', 'marriage']
		: ['marriage']) as string[],
	tshirtSize: undefined as string | undefined,
	shirtSizesByType: {} as Record<string, string>,
	shirtSizes: [] as Array<{ shirtTypeId: string; size: string }>,
	takesFridayMeal: false,
	// Contactos de emergencia propios (solo si useDifferentEmergencyContacts).
	emergencyContact1Name: '',
	emergencyContact1Relation: '',
	emergencyContact1HomePhone: '',
	emergencyContact1WorkPhone: '',
	emergencyContact1CellPhone: '',
	emergencyContact1Email: '',
	emergencyContact2Name: '',
	emergencyContact2Relation: '',
	emergencyContact2HomePhone: '',
	emergencyContact2WorkPhone: '',
	emergencyContact2CellPhone: '',
	emergencyContact2Email: '',
})

const husbandData = ref<Record<string, any>>(spouseInitial())
const wifeData = ref<Record<string, any>>(spouseInitial())

const sharedAddress = ref<Record<string, any>>({
	street: '',
	houseNumber: '',
	postalCode: '',
	neighborhood: '',
	city: 'Ciudad de México',
	state: 'CDMX',
	country: 'MX',
})

const useDifferentEmergencyContacts = ref(false)
const sharedEmergency = ref<Record<string, any>>({
	emergencyContact1Name: '',
	emergencyContact1Relation: '',
	emergencyContact1HomePhone: '',
	emergencyContact1WorkPhone: '',
	emergencyContact1CellPhone: '',
	emergencyContact1Email: '',
	emergencyContact2Name: '',
	emergencyContact2Relation: '',
	emergencyContact2HomePhone: '',
	emergencyContact2WorkPhone: '',
	emergencyContact2CellPhone: '',
	emergencyContact2Email: '',
})

const sharedOther = ref<Record<string, any>>({
	invitedBy: '',
	isInvitedByEmausMember: undefined,
	inviterHomePhone: '',
	inviterWorkPhone: '',
	inviterCellPhone: '',
	inviterEmail: undefined,
	pickupLocation: '',
	arrivesOnOwn: true,
})

const formErrors = reactive<Record<string, string>>({})

// ---------- Pasos ----------

type StepDef = { key: string; label: string }
const steps = computed<StepDef[]>(() => [
	{ key: 'husband-personal', label: t('coupleRegistration.steps.husbandPersonal') },
	{ key: 'wife-personal', label: t('coupleRegistration.steps.wifePersonal') },
	{ key: 'address', label: t('coupleRegistration.steps.address') },
	{ key: 'husband-health', label: t('coupleRegistration.steps.husbandHealth') },
	{ key: 'wife-health', label: t('coupleRegistration.steps.wifeHealth') },
	{ key: 'emergency', label: t('coupleRegistration.steps.emergency') },
	{
		key: 'other',
		label: isWalker.value
			? t('coupleRegistration.steps.otherWalker')
			: t('coupleRegistration.steps.otherServer'),
	},
	{ key: 'summary', label: t('serverRegistration.summary.title') },
])
const currentStep = ref(1)
const totalSteps = computed(() => steps.value.length)
const currentStepKey = computed(() => steps.value[currentStep.value - 1]?.key)
const progressPercent = computed(() =>
	Math.round(((currentStep.value - 1) / (totalSteps.value - 1)) * 100),
)

// ---------- Validación por paso ----------

const requiredEmailField = <T extends z.ZodTypeAny>(schema: T) =>
	z.preprocess((val) => (typeof val === 'string' ? normalizeEmail(val) : val), schema)

const addPhoneIssues = (fields: string[], data: Record<string, any>, ctx: z.RefinementCtx) => {
	for (const field of fields) {
		const result = validatePhoneForCountry(data[field], retreatCountry.value)
		if (!result.valid) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: [field],
				message: phoneValidationMessage(result)!,
			})
		}
	}
}

const personalSchema = z
	.object({
		firstName: z.string().min(1, 'First Name is required'),
		lastName: z.string().min(1, 'Last Name is required'),
		nickname: z.string().min(1, 'Nickname is required'),
		birthDate: z.string().min(1, 'Birth Date is required'),
		maritalStatus: z.enum(['S', 'C', 'D', 'V', 'O']),
		email: requiredEmailField(z.string().email('Invalid email address').min(1, 'Email is required')),
		occupation: z.string().min(1, 'Occupation is required'),
		acceptedPrivacyNotice: z.literal(true, {
			errorMap: () => ({ message: 'Debes aceptar el aviso de privacidad' }),
		}),
	})
	.passthrough()
	.refine((data: any) => data.cellPhone || data.workPhone || data.homePhone, {
		message: 'At least one phone number (Cell, Work, or Home) is required.',
		path: ['phoneNumbers'],
	})
	.superRefine((data, ctx) => {
		addPhoneIssues(['homePhone', 'workPhone', 'cellPhone'], data, ctx)
	})

const addressSchema = z.object({
	street: z.string().min(1, 'Street is required'),
	houseNumber: z.string().min(1, 'House Number is required'),
	postalCode: z.string().min(1, 'Postal Code is required'),
	neighborhood: z.string().min(1, 'Neighborhood is required'),
	city: z.string().min(1, 'City is required'),
	state: z.string().min(1, 'State is required'),
	country: z.string().min(1, 'Country is required'),
})

const healthSchema = z
	.object({
		snores: z.boolean({ required_error: 'This field is required' }),
		hasMedication: z.boolean({ required_error: 'This field is required' }),
		medicationDetails: z.string().optional(),
		medicationSchedule: z.string().optional(),
		hasDietaryRestrictions: z.boolean({ required_error: 'This field is required' }),
		dietaryRestrictionsDetails: z.string().optional(),
		hasDisability: z.boolean().optional(),
		disabilitySupport: z.string().optional(),
		sacraments: z
			.array(z.enum(['baptism', 'communion', 'confirmation', 'marriage', 'none']))
			.min(1, 'At least one sacrament must be selected'),
	})
	.passthrough()
	.refine((d: any) => !d.hasMedication || (d.medicationDetails ?? '').trim() !== '', {
		message: 'Medication details are required if you have medication.',
		path: ['medicationDetails'],
	})
	.refine((d: any) => !d.hasMedication || (d.medicationSchedule ?? '').trim() !== '', {
		message: 'Medication schedule is required if you have medication.',
		path: ['medicationSchedule'],
	})
	.refine(
		(d: any) => !d.hasDietaryRestrictions || (d.dietaryRestrictionsDetails ?? '').trim() !== '',
		{
			message: 'Dietary restrictions details are required if you have dietary restrictions.',
			path: ['dietaryRestrictionsDetails'],
		},
	)
	.refine((d: any) => !d.hasDisability || (d.disabilitySupport ?? '').trim() !== '', {
		message: 'Debe seleccionar al menos un tipo de apoyo si tiene capacidad diferente.',
		path: ['disabilitySupport'],
	})

const EMERGENCY_PHONE_FIELDS = [
	'emergencyContact1HomePhone',
	'emergencyContact1WorkPhone',
	'emergencyContact1CellPhone',
	'emergencyContact2HomePhone',
	'emergencyContact2WorkPhone',
	'emergencyContact2CellPhone',
]

const emergencyWalkerSchema = z
	.object({
		emergencyContact1Name: z.string().min(1, 'Emergency Contact 1 Name is required'),
		emergencyContact1Relation: z.string().min(1, 'Emergency Contact 1 Relation is required'),
		emergencyContact1CellPhone: z.string().min(1, 'Cell phone is required for Emergency Contact 1'),
		emergencyContact2Name: z.string().min(1, 'Emergency Contact 2 Name is required'),
		emergencyContact2Relation: z.string().min(1, 'Emergency Contact 2 Relation is required'),
		emergencyContact2CellPhone: z.string().min(1, 'Cell phone is required for Emergency Contact 2'),
	})
	.passthrough()
	.superRefine((data, ctx) => {
		addPhoneIssues(EMERGENCY_PHONE_FIELDS, data, ctx)
	})

const emergencyServerSchema = z
	.object({})
	.passthrough()
	.superRefine((data, ctx) => {
		addPhoneIssues(EMERGENCY_PHONE_FIELDS, data, ctx)
	})

const emergencySchema = computed(() =>
	isWalker.value ? emergencyWalkerSchema : emergencyServerSchema,
)

const clearErrors = () => {
	for (const key in formErrors) delete formErrors[key]
}

const applyZodErrors = (error: z.ZodError) => {
	const messages: string[] = []
	error.errors.forEach((e) => {
		const path = e.path.join('.')
		formErrors[path] = e.message
		messages.push(`${path} - ${e.message}`)
	})
	return messages
}

const scrollToFirstError = async () => {
	await nextTick()
	const container = document.querySelector('[data-registration-step]') ?? document
	const target = container.querySelector('.border-red-500') as HTMLElement | null
	if (!target) return
	if (typeof target.scrollIntoView === 'function') {
		target.scrollIntoView({ behavior: 'smooth', block: 'center' })
	}
}

const validateCurrentStep = (): boolean => {
	clearErrors()
	const key = currentStepKey.value
	let result: { success: boolean; error?: z.ZodError } = { success: true }

	switch (key) {
		case 'husband-personal':
			result = personalSchema.safeParse(husbandData.value)
			break
		case 'wife-personal':
			result = personalSchema.safeParse(wifeData.value)
			break
		case 'address':
			result = addressSchema.safeParse(sharedAddress.value)
			break
		case 'husband-health':
			result = healthSchema.safeParse(husbandData.value)
			break
		case 'wife-health':
			result = healthSchema.safeParse(wifeData.value)
			break
		case 'emergency': {
			if (useDifferentEmergencyContacts.value) {
				const husbandResult = emergencySchema.value.safeParse(husbandData.value)
				if (!husbandResult.success) {
					result = husbandResult
					break
				}
				result = emergencySchema.value.safeParse(wifeData.value)
			} else {
				result = emergencySchema.value.safeParse(sharedEmergency.value)
			}
			break
		}
		case 'other': {
			if (isWalker.value) {
				if (!husbandData.value.tshirtSize) {
					formErrors['husband.tshirtSize'] = t('walkerRegistration.fields.tshirtSize.label')
				}
				if (!wifeData.value.tshirtSize) {
					formErrors['wife.tshirtSize'] = t('walkerRegistration.fields.tshirtSize.label')
				}
				const inviterCheck = z
					.object({})
					.passthrough()
					.superRefine((data, ctx) => {
						addPhoneIssues(
							['inviterHomePhone', 'inviterWorkPhone', 'inviterCellPhone'],
							data,
							ctx,
						)
					})
					.safeParse(sharedOther.value)
				if (!inviterCheck.success) applyZodErrors(inviterCheck.error)
				result = { success: Object.keys(formErrors).length === 0 }
			}
			break
		}
	}

	if (!result.success) {
		if (result.error) applyZodErrors(result.error)
		toast({
			title: t('coupleRegistration.validationError'),
			description: Object.entries(formErrors)
				.map(([k, v]) => `${k} - ${v}`)
				.join('\n'),
			variant: 'destructive',
		})
		return false
	}
	return true
}

const nextStep = () => {
	if (!validateCurrentStep()) {
		scrollToFirstError()
		return
	}
	// Conveniencia: al pasar de los datos de él a los de ella, pre-llenar los
	// campos que un matrimonio suele compartir (email y apellido), editables.
	if (currentStepKey.value === 'husband-personal') {
		if (!wifeData.value.email) wifeData.value.email = husbandData.value.email
		if (!wifeData.value.lastName) wifeData.value.lastName = husbandData.value.lastName
	}
	if (currentStep.value < totalSteps.value) currentStep.value++
}

const prevStep = () => {
	if (currentStep.value > 1) currentStep.value--
}

// ---------- Draft (localStorage) ----------

const draftKey = computed(
	() =>
		`registration-draft:couple:${registrationType.value}:${validRetreatId.value || props.retreatId || props.slug || 'unknown'}`,
)

function saveDraft() {
	try {
		const strip = (obj: Record<string, any>) => {
			const { acceptedPrivacyNotice: _a, ...rest } = obj
			return rest
		}
		localStorage.setItem(
			draftKey.value,
			JSON.stringify({
				husband: strip(husbandData.value),
				wife: strip(wifeData.value),
				address: sharedAddress.value,
				emergency: sharedEmergency.value,
				other: sharedOther.value,
				useDifferentEmergencyContacts: useDifferentEmergencyContacts.value,
				step: currentStep.value,
				savedAt: Date.now(),
			}),
		)
	} catch {
		// localStorage puede estar lleno o deshabilitado
	}
}

function loadDraft() {
	try {
		const raw = localStorage.getItem(draftKey.value)
		if (!raw) return
		const parsed = JSON.parse(raw)
		if (!parsed || (parsed.savedAt && Date.now() - parsed.savedAt > 7 * 24 * 60 * 60 * 1000)) {
			localStorage.removeItem(draftKey.value)
			return
		}
		if (parsed.husband) husbandData.value = { ...husbandData.value, ...parsed.husband }
		if (parsed.wife) wifeData.value = { ...wifeData.value, ...parsed.wife }
		if (parsed.address) sharedAddress.value = { ...sharedAddress.value, ...parsed.address }
		if (parsed.emergency) sharedEmergency.value = { ...sharedEmergency.value, ...parsed.emergency }
		if (parsed.other) sharedOther.value = { ...sharedOther.value, ...parsed.other }
		if (typeof parsed.useDifferentEmergencyContacts === 'boolean') {
			useDifferentEmergencyContacts.value = parsed.useDifferentEmergencyContacts
		}
	} catch {
		// draft corrupto: se ignora
	}
}

function clearDraft() {
	try {
		localStorage.removeItem(draftKey.value)
	} catch {
		// localStorage deshabilitado — seguro ignorar
	}
}

watch([husbandData, wifeData, sharedAddress, sharedEmergency, sharedOther], saveDraft, {
	deep: true,
})

// ---------- Playeras (walker) ----------

const FALLBACK_SIZES = ['S', 'M', 'G', 'X', '2']
const walkerShirtType = computed(() => {
	const types: any[] = retreatData.value?.shirtTypes || []
	if (types.length === 0) return null
	return (
		types.find((t: any) => t.requiredForWalkers) ||
		[...types].sort((a: any, b: any) => a.sortOrder - b.sortOrder)[0]
	)
})
const walkerSizes = computed<string[]>(() => {
	const type = walkerShirtType.value
	if (!type || !type.availableSizes || type.availableSizes.length === 0) return FALLBACK_SIZES
	return type.availableSizes
})

// ---------- Submit ----------

const buildSpousePayload = (spouse: Record<string, any>) => {
	const {
		hasDisability: _hd,
		shirtSizesByType: _sbt,
		acceptedPrivacyNotice: _apn,
		...base
	} = spouse

	const payload: Record<string, any> = {
		...base,
		...sharedAddress.value,
		...(useDifferentEmergencyContacts.value ? {} : sharedEmergency.value),
	}

	if (isWalker.value) {
		Object.assign(payload, sharedOther.value)
		// tshirtSize legacy + mapeo al shirt type del retiro (igual que el flujo individual)
		if (payload.tshirtSize && walkerShirtType.value) {
			payload.shirtSizes = [
				{ shirtTypeId: walkerShirtType.value.id, size: payload.tshirtSize },
			]
		}
	} else {
		// Servidores: shirtSizes ya viene armado por Step5ServerInfo desde shirtSizesByType
		delete payload.isAngelito
		delete payload.availability
	}

	// Campos vacíos opcionales con formato → undefined (Zod los rechaza como '')
	for (const key of ['inviterEmail', 'emergencyContact1Email', 'emergencyContact2Email']) {
		if (payload[key] === '' || payload[key] === null) payload[key] = undefined
	}

	return payload
}

const handleSubmit = async () => {
	if (isSubmitting.value) return
	// Revalidar los pasos con contenido antes de enviar.
	for (let step = 1; step < totalSteps.value; step++) {
		currentStep.value = step
		if (!validateCurrentStep()) {
			scrollToFirstError()
			return
		}
	}
	currentStep.value = totalSteps.value
	clearErrors()

	const body = {
		retreatId: validRetreatId.value,
		type: registrationType.value,
		acceptedPrivacyNotice: true,
		husband: buildSpousePayload(husbandData.value),
		wife: buildSpousePayload(wifeData.value),
	}

	isSubmitting.value = true
	try {
		const recaptchaToken = await getRecaptchaToken(RECAPTCHA_ACTIONS.PARTICIPANT_REGISTER)

		if (isTestMode.value) {
			const dryRunResult = await participantStore.createCoupleParticipant(
				body,
				recaptchaToken,
				true,
			)
			toast({
				title: dryRunResult?.valid
					? t('coupleRegistration.dryRunOk')
					: t('coupleRegistration.validationError'),
				description: dryRunResult?.valid
					? dryRunResult?.warnings?.join('\n') || ''
					: dryRunResult?.error || '',
				variant: dryRunResult?.valid ? 'default' : 'destructive',
			})
			return
		}

		const result = await participantStore.createCoupleParticipant(body, recaptchaToken)
		clearDraft()
		showSuccessScreen.value = true
		if (result?.husband?.type === 'waiting') {
			toast({
				title: t('coupleRegistration.waitingTitle'),
				description: t('coupleRegistration.waitingMessage'),
			})
		} else {
			toast({ title: t('coupleRegistration.successTitle') })
		}
	} catch {
		// El store ya mostró el toast del error (409 incluido).
	} finally {
		isSubmitting.value = false
	}
}

// ---------- Resumen ----------

type SummaryRow = { label: string; husband?: string; wife?: string }
const summaryRows = computed<SummaryRow[]>(() => {
	const yesNo = (v: any) => (v ? t('common.yes') : t('common.no'))
	return [
		{
			label: t('serverRegistration.fields.firstName'),
			husband: `${husbandData.value.firstName} ${husbandData.value.lastName}`,
			wife: `${wifeData.value.firstName} ${wifeData.value.lastName}`,
		},
		{
			label: t('serverRegistration.fields.email'),
			husband: husbandData.value.email,
			wife: wifeData.value.email,
		},
		{
			label: t('serverRegistration.fields.cellPhone'),
			husband: husbandData.value.cellPhone,
			wife: wifeData.value.cellPhone,
		},
		{
			label: t('serverRegistration.fields.snores'),
			husband: yesNo(husbandData.value.snores),
			wife: yesNo(wifeData.value.snores),
		},
		{
			label: t('serverRegistration.fields.hasMedication'),
			husband: yesNo(husbandData.value.hasMedication),
			wife: yesNo(wifeData.value.hasMedication),
		},
		...(isWalker.value
			? [
					{
						label: t('walkerRegistration.fields.tshirtSize.label'),
						husband: husbandData.value.tshirtSize,
						wife: wifeData.value.tshirtSize,
					},
					{
						label: t('walkerRegistration.fields.invitedBy'),
						husband: sharedOther.value.invitedBy,
						wife: sharedOther.value.invitedBy,
					},
				]
			: []),
	]
})

// ---------- Carga del retiro ----------

onMounted(async () => {
	try {
		let response: Response
		if (props.slug) {
			response = await fetch(`${getApiUrl()}/retreats/public/slug/${props.slug}`)
		} else if (props.retreatId) {
			response = await fetch(`${getApiUrl()}/retreats/public/${props.retreatId}`)
		} else {
			throw new Error('No retreat identifier provided')
		}
		if (response.ok) {
			const retreat = await response.json()
			if (retreat && retreat.isPublic) {
				validRetreatId.value = retreat.id
				retreatData.value = retreat
				loadDraft()
			}
		}
	} catch {
		retreatData.value = null
	} finally {
		isLoading.value = false
	}
})
</script>

<template>
	<div class="min-h-screen bg-muted/30 py-6 px-3 sm:px-6">
		<div class="max-w-3xl mx-auto space-y-4">
			<div v-if="isLoading" class="flex justify-center py-20">
				<div class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
			</div>

			<Card v-else-if="!retreatData">
				<CardHeader>
					<CardTitle>{{ $t('coupleRegistration.retreatNotFoundTitle') }}</CardTitle>
					<CardDescription>{{ $t('coupleRegistration.retreatNotFoundMessage') }}</CardDescription>
				</CardHeader>
			</Card>

			<Card v-else-if="isRegistrationClosed">
				<CardHeader>
					<CardTitle>{{ retreatData.parish }}</CardTitle>
					<CardDescription>{{ $t('coupleRegistration.registrationClosed') }}</CardDescription>
				</CardHeader>
			</Card>

			<Card v-else-if="showSuccessScreen" data-testid="couple-success">
				<CardHeader>
					<CardTitle>{{ $t('coupleRegistration.successTitle') }}</CardTitle>
					<CardDescription>{{ $t('coupleRegistration.successMessage') }}</CardDescription>
				</CardHeader>
			</Card>

			<template v-else>
				<Card>
					<CardHeader>
						<CardTitle>{{ retreatData.parish }}</CardTitle>
						<CardDescription>
							{{ $t('coupleRegistration.title') }} —
							{{ isWalker ? $t('coupleRegistration.asWalkers') : $t('coupleRegistration.asServers') }}
						</CardDescription>
					</CardHeader>
				</Card>

				<!-- Progreso -->
				<div class="space-y-1">
					<div class="flex justify-between text-xs text-muted-foreground">
						<span>{{ steps[currentStep - 1]?.label }}</span>
						<span>{{ currentStep }} / {{ totalSteps }}</span>
					</div>
					<div class="h-2 bg-muted rounded-full overflow-hidden">
						<div
							class="h-full bg-primary transition-all"
							:style="{ width: `${progressPercent}%` }"
						/>
					</div>
				</div>

				<div data-registration-step class="space-y-4">
					<!-- 1 y 2: datos personales por cónyuge -->
					<template v-if="currentStepKey === 'husband-personal'">
						<h2 class="text-lg font-semibold">{{ $t('coupleRegistration.husbandSection') }}</h2>
						<Step1PersonalInfo v-model="husbandData" :errors="formErrors" />
					</template>
					<template v-else-if="currentStepKey === 'wife-personal'">
						<h2 class="text-lg font-semibold">{{ $t('coupleRegistration.wifeSection') }}</h2>
						<Step1PersonalInfo v-model="wifeData" :errors="formErrors" />
					</template>

					<!-- 3: dirección compartida -->
					<template v-else-if="currentStepKey === 'address'">
						<p class="text-sm text-muted-foreground">
							{{ $t('coupleRegistration.sharedAddressHint') }}
						</p>
						<Step2AddressInfo v-model="sharedAddress" :errors="formErrors" />
					</template>

					<!-- 4 y 5: salud por cónyuge -->
					<template v-else-if="currentStepKey === 'husband-health'">
						<h2 class="text-lg font-semibold">{{ $t('coupleRegistration.husbandSection') }}</h2>
						<Step3ServiceInfo
							v-model="husbandData"
							:errors="formErrors"
							:type="registrationType"
						/>
					</template>
					<template v-else-if="currentStepKey === 'wife-health'">
						<h2 class="text-lg font-semibold">{{ $t('coupleRegistration.wifeSection') }}</h2>
						<Step3ServiceInfo v-model="wifeData" :errors="formErrors" :type="registrationType" />
					</template>

					<!-- 6: contactos de emergencia -->
					<template v-else-if="currentStepKey === 'emergency'">
						<button
							type="button"
							class="w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-all"
							:class="useDifferentEmergencyContacts ? 'border-primary bg-primary/5' : 'border-input bg-background hover:bg-accent/50'"
							data-testid="toggle-different-emergency"
							@click="useDifferentEmergencyContacts = !useDifferentEmergencyContacts"
						>
							<div
								class="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors"
								:class="useDifferentEmergencyContacts ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 bg-background'"
							>
								<svg
									v-if="useDifferentEmergencyContacts"
									class="w-3.5 h-3.5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
								</svg>
							</div>
							<span class="text-sm font-medium">
								{{ $t('coupleRegistration.useDifferentEmergencyContacts') }}
							</span>
						</button>

						<template v-if="useDifferentEmergencyContacts">
							<h2 class="text-lg font-semibold">{{ $t('coupleRegistration.husbandSection') }}</h2>
							<Step4EmergencyContact
								v-model="husbandData"
								:errors="formErrors"
								:type="registrationType"
							/>
							<h2 class="text-lg font-semibold">{{ $t('coupleRegistration.wifeSection') }}</h2>
							<Step4EmergencyContact
								v-model="wifeData"
								:errors="formErrors"
								:type="registrationType"
							/>
						</template>
						<Step4EmergencyContact
							v-else
							v-model="sharedEmergency"
							:errors="formErrors"
							:type="registrationType"
						/>
					</template>

					<!-- 7: playeras + invitación (walker) o info de servidor por cónyuge -->
					<template v-else-if="currentStepKey === 'other'">
						<template v-if="isWalker">
							<Card>
								<CardHeader>
									<CardTitle>{{ $t('coupleRegistration.shirtsTitle') }}</CardTitle>
								</CardHeader>
								<CardContent class="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div>
										<Label>
											{{ $t('coupleRegistration.husbandShirtSize') }}
											<span v-if="walkerShirtType" class="text-muted-foreground font-normal">
												({{ walkerShirtType.name }})
											</span>
										</Label>
										<Select v-model="husbandData.tshirtSize">
											<SelectTrigger :class="{ 'border-red-500': !!formErrors['husband.tshirtSize'] }">
												<SelectValue
													:placeholder="$t('walkerRegistration.fields.tshirtSize.placeholder')"
												/>
											</SelectTrigger>
											<SelectContent>
												<SelectItem v-for="s in walkerSizes" :key="s" :value="s">{{ s }}</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div>
										<Label>
											{{ $t('coupleRegistration.wifeShirtSize') }}
											<span v-if="walkerShirtType" class="text-muted-foreground font-normal">
												({{ walkerShirtType.name }})
											</span>
										</Label>
										<Select v-model="wifeData.tshirtSize">
											<SelectTrigger :class="{ 'border-red-500': !!formErrors['wife.tshirtSize'] }">
												<SelectValue
													:placeholder="$t('walkerRegistration.fields.tshirtSize.placeholder')"
												/>
											</SelectTrigger>
											<SelectContent>
												<SelectItem v-for="s in walkerSizes" :key="s" :value="s">{{ s }}</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>{{ $t('coupleRegistration.inviterTitle') }}</CardTitle>
								</CardHeader>
								<CardContent class="space-y-4">
									<div>
										<Label for="invitedBy">{{ $t('walkerRegistration.fields.invitedBy') }}</Label>
										<Input id="invitedBy" v-model="sharedOther.invitedBy" />
									</div>
									<div>
										<Label for="inviterCellPhone">
											{{ $t('walkerRegistration.fields.inviterCellPhone') }}
										</Label>
										<Input
											id="inviterCellPhone"
											v-model="sharedOther.inviterCellPhone"
											type="tel"
											inputmode="numeric"
											:class="{ 'border-red-500': !!formErrors['inviterCellPhone'] }"
										/>
										<p v-if="formErrors['inviterCellPhone']" class="text-red-500 text-sm mt-1">
											{{ formErrors['inviterCellPhone'] }}
										</p>
									</div>
									<div>
										<Label for="inviterEmail">
											{{ $t('walkerRegistration.fields.inviterEmail') }}
										</Label>
										<Input id="inviterEmail" v-model="sharedOther.inviterEmail" type="email" />
									</div>
									<div>
										<Label for="pickupLocation">
											{{ $t('walkerRegistration.fields.pickupLocation') }}
										</Label>
										<Input id="pickupLocation" v-model="sharedOther.pickupLocation" />
									</div>
								</CardContent>
							</Card>
						</template>
						<template v-else>
							<h2 class="text-lg font-semibold">{{ $t('coupleRegistration.husbandSection') }}</h2>
							<Step5ServerInfo
								v-model="husbandData"
								:errors="formErrors"
								:shirt-types="retreatData?.shirtTypes"
								:retreat-start-date="retreatData?.startDate"
								:retreat-end-date="retreatData?.endDate"
								:meal-charges-enabled="mealChargesEnabled"
								:allow-angelito="false"
							/>
							<h2 class="text-lg font-semibold">{{ $t('coupleRegistration.wifeSection') }}</h2>
							<Step5ServerInfo
								v-model="wifeData"
								:errors="formErrors"
								:shirt-types="retreatData?.shirtTypes"
								:retreat-start-date="retreatData?.startDate"
								:retreat-end-date="retreatData?.endDate"
								:meal-charges-enabled="mealChargesEnabled"
								:allow-angelito="false"
							/>
						</template>
					</template>

					<!-- 8: resumen lado a lado -->
					<template v-else-if="currentStepKey === 'summary'">
						<Card>
							<CardHeader>
								<CardTitle>{{ $t('serverRegistration.summary.title') }}</CardTitle>
							</CardHeader>
							<CardContent>
								<div class="overflow-x-auto">
									<table class="w-full text-sm">
										<thead>
											<tr class="border-b">
												<th class="text-left py-2 pr-2 font-medium" />
												<th class="text-left py-2 pr-2 font-medium">
													{{ $t('coupleRegistration.husband') }}
												</th>
												<th class="text-left py-2 font-medium">
													{{ $t('coupleRegistration.wife') }}
												</th>
											</tr>
										</thead>
										<tbody>
											<tr v-for="row in summaryRows" :key="row.label" class="border-b last:border-0">
												<td class="py-2 pr-2 text-muted-foreground">{{ row.label }}</td>
												<td class="py-2 pr-2">{{ row.husband || '-' }}</td>
												<td class="py-2">{{ row.wife || '-' }}</td>
											</tr>
										</tbody>
									</table>
								</div>
							</CardContent>
						</Card>
					</template>
				</div>

				<!-- Navegación -->
				<div class="flex justify-between pt-2">
					<Button variant="outline" :disabled="currentStep === 1" @click="prevStep">
						{{ $t('common.previous') }}
					</Button>
					<Button v-if="currentStep < totalSteps" data-testid="couple-next" @click="nextStep">
						{{ $t('common.next') }}
					</Button>
					<Button
						v-else
						:disabled="isSubmitting"
						data-testid="couple-submit"
						@click="handleSubmit"
					>
						{{ $t('common.submit') }}
					</Button>
				</div>
			</template>
		</div>
	</div>
</template>
