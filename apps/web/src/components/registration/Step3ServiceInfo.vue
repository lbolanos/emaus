<script setup lang="ts">
import { computed, watch } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui'
import { Input } from '@repo/ui'
import { Label } from '@repo/ui'
import { Checkbox } from '@repo/ui'
import { RadioGroup, RadioGroupItem } from '@repo/ui'

const props = defineProps<{
  errors: Record<string, string>
}>()

const formData = defineModel<Record<string, any>>({ required: true })

const hasError = (field: string) => !!props.errors[field]
const getErrorMessage = (field: string) => props.errors[field]

const sacramentOptions = ['baptism', 'communion', 'confirmation', 'marriage', 'none'] as const

function updateSacraments(sacrament: typeof sacramentOptions[number]) {
  const currentSacraments = formData.value.sacraments || []
  const index = currentSacraments.indexOf(sacrament)

  if (index > -1) {
    formData.value.sacraments = currentSacraments.filter((s: string) => s !== sacrament)
  } else {
    formData.value.sacraments = [...currentSacraments, sacrament]
  }
}

// Disability support handling
const disabilityMobility = computed({
  get: () => formData.value.disabilitySupport?.includes('Movilidad') || false,
  set: (value: boolean) => updateDisabilitySupport('Movilidad', value)
})

const disabilityVision = computed({
  get: () => formData.value.disabilitySupport?.includes('Visión') || false,
  set: (value: boolean) => updateDisabilitySupport('Visión', value)
})

const disabilityOther = computed({
  get: () => {
    const match = formData.value.disabilitySupport?.match(/Otra:\s*(.*)/);
    return match ? match[1] : '';
  },
  set: (value: string) => {
    const current = formData.value.disabilitySupport || '';
    const withoutOther = current.replace(/,?\s*Otra:\s*[^,]*/g, '').trim();
    const parts = withoutOther ? withoutOther.split(', ').filter(Boolean) : [];
    if (value.trim()) {
      parts.push(`Otra: ${value.trim()}`);
    }
    formData.value.disabilitySupport = parts.join(', ');
  }
})

function updateDisabilitySupport(type: string, checked: boolean) {
  const current = formData.value.disabilitySupport || '';
  const parts = current ? current.split(', ').filter(Boolean) : [];

  if (checked) {
    if (!parts.includes(type)) {
      parts.push(type);
    }
  } else {
    const index = parts.indexOf(type);
    if (index > -1) {
      parts.splice(index, 1);
    }
  }

  formData.value.disabilitySupport = parts.join(', ');
}

function handleOtherFocus() {
  if (!disabilityOther.value) {
    disabilityOther.value = ''
  }
}

function handleOtherCheckbox() {
  const hasOther = formData.value.disabilitySupport?.includes('Otra:')
  if (hasOther) {
    // Unchecking - remove "Otra:" from the support string
    const current = formData.value.disabilitySupport || ''
    const withoutOther = current.replace(/,?\s*Otra:\s*[^,]*/g, '').trim()
    formData.value.disabilitySupport = withoutOther
  }
  // If not checked, clicking doesn't auto-check - user must type in the input
}

function handleMobilityCheckbox() {
  disabilityMobility.value = !disabilityMobility.value
}

function handleVisionCheckbox() {
  disabilityVision.value = !disabilityVision.value
}

// Watch hasDisability to clear disabilitySupport when set to false
watch(() => formData.value.hasDisability, (newValue) => {
  if (newValue === false) {
    formData.value.disabilitySupport = ''
  }
})

// Initialize hasDisability based on existing disabilitySupport content
if (formData.value.disabilitySupport && !formData.value.hasDisability) {
  formData.value.hasDisability = true
}
</script>

<template>
  <Card>
    <CardHeader><CardTitle>{{ $t('serverRegistration.tabs.serviceInfo') }}</CardTitle></CardHeader>
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
      <div class="border-t pt-4 mt-4">
        <Label>{{ $t('serverRegistration.fields.hasDisability') }}</Label>
        <RadioGroup v-model="formData.hasDisability" class="flex space-x-4">
          <div class="flex items-center space-x-2">
            <RadioGroupItem id="disability-yes" :value="true" />
            <Label for="disability-yes">{{ $t('common.yes') }}</Label>
          </div>
          <div class="flex items-center space-x-2">
            <RadioGroupItem id="disability-no" :value="false" />
            <Label for="disability-no">{{ $t('common.no') }}</Label>
          </div>
        </RadioGroup>
        <p v-if="hasError('hasDisability')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('hasDisability') }}</p>
      </div>
      <div v-if="formData.hasDisability">
        <Label class="font-semibold text-base">{{ $t('serverRegistration.fields.disabilitySupportSubtext') }}</Label>
        <p v-if="hasError('disabilitySupport')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('disabilitySupport') }}</p>
        <div class="space-y-2 mt-2">
          <div class="flex items-center space-x-2">
            <Checkbox id="disability-mobility" :checked="disabilityMobility" @click="handleMobilityCheckbox" />
            <Label for="disability-mobility">{{ $t('serverRegistration.fields.disabilityMobility') }}</Label>
          </div>
          <div class="flex items-center space-x-2">
            <Checkbox id="disability-vision" :checked="disabilityVision" @click="handleVisionCheckbox" />
            <Label for="disability-vision">{{ $t('serverRegistration.fields.disabilityVision') }}</Label>
          </div>
          <div class="flex items-start space-x-2">
            <Checkbox id="disability-other-check" :checked="!!disabilityOther" @click="handleOtherCheckbox" class="mt-1" />
            <div class="flex-1">
              <Label for="disability-other-check" class="block mb-1">{{ $t('serverRegistration.fields.disabilityOther') }}</Label>
              <Input
                id="disability-other-input"
                v-model="disabilityOther"
                :placeholder="$t('serverRegistration.fields.disabilityOtherPlaceholder')"
                @focus="handleOtherFocus"
              />
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
