<script setup lang="ts">
import { computed, watch } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui'
import { Input } from '@repo/ui'
import { Label } from '@repo/ui'

const props = defineProps<{
  errors: Record<string, string>
  type?: 'walker' | 'server' | 'partial_server' | 'waiting'
}>()

const isServer = computed(() => props.type === 'server' || props.type === 'partial_server')

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

const disabilityMobility = computed({
  get: () => formData.value.disabilitySupport?.includes('Movilidad') || false,
  set: (value: boolean) => updateDisabilitySupport('Movilidad', value),
})

const disabilityVision = computed({
  get: () => formData.value.disabilitySupport?.includes('Visión') || false,
  set: (value: boolean) => updateDisabilitySupport('Visión', value),
})

const disabilityOther = computed({
  get: () => {
    const match = formData.value.disabilitySupport?.match(/Otra:\s*(.*)/)
    return match ? match[1] : ''
  },
  set: (value: string) => {
    const current = formData.value.disabilitySupport || ''
    const withoutOther = current.replace(/,?\s*Otra:\s*[^,]*/g, '').trim()
    const parts = withoutOther ? withoutOther.split(', ').filter(Boolean) : []
    if (value.trim()) parts.push(`Otra: ${value.trim()}`)
    formData.value.disabilitySupport = parts.join(', ')
  },
})

function updateDisabilitySupport(type: string, checked: boolean) {
  const current = formData.value.disabilitySupport || ''
  const parts = current ? current.split(', ').filter(Boolean) : []
  if (checked) {
    if (!parts.includes(type)) parts.push(type)
  } else {
    const index = parts.indexOf(type)
    if (index > -1) parts.splice(index, 1)
  }
  formData.value.disabilitySupport = parts.join(', ')
}

function toggleDisabilityOther() {
  const hasOther = formData.value.disabilitySupport?.includes('Otra:')
  if (hasOther) {
    const current = formData.value.disabilitySupport || ''
    formData.value.disabilitySupport = current.replace(/,?\s*Otra:\s*[^,]*/g, '').trim()
  } else {
    disabilityOther.value = ' '
  }
}

watch(() => formData.value.hasDisability, (newValue) => {
  if (newValue === false) formData.value.disabilitySupport = ''
})

if (formData.value.disabilitySupport && !formData.value.hasDisability) {
  formData.value.hasDisability = true
}
</script>

<template>
  <Card>
    <CardHeader><CardTitle>{{ $t('serverRegistration.tabs.serviceInfo') }}</CardTitle></CardHeader>
    <CardContent class="space-y-5">
      <!-- Snores -->
      <div>
        <Label class="mb-2 block">{{ $t('serverRegistration.fields.snores') }}</Label>
        <div class="inline-flex rounded-lg border bg-muted/40 p-1">
          <button
            type="button"
            class="px-5 py-1.5 rounded-md text-sm font-medium transition-all"
            :class="formData.snores === true ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="formData.snores = true"
          >{{ $t('common.yes') }}</button>
          <button
            type="button"
            class="px-5 py-1.5 rounded-md text-sm font-medium transition-all"
            :class="formData.snores === false ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="formData.snores = false"
          >{{ $t('common.no') }}</button>
        </div>
        <p v-if="hasError('snores')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('snores') }}</p>
      </div>

      <!-- Medication -->
      <div>
        <Label class="mb-2 block">{{ $t('serverRegistration.fields.hasMedication') }}</Label>
        <div class="inline-flex rounded-lg border bg-muted/40 p-1">
          <button
            type="button"
            class="px-5 py-1.5 rounded-md text-sm font-medium transition-all"
            :class="formData.hasMedication === true ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="formData.hasMedication = true"
          >{{ $t('common.yes') }}</button>
          <button
            type="button"
            class="px-5 py-1.5 rounded-md text-sm font-medium transition-all"
            :class="formData.hasMedication === false ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="formData.hasMedication = false"
          >{{ $t('common.no') }}</button>
        </div>
        <p v-if="hasError('hasMedication')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('hasMedication') }}</p>
      </div>
      <div v-if="formData.hasMedication" class="pl-2 border-l-2 border-primary/30 space-y-3">
        <div>
          <Label for="medicationDetails">{{ $t('serverRegistration.fields.medicationDetails') }}</Label>
          <Input id="medicationDetails" v-model="formData.medicationDetails" :class="{ 'border-red-500': hasError('medicationDetails') }" />
          <p v-if="hasError('medicationDetails')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('medicationDetails') }}</p>
        </div>
        <div>
          <Label for="medicationSchedule">{{ $t('serverRegistration.fields.medicationSchedule') }}</Label>
          <Input id="medicationSchedule" v-model="formData.medicationSchedule" :class="{ 'border-red-500': hasError('medicationSchedule') }" />
          <p v-if="hasError('medicationSchedule')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('medicationSchedule') }}</p>
        </div>
      </div>

      <!-- Dietary -->
      <div>
        <Label class="mb-2 block">{{ $t('serverRegistration.fields.hasDietaryRestrictions') }}</Label>
        <div class="inline-flex rounded-lg border bg-muted/40 p-1">
          <button
            type="button"
            class="px-5 py-1.5 rounded-md text-sm font-medium transition-all"
            :class="formData.hasDietaryRestrictions === true ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="formData.hasDietaryRestrictions = true"
          >{{ $t('common.yes') }}</button>
          <button
            type="button"
            class="px-5 py-1.5 rounded-md text-sm font-medium transition-all"
            :class="formData.hasDietaryRestrictions === false ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="formData.hasDietaryRestrictions = false"
          >{{ $t('common.no') }}</button>
        </div>
        <p v-if="hasError('hasDietaryRestrictions')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('hasDietaryRestrictions') }}</p>
      </div>
      <div v-if="formData.hasDietaryRestrictions" class="pl-2 border-l-2 border-primary/30">
        <Label for="dietaryRestrictionsDetails">{{ $t('serverRegistration.fields.dietaryRestrictionsDetails') }}</Label>
        <Input id="dietaryRestrictionsDetails" v-model="formData.dietaryRestrictionsDetails" :class="{ 'border-red-500': hasError('dietaryRestrictionsDetails') }" />
        <p v-if="hasError('dietaryRestrictionsDetails')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('dietaryRestrictionsDetails') }}</p>
      </div>

      <!-- Sacraments (chips) -->
      <div v-if="!isServer">
        <Label class="mb-2 block">{{ $t('serverRegistration.fields.sacraments.label') }}</Label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="sacrament in sacramentOptions"
            :key="sacrament"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all"
            :class="formData.sacraments?.includes(sacrament)
              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
              : 'border-input bg-background text-foreground hover:bg-accent hover:border-primary/40'"
            @click="updateSacraments(sacrament)"
          >
            <svg v-if="formData.sacraments?.includes(sacrament)" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
            {{ $t(`serverRegistration.fields.sacraments.options.${sacrament}`) }}
          </button>
        </div>
        <p v-if="hasError('sacraments')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('sacraments') }}</p>
      </div>

      <!-- Disability -->
      <div class="border-t pt-4">
        <Label class="mb-2 block">{{ $t('serverRegistration.fields.hasDisability') }}</Label>
        <div class="inline-flex rounded-lg border bg-muted/40 p-1">
          <button
            type="button"
            class="px-5 py-1.5 rounded-md text-sm font-medium transition-all"
            :class="formData.hasDisability === true ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="formData.hasDisability = true"
          >{{ $t('common.yes') }}</button>
          <button
            type="button"
            class="px-5 py-1.5 rounded-md text-sm font-medium transition-all"
            :class="formData.hasDisability === false ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="formData.hasDisability = false"
          >{{ $t('common.no') }}</button>
        </div>
        <p v-if="hasError('hasDisability')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('hasDisability') }}</p>
      </div>

      <div v-if="formData.hasDisability" class="pl-2 border-l-2 border-primary/30 space-y-3">
        <Label class="font-medium">{{ $t('serverRegistration.fields.disabilitySupportSubtext') }}</Label>
        <p v-if="hasError('disabilitySupport')" class="text-red-500 text-sm">{{ getErrorMessage('disabilitySupport') }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all"
            :class="disabilityMobility
              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
              : 'border-input bg-background text-foreground hover:bg-accent hover:border-primary/40'"
            @click="disabilityMobility = !disabilityMobility"
          >
            <svg v-if="disabilityMobility" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
            {{ $t('serverRegistration.fields.disabilityMobility') }}
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all"
            :class="disabilityVision
              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
              : 'border-input bg-background text-foreground hover:bg-accent hover:border-primary/40'"
            @click="disabilityVision = !disabilityVision"
          >
            <svg v-if="disabilityVision" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
            {{ $t('serverRegistration.fields.disabilityVision') }}
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all"
            :class="!!disabilityOther
              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
              : 'border-input bg-background text-foreground hover:bg-accent hover:border-primary/40'"
            @click="toggleDisabilityOther"
          >
            <svg v-if="!!disabilityOther" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
            {{ $t('serverRegistration.fields.disabilityOther') }}
          </button>
        </div>
        <Input
          v-if="!!disabilityOther"
          id="disability-other-input"
          v-model="disabilityOther"
          :placeholder="$t('serverRegistration.fields.disabilityOtherPlaceholder')"
        />
      </div>
    </CardContent>
  </Card>
</template>
