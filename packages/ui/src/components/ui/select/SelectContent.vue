<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import {
  SelectContent,
  type SelectContentProps,
  SelectPortal,
  SelectViewport,
} from 'radix-vue'
import { cn } from '../../../lib/utils'

const props = defineProps<SelectContentProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { class: _, ...delegated } = props
  void _
  return delegated
})
</script>

<template>
  <SelectPortal>
    <SelectContent
      v-bind="delegatedProps"
      :class="
        cn(
          'relative z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          props.class,
        )
      "
    >
      <SelectViewport
        class="p-1 h-[--radix-select-trigger-height] w-full min-w-[--radix-select-trigger-width]"
      >
        <slot />
      </SelectViewport>
    </SelectContent>
  </SelectPortal>
</template>
