<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { ICountry } from 'country-state-city';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits(['update:modelValue']);

const countries = ref<ICountry[]>([]);
const loading = ref(false);

onMounted(async () => {
  loading.value = true;
  const { Country } = await import('country-state-city');
  countries.value = Country.getAllCountries();
  loading.value = false;
});

const handleUpdate = (value: string) => {
  emit('update:modelValue', value);
};
</script>

<template>
  <Select :model-value="props.modelValue" @update:model-value="handleUpdate" :disabled="loading">
    <SelectTrigger>
      <SelectValue :placeholder="loading ? 'Cargando...' : $t('serverRegistration.fields.country')" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="country in countries" :key="country.isoCode" :value="country.isoCode">
        {{ country.name }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>
