<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import { ComboboxSeparator, type ComboboxSeparatorProps } from 'radix-vue'
import { cn } from '@repo/ui/lib/utils'

const props = defineProps<ComboboxSeparatorProps & {
  class?: HTMLAttributes['class']
}>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})
</script>

<template>
  <ComboboxSeparator v-bind="delegatedProps" :class="cn('bg-border -mx-1 h-px', props.class)" />
</template>