<script setup lang="ts">
import { ref, watch } from 'vue';
import type { IState } from 'country-state-city';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';

const props = defineProps<{
  modelValue: string;
  countryCode: string;
}>();

const emit = defineEmits(['update:modelValue']);

const states = ref<IState[]>([]);
const loading = ref(false);

watch(() => props.countryCode, async (newCountryCode, oldCountryCode) => {
  if (newCountryCode) {
    loading.value = true;
    const { State } = await import('country-state-city');
    states.value = State.getStatesOfCountry(newCountryCode);
    loading.value = false;
  } else {
    states.value = [];
  }
  // Only reset the state if the country has actually changed from a previous valid value
  if (newCountryCode !== oldCountryCode && oldCountryCode !== undefined) {
    emit('update:modelValue', '');
  }
}, { immediate: true });

const handleUpdate = (value: string) => {
  console.log('[StateSelector] handleUpdate called with:', value);
  emit('update:modelValue', value);
};
</script>

<template>
  <Select :model-value="props.modelValue" @update:model-value="handleUpdate" :disabled="!countryCode || loading">
    <SelectTrigger>
      <SelectValue :placeholder="loading ? 'Cargando...' : $t('serverRegistration.fields.state')" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="state in states" :key="state.isoCode" :value="state.isoCode">
        {{ state.name }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>