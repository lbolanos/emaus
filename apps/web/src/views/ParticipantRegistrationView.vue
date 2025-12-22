<script setup lang="ts">
import { computed, ref, watch, reactive, onMounted } from 'vue'
import { useToast } from '@repo/ui'
import { z } from 'zod'
import { participantSchema, Participant } from '@repo/types'
import { useParticipantStore } from '@/stores/participantStore'
import { getApiUrl } from '@/config/runtimeConfig'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui'
import { Button } from '@repo/ui'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@repo/ui'

import Step1PersonalInfo from '@/components/registration/Step1PersonalInfo.vue'
import Step2AddressInfo from '@/components/registration/Step2AddressInfo.vue'
import Step3ServiceInfo from '@/components/registration/Step3ServiceInfo.vue'
import Step4EmergencyContact from '@/components/registration/Step4EmergencyContact.vue'
import Step5OtherInfo from '@/components/registration/Step5OtherInfo.vue'
import Step5ServerInfo from '@/components/registration/Step5ServerInfo.vue'

const props = defineProps<{ retreatId: string; type: string }>()
const participantStore = useParticipantStore()
const { toast } = useToast()

const validRetreatId = ref(props.retreatId)
const isLoading = ref(true)

const getInitialFormData = (): Partial<Omit<Participant, 'id'>> & { hasDisability?: boolean } => ({
  retreatId: validRetreatId.value,
  type: props.type as 'walker' | 'server' | 'waiting' | 'partial_server',
  sacraments: [],
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
})

const formData = ref(getInitialFormData())

const isDialogOpen = ref(false)
const currentStep = ref(1)
const totalSteps = computed(() => 6)

const formErrors = reactive<Record<string, string>>({})

// Define schemas for each new step
const step1Schema = z.object({
  firstName: z.string().min(1, 'First Name is required'),
  lastName: z.string().min(1, 'Last Name is required'),
  nickname: z.string().optional(),
  birthDate: z.string().min(1, 'Birth Date is required'),
  maritalStatus: z.enum(['S', 'C', 'D', 'V', 'O']),
  parish: z.string().optional(),
  homePhone: z.string().optional(),
  workPhone: z.string().optional(),
  cellPhone: z.string().optional(),
  email: z.string().email('Invalid email address').min(1, 'Email is required'),
  occupation: z.string().optional(),
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

const step3Schema = z.object({
  snores: z.boolean({ required_error: 'This field is required' }),
  hasMedication: z.boolean({ required_error: 'This field is required' }),
  medicationDetails: z.string().optional(),
  medicationSchedule: z.string().optional(),
  hasDietaryRestrictions: z.boolean({ required_error: 'This field is required' }),
  dietaryRestrictionsDetails: z.string().optional(),
  hasDisability: z.boolean().optional(),
  disabilitySupport: z.string().optional(),
  sacraments: z.array(z.enum(['baptism', 'communion', 'confirmation', 'marriage', 'none'])).min(1, 'At least one sacrament must be selected'),
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
  message: 'Debe seleccionar al menos un tipo de apoyo si tiene discapacidad.',
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
  tshirtSize: z.enum(['S', 'M', 'G', 'X', '2'], { required_error: 'T-shirt size is required' }),
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
  needsWhiteShirt: z.enum(['S', 'M', 'G', 'X', '2', 'null']).nullable().optional(),
  needsBlueShirt: z.enum(['S', 'M', 'G', 'X', '2', 'null']).nullable().optional(),
  needsJacket: z.enum(['S', 'M', 'G', 'X', '2', 'null']).nullable().optional()
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
    if (currentStep.value < totalSteps.value) {
      currentStep.value++
    }
  }
}

const prevStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

watch(() => props.retreatId, (newRetreatId) => {
  formData.value.retreatId = newRetreatId
}, { immediate: true })

const onSubmit = async () => {
  // Clear previous errors
  for (const key in formErrors) {
    delete formErrors[key]
  }
  // The server will set registrationDate and lastUpdatedDate, so we omit them from client-side validation.
  const validationSchema = participantSchema.omit({ id: true, registrationDate: true, lastUpdatedDate: true });
  const result = validationSchema.safeParse(formData.value)
  if (!result.success) {
    const errors: string[] = []
    result.error.errors.forEach((e: any) => {
      const path = e.path.join('.')
      formErrors[path] = e.message
      errors.push(`${path} - ${e.message}`)
    })
    console.error('Validation Error:', result.error.errors)
    toast({
      title: 'Validation Error',
      description: 'Please review all steps and correct any errors.',
      variant: 'destructive',
    })
    return
  }

  try {
    await participantStore.createParticipant(result.data)
    toast({ title: 'Registration Successful' })
    isDialogOpen.value = false
    currentStep.value = 1
    formData.value = getInitialFormData()
  } catch (error: any) {
    console.error('Submission error:', error)
    if (error.response && error.response.status === 409) {
      toast({
        title: 'Registration Failed',
        description: 'A participant with this email already exists in this retreat.',
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
    // Check if the provided retreatId exists using public endpoint
    const response = await fetch(`${getApiUrl()}/retreats/public/${props.retreatId}`)

    if (response.ok) {
      const retreat = await response.json()
      if (retreat && retreat.isPublic) {
        validRetreatId.value = retreat.id
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
    <div
      class="absolute inset-0 bg-cover bg-center"
      style="background-image: url('/header_bck.png');"
    >
    
    <div class="relative z-10 flex flex-col items-center justify-center h-full text-white text-center px-4" >
      <div class="bg-black/20 backdrop-blur-sm rounded-2xl p-8 max-w-2xl mx-auto border border-white/10 shadow-2xl">
        <div class="mb-6">
          <div class="w-20 h-20 mx-auto mb-6 bg-white/10 rounded-full flex items-center justify-center">
            <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <h1 class="text-4xl md:text-5xl font-bold mb-4">{{ $t( props.type === 'walker' ? 'walkerRegistration.landing.title' : 'serverRegistration.landing.title') }}</h1>
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
        <DialogContent class="sm:max-w-[80vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{{ $t( props.type === 'walker' ? 'walkerRegistration.title' : 'serverRegistration.title') }}</DialogTitle>
            <DialogDescription>
              {{ $t( props.type === 'walker' ? 'walkerRegistration.description' : 'serverRegistration.description') }} ({{ $t('serverRegistration.step', { current: currentStep, total: totalSteps }) }})
            </DialogDescription>
          </DialogHeader>
          <div class="container mx-auto p-4">
            <Step1PersonalInfo v-show="currentStep === 1" v-model="formData" :errors="formErrors" />
            <Step2AddressInfo v-show="currentStep === 2" v-model="formData" :errors="formErrors" />
            <Step3ServiceInfo v-show="currentStep === 3" v-model="formData" :errors="formErrors" />
            <Step4EmergencyContact v-show="currentStep === 4" v-model="formData" :errors="formErrors" :type="(props.type as 'walker' | 'server')" />
            <Step5OtherInfo v-show="currentStep === 5 && props.type === 'walker'" v-model="formData" :errors="formErrors" />
            <Step5ServerInfo v-show="currentStep === 5 && props.type === 'server'" v-model="formData" :errors="formErrors" />

            <!-- Step 6: Summary -->
            <div v-show="currentStep === totalSteps">
              <Card>
                <CardHeader>
                  <CardTitle>{{ $t('serverRegistration.summary.title') }}</CardTitle>
                  <CardDescription>{{ $t('serverRegistration.summary.description') }}</CardDescription>
                </CardHeader>
                <CardContent class="space-y-2">
                  <div v-for="item in summaryData" :key="item.label" class="flex justify-between">
                    <span class="font-semibold">{{ $t(item.label) }}:</span>
                    <span>{{ item.value?.includes('common.') ? $t(item.value) : item.value }}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" @click="prevStep" v-if="currentStep > 1">{{ $t('common.previous') }}</Button>
            <Button @click="nextStep" v-if="currentStep < totalSteps">{{ $t('common.next') }}</Button>
            <Button @click="onSubmit" v-if="currentStep === totalSteps">{{ $t('common.submit') }}</Button>
          </DialogFooter>
        </DialogContent>
        </Dialog>
      </div>
      </div>
    </div>
    </div>
  </div>
</template>