<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { IState } from 'country-state-city'
import SearchableSelect, { type SearchableOption } from './SearchableSelect.vue'

const props = defineProps<{
  modelValue: string
  countryCode: string
}>()

const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

const states = ref<IState[]>([])
const loading = ref(false)

watch(
  () => props.countryCode,
  async (newCountryCode, oldCountryCode) => {
    if (newCountryCode) {
      loading.value = true
      // Only state.json (~542 KB). See CountrySelector for why the package root
      // is off limits here.
      const { default: State } = await import('country-state-city/lib/state')
      states.value = State.getStatesOfCountry(newCountryCode)
      loading.value = false
    } else {
      states.value = []
    }
    // Only reset the state if the country has actually changed from a previous valid value
    if (newCountryCode !== oldCountryCode && oldCountryCode !== undefined) {
      emit('update:modelValue', '')
    }
  },
  { immediate: true },
)

const options = computed<SearchableOption[]>(() =>
  states.value.map((state) => ({ value: state.isoCode, label: state.name })),
)

const handleUpdate = (value: string) => {
  emit('update:modelValue', value)
}
</script>

<template>
  <SearchableSelect
    :model-value="props.modelValue"
    :options="options"
    :disabled="!props.countryCode || loading"
    :placeholder="loading ? t('common.loading') : t('serverRegistration.fields.state')"
    :search-placeholder="t('common.searchPlaceholder')"
    @update:model-value="handleUpdate"
  />
</template>
