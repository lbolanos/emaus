<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@repo/ui'
import { storeLocale } from '@/i18n'

const { t, locale } = useI18n()

const handleUpdate = (value: string) => {
  locale.value = value
  storeLocale(value)
}
</script>

<template>
  <Select :model-value="locale" @update:model-value="handleUpdate">
    <SelectTrigger class="w-[180px]">
      <SelectValue placeholder="Select a language" />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectItem value="en">
          {{ t('language.english') }}
        </SelectItem>
        <SelectItem value="es">
          {{ t('language.spanish') }}
        </SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
</template>
