<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Checkbox } from '@repo/ui/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@repo/ui/components/ui/radio-group'

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
    formData.value.sacraments = currentSacraments.filter(s => s !== sacrament)
  } else {
    formData.value.sacraments = [...currentSacraments, sacrament]
  }
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
    </CardContent>
  </Card>
</template>
