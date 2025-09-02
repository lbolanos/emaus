<script setup lang="ts">
import { computed, ref, watch, reactive } from 'vue'
import { useToast } from '@repo/ui/components/ui/toast/use-toast'
import { z } from 'zod'
import { participantSchema, Participant } from '@repo/types'
import { useParticipantStore } from '@/stores/participantStore'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Button } from '@repo/ui/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@repo/ui/components/ui/dialog'

import Step1PersonalInfo from '@/components/registration/Step1PersonalInfo.vue'
import Step2AddressInfo from '@/components/registration/Step2AddressInfo.vue'
import Step3ServiceInfo from '@/components/registration/Step3ServiceInfo.vue'
import Step4EmergencyContact from '@/components/registration/Step4EmergencyContact.vue'
import Step5OtherInfo from '@/components/registration/Step5OtherInfo.vue'

const props = defineProps<{ retreatId: string; type: string }>()
const participantStore = useParticipantStore()
const { toast } = useToast()

const getInitialFormData = (): Partial<Omit<Participant, 'id'>> => ({
  retreatId: props.retreatId,
  type: props.type as 'server' | 'walker',
  sacraments: [],
  firstName: '',
  lastName: '',
  nickname: '',
  birthDate: '',
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
const totalSteps = computed(() => props.type === 'walker' ? 6 : 5)

const formErrors = reactive<Record<string, string>>({})

// Define schemas for each new step
const step1Schema = z.object({
  firstName: z.string().min(1, 'First Name is required'),
  lastName: z.string().min(1, 'Last Name is required'),
  nickname: z.string().optional(),
  birthDate: z.string().min(1, 'Birth Date is required'),
  maritalStatus: z.enum(['single', 'married', 'separated_divorced', 'widowed', 'other']),
  parish: z.string().min(1, 'Parish is required'),
  homePhone: z.string().optional(),
  workPhone: z.string().optional(),
  cellPhone: z.string().optional(),
  email: z.string().email('Invalid email address').min(1, 'Email is required'),
  occupation: z.string().min(1, 'Occupation is required'),
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
  sacraments: z.array(z.enum(['baptism', 'communion', 'confirmation', 'marriage', 'none'])).min(1, 'At least one sacrament must be selected'),
}).refine((data) => {
  if (data.hasMedication && (!data.medicationDetails || !data.medicationSchedule)) {
    return false
  }
  return true
}, {
  message: 'Medication details and schedule are required if you have medication.',
  path: ['medicationDetails'],
}).refine((data) => {
  if (data.hasDietaryRestrictions && !data.dietaryRestrictionsDetails) {
    return false
  }
  return true
}, {
  message: 'Dietary restrictions details are required if you have dietary restrictions.',
  path: ['dietaryRestrictionsDetails'],
})

const step4Schema = z.object({
  emergencyContact1Name: z.string().min(1, 'Emergency Contact 1 Name is required'),
  emergencyContact1Relation: z.string().min(1, 'Emergency Contact 1 Relation is required'),
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
}).refine(data => data.emergencyContact1HomePhone || data.emergencyContact1WorkPhone || data.emergencyContact1CellPhone, {
  message: 'At least one phone number is required for Emergency Contact 1.',
  path: ['emergencyContact1PhoneNumbers'],
}).refine((data) => {
  if (data.emergencyContact2Name) {
    return data.emergencyContact2HomePhone || data.emergencyContact2WorkPhone || data.emergencyContact2CellPhone
  }
  return true
}, {
  message: 'At least one phone number is required for Emergency Contact 2 if name is provided.',
  path: ['emergencyContact2PhoneNumbers'],
})

const step5Schema = z.object({
  tshirtSize: z.enum(['S', 'M', 'L', 'XL', 'XXL'], { required_error: 'T-shirt size is required' }),
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

const stepSchemas = computed(() => {
  const schemas = [step1Schema, step2Schema, step3Schema, step4Schema]
  if (props.type === 'walker') {
    schemas.push(step5Schema)
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
    result.error.errors.forEach((e) => {
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
  const result = participantSchema.omit({ id: true }).safeParse(formData.value)
  if (!result.success) {
    const errors: string[] = []
    result.error.errors.forEach((e) => {
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
  } catch (error) {
    console.error('Submission error:', error)
    toast({
      title: 'Submission Failed',
      description: 'An unexpected error occurred during registration.',
      variant: 'destructive',
    })
  }
}

const summaryData = computed(() => {
  return [
    { label: 'serverRegistration.fields.firstName', value: formData.value.firstName },
    { label: 'serverRegistration.fields.lastName', value: formData.value.lastName },
    { label: 'serverRegistration.fields.email', value: formData.value.email },
    { label: 'serverRegistration.fields.cellPhone', value: formData.value.cellPhone },
    { label: 'serverRegistration.fields.snores', value: formData.value.snores ? 'common.yes' : 'common.no' },
    { label: 'serverRegistration.fields.hasMedication', value: formData.value.hasMedication ? 'common.yes' : 'common.no' },
    { label: 'serverRegistration.fields.hasDietaryRestrictions', value: formData.value.hasDietaryRestrictions ? 'common.yes' : 'common.no' },
    { label: 'serverRegistration.emergencyContact1', value: `${formData.value.emergencyContact1Name} (${formData.value.emergencyContact1Relation}) - ${formData.value.emergencyContact1CellPhone || formData.value.emergencyContact1WorkPhone || formData.value.emergencyContact1HomePhone}` },
    { label: 'walkerRegistration.fields.tshirtSize.label', value: formData.value.tshirtSize },
    { label: 'walkerRegistration.fields.invitedBy', value: formData.value.invitedBy },
  ]
})
</script>

<template>
  <div class="relative h-screen w-full">
    <div
      class="absolute inset-0 bg-cover bg-center"
      style="background-image: url('/header_bck.png');"
    >
    
    <div class="relative z-10 flex flex-col items-center justify-center h-full text-white text-center" >
      <h1 class="text-5xl font-bold mb-4">{{ $t( props.type === 'walker' ? 'walkerRegistration.landing.title' : 'serverRegistration.landing.title') }}</h1>
      <p class="text-xl mb-8">{{ $t( props.type === 'walker' ? 'walkerRegistration.landing.subtitle' : 'serverRegistration.landing.subtitle') }}</p>
      <Dialog v-model:open="isDialogOpen">
        <DialogTrigger as-child>
          <Button size="lg" variant="outline" class="bg-transparent hover:bg-white hover:text-black">
            {{ $t('serverRegistration.landing.cta') }}
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
            <Step4EmergencyContact v-show="currentStep === 4" v-model="formData" :errors="formErrors" />
            <Step5OtherInfo v-show="currentStep === 5 && props.type === 'walker'" v-model="formData" :errors="formErrors" />

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
</template>

