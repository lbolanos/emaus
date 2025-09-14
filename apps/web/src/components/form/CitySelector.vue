<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import { City } from 'country-state-city';
import type { ICity } from 'country-state-city';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';

const props = defineProps<{
  modelValue: string;
  countryCode: string;
  stateCode: string;
}>();

const emit = defineEmits(['update:modelValue']);

const cities = ref<ICity[]>([]);

watchEffect(() => {
  if (props.countryCode && props.stateCode) {
    cities.value = City.getCitiesOfState(props.countryCode, props.stateCode);
  } else {
    cities.value = [];
  }
}, { flush: 'pre' });

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