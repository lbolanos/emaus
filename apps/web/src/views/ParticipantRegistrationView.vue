<script setup lang="ts">
import { computed, ref, watch, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useToast } from '@repo/ui'
import { z } from 'zod'
import { participantSchema, Participant } from '@repo/types'
import { useParticipantStore } from '@/stores/participantStore'
import { getApiUrl } from '@/config/runtimeConfig'
import { getRecaptchaToken, RECAPTCHA_ACTIONS } from '@/services/recaptcha'
import { checkParticipantExists, confirmExistingRegistration } from '@/services/api'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui'
import { Button } from '@repo/ui'
import { Input } from '@repo/ui'
import { Label } from '@repo/ui'
import { Checkbox } from '@repo/ui'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@repo/ui'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@repo/ui'

import { storeLocale } from '@/i18n'
import Step1PersonalInfo from '@/components/registration/Step1PersonalInfo.vue'
import Step2AddressInfo from '@/components/registration/Step2AddressInfo.vue'
import Step3ServiceInfo from '@/components/registration/Step3ServiceInfo.vue'
import Step4EmergencyContact from '@/components/registration/Step4EmergencyContact.vue'
import Step5OtherInfo from '@/components/registration/Step5OtherInfo.vue'
import Step5ServerInfo from '@/components/registration/Step5ServerInfo.vue'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui'

const props = defineProps<{ retreatId?: string; slug?: string; type: string }>()
const participantStore = useParticipantStore()
const route = useRoute()
const { t, locale } = useI18n()
const { toast } = useToast()

const isTestMode = computed(() => route.query.test === 'true')

const switchLocale = (lang: string) => {
  locale.value = lang
  storeLocale(lang)
}

const validRetreatId = ref(props.retreatId || '')
const isLoading = ref(true)
const retreatData = ref<any>(null)

const getInitialFormData = (): Partial<Omit<Participant, 'id'>> & { hasDisability?: boolean; isAngelito?: boolean } => ({
  retreatId: validRetreatId.value,
  type: props.type as 'walker' | 'server' | 'waiting' | 'partial_server',
  sacraments: (props.type === 'server' || props.type === 'partial_server')
    ? ['baptism', 'communion', 'confirmation']
    : [],
  firstName: '',
  registrationDate: undefined,
  lastName: '',
  nickname: '',
  birthDate: new Date(),
  maritalStatus: undefined,
  street: '',
  houseNumber: '',
  postalCode: '',
  neighborhood: '',
  city: 'Ciudad de México',
  state: 'CDMX',
  country: 'MX',
  parish: '',
  homePhone: '',
  workPhone: '',
  cellPhone: '',
  email: '',
  occupation: '',
  snores: undefined,
  hasMedication: undefined,
  medicationDetails: '',
  medicationSchedule: '',
  hasDietaryRestrictions: undefined,
  dietaryRestrictionsDetails: '',
  hasDisability: undefined,
  disabilitySupport: '',
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
  tshirtSize: undefined,
  needsWhiteShirt: null,
  needsBlueShirt: null,
  needsJacket: null,
  invitedBy: '',
  isInvitedByEmausMember: undefined,
  inviterHomePhone: '',
  inviterWorkPhone: '',
  inviterCellPhone: '',
  inviterEmail: undefined,
  pickupLocation: '',
  arrivesOnOwn: true,
  isAngelito: false,
  acceptedPrivacyNotice: false,
})

const formData = ref(getInitialFormData())

const isServerType = computed(() => props.type === 'server' || props.type === 'partial_server')
const isRegistrationClosed = computed(() => Boolean(retreatData.value?.isRegistrationClosed))
const showEmailLookup = ref(false)
const emailLookup = ref('')
const isSearching = ref(false)

const existingParticipantName = ref('')
const isConfirming = ref(false)
const showSuccessScreen = ref(false)
const lookupShirtSizes = ref<Record<string, string>>({})

const lookupVisibleShirtTypes = computed(() => {
  const types = retreatData.value?.shirtTypes || []
  return [...types]
    .filter((t: any) => t.optionalForServers)
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
})

const isDialogOpen = ref(false)
const currentStep = ref(1)
const totalSteps = computed(() => 6)
const completedSteps = ref(new Set<number>())

const stepLabels = computed(() => [
  t('serverRegistration.tabs.personalInfo'),
  t('serverRegistration.tabs.addressInfo'),
  t('serverRegistration.tabs.serviceInfo'),
  t('serverRegistration.tabs.emergencyContact'),
  props.type === 'walker' ? t('walkerRegistration.tabs.otherInfo') : t('serverRegistration.tabs.serverInfo'),
  t('serverRegistration.summary.title'),
])
const progressPercent = computed(() => Math.round(((currentStep.value - 1) / (totalSteps.value - 1)) * 100))

const draftKey = computed(() => `registration-draft:${props.type}:${validRetreatId.value || props.retreatId || props.slug || 'unknown'}`)

const formErrors = reactive<Record<string, string>>({})

// Define schemas for each new step
const step1Schema = z.object({
  firstName: z.string().min(1, 'First Name is required'),
  lastName: z.string().min(1, 'Last Name is required'),
  nickname: z.string().min(1, 'Nickname is required'),
  birthDate: z.string().min(1, 'Birth Date is required'),
  maritalStatus: z.enum(['S', 'C', 'D', 'V', 'O']),
  parish: z.string().optional(),
  homePhone: z.string().optional(),
  workPhone: z.string().optional(),
  cellPhone: z.string().optional(),
  email: z.string().email('Invalid email address').min(1, 'Email is required'),
  occupation: z.string().min(1, 'Occupation is required'),
  acceptedPrivacyNotice: z.literal(true, {
    errorMap: () => ({ message: 'Debes aceptar el aviso de privacidad' }),
  }),
}).refine(data => data.cellPhone || data.workPhone || data.homePhone, {
  message: 'At least one phone number (Cell, Work, or Home) is required.',
  path: ['phoneNumbers'],
})

const step2Schema = z.object({
  street: z.string().min(1, 'Street is required'),
  houseNumber: z.string().min(1, 'House Number is required'),
  postalCode: z.string().min(1, 'Postal Code is required'),
  neighborhood: z.string().min(1, 'Neighborhood is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  country: z.string().min(1, 'Country is required'),
})

const sacramentsField = isServerType.value
  ? z.array(z.enum(['baptism', 'communion', 'confirmation', 'marriage', 'none'])).optional()
  : z.array(z.enum(['baptism', 'communion', 'confirmation', 'marriage', 'none'])).min(1, 'At least one sacrament must be selected')

const step3Schema = z.object({
  snores: z.boolean({ required_error: 'This field is required' }),
  hasMedication: z.boolean({ required_error: 'This field is required' }),
  medicationDetails: z.string().optional(),
  medicationSchedule: z.string().optional(),
  hasDietaryRestrictions: z.boolean({ required_error: 'This field is required' }),
  dietaryRestrictionsDetails: z.string().optional(),
  hasDisability: z.boolean().optional(),
  disabilitySupport: z.string().optional(),
  sacraments: sacramentsField,
}).refine((data) => {
  if (data.hasMedication && (!data.medicationDetails || data.medicationDetails.trim() === '')) {
    return false
  }
  return true
}, {
  message: 'Medication details are required if you have medication.',
  path: ['medicationDetails'],
}).refine((data) => {
  if (data.hasMedication && (!data.medicationSchedule || data.medicationSchedule.trim() === '')) {
    return false
  }
  return true
}, {
  message: 'Medication schedule is required if you have medication.',
  path: ['medicationSchedule'],
}).refine((data) => {
  if (data.hasDietaryRestrictions && (!data.dietaryRestrictionsDetails || data.dietaryRestrictionsDetails.trim() === '')) {
    return false
  }
  return true
}, {
  message: 'Dietary restrictions details are required if you have dietary restrictions.',
  path: ['dietaryRestrictionsDetails'],
}).refine((data) => {
  if (data.hasDisability && (!data.disabilitySupport || data.disabilitySupport.trim() === '')) {
    return false
  }
  return true
}, {
  message: 'Debe seleccionar al menos un tipo de apoyo si tiene capacidad diferente.',
  path: ['disabilitySupport'],
})

// For servers: emergency contacts are optional
const step4ServerSchema = z.object({
  emergencyContact1Name: z.string().optional(),
  emergencyContact1Relation: z.string().optional(),
  emergencyContact1HomePhone: z.string().optional(),
  emergencyContact1WorkPhone: z.string().optional(),
  emergencyContact1CellPhone: z.string().optional(),
  emergencyContact1Email: z.preprocess(
    val => (val === '' ? undefined : val),
    z.string().email({ message: 'Invalid email address' }).optional(),
  ),
  emergencyContact2Name: z.string().optional(),
  emergencyContact2Relation: z.string().optional(),
  emergencyContact2HomePhone: z.string().optional(),
  emergencyContact2WorkPhone: z.string().optional(),
  emergencyContact2CellPhone: z.string().optional(),
  emergencyContact2Email: z.preprocess(
    val => (val === '' ? undefined : val),
    z.string().email({ message: 'Invalid email address' }).optional(),
  ),
})

// For walkers: 2 emergency contacts required, each with email and cell phone
const step4WalkerSchema = z.object({
  emergencyContact1Name: z.string().min(1, 'Emergency Contact 1 Name is required'),
  emergencyContact1Relation: z.string().min(1, 'Emergency Contact 1 Relation is required'),
  emergencyContact1HomePhone: z.string().optional(),
  emergencyContact1WorkPhone: z.string().optional(),
  emergencyContact1CellPhone: z.string().min(1, 'Cell phone is required for Emergency Contact 1'),
  emergencyContact1Email: z.preprocess(
    val => (val === '' ? undefined : val),
    z.string().email({ message: 'Invalid email address' }).min(1, 'Email is required for Emergency Contact 1'),
  ),
  emergencyContact2Name: z.string().min(1, 'Emergency Contact 2 Name is required'),
  emergencyContact2Relation: z.string().min(1, 'Emergency Contact 2 Relation is required'),
  emergencyContact2HomePhone: z.string().optional(),
  emergencyContact2WorkPhone: z.string().optional(),
  emergencyContact2CellPhone: z.string().min(1, 'Cell phone is required for Emergency Contact 2'),
  emergencyContact2Email: z.preprocess(
    val => (val === '' ? undefined : val),
    z.string().email({ message: 'Invalid email address' }).min(1, 'Email is required for Emergency Contact 2'),
  ),
})

const step5WalkerSchema = z.object({
  tshirtSize: z.string({ required_error: 'T-shirt size is required' }).min(1, 'T-shirt size is required'),
  invitedBy: z.string().optional(),
  isInvitedByEmausMember: z.boolean().optional(),
  inviterHomePhone: z.string().optional(),
  inviterWorkPhone: z.string().optional(),
  inviterCellPhone: z.string().optional(),
  inviterEmail: z.preprocess(
    val => (val === '' ? undefined : val),
    z.string().email({ message: 'Invalid inviter email address' }).optional(),
  ),
  pickupLocation: z.string().optional(),
  arrivesOnOwn: z.boolean().optional(),
})

const step5ServerSchema = z.object({
  shirtSizes: z
    .array(z.object({ shirtTypeId: z.string(), size: z.string().min(1) }))
    .optional(),
})

const stepSchemas = computed(() => {
  const schemas: any[] = [step1Schema, step2Schema, step3Schema]
  if (props.type === 'walker') {
    schemas.push(step4WalkerSchema)
    schemas.push(step5WalkerSchema)
  } else {
    schemas.push(step4ServerSchema)
    schemas.push(step5ServerSchema)
  }
  return schemas
})

const validateStep = (step: number) => {
  const schema = stepSchemas.value[step - 1]
  if (!schema) return true

  // Clear previous errors
  for (const key in formErrors) {
    delete formErrors[key]
  }

  const result = schema.safeParse(formData.value)
  if (!result.success) {
    const errors: string[] = []
    result.error.errors.forEach((e: any) => {
      const path = e.path.join('.')
      formErrors[path] = e.message
      errors.push(`${path} - ${e.message}`)
    })
    console.error(`Validation errors in step ${step}:`, result.error.errors)
    toast({
      title: `Please correct the errors in step ${step}`,
      description: errors.join('\n'),
      variant: 'destructive',
    })
    return false
  }
  return true
}

// Watch for changes in formData to clear errors
watch(formData, (newValue, oldValue) => {
  for (const key in formErrors) {
    if (newValue[key as keyof typeof newValue] !== oldValue[key as keyof typeof oldValue]) {
      delete formErrors[key]
    }
  }
}, { deep: true })

const nextStep = () => {
  if (validateStep(currentStep.value)) {
    completedSteps.value.add(currentStep.value)
    if (currentStep.value < totalSteps.value) {
      currentStep.value++
    }
  }
}

const prevStep = () => {
  if (currentStep.value === 1 && isServerType.value) {
    showEmailLookup.value = true
    return
  }
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

const goToStep = (step: number) => {
  if (step === currentStep.value) return
  if (step < currentStep.value || completedSteps.value.has(step - 1)) {
    currentStep.value = step
  }
}

// Auto-save draft to localStorage
const SENSITIVE_KEYS_TO_SKIP = new Set(['acceptedPrivacyNotice'])
function saveDraft() {
  if (!isDialogOpen.value) return
  try {
    const data = { ...formData.value }
    for (const k of SENSITIVE_KEYS_TO_SKIP) delete (data as any)[k]
    localStorage.setItem(draftKey.value, JSON.stringify({ data, step: currentStep.value, savedAt: Date.now() }))
  } catch {
    // localStorage may be full or disabled
  }
}
function loadDraft() {
  try {
    const raw = localStorage.getItem(draftKey.value)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.data) return false
    // Discard drafts older than 7 days
    if (parsed.savedAt && Date.now() - parsed.savedAt > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(draftKey.value)
      return false
    }
    formData.value = { ...formData.value, ...parsed.data, retreatId: validRetreatId.value }
    return true
  } catch {
    return false
  }
}
function clearDraft() {
  try {
    localStorage.removeItem(draftKey.value)
  } catch {
    // localStorage may be disabled (private browsing, quota, etc.) — safe to ignore.
  }
}

watch(formData, saveDraft, { deep: true })
watch(currentStep, saveDraft)

const handleEmailLookup = async () => {
  if (!emailLookup.value || !emailLookup.value.includes('@')) {
    toast({
      title: 'Error',
      description: 'Por favor ingresa un correo electrónico válido.',
      variant: 'destructive',
    })
    return
  }

  isSearching.value = true
  try {
    const recaptchaToken = await getRecaptchaToken(RECAPTCHA_ACTIONS.PARTICIPANT_EMAIL_CHECK)
    const result = await checkParticipantExists(
      emailLookup.value,
      recaptchaToken,
      validRetreatId.value || undefined,
    )

    if (result.registeredInRetreat) {
      const fallback =
        result.registeredGroup === 'walker'
          ? t('serverRegistration.emailLookup.alreadyRegisteredAsWalker')
          : result.registeredGroup === 'server'
            ? t('serverRegistration.emailLookup.alreadyRegisteredAsServer')
            : t('serverRegistration.emailLookup.alreadyRegistered')
      toast({
        title: 'Error',
        description: result.alreadyRegisteredMessage || fallback,
        variant: 'destructive',
      })
      return
    }

    if (result.exists) {
      const name = [result.firstName, result.lastName].filter(Boolean).join(' ')
      existingParticipantName.value = name
      formData.value.email = emailLookup.value
      showEmailLookup.value = false
    } else {
      formData.value.email = emailLookup.value
      toast({ title: t('serverRegistration.emailLookup.notFound') })
      showEmailLookup.value = false
    }
  } catch (error) {
    console.error('Email lookup error:', error)
    // On error, just proceed with the email pre-filled
    formData.value.email = emailLookup.value
    showEmailLookup.value = false
  } finally {
    isSearching.value = false
  }
}

const skipEmailLookup = () => {
  showEmailLookup.value = false
}

const handleConfirmIdentity = async () => {
  isConfirming.value = true
  try {
    const recaptchaToken = await getRecaptchaToken(RECAPTCHA_ACTIONS.PARTICIPANT_REGISTER)
    const effectiveType =
      props.type === 'server' && (formData.value as any).isAngelito
        ? 'partial_server'
        : props.type
    const shirtSizes = Object.entries(lookupShirtSizes.value)
      .filter(([, size]) => size && size !== 'null')
      .map(([shirtTypeId, size]) => ({ shirtTypeId, size }))
    await confirmExistingRegistration(
      emailLookup.value,
      validRetreatId.value,
      effectiveType,
      recaptchaToken,
      shirtSizes,
    )
    // Show success screen briefly before closing
    showSuccessScreen.value = true
    clearDraft()
    setTimeout(() => {
      showSuccessScreen.value = false
      existingParticipantName.value = ''
      isDialogOpen.value = false
    }, 2500)
  } catch (error: any) {
    console.error('Confirm registration error:', error)
    toast({
      title: 'Error',
      description: error.response?.data?.message || 'An unexpected error occurred.',
      variant: 'destructive',
    })
  } finally {
    isConfirming.value = false
  }
}

const handleDenyIdentity = () => {
  existingParticipantName.value = ''
  formData.value.email = emailLookup.value
}

// Reset email lookup when dialog opens for server types
watch(isDialogOpen, (open) => {
  if (open && isServerType.value) {
    showEmailLookup.value = true
    emailLookup.value = ''
    existingParticipantName.value = ''
    lookupShirtSizes.value = {}
  }
  if (open) {
    // Restore draft when dialog opens
    if (loadDraft()) {
      toast({
        title: t('serverRegistration.draft.restoredTitle'),
        description: t('serverRegistration.draft.restoredDesc'),
      })
    }
  }
})

watch(() => props.retreatId, (newRetreatId) => {
  formData.value.retreatId = newRetreatId
}, { immediate: true })

const onSubmit = async () => {
  // Clear previous errors
  for (const key in formErrors) {
    delete formErrors[key]
  }

  // Re-validate ALL steps to catch fields cleared after initial step validation
  for (let step = 1; step <= totalSteps.value - 1; step++) {
    if (!validateStep(step)) {
      currentStep.value = step
      toast({
        title: 'Validation Error',
        description: `Please correct the errors in step ${step}.`,
        variant: 'destructive',
      })
      return
    }
  }

  // Step 1 validation just enforced literal true on acceptedPrivacyNotice.
  // Stamp the acceptance timestamp and re-affirm the boolean so the route validator (and audit log) get a consistent body.
  formData.value.acceptedPrivacyNotice = true
  ;(formData.value as any).acceptedPrivacyNoticeAt = new Date().toISOString()

  // If server marked as angelito, register as partial_server with scholarship (no bed/table/pago)
  if (props.type === 'server' && (formData.value as any).isAngelito) {
    formData.value.type = 'partial_server'
    formData.value.isScholarship = true
  }

  // For servers, make emergency contact fields optional in the final schema
  const baseSchema = participantSchema.omit({ id: true, registrationDate: true, lastUpdatedDate: true });
  const finalSchema = props.type !== 'walker'
    ? baseSchema.extend({
        emergencyContact1Name: z.string().optional(),
        emergencyContact1Relation: z.string().optional(),
        emergencyContact1CellPhone: z.string().optional(),
      })
    : baseSchema;

  const zodResult = finalSchema.safeParse(formData.value)
  if (!zodResult.success) {
    const errors: string[] = []
    zodResult.error.errors.forEach((e: any) => {
      const path = e.path.join('.')
      formErrors[path] = e.message
      errors.push(`${path} - ${e.message}`)
    })
    console.error('Validation Error:', zodResult.error.errors)
    toast({
      title: 'Validation Error',
      description: 'Please review all steps and correct any errors.',
      variant: 'destructive',
    })
    return
  }
  const result = { data: zodResult.data as Omit<Participant, 'id' | 'registrationDate' | 'lastUpdatedDate'> }

  try {
    // Get reCAPTCHA token for bot protection
    const recaptchaToken = await getRecaptchaToken(RECAPTCHA_ACTIONS.PARTICIPANT_REGISTER)

    if (isTestMode.value) {
      const dryRunResult = await participantStore.createParticipant(result.data, recaptchaToken, true)
      const warnings = dryRunResult?.warnings?.length
        ? dryRunResult.warnings.join('\n')
        : ''
      if (dryRunResult?.valid) {
        toast({
          title: 'Validación exitosa',
          description: warnings || 'Todos los datos son válidos. No se guardó nada en la base de datos.',
        })
      } else {
        toast({
          title: 'Validación fallida',
          description: dryRunResult?.error || 'Error de validación',
          variant: 'destructive',
        })
      }
      // Keep form open — don't reset
      return
    }

    await participantStore.createParticipant(result.data, recaptchaToken)
    toast({ title: 'Registration Successful' })
    clearDraft()
    completedSteps.value.clear()
    isDialogOpen.value = false
    currentStep.value = 1
    formData.value = getInitialFormData()
  } catch (error: any) {
    console.error('Submission error:', error)
    if (error.response && error.response.status === 409) {
      toast({
        title: 'Registration Failed',
        description:
          error.response?.data?.message ||
          t('serverRegistration.emailLookup.alreadyRegistered'),
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Submission Failed',
        description: 'An unexpected error occurred during registration.',
        variant: 'destructive',
      })
    }
  }
}

const summaryData = computed(() => {
  const data = [
    { label: 'serverRegistration.fields.firstName', value: formData.value.firstName },
    { label: 'serverRegistration.fields.lastName', value: formData.value.lastName },
    { label: 'serverRegistration.fields.email', value: formData.value.email },
    { label: 'serverRegistration.fields.cellPhone', value: formData.value.cellPhone },
    { label: 'serverRegistration.fields.snores', value: formData.value.snores ? 'common.yes' : 'common.no' },
    { label: 'serverRegistration.fields.hasMedication', value: formData.value.hasMedication ? 'common.yes' : 'common.no' },
    { label: 'serverRegistration.fields.hasDietaryRestrictions', value: formData.value.hasDietaryRestrictions ? 'common.yes' : 'common.no' },
    { label: 'serverRegistration.emergencyContact1', value: `${formData.value.emergencyContact1Name} (${formData.value.emergencyContact1Relation}) - ${formData.value.emergencyContact1CellPhone || formData.value.emergencyContact1WorkPhone || formData.value.emergencyContact1HomePhone}` }
  ]

  if (props.type === 'walker') {
    data.push({ label: 'walkerRegistration.fields.invitedBy', value: formData.value.invitedBy },
              { label: 'walkerRegistration.fields.tshirtSize.label', value: formData.value.tshirtSize }
    )
  } else {
    data.push({ label: 'serverRegistration.fields.needsWhiteShirt', value: (formData.value.needsWhiteShirt === 'null' || !formData.value.needsWhiteShirt) ? 'serverRegistration.fields.noSizeNeeded' : formData.value.needsWhiteShirt })
    data.push({ label: 'serverRegistration.fields.needsBlueShirt', value: (formData.value.needsBlueShirt === 'null' || !formData.value.needsBlueShirt) ? 'serverRegistration.fields.noSizeNeeded' : formData.value.needsBlueShirt })
    data.push({ label: 'serverRegistration.fields.needsJacket', value: (formData.value.needsJacket === 'null' || !formData.value.needsJacket) ? 'serverRegistration.fields.noSizeNeeded' : formData.value.needsJacket })
  }

  return data
})

// Validate retreat ID on mount
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
      } else {
        throw new Error('Retreat not found or not public')
      }
    } else {
      throw new Error('Retreat not found')
    }

    // Update formData with valid retreat ID
    formData.value.retreatId = validRetreatId.value
  } catch (error) {
    toast({
      title: 'Error',
      description: 'Invalid retreat ID or retreat not available for registration. Please check your registration link.',
      variant: 'destructive',
    })
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="relative h-screen w-full">
    <!-- Dry-run test mode banner -->
    <div v-if="isTestMode" class="fixed top-0 left-0 right-0 z-50 bg-yellow-400 text-yellow-900 text-center py-2 px-4 font-bold text-sm shadow-md">
      MODO PRUEBA — Los envíos no se guardarán en la base de datos
    </div>
    <div
      class="absolute inset-0 bg-cover bg-center"
      :class="{ 'pt-10': isTestMode }"
      style="background-image: url('/header_bck.png');"
    >
    
    <div class="relative z-10 flex flex-col items-center justify-center h-full text-white text-center px-4" >
      <div class="absolute top-4 right-4">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon" class="text-white hover:bg-white/20 rounded-full">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <circle cx="4" cy="10" r="2" />
                <circle cx="10" cy="10" r="2" />
                <circle cx="16" cy="10" r="2" />
              </svg>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="switchLocale('es')" :class="{ 'font-bold': locale === 'es' }">
              Espa&#241;ol
            </DropdownMenuItem>
            <DropdownMenuItem @click="switchLocale('en')" :class="{ 'font-bold': locale === 'en' }">
              English
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div v-if="isRegistrationClosed" class="bg-black/20 backdrop-blur-sm rounded-2xl p-8 max-w-2xl mx-auto border border-white/10 shadow-2xl">
        <div class="w-20 h-20 mx-auto mb-6 bg-white/10 rounded-full flex items-center justify-center">
          <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <h1 class="text-3xl md:text-4xl font-bold mb-4">{{ $t('serverRegistration.retreatClosed.title') }}</h1>
        <p class="text-lg md:text-xl opacity-90">{{ $t('serverRegistration.retreatClosed.description') }}</p>
      </div>
      <div v-else class="bg-black/20 backdrop-blur-sm rounded-2xl p-8 max-w-2xl mx-auto border border-white/10 shadow-2xl">
        <div class="mb-6">
          <div class="w-20 h-20 mx-auto mb-6 bg-white/10 rounded-full flex items-center justify-center">
            <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <h1 class="text-4xl md:text-5xl font-bold mb-4">{{ $t( props.type === 'walker' ? 'walkerRegistration.landing.title' : 'serverRegistration.landing.title') }}</h1>
          <p v-if="retreatData?.parish" class="text-2xl md:text-3xl font-semibold mb-3 text-yellow-200">{{ retreatData.parish }}</p>
          <p class="text-lg md:text-xl mb-6 opacity-90">{{ $t( props.type === 'walker' ? 'walkerRegistration.landing.subtitle' : 'serverRegistration.landing.subtitle') }}</p>
        </div>

        <div v-if="props.type === 'walker'" class="mb-8 space-y-4">
          <div class="flex items-center justify-center space-x-3 mb-6">
            <svg class="w-6 h-6 text-yellow-300" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
            </svg>
            <span class="text-lg font-medium">Transforma tu vida</span>
          </div>
          <div class="flex items-center justify-center space-x-3 mb-6">
            <svg class="w-6 h-6 text-green-300" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
            <span class="text-lg font-medium">Encuentra tu propósito</span>
          </div>
          <div class="flex items-center justify-center space-x-3">
            <svg class="w-6 h-6 text-blue-300" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/>
            </svg>
            <span class="text-lg font-medium">Construye amistades para siempre</span>
          </div>
        </div>

        <div class="space-y-4">
          <Dialog v-model:open="isDialogOpen">
            <DialogTrigger as-child>
              <Button size="lg" class="bg-white text-black hover:bg-gray-100 font-semibold text-lg px-8 py-3 rounded-full transition-all duration-300 transform hover:scale-105 shadow-lg" :disabled="isLoading">
                <span v-if="isLoading" class="flex items-center space-x-2">
                  <svg class="animate-spin h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Cargando...</span>
                </span>
                <span v-else class="flex items-center space-x-2">
                  {{ $t('serverRegistration.landing.cta') }}
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path>
                  </svg>
                </span>
              </Button>
            </DialogTrigger>
        <DialogContent class="sm:max-w-[680px] md:max-w-[760px] max-h-[92vh] overflow-y-auto">
          <!-- Success Screen (shown briefly after confirming) -->
          <template v-if="showSuccessScreen">
            <div class="py-12 px-4 flex flex-col items-center justify-center text-center space-y-6">
              <div class="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center animate-[bounceIn_0.5s_ease-out]">
                <svg class="w-10 h-10 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div class="space-y-2">
                <h2 class="text-2xl font-bold text-foreground">{{ $t('serverRegistration.emailLookup.success') }}</h2>
                <p class="text-muted-foreground">{{ existingParticipantName }}</p>
              </div>
            </div>
          </template>

          <!-- Email Lookup Step (for server types) -->
          <template v-else-if="showEmailLookup">
            <DialogHeader>
              <DialogTitle>{{ $t('serverRegistration.emailLookup.title') }}</DialogTitle>
              <DialogDescription>{{ $t('serverRegistration.emailLookup.description') }}</DialogDescription>
            </DialogHeader>
            <div class="px-2 py-6 sm:px-6">
              <div class="flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
                <div class="shrink-0">
                  <svg class="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <Input
                  id="email-lookup"
                  v-model="emailLookup"
                  type="email"
                  class="border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-base p-0 h-auto"
                  :placeholder="$t('serverRegistration.emailLookup.placeholder')"
                  @keyup.enter="handleEmailLookup"
                />
              </div>
            </div>
            <DialogFooter class="gap-2 sm:gap-0">
              <Button variant="ghost" @click="skipEmailLookup" :disabled="isSearching" class="text-muted-foreground">
                {{ $t('serverRegistration.emailLookup.skip') }}
              </Button>
              <Button @click="handleEmailLookup" :disabled="isSearching || !emailLookup.includes('@')">
                <svg v-if="isSearching" class="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <svg v-else class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {{ $t('serverRegistration.emailLookup.search') }}
              </Button>
            </DialogFooter>
          </template>

          <!-- Confirm Identity Screen -->
          <template v-else-if="existingParticipantName">
            <div class="py-8 px-4 sm:px-6 flex flex-col items-center text-center space-y-6">
              <!-- Avatar circle with initials -->
              <div class="w-24 h-24 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                <span class="text-3xl font-bold text-primary">
                  {{ existingParticipantName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() }}
                </span>
              </div>

              <!-- Name and question -->
              <div class="space-y-2">
                <h2 class="text-2xl font-bold text-foreground">
                  {{ $t('serverRegistration.emailLookup.confirmIdentity') }}
                </h2>
                <p class="text-lg text-muted-foreground max-w-md">
                  {{ $t('serverRegistration.emailLookup.confirmMessage', { name: existingParticipantName }) }}
                </p>
              </div>

              <!-- Email shown as context -->
              <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-sm text-muted-foreground">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {{ emailLookup }}
              </div>

              <!-- Angelito toggle for server email-lookup flow -->
              <button
                v-if="props.type === 'server'"
                type="button"
                class="w-full max-w-md flex items-start gap-3 rounded-lg border p-3 text-left transition-all"
                :class="formData.isAngelito
                  ? 'border-purple-400 bg-purple-100 dark:border-purple-600 dark:bg-purple-950'
                  : 'border-purple-200 bg-purple-50 hover:bg-purple-100/70 dark:border-purple-800 dark:bg-purple-950/50'"
                @click="formData.isAngelito = !formData.isAngelito"
              >
                <div
                  class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 mt-0.5 transition-colors"
                  :class="formData.isAngelito
                    ? 'border-purple-600 bg-purple-600 text-white'
                    : 'border-purple-300 bg-white dark:bg-purple-950'"
                >
                  <svg v-if="formData.isAngelito" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div class="space-y-0.5 flex-1">
                  <div class="font-medium text-sm">{{ $t('serverRegistration.fields.isAngelito') }}</div>
                  <p class="text-xs text-muted-foreground">{{ $t('serverRegistration.fields.isAngelitoHint') }}</p>
                </div>
              </button>

              <!-- Shirt size selectors in lookup confirm flow -->
              <div v-if="props.type === 'server' && lookupVisibleShirtTypes.length > 0" class="w-full max-w-md text-left space-y-3 border-t pt-4">
                <p class="text-sm font-medium">{{ $t('serverRegistration.fields.shirtsAskTitle') }}</p>
                <p class="text-xs text-muted-foreground">{{ $t('serverRegistration.fields.shirtsAskHint') }}</p>
                <div v-for="t in lookupVisibleShirtTypes" :key="t.id">
                  <Label :for="`lookup-shirt-${t.id}`">{{ t.name }}</Label>
                  <Select
                    :model-value="lookupShirtSizes[t.id] ?? 'null'"
                    @update:model-value="(v: any) => (lookupShirtSizes[t.id] = v)"
                  >
                    <SelectTrigger :id="`lookup-shirt-${t.id}`">
                      <SelectValue :placeholder="$t('serverRegistration.fields.shirtSizePlaceholder')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="null">{{ $t('serverRegistration.fields.noSizeNeeded') }}</SelectItem>
                      <SelectItem
                        v-for="s in (t.availableSizes && t.availableSizes.length > 0 ? t.availableSizes : ['S','M','G','X','2'])"
                        :key="s"
                        :value="s"
                      >{{ s }}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <!-- Action buttons stacked on mobile, side by side on desktop -->
              <div class="flex flex-col-reverse sm:flex-row gap-3 w-full sm:w-auto pt-2">
                <Button
                  variant="outline"
                  size="lg"
                  @click="handleDenyIdentity"
                  :disabled="isConfirming"
                  class="sm:min-w-[180px]"
                >
                  {{ $t('serverRegistration.emailLookup.denyButton') }}
                </Button>
                <Button
                  size="lg"
                  @click="handleConfirmIdentity"
                  :disabled="isConfirming"
                  class="sm:min-w-[180px]"
                >
                  <svg v-if="isConfirming" class="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <svg v-else class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  {{ $t('serverRegistration.emailLookup.confirmButton') }}
                </Button>
              </div>
            </div>
          </template>

          <!-- Regular Form Steps -->
          <template v-else>
            <DialogHeader class="space-y-3">
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <DialogTitle class="flex flex-wrap items-center gap-2 text-lg">
                    {{ $t( props.type === 'walker' ? 'walkerRegistration.title' : 'serverRegistration.title') }}
                    <span v-if="retreatData?.parish" class="rounded-full bg-primary/10 text-primary text-xs font-semibold px-2.5 py-0.5">{{ retreatData.parish }}</span>
                  </DialogTitle>
                  <DialogDescription class="mt-1">
                    {{ stepLabels[currentStep - 1] }}
                  </DialogDescription>
                </div>
                <span class="shrink-0 rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {{ currentStep }} / {{ totalSteps }}
                </span>
              </div>

              <!-- Progress bar -->
              <div class="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div class="h-full bg-primary transition-all duration-300 ease-out" :style="{ width: progressPercent + '%' }" />
              </div>

              <!-- Step indicator dots (clickable for completed steps) -->
              <div class="flex items-center justify-between gap-1 px-1">
                <button
                  v-for="(label, idx) in stepLabels"
                  :key="idx"
                  type="button"
                  class="group flex flex-col items-center gap-1 flex-1 min-w-0 cursor-pointer disabled:cursor-not-allowed"
                  :disabled="!(idx + 1 === currentStep || idx + 1 < currentStep || completedSteps.has(idx))"
                  @click="goToStep(idx + 1)"
                >
                  <div
                    class="flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors"
                    :class="[
                      currentStep === idx + 1
                        ? 'border-primary bg-primary text-primary-foreground'
                        : completedSteps.has(idx + 1) || idx + 1 < currentStep
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-muted-foreground/30 bg-background text-muted-foreground',
                    ]"
                  >
                    <svg v-if="(completedSteps.has(idx + 1) || idx + 1 < currentStep) && currentStep !== idx + 1" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                    </svg>
                    <span v-else>{{ idx + 1 }}</span>
                  </div>
                  <span class="hidden sm:block text-[10px] truncate w-full text-center" :class="currentStep === idx + 1 ? 'text-foreground font-medium' : 'text-muted-foreground'">
                    {{ label }}
                  </span>
                </button>
              </div>
            </DialogHeader>

            <div class="px-1 sm:px-2 py-4">
              <transition name="step-fade" mode="out-in">
                <div :key="currentStep">
                  <Step1PersonalInfo v-if="currentStep === 1" v-model="formData" :errors="formErrors" />
                  <Step2AddressInfo v-else-if="currentStep === 2" v-model="formData" :errors="formErrors" />
                  <Step3ServiceInfo v-else-if="currentStep === 3" v-model="formData" :errors="formErrors" :type="(props.type as 'walker' | 'server' | 'partial_server' | 'waiting')" />
                  <Step4EmergencyContact v-else-if="currentStep === 4" v-model="formData" :errors="formErrors" :type="(props.type as 'walker' | 'server')" />
                  <Step5OtherInfo v-else-if="currentStep === 5 && props.type === 'walker'" v-model="formData" :errors="formErrors" :showPickupInfo="retreatData?.flyer_options?.showPickupInfo ?? true" :shirt-types="retreatData?.shirtTypes" />
                  <Step5ServerInfo v-else-if="currentStep === 5 && props.type === 'server'" v-model="formData" :errors="formErrors" :shirt-types="retreatData?.shirtTypes" />

                  <!-- Step 6: Summary -->
                  <div v-else-if="currentStep === totalSteps">
                    <div v-if="isTestMode" class="mb-4 rounded-lg border border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-4 text-yellow-800 dark:text-yellow-200 text-sm">
                      <strong>MODO PRUEBA:</strong> Al enviar, solo se validarán los datos. No se creará ningún registro ni se enviará correo de confirmación.
                    </div>
                    <Card>
                      <CardHeader>
                        <CardTitle>{{ $t('serverRegistration.summary.title') }}</CardTitle>
                        <CardDescription>{{ $t('serverRegistration.summary.description') }}</CardDescription>
                      </CardHeader>
                      <CardContent class="space-y-2">
                        <div v-for="item in summaryData" :key="item.label" class="flex flex-wrap gap-2 justify-between border-b pb-1.5 last:border-0">
                          <span class="font-medium text-muted-foreground text-sm">{{ $t(item.label) }}</span>
                          <span class="text-sm">{{ item.value?.includes('Registration.') || item.value?.includes('common.') ? $t(item.value) : item.value }}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </transition>
            </div>
            <DialogFooter class="gap-2 sm:gap-0">
              <Button variant="outline" @click="prevStep" v-if="currentStep > 1 || isServerType">
                <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
                {{ $t('common.previous') }}
              </Button>
              <Button @click="nextStep" v-if="currentStep < totalSteps">
                {{ $t('common.next') }}
                <svg class="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </Button>
              <Button @click="onSubmit" v-if="currentStep === totalSteps" class="bg-green-600 hover:bg-green-700">
                <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                {{ $t('common.submit') }}
              </Button>
            </DialogFooter>
          </template>
        </DialogContent>
        </Dialog>
      </div>
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
.step-fade-enter-active,
.step-fade-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.step-fade-enter-from {
  opacity: 0;
  transform: translateX(8px);
}
.step-fade-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}
</style>