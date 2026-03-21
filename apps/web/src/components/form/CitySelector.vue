<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import type { ICity } from 'country-state-city';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';

const props = defineProps<{
  modelValue: string;
  countryCode: string;
  stateCode: string;
}>();

const emit = defineEmits(['update:modelValue']);

const cities = ref<ICity[]>([]);
const loading = ref(false);

watchEffect(async () => {
  if (props.countryCode && props.stateCode) {
    loading.value = true;
    const { City } = await import('country-state-city');
    cities.value = City.getCitiesOfState(props.countryCode, props.stateCode);
    loading.value = false;
  } else {
    cities.value = [];
  }
});

const handleUpdate = (value: string) => {
  emit('update:modelValue', value);
};
</script>

<template>
  <Select :model-value="props.modelValue" @update:model-value="handleUpdate" :disabled="!stateCode || loading">
    <SelectTrigger>
      <SelectValue :placeholder="loading ? 'Cargando...' : $t('serverRegistration.fields.city')" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="city in cities" :key="city.name" :value="city.name">
        {{ city.name }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>