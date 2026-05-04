<script setup lang="ts">
import { computed, watch } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui'
import { Label } from '@repo/ui'
import { Checkbox } from '@repo/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui'

type ShirtType = {
  id: string
  name: string
  color?: string | null
  requiredForWalkers: boolean
  optionalForServers: boolean
  sortOrder: number
  availableSizes?: string[] | null
}

const props = defineProps<{
  errors: Record<string, string>
  shirtTypes?: ShirtType[]
}>()

const formData = defineModel<Record<string, any>>({ required: true })

const FALLBACK_SIZES = ['S', 'M', 'G', 'X', '2']
function sizesFor(t: ShirtType): string[] {
  return t.availableSizes && t.availableSizes.length > 0 ? t.availableSizes : FALLBACK_SIZES
}

const visibleTypes = computed(() =>
  (props.shirtTypes || [])
    .filter((t) => t.optionalForServers)
    .sort((a, b) => a.sortOrder - b.sortOrder),
)

// Initialize/maintain shirtSizes map on formData
watch(
  () => visibleTypes.value.map((t) => t.id).join(','),
  () => {
    if (!formData.value.shirtSizesByType) {
      formData.value.shirtSizesByType = {}
    }
  },
  { immediate: true },
)

function setSize(typeId: string, value: string) {
  if (!formData.value.shirtSizesByType) formData.value.shirtSizesByType = {}
  formData.value.shirtSizesByType[typeId] = value
  // Sync to flat array for submission
  formData.value.shirtSizes = Object.entries(formData.value.shirtSizesByType)
    .filter(([, size]) => size && size !== 'null')
    .map(([shirtTypeId, size]) => ({ shirtTypeId, size }))
}

function getSize(typeId: string): string {
  return formData.value.shirtSizesByType?.[typeId] ?? 'null'
}
</script>

<template>
  <Card>
    <CardHeader><CardTitle>{{ $t('serverRegistration.tabs.serverInfo') }}</CardTitle></CardHeader>
    <CardContent class="space-y-4">
      <button
        type="button"
        class="w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-all"
        :class="formData.isAngelito
          ? 'border-purple-400 bg-purple-100 dark:border-purple-600 dark:bg-purple-950'
          : 'border-purple-200 bg-purple-50 hover:bg-purple-100/70 dark:border-purple-800 dark:bg-purple-950/50'"
        @click="formData.isAngelito = !formData.isAngelito"
      >
        <div
          class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 mt-0.5 transition-colors"
          :class="formData.isAngelito
            ? 'border-purple-600 bg-purple-600 text-white'
            : 'border-purple-300 bg-white dark:bg-purple-950'"
        >
          <svg v-if="formData.isAngelito" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div class="space-y-0.5 flex-1">
          <div class="font-medium text-sm">{{ $t('serverRegistration.fields.isAngelito') }}</div>
          <p class="text-xs text-muted-foreground">{{ $t('serverRegistration.fields.isAngelitoHint') }}</p>
        </div>
      </button>

      <div v-if="visibleTypes.length === 0" class="text-sm text-muted-foreground">
        {{ $t('serverRegistration.fields.noShirtsConfigured') }}
      </div>

      <div v-for="t in visibleTypes" :key="t.id">
        <Label :for="`shirt-${t.id}`">{{ t.name }}</Label>
        <Select :model-value="getSize(t.id)" @update:model-value="(v: any) => setSize(t.id, v)">
          <SelectTrigger :id="`shirt-${t.id}`">
            <SelectValue :placeholder="$t('serverRegistration.fields.shirtSizePlaceholder')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="null">{{ $t('serverRegistration.fields.noSizeNeeded') }}</SelectItem>
            <SelectItem v-for="s in sizesFor(t)" :key="s" :value="s">{{ s }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </CardContent>
  </Card>
</template>
