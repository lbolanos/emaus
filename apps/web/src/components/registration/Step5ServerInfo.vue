<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select'
import { Checkbox } from '@repo/ui/components/ui/checkbox'

const props = defineProps<{
  errors: Record<string, string>
}>()

const formData = defineModel<Record<string, any>>({ required: true })

const hasError = (field: string) => !!props.errors[field]
const getErrorMessage = (field: string) => props.errors[field]
</script>

<template>
  <Card>
    <CardHeader><CardTitle>{{ $t('serverRegistration.tabs.serverInfo') }}</CardTitle></CardHeader>
    <CardContent class="space-y-4">
      <div class="flex items-center space-x-2">
        <Checkbox id="needsWhiteShirt" v-model="formData.needsWhiteShirt" />
        <Label for="needsWhiteShirt">{{ $t('serverRegistration.fields.needsWhiteShirt') }}</Label>
      </div>
      <div class="flex items-center space-x-2">
        <Checkbox id="needsBlueShirt" v-model="formData.needsBlueShirt" />
        <Label for="needsBlueShirt">{{ $t('serverRegistration.fields.needsBlueShirt') }}</Label>
      </div>
      <div class="flex items-center space-x-2">
        <Checkbox id="needsJacket" v-model="formData.needsJacket" />
        <Label for="needsJacket">{{ $t('serverRegistration.fields.needsJacket') }}</Label>
      </div>
      <div>
        <Label for="tshirtSize">{{ $t('walkerRegistration.fields.tshirtSize.label') }}</Label>
        <Select v-model="formData.tshirtSize">
          <SelectTrigger :class="{ 'border-red-500': hasError('tshirtSize') }">
            <SelectValue :placeholder="$t('walkerRegistration.fields.tshirtSize.placeholder')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="S">{{ $t('walkerRegistration.fields.tshirtSize.options.S') }}</SelectItem>
            <SelectItem value="M">{{ $t('walkerRegistration.fields.tshirtSize.options.M') }}</SelectItem>
            <SelectItem value="G">{{ $t('walkerRegistration.fields.tshirtSize.options.G') }}</SelectItem>
            <SelectItem value="X">{{ $t('walkerRegistration.fields.tshirtSize.options.X') }}</SelectItem>
            <SelectItem value="2">{{ $t('walkerRegistration.fields.tshirtSize.options.2') }}</SelectItem>
          </SelectContent>
        </Select>
        <p v-if="hasError('tshirtSize')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('tshirtSize') }}</p>
      </div>
    </CardContent>
  </Card>
</template>
