<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import CountrySelector from '@/components/form/CountrySelector.vue'
import StateSelector from '@/components/form/StateSelector.vue'
import CitySelector from '@/components/form/CitySelector.vue'

const props = defineProps<{
  errors: Record<string, string>
}>()

const formData = defineModel<Record<string, any>>({ required: true })

const hasError = (field: string) => !!props.errors[field]
const getErrorMessage = (field: string) => props.errors[field]
</script>

<template>
  <Card>
    <CardHeader><CardTitle>{{ $t('serverRegistration.tabs.addressInfo') }}</CardTitle></CardHeader>
    <CardContent class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      </div>
    </CardContent>
  </Card>
</template>
