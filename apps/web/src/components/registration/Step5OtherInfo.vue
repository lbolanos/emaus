<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui'
import { Input } from '@repo/ui'
import { Label } from '@repo/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui'
import { Checkbox } from '@repo/ui'
import { RadioGroup, RadioGroupItem } from '@repo/ui'

const props = defineProps<{
  errors: Record<string, string>
  showPickupInfo?: boolean
}>()

const formData = defineModel<Record<string, any>>({ required: true })

const hasError = (field: string) => !!props.errors[field]
const getErrorMessage = (field: string) => props.errors[field]
</script>

<template>
  <Card>
    <CardHeader><CardTitle>{{ $t('walkerRegistration.tabs.otherInfo') }}</CardTitle></CardHeader>
    <CardContent class="space-y-4">
      <div>
        <Label for="tshirtSize">{{ $t('walkerRegistration.fields.tshirtSize.label') }}</Label>
        <Select v-model="formData.tshirtSize">
          <SelectTrigger :class="{ 'border-red-500': hasError('tshirtSize') }">
            <SelectValue :placeholder="$t('walkerRegistration.fields.tshirtSize.placeholder')" />
          </SelectTrigger>
          <SelectContent>
            <!--SelectItem value="S">{{ $t('walkerRegistration.fields.tshirtSize.options.S') }}</SelectItem-->
            <SelectItem value="M">{{ $t('walkerRegistration.fields.tshirtSize.options.M') }}</SelectItem>
            <SelectItem value="G">{{ $t('walkerRegistration.fields.tshirtSize.options.G') }}</SelectItem>
            <SelectItem value="X">{{ $t('walkerRegistration.fields.tshirtSize.options.X') }}</SelectItem>
            <SelectItem value="2">{{ $t('walkerRegistration.fields.tshirtSize.options.2') }}</SelectItem>
          </SelectContent>
        </Select>
        <p v-if="hasError('tshirtSize')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('tshirtSize') }}</p>
      </div>
      <div>
        <Label for="invitedBy">{{ $t('walkerRegistration.fields.invitedBy') }}</Label>
        <Input id="invitedBy" v-model="formData.invitedBy" />
      </div>
      <div>
        <Label>{{ $t('walkerRegistration.fields.isInvitedByEmausMember') }}</Label>
        <RadioGroup v-model="formData.isInvitedByEmausMember" class="flex space-x-4">
          <div class="flex items-center space-x-2">
            <RadioGroupItem id="emaus-yes" :value="true" />
            <Label for="emaus-yes">{{ $t('common.yes') }}</Label>
          </div>
          <div class="flex items-center space-x-2">
            <RadioGroupItem id="emaus-no" :value="false" />
            <Label for="emaus-no">{{ $t('common.no') }}</Label>
          </div>
        </RadioGroup>
      </div>
      <div>
        <Label for="inviterHomePhone">{{ $t('walkerRegistration.fields.inviterHomePhone') }}</Label>
        <Input id="inviterHomePhone" v-model="formData.inviterHomePhone" />
      </div>
      <div>
        <Label for="inviterWorkPhone">{{ $t('walkerRegistration.fields.inviterWorkPhone') }}</Label>
        <Input id="inviterWorkPhone" v-model="formData.inviterWorkPhone" />
      </div>
      <div>
        <Label for="inviterCellPhone">{{ $t('walkerRegistration.fields.inviterCellPhone') }}</Label>
        <Input id="inviterCellPhone" v-model="formData.inviterCellPhone" />
      </div>
      <div>
        <Label for="inviterEmail">{{ $t('walkerRegistration.fields.inviterEmail') }}</Label>
        <Input id="inviterEmail" type="email" v-model="formData.inviterEmail" :class="{ 'border-red-500': hasError('inviterEmail') }" />
        <p v-if="hasError('inviterEmail')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('inviterEmail') }}</p>
      </div>
      <div v-if="showPickupInfo !== false">
        <div>
          <Label for="pickupLocation">{{ $t('walkerRegistration.fields.pickupLocation') }}</Label>
          <Input id="pickupLocation" v-model="formData.pickupLocation" />
        </div>
        <div class="flex items-center space-x-2">
          <Checkbox id="arrivesOnOwn" v-model="formData.arrivesOnOwn" />
          <Label for="arrivesOnOwn">{{ $t('walkerRegistration.fields.arrivesOnOwn') }}</Label>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
