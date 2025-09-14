<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui'
import { Input } from '@repo/ui'
import { Label } from '@repo/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui'

const props = defineProps<{
  errors: Record<string, string>
}>()

const formData = defineModel<Record<string, any>>({ required: true })

const hasError = (field: string) => !!props.errors[field]
const getErrorMessage = (field: string) => props.errors[field]
</script>

<template>
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
              <SelectItem value="S">{{ $t('serverRegistration.fields.maritalStatus.options.single') }}</SelectItem>
              <SelectItem value="C">{{ $t('serverRegistration.fields.maritalStatus.options.married') }}</SelectItem>
              <SelectItem value="D">{{ $t('serverRegistration.fields.maritalStatus.options.separated_divorced') }}</SelectItem>
              <SelectItem value="V">{{ $t('serverRegistration.fields.maritalStatus.options.widowed') }}</SelectItem>
              <SelectItem value="O">{{ $t('serverRegistration.fields.maritalStatus.options.other') }}</SelectItem>
            </SelectContent>
          </Select>
          <p v-if="hasError('maritalStatus')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('maritalStatus') }}</p>
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
</template>