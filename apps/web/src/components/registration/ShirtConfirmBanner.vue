<script setup lang="ts">
import { Button } from '@repo/ui'
import { useI18n } from 'vue-i18n'

// Shared by every registration flow that submits shirt sizes: the individual
// server registration (email lookup's identity screen and multi-step form) and
// the couple registration's summary. The shirt select ships with "No necesita"
// preselected, so submitting without a size is almost never a conscious
// decision — the banner asks once before registering.
const { t: $t } = useI18n()
withDefaults(defineProps<{ disabled?: boolean; i18nPrefix?: string }>(), {
  disabled: false,
  // The couple flow has its own copy (plural) under coupleRegistration.
  i18nPrefix: 'serverRegistration',
})
defineEmits<{ confirm: []; back: [] }>()
</script>

<template>
  <div class="rounded-lg border border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-4 space-y-3">
    <div class="space-y-0.5">
      <p class="font-semibold text-sm text-yellow-800 dark:text-yellow-200">
        {{ $t(`${i18nPrefix}.shirtConfirm.title`) }}
      </p>
      <p class="text-sm text-yellow-800 dark:text-yellow-200">
        {{ $t(`${i18nPrefix}.shirtConfirm.description`) }}
      </p>
    </div>
    <div class="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
      <Button variant="outline" size="sm" @click="$emit('back')">
        {{ $t(`${i18nPrefix}.shirtConfirm.back`) }}
      </Button>
      <Button size="sm" class="bg-green-600 hover:bg-green-700" :disabled="disabled" @click="$emit('confirm')">
        {{ $t(`${i18nPrefix}.shirtConfirm.confirm`) }}
      </Button>
    </div>
  </div>
</template>
