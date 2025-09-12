<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select'

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
      <div>
        <Label for="needsWhiteShirt">{{ $t('serverRegistration.fields.needsWhiteShirt') }}</Label>
        <Select v-model="formData.needsWhiteShirt">
          <SelectTrigger>
            <SelectValue :placeholder="$t('serverRegistration.fields.needsWhiteShirtPlaceholder')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="null">{{ $t('serverRegistration.fields.noSizeNeeded') }}</SelectItem>
            <SelectItem value="S">{{ $t('walkerRegistration.fields.tshirtSize.options.S') }}</SelectItem>
            <SelectItem value="M">{{ $t('walkerRegistration.fields.tshirtSize.options.M') }}</SelectItem>
            <SelectItem value="G">{{ $t('walkerRegistration.fields.tshirtSize.options.G') }}</SelectItem>
            <SelectItem value="X">{{ $t('walkerRegistration.fields.tshirtSize.options.X') }}</SelectItem>
            <SelectItem value="2">{{ $t('walkerRegistration.fields.tshirtSize.options.2') }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label for="needsBlueShirt">{{ $t('serverRegistration.fields.needsBlueShirt') }}</Label>
        <Select v-model="formData.needsBlueShirt">
          <SelectTrigger>
            <SelectValue :placeholder="$t('serverRegistration.fields.needsBlueShirtPlaceholder')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="null">{{ $t('serverRegistration.fields.noSizeNeeded') }}</SelectItem>
            <SelectItem value="S">{{ $t('walkerRegistration.fields.tshirtSize.options.S') }}</SelectItem>
            <SelectItem value="M">{{ $t('walkerRegistration.fields.tshirtSize.options.M') }}</SelectItem>
            <SelectItem value="G">{{ $t('walkerRegistration.fields.tshirtSize.options.G') }}</SelectItem>
            <SelectItem value="X">{{ $t('walkerRegistration.fields.tshirtSize.options.X') }}</SelectItem>
            <SelectItem value="2">{{ $t('walkerRegistration.fields.tshirtSize.options.2') }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label for="needsJacket">{{ $t('serverRegistration.fields.needsJacket') }}</Label>
        <Select v-model="formData.needsJacket">
          <SelectTrigger>
            <SelectValue :placeholder="$t('serverRegistration.fields.needsJacketPlaceholder')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="null">{{ $t('serverRegistration.fields.noSizeNeeded') }}</SelectItem>
            <SelectItem value="S">{{ $t('walkerRegistration.fields.tshirtSize.options.S') }}</SelectItem>
            <SelectItem value="M">{{ $t('walkerRegistration.fields.tshirtSize.options.M') }}</SelectItem>
            <SelectItem value="G">{{ $t('walkerRegistration.fields.tshirtSize.options.G') }}</SelectItem>
            <SelectItem value="X">{{ $t('walkerRegistration.fields.tshirtSize.options.X') }}</SelectItem>
            <SelectItem value="2">{{ $t('walkerRegistration.fields.tshirtSize.options.2') }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </CardContent>
  </Card>
</template>
