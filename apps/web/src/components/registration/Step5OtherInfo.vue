<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui'
import { Input } from '@repo/ui'
import { Label } from '@repo/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui'

type ShirtType = {
  id: string
  name: string
  requiredForWalkers: boolean
  optionalForServers: boolean
  sortOrder: number
  availableSizes?: string[] | null
}

const props = defineProps<{
  errors: Record<string, string>
  showPickupInfo?: boolean
  shirtTypes?: ShirtType[]
}>()

const formData = defineModel<Record<string, any>>({ required: true })

const hasError = (field: string) => !!props.errors[field]
const getErrorMessage = (field: string) => props.errors[field]

const FALLBACK_SIZES = ['S', 'M', 'G', 'X', '2']

// Walker uses a single shirt: pick the type marked requiredForWalkers, or the first sorted type.
const walkerShirtType = computed<ShirtType | null>(() => {
  const types = props.shirtTypes || []
  if (types.length === 0) return null
  const required = types.find((t) => t.requiredForWalkers)
  if (required) return required
  return [...types].sort((a, b) => a.sortOrder - b.sortOrder)[0]
})

const walkerSizes = computed<string[]>(() => {
  const t = walkerShirtType.value
  if (!t || !t.availableSizes || t.availableSizes.length === 0) return FALLBACK_SIZES
  return t.availableSizes
})
</script>

<template>
  <Card>
    <CardHeader><CardTitle>{{ $t('walkerRegistration.tabs.otherInfo') }}</CardTitle></CardHeader>
    <CardContent class="space-y-4">
      <div>
        <Label for="tshirtSize">
          {{ $t('walkerRegistration.fields.tshirtSize.label') }}
          <span v-if="walkerShirtType" class="text-muted-foreground font-normal">({{ walkerShirtType.name }})</span>
        </Label>
        <Select v-model="formData.tshirtSize">
          <SelectTrigger :class="{ 'border-red-500': hasError('tshirtSize') }">
            <SelectValue :placeholder="$t('walkerRegistration.fields.tshirtSize.placeholder')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="s in walkerSizes" :key="s" :value="s">{{ s }}</SelectItem>
          </SelectContent>
        </Select>
        <p v-if="hasError('tshirtSize')" class="text-red-500 text-sm mt-1">{{ getErrorMessage('tshirtSize') }}</p>
      </div>
      <div>
        <Label for="invitedBy">{{ $t('walkerRegistration.fields.invitedBy') }}</Label>
        <Input id="invitedBy" v-model="formData.invitedBy" />
      </div>
      <div>
        <Label class="mb-2 block">{{ $t('walkerRegistration.fields.isInvitedByEmausMember') }}</Label>
        <div class="inline-flex rounded-lg border bg-muted/40 p-1">
          <button
            type="button"
            class="px-5 py-1.5 rounded-md text-sm font-medium transition-all"
            :class="formData.isInvitedByEmausMember === true ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="formData.isInvitedByEmausMember = true"
          >{{ $t('common.yes') }}</button>
          <button
            type="button"
            class="px-5 py-1.5 rounded-md text-sm font-medium transition-all"
            :class="formData.isInvitedByEmausMember === false ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="formData.isInvitedByEmausMember = false"
          >{{ $t('common.no') }}</button>
        </div>
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
      <div v-if="showPickupInfo !== false" class="space-y-3">
        <div>
          <Label for="pickupLocation">{{ $t('walkerRegistration.fields.pickupLocation') }}</Label>
          <Input id="pickupLocation" v-model="formData.pickupLocation" />
        </div>
        <button
          type="button"
          class="w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-all"
          :class="formData.arrivesOnOwn
            ? 'border-primary bg-primary/5'
            : 'border-input bg-background hover:bg-accent/50'"
          @click="formData.arrivesOnOwn = !formData.arrivesOnOwn"
        >
          <div
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors"
            :class="formData.arrivesOnOwn ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 bg-background'"
          >
            <svg v-if="formData.arrivesOnOwn" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span class="text-sm font-medium">{{ $t('walkerRegistration.fields.arrivesOnOwn') }}</span>
        </button>
      </div>
    </CardContent>
  </Card>
</template>
