<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import { ComboboxGroup, type ComboboxGroupProps } from 'radix-vue'
import { cn } from '@repo/ui/lib/utils'

const props = defineProps<ComboboxGroupProps & {
  class?: HTMLAttributes['class']
}>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})
</script>

<template>
  <ComboboxGroup v-bind="delegatedProps" :class="cn('p-1 text-foreground overflow-hidden [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground', props.class)">
    <slot />
  </ComboboxGroup>
</template>