<script setup lang="ts">
import { ref, watch } from 'vue';
import { State } from 'country-state-city';
import type { IState } from 'country-state-city';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select';

const props = defineProps<{
  modelValue: string;
  countryCode: string;
}>();

const emit = defineEmits(['update:modelValue']);

const states = ref<IState[]>([]);

watch(() => props.countryCode, (newCountryCode, oldCountryCode) => {
  console.log(`[StateSelector] countryCode changed from ${oldCountryCode} to ${newCountryCode}`);
  if (newCountryCode) {
    states.value = State.getStatesOfCountry(newCountryCode);
    console.log(`[StateSelector] Fetched ${states.value.length} states for country ${newCountryCode}`);
  } else {
    states.value = [];
  }
  // Only reset the state if the country has actually changed from a previous valid value
  if (newCountryCode !== oldCountryCode && oldCountryCode !== undefined) {
    console.log('[StateSelector] Country has changed, resetting state value.');
    emit('update:modelValue', '');
  }
}, { immediate: true });

watch(() => props.modelValue, (newValue, oldValue) => {
  console.log(`[StateSelector] modelValue changed from ${oldValue} to ${newValue}`);
});

const handleUpdate = (value: string) => {
  console.log('[StateSelector] handleUpdate called with:', value);
  emit('update:modelValue', value);
};
</script>

<template>
  <Select :model-value="props.modelValue" @update:model-value="handleUpdate" :disabled="!countryCode">
    <SelectTrigger>
      <SelectValue :placeholder="$t('serverRegistration.fields.state')" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="state in states" :key="state.isoCode" :value="state.isoCode">
        {{ state.name }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>