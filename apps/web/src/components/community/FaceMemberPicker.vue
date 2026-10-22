<template>
  <!-- Inline autocomplete: a Popover + Command does not mount inside a Dialog in this repo. -->
  <div class="space-y-1">
    <Input
      v-model="query"
      :placeholder="placeholder"
      :aria-label="placeholder"
      autocomplete="off"
    />
    <ul v-if="matches.length" class="rounded-md border bg-background divide-y" role="listbox">
      <li v-for="candidate in matches" :key="candidate.id">
        <button
          type="button"
          role="option"
          class="w-full px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted"
          :data-member-id="candidate.id"
          @click="pick(candidate.id)"
        >
          {{ candidate.name }}
        </button>
      </li>
    </ul>
    <p v-else-if="query.trim()" class="px-1 text-xs text-muted-foreground">Nadie coincide.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Input } from '@repo/ui';

export interface PickerCandidate {
  id: string;
  name: string;
}

const props = withDefaults(
  defineProps<{
    candidates: PickerCandidate[];
    placeholder?: string;
    maxResults?: number;
  }>(),
  { placeholder: 'Buscar por nombre', maxResults: 6 },
);

const emit = defineEmits<{ (e: 'select', memberId: string): void }>();

const query = ref('');

// Without accents or case, so "jose" finds "José".
const normalize = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

const matches = computed(() => {
  const tokens = normalize(query.value).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  return props.candidates
    .filter((c) => {
      const name = normalize(c.name);
      return tokens.every((token) => name.includes(token));
    })
    .slice(0, props.maxResults);
});

const pick = (memberId: string) => {
  emit('select', memberId);
  query.value = '';
};
</script>
