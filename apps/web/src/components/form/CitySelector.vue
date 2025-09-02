<script setup lang="ts">
import { ref, watch } from 'vue';
import { City } from 'country-state-city';
import type { ICity } from 'country-state-city';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select';

const props = defineProps<{
  modelValue: string;
  countryCode: string;
  stateCode: string;
}>();

const emit = defineEmits(['update:modelValue']);

const cities = ref<ICity[]>([]);

watch(() => [props.countryCode, props.stateCode], ([newCountryCode, newStateCode], [oldCountryCode, oldStateCode] = []) => {
  if (newCountryCode && newStateCode) {
    cities.value = City.getCitiesOfState(newCountryCode, newStateCode);
  } else {
    cities.value = [];
  }
  // Only reset the city if the country or state has actually changed from a previous valid value
  if ((newCountryCode !== oldCountryCode && oldCountryCode !== undefined) || (newStateCode !== oldStateCode && oldStateCode !== undefined)) {
    emit('update:modelValue', '');
  }
}, { immediate: true });

const handleUpdate = (value: string) => {
  emit('update:modelValue', value);
};
</script>

<template>
  <Select :model-value="props.modelValue" @update:model-value="handleUpdate" :disabled="!stateCode">
    <SelectTrigger>
      <SelectValue :placeholder="$t('serverRegistration.fields.city')" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="city in cities" :key="city.name" :value="city.name">
        {{ city.name }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>