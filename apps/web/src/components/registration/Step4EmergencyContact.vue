<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui'
import { Input } from '@repo/ui'
import { Label } from '@repo/ui'

const props = defineProps<{
  errors: Record<string, string>
}>()

const formData = defineModel<Record<string, any>>({ required: true })

const hasError = (field: string) => !!props.errors[field]
const getErrorMessage = (field: string) => props.errors[field]
</script>

<template>
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
</template>
