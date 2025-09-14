<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Country } from 'country-state-city';
import type { ICountry } from 'country-state-city';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits(['update:modelValue']);

const countries = ref<ICountry[]>([]);

onMounted(() => {
  countries.value = Country.getAllCountries();
});

const handleUpdate = (value: string) => {
  console.log('[CountrySelector] handleUpdate called with:', value);
  emit('update:modelValue', value);
};
</script>

<template>
  <Select :model-value="props.modelValue" @update:model-value="handleUpdate">
    <SelectTrigger>
      <SelectValue :placeholder="$t('serverRegistration.fields.country')" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="country in countries" :key="country.isoCode" :value="country.isoCode">
        {{ country.name }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>
