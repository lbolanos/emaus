<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ICountry } from 'country-state-city'
import SearchableSelect, { type SearchableOption } from './SearchableSelect.vue'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits(['update:modelValue'])

const { t, locale } = useI18n()

const countries = ref<ICountry[]>([])
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  // Only the country list (~93 KB). Importing the package root pulls in
  // city.json too — 7.7 MB of cities that this field never needs, enough to
  // stall the step on mobile data and to get the tab killed on Safari iOS.
  const { default: Country } = await import('country-state-city/lib/country')
  countries.value = Country.getAllCountries()
  loading.value = false
})

// The package ships English names; the browser already knows them in Spanish.
const regionNames = computed(() => {
  try {
    return new Intl.DisplayNames([locale.value || 'es'], { type: 'region' })
  } catch {
    return null
  }
})

const options = computed<SearchableOption[]>(() =>
  countries.value
    .map((country) => ({
      value: country.isoCode,
      label: regionNames.value?.of(country.isoCode) || country.name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, locale.value || 'es')),
)

const handleUpdate = (value: string) => {
  emit('update:modelValue', value)
}
</script>

<template>
  <SearchableSelect
    :model-value="props.modelValue"
    :options="options"
    :disabled="loading"
    :placeholder="loading ? t('common.loading') : t('serverRegistration.fields.country')"
    :search-placeholder="t('common.searchPlaceholder')"
    @update:model-value="handleUpdate"
  />
</template>
