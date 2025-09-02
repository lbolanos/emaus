<script setup lang="ts">
import { computed, ref, watch, reactive } from 'vue';
import { useToast } from '@repo/ui/components/ui/toast/use-toast';
import { z } from 'zod';
import { serverSchema, Server } from '@repo/types';
import { useServerStore } from '@/stores/serverStore';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card';
import { Input } from '@repo/ui/components/ui/input';
import { Label } from '@repo/ui/components/ui/label';
import { Button } from '@repo/ui/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select';
import { Checkbox } from '@repo/ui/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@repo/ui/components/ui/radio-group';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@repo/ui/components/ui/dialog';
import CountrySelector from '@/components/form/CountrySelector.vue';
import StateSelector from '@/components/form/StateSelector.vue';
import CitySelector from '@/components/form/CitySelector.vue';

const props = defineProps<{ retreatId: string }>();
const serverStore = useServerStore();
const { toast } = useToast();

const getInitialFormData = (): Partial<Omit<Server, 'id'>> => ({
  retreatId: props.retreatId,
  type: 'server',
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
});

const formData = ref(getInitialFormData());

const isDialogOpen = ref(false);
const currentStep = ref(1);
const totalSteps = 4;

const formErrors = reactive<Record<string, string>>({});

// Define schemas for each step
const step1Schema = z.object({
  firstName: z.string().min(1, 'First Name is required'),
  lastName: z.string().min(1, 'Last Name is required'),
  nickname: z.string().optional(),
  birthDate: z.string().min(1, 'Birth Date is required'),
  maritalStatus: z.enum(['single', 'married', 'separated_divorced', 'widowed', 'other']),
  street: z.string().min(1, 'Street is required'),
  houseNumber: z.string().min(1, 'House Number is required'),
  postalCode: z.string().min(1, 'Postal Code is required'),
  neighborhood: z.string().min(1, 'Neighborhood is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  country: z.string().min(1, 'Country is required'),
  parish: z.string().min(1, 'Parish is required'),
  homePhone: z.string().optional(),
  workPhone: z.string().optional(),
  cellPhone: z.string().optional(),
  email: z.string().email('Invalid email address').min(1, 'Email is required'),
  occupation: z.string().min(1, 'Occupation is required'),
}).refine((data) => data.cellPhone || data.workPhone || data.homePhone, {
  message: 'At least one phone number (Cell, Work, or Home) is required.',
  path: ['phoneNumbers'],
});

const step2Schema = z.object({
  snores: z.boolean({ required_error: 'This field is required' }),
  hasMedication: z.boolean({ required_error: 'This field is required' }),
  medicationDetails: z.string().optional(),
  medicationSchedule: z.string().optional(),
  hasDietaryRestrictions: z.boolean({ required_error: 'This field is required' }),
  dietaryRestrictionsDetails: z.string().optional(),
  sacraments: z.array(z.enum(['baptism', 'communion', 'confirmation', 'marriage', 'none'])).min(1, 'At least one sacrament must be selected'),
}).refine((data) => {
  if (data.hasMedication && (!data.medicationDetails || !data.medicationSchedule)) {
    return false;
  }
  return true;
}, {
  message: 'Medication details and schedule are required if you have medication.',
  path: ['medicationDetails'],
}).refine((data) => {
  if (data.hasDietaryRestrictions && !data.dietaryRestrictionsDetails) {
    return false;
  }
  return true;
}, {
  message: 'Dietary restrictions details are required if you have dietary restrictions.',
  path: ['dietaryRestrictionsDetails'],
});

const step3Schema = z.object({
  emergencyContact1Name: z.string().min(1, 'Emergency Contact 1 Name is required'),
  emergencyContact1Relation: z.string().min(1, 'Emergency Contact 1 Relation is required'),
  emergencyContact1HomePhone: z.string().optional(),
  emergencyContact1WorkPhone: z.string().optional(),
  emergencyContact1CellPhone: z.string().optional(),
  emergencyContact1Email: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().email({ message: 'Invalid email address' }).optional(),
  ),
  emergencyContact2Name: z.string().optional(),
  emergencyContact2Relation: z.string().optional(),
  emergencyContact2HomePhone: z.string().optional(),
  emergencyContact2WorkPhone: z.string().optional(),
  emergencyContact2CellPhone: z.string().optional(),
  emergencyContact2Email: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().email({ message: 'Invalid email address' }).optional(),
  ),
}).refine((data) => data.emergencyContact1HomePhone || data.emergencyContact1WorkPhone || data.emergencyContact1CellPhone, {
  message: 'At least one phone number is required for Emergency Contact 1.',
  path: ['emergencyContact1PhoneNumbers'],
}).refine((data) => {
  if (data.emergencyContact2Name) {
    return data.emergencyContact2HomePhone || data.emergencyContact2WorkPhone || data.emergencyContact2CellPhone;
  }
  return true;
}, {
  message: 'At least one phone number is required for Emergency Contact 2 if name is provided.',
  path: ['emergencyContact2PhoneNumbers'],
});

const stepSchemas = [step1Schema, step2Schema, step3Schema];

const validateStep = (step: number) => {
  console.log(`Validating step ${step}. Current formData.sacraments:`, formData.value.sacraments);
  const schema = stepSchemas[step - 1];
  if (!schema) return true;

  // Clear previous errors
  for (const key in formErrors) {
    delete formErrors[key];
  }

  const result = schema.safeParse(formData.value);
  if (!result.success) {
    const errors: string[] = [];
    result.error.errors.forEach((e) => {
      const path = e.path.join('.');
      formErrors[path] = e.message;
      errors.push(`${path} - ${e.message}`);
    });
    console.error(`Validation errors in step ${step}:`, result.error.errors);
    toast({
      title: `Please correct the errors in step ${step}`,
      description: errors.join('\n'),
      variant: 'destructive',
    });
    return false;
  }
  return true;
};

const hasError = (field: string) => {
  return !!formErrors[field];
};

const getErrorMessage = (field: string) => {
  return formErrors[field];
};

// Watch for changes in formData to clear errors
watch(formData, (newValue, oldValue) => {
  for (const key in formErrors) {
    if (newValue[key as keyof typeof newValue] !== oldValue[key as keyof typeof oldValue]) {
      delete formErrors[key];
    }
  }
}, { deep: true });


const nextStep = () => {
  if (validateStep(currentStep.value)) {
    if (currentStep.value < totalSteps) {
      currentStep.value++;
    }
  }
};

const prevStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--;
  }
};

watch(() => props.retreatId, (newRetreatId) => {
  formData.value.retreatId = newRetreatId;
}, { immediate: true });

const onSubmit = async () => {
  // Clear previous errors
  for (const key in formErrors) {
    delete formErrors[key];
  }

  const result = serverSchema.omit({ id: true }).safeParse(formData.value);
  if (!result.success) {
    const errors: string[] = [];
    result.error.errors.forEach((e) => {
      const path = e.path.join('.');
      formErrors[path] = e.message;
      errors.push(`${path} - ${e.message}`);
    });
    console.error('Validation Error:', result.error.errors);
    toast({
      title: 'Validation Error',
      description: errors.join('\n'),
      variant: 'destructive',
    });
    return;
  }

  // If all steps are valid, proceed with submission
  try {
    await serverStore.createServer(result.data);
    toast({ title: 'Registration Successful' });
    isDialogOpen.value = false;
    currentStep.value = 1;
    formData.value = getInitialFormData();
  } catch (error) {
    // This catch block is for potential errors during the actual submission (e.g., API call)
    console.error('Submission error:', error);
    toast({
      title: 'Submission Failed',
      description: 'An unexpected error occurred during registration.',
      variant: 'destructive',
    });
  }
};

function updateSacraments(sacrament: typeof sacramentOptions[number]) {
  console.log('updateSacraments called for:', sacrament);
  const currentSacraments = formData.value.sacraments || [];
  const index = currentSacraments.indexOf(sacrament);

  if (index > -1) {
    formData.value.sacraments = currentSacraments.filter(s => s !== sacrament);
  } else {
    formData.value.sacraments = [...currentSacraments, sacrament];
  }
  console.log('Sacraments after update:', formData.value.sacraments);
}

const sacramentOptions = ['baptism', 'communion', 'confirmation', 'marriage', 'none'] as const;

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
  ];
});
</script>

<template>
  <div class="relative h-screen w-full">
    <div
      class="absolute inset-0 bg-cover bg-center"
      style="background-image: url('/header_bck.png');"
    >
      <div class="absolute inset-0 bg-black opacity-50"></div>
    </div>
    <div class="relative z-10 flex flex-col items-center justify-center h-full text-white text-center">
      <h1 class="text-5xl font-bold mb-4">{{ $t('serverRegistration.landing.title') }}</h1>
      <p class="text-xl mb-8">{{ $t('serverRegistration.landing.subtitle') }}</p>
      <Dialog v-model:open="isDialogOpen">
        <DialogTrigger as-child>
          <Button size="lg" variant="outline" class="bg-transparent hover:bg-white hover:text-black">
            {{ $t('serverRegistration.landing.cta') }}
          </Button>
        </DialogTrigger>
        <DialogContent class="sm:max-w-[80vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{{ $t('serverRegistration.title') }}</DialogTitle>
            <DialogDescription>
               {{ $t('serverRegistration.description') }} ({{ $t('serverRegistration.step', { current: currentStep, total: totalSteps }) }})
            </DialogDescription>
          </DialogHeader>
          <div class="container mx-auto p-4">
            <!-- Step 1: Personal Info -->
            <div v-show="currentStep === 1">
              <Card>
                <CardHeader><CardTitle>{{ $t('serverRegistration.tabs.personalInfo') }}</CardTitle></CardHeader>
                <CardContent class="space-y-4">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label for="firstName">{{ $t('serverRegistration.fields.firstName') }}</Label>
                      <Input id="firstName" v-model="formData.firstName" :class="{ 'border-red-500': hasError('firstName') }" />
                      <p v-if="hasError('firstName')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('firstName') }}</p>
                    </div>
                    <div>
                      <Label for="lastName">{{ $t('serverRegistration.fields.lastName') }}</Label>
                      <Input id="lastName" v-model="formData.lastName" :class="{ 'border-red-500': hasError('lastName') }" />
                      <p v-if="hasError('lastName')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('lastName') }}</p>
                    </div>
                    <div>
                      <Label for="nickname">{{ $t('serverRegistration.fields.nickname') }}</Label>
                      <Input id="nickname" v-model="formData.nickname" :class="{ 'border-red-500': hasError('nickname') }" />
                      <p v-if="hasError('nickname')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('nickname') }}</p>
                    </div>
                    <div>
                      <Label for="birthDate">{{ $t('serverRegistration.fields.birthDate') }}</Label>
                      <Input id="birthDate" type="date" v-model="formData.birthDate" :class="{ 'border-red-500': hasError('birthDate') }" />
                      <p v-if="hasError('birthDate')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('birthDate') }}</p>
                    </div>
                    <div>
                      <Label for="maritalStatus">{{ $t('serverRegistration.fields.maritalStatus.label') }}</Label>
                      <Select v-model="formData.maritalStatus">
                        <SelectTrigger :class="{ 'border-red-500': hasError('maritalStatus') }">
                          <SelectValue :placeholder="$t('serverRegistration.fields.maritalStatus.placeholder')" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">{{ $t('serverRegistration.fields.maritalStatus.options.single') }}</SelectItem>
                          <SelectItem value="married">{{ $t('serverRegistration.fields.maritalStatus.options.married') }}</SelectItem>
                          <SelectItem value="separated_divorced">{{ $t('serverRegistration.fields.maritalStatus.options.separated_divorced') }}</SelectItem>
                          <SelectItem value="widowed">{{ $t('serverRegistration.fields.maritalStatus.options.widowed') }}</SelectItem>
                          <SelectItem value="other">{{ $t('serverRegistration.fields.maritalStatus.options.other') }}</SelectItem>
                        </SelectContent>
                      </Select>
                      <p v-if="hasError('maritalStatus')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('maritalStatus') }}</p>
                    </div>
                    <div>
                      <Label for="country">{{ $t('serverRegistration.fields.country') }}</Label>
                      <CountrySelector id="country" v-model="formData.country" :class="{ 'border-red-500': hasError('country') }" />
                      <p v-if="hasError('country')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('country') }}</p>
                    </div>
                    <div>
                      <Label for="state">{{ $t('serverRegistration.fields.state') }}</Label>
                      <StateSelector id="state" v-model="formData.state" :country-code="formData.country!" :class="{ 'border-red-500': hasError('state') }" />
                      <p v-if="hasError('state')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('state') }}</p>
                    </div>
                    <div>
                      <Label for="city">{{ $t('serverRegistration.fields.city') }}</Label>
                      <CitySelector id="city" v-model="formData.city" :country-code="formData.country!" :state-code="formData.state!" :class="{ 'border-red-500': hasError('city') }" />
                      <p v-if="hasError('city')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('city') }}</p>
                    </div>
                    
                    <div>
                      <Label for="street">{{ $t('serverRegistration.fields.street') }}</Label>
                      <Input id="street" v-model="formData.street" :class="{ 'border-red-500': hasError('street') }" />
                      <p v-if="hasError('street')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('street') }}</p>
                    </div>
                    <div>
                      <Label for="houseNumber">{{ $t('serverRegistration.fields.houseNumber') }}</Label>
                      <Input id="houseNumber" v-model="formData.houseNumber" :class="{ 'border-red-500': hasError('houseNumber') }" />
                      <p v-if="hasError('houseNumber')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('houseNumber') }}</p>
                    </div>
                    <div>
                      <Label for="postalCode">{{ $t('serverRegistration.fields.postalCode') }}</Label>
                      <Input id="postalCode" v-model="formData.postalCode" :class="{ 'border-red-500': hasError('postalCode') }" />
                      <p v-if="hasError('postalCode')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('postalCode') }}</p>
                    </div>
                    <div>
                      <Label for="neighborhood">{{ $t('serverRegistration.fields.neighborhood') }}</Label>
                      <Input id="neighborhood" v-model="formData.neighborhood" :class="{ 'border-red-500': hasError('neighborhood') }" />
                      <p v-if="hasError('neighborhood')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('neighborhood') }}</p>
                    </div>
                    <div>
                      <Label for="parish">{{ $t('serverRegistration.fields.parish') }}</Label>
                      <Input id="parish" v-model="formData.parish" :class="{ 'border-red-500': hasError('parish') }" />
                      <p v-if="hasError('parish')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('parish') }}</p>
                    </div>
                    <div>
                      <Label for="homePhone">{{ $t('serverRegistration.fields.homePhone') }}</Label>
                      <Input id="homePhone" v-model="formData.homePhone" :class="{ 'border-red-500': hasError('homePhone') || hasError('phoneNumbers') }" />
                      <p v-if="hasError('homePhone')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('homePhone') }}</p>
                      <p v-else-if="hasError('phoneNumbers')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('phoneNumbers') }}</p>
                    </div>
                    <div>
                      <Label for="workPhone">{{ $t('serverRegistration.fields.workPhone') }}</Label>
                      <Input id="workPhone" v-model="formData.workPhone" :class="{ 'border-red-500': hasError('workPhone') || hasError('phoneNumbers') }" />
                      <p v-if="hasError('workPhone')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('workPhone') }}</p>
                    </div>
                    <div>
                      <Label for="cellPhone">{{ $t('serverRegistration.fields.cellPhone') }}</Label>
                      <Input id="cellPhone" v-model="formData.cellPhone" :class="{ 'border-red-500': hasError('cellPhone') || hasError('phoneNumbers') }" />
                      <p v-if="hasError('cellPhone')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('cellPhone') }}</p>
                    </div>
                    <div>
                      <Label for="email">{{ $t('serverRegistration.fields.email') }}</Label>
                      <Input id="email" type="email" v-model="formData.email" :class="{ 'border-red-500': hasError('email') }" />
                      <p v-if="hasError('email')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('email') }}</p>
                    </div>
                    <div>
                      <Label for="occupation">{{ $t('serverRegistration.fields.occupation') }}</Label>
                      <Input id="occupation" v-model="formData.occupation" :class="{ 'border-red-500': hasError('occupation') }" />
                      <p v-if="hasError('occupation')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('occupation') }}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <!-- Step 2: Health Info -->
            <div v-show="currentStep === 2">
              <Card>
                <CardHeader><CardTitle>{{ $t('serverRegistration.tabs.healthInfo') }}</CardTitle></CardHeader>
                <CardContent class="space-y-4">
                  <div>
                    <Label>{{ $t('serverRegistration.fields.snores') }}</Label>
                    <RadioGroup v-model="formData.snores" class="flex space-x-4">
                      <div class="flex items-center space-x-2">
                        <RadioGroupItem id="snores-yes" :value="true" />
                        <Label for="snores-yes">{{ $t('common.yes') }}</Label>
                      </div>
                      <div class="flex items-center space-x-2">
                        <RadioGroupItem id="snores-no" :value="false" />
                        <Label for="snores-no">{{ $t('common.no') }}</Label>
                      </div>
                    </RadioGroup>
                    <p v-if="hasError('snores')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('snores') }}</p>
                  </div>
                  <div>
                    <Label>{{ $t('serverRegistration.fields.hasMedication') }}</Label>
                    <RadioGroup v-model="formData.hasMedication" class="flex space-x-4">
                      <div class="flex items-center space-x-2">
                        <RadioGroupItem id="meds-yes" :value="true" />
                        <Label for="meds-yes">{{ $t('common.yes') }}</Label>
                      </div>
                      <div class="flex items-center space-x-2">
                        <RadioGroupItem id="meds-no" :value="false" />
                        <Label for="meds-no">{{ $t('common.no') }}</Label>
                      </div>
                    </RadioGroup>
                    <p v-if="hasError('hasMedication')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('hasMedication') }}</p>
                  </div>
                  <div v-if="formData.hasMedication">
                    <Label for="medicationDetails">{{ $t('serverRegistration.fields.medicationDetails') }}</Label>
                    <Input id="medicationDetails" v-model="formData.medicationDetails" :class="{ 'border-red-500': hasError('medicationDetails') }" />
                    <p v-if="hasError('medicationDetails')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('medicationDetails') }}</p>
                  </div>
                  <div v-if="formData.hasMedication">
                    <Label for="medicationSchedule">{{ $t('serverRegistration.fields.medicationSchedule') }}</Label>
                    <Input id="medicationSchedule" v-model="formData.medicationSchedule" :class="{ 'border-red-500': hasError('medicationSchedule') }" />
                    <p v-if="hasError('medicationSchedule')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('medicationSchedule') }}</p>
                  </div>
                  <div>
                    <Label>{{ $t('serverRegistration.fields.hasDietaryRestrictions') }}</Label>
                    <RadioGroup v-model="formData.hasDietaryRestrictions" class="flex space-x-4">
                      <div class="flex items-center space-x-2">
                        <RadioGroupItem id="diet-yes" :value="true" />
                        <Label for="diet-yes">{{ $t('common.yes') }}</Label>
                      </div>
                      <div class="flex items-center space-x-2">
                        <RadioGroupItem id="diet-no" :value="false" />
                        <Label for="diet-no">{{ $t('common.no') }}</Label>
                      </div>
                    </RadioGroup>
                    <p v-if="hasError('hasDietaryRestrictions')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('hasDietaryRestrictions') }}</p>
                  </div>
                  <div v-if="formData.hasDietaryRestrictions">
                    <Label for="dietaryRestrictionsDetails">{{ $t('serverRegistration.fields.dietaryRestrictionsDetails') }}</Label>
                    <Input id="dietaryRestrictionsDetails" v-model="formData.dietaryRestrictionsDetails" :class="{ 'border-red-500': hasError('dietaryRestrictionsDetails') }" />
                    <p v-if="hasError('dietaryRestrictionsDetails')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('dietaryRestrictionsDetails') }}</p>
                  </div>
                  <div>
                    <Label>{{ $t('serverRegistration.fields.sacraments.label') }}</Label>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <div v-for="sacrament in sacramentOptions" :key="sacrament" class="flex items-center space-x-2">
                        <Checkbox :id="sacrament" :checked="formData.sacraments?.includes(sacrament)" @click="() => updateSacraments(sacrament)" />
                        <Label :for="sacrament">{{ $t(`serverRegistration.fields.sacraments.options.${sacrament}`) }}</Label>
                      </div>
                    </div>
                    <p v-if="hasError('sacraments')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('sacraments') }}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <!-- Step 3: Emergency Contact -->
            <div v-show="currentStep === 3">
              <Card>
                <CardHeader><CardTitle>{{ $t('serverRegistration.tabs.emergencyContact') }}</CardTitle></CardHeader>
                <CardContent class="space-y-6">
                  <div>
                    <h3 class="font-semibold mb-2">{{ $t('serverRegistration.emergencyContact1') }}</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label for="emergencyContact1Name">{{ $t('serverRegistration.fields.emergencyContact.name') }}</Label>
                        <Input id="emergencyContact1Name" v-model="formData.emergencyContact1Name" :class="{ 'border-red-500': hasError('emergencyContact1Name') }" />
                        <p v-if="hasError('emergencyContact1Name')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('emergencyContact1Name') }}</p>
                      </div>
                      <div>
                        <Label for="emergencyContact1Relation">{{ $t('serverRegistration.fields.emergencyContact.relation') }}</Label>
                        <Input id="emergencyContact1Relation" v-model="formData.emergencyContact1Relation" :class="{ 'border-red-500': hasError('emergencyContact1Relation') }" />
                        <p v-if="hasError('emergencyContact1Relation')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('emergencyContact1Relation') }}</p>
                      </div>
                      <div>
                        <Label for="emergencyContact1HomePhone">{{ $t('serverRegistration.fields.emergencyContact.homePhone') }}</Label>
                        <Input id="emergencyContact1HomePhone" v-model="formData.emergencyContact1HomePhone" :class="{ 'border-red-500': hasError('emergencyContact1HomePhone') || hasError('emergencyContact1PhoneNumbers') }" />
                        <p v-if="hasError('emergencyContact1HomePhone')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('emergencyContact1HomePhone') }}</p>
                        <p v-else-if="hasError('emergencyContact1PhoneNumbers')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('emergencyContact1PhoneNumbers') }}</p>
                      </div>
                      <div>
                        <Label for="emergencyContact1WorkPhone">{{ $t('serverRegistration.fields.emergencyContact.workPhone') }}</Label>
                        <Input id="emergencyContact1WorkPhone" v-model="formData.emergencyContact1WorkPhone" :class="{ 'border-red-500': hasError('emergencyContact1WorkPhone') || hasError('emergencyContact1PhoneNumbers') }" />
                        <p v-if="hasError('emergencyContact1WorkPhone')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('emergencyContact1WorkPhone') }}</p>
                      </div>
                      <div>
                        <Label for="emergencyContact1CellPhone">{{ $t('serverRegistration.fields.emergencyContact.cellPhone') }}</Label>
                        <Input id="emergencyContact1CellPhone" v-model="formData.emergencyContact1CellPhone" :class="{ 'border-red-500': hasError('emergencyContact1CellPhone') || hasError('emergencyContact1PhoneNumbers') }" />
                        <p v-if="hasError('emergencyContact1CellPhone')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('emergencyContact1CellPhone') }}</p>
                      </div>
                      <div>
                        <Label for="emergencyContact1Email">{{ $t('serverRegistration.fields.emergencyContact.email') }}</Label>
                        <Input id="emergencyContact1Email" type="email" v-model="formData.emergencyContact1Email" :class="{ 'border-red-500': hasError('emergencyContact1Email') }" />
                        <p v-if="hasError('emergencyContact1Email')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('emergencyContact1Email') }}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 class="font-semibold mb-2">{{ $t('serverRegistration.emergencyContact2') }}</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div>
                        <Label for="emergencyContact2Name">{{ $t('serverRegistration.fields.emergencyContact.name') }}</Label>
                        <Input id="emergencyContact2Name" v-model="formData.emergencyContact2Name" :class="{ 'border-red-500': hasError('emergencyContact2Name') }" />
                        <p v-if="hasError('emergencyContact2Name')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('emergencyContact2Name') }}</p>
                      </div>
                      <div>
                        <Label for="emergencyContact2Relation">{{ $t('serverRegistration.fields.emergencyContact.relation') }}</Label>
                        <Input id="emergencyContact2Relation" v-model="formData.emergencyContact2Relation" :class="{ 'border-red-500': hasError('emergencyContact2Relation') }" />
                        <p v-if="hasError('emergencyContact2Relation')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('emergencyContact2Relation') }}</p>
                      </div>
                      <div>
                        <Label for="emergencyContact2HomePhone">{{ $t('serverRegistration.fields.emergencyContact.homePhone') }}</Label>
                        <Input id="emergencyContact2HomePhone" v-model="formData.emergencyContact2HomePhone" :class="{ 'border-red-500': hasError('emergencyContact2HomePhone') || hasError('emergencyContact2PhoneNumbers') }" />
                        <p v-if="hasError('emergencyContact2HomePhone')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('emergencyContact2HomePhone') }}</p>
                      </div>
                      <div>
                        <Label for="emergencyContact2WorkPhone">{{ $t('serverRegistration.fields.emergencyContact.workPhone') }}</Label>
                        <Input id="emergencyContact2WorkPhone" v-model="formData.emergencyContact2WorkPhone" />
                      </div>
                      <div>
                        <Label for="emergencyContact2CellPhone">{{ $t('serverRegistration.fields.emergencyContact.cellPhone') }}</Label>
                        <Input id="emergencyContact2CellPhone" v-model="formData.emergencyContact2CellPhone" />
                      </div>
                      <div>
                        <Label for="emergencyContact2Email">{{ $t('serverRegistration.fields.emergencyContact.email') }}</Label>
                        <Input id="emergencyContact2Email" type="email" v-model="formData.emergencyContact2Email" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <!-- Step 4: Summary -->
            <div v-show="currentStep === 4">
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
</template>
