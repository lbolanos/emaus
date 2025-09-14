<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import { type ComboboxRootEmits, type ComboboxRootProps, useForwardPropsEmits } from 'radix-vue'
import { Dialog, DialogContent } from '../dialog'
import Command from './Command.vue'

const props = defineProps<ComboboxRootProps & {
  class?: HTMLAttributes['class']
}>()
const emits = defineEmits<ComboboxRootEmits>()

const delegatedProps = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { class: _, ...delegated } = props
  void _
  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps.value, emits)
</script>

<template>
  <Dialog>
    <DialogContent class="p-0 overflow-hidden shadow-lg">
      <Command v-bind="forwarded" class="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
        <slot />
      </Command>
    </DialogContent>
  </Dialog>
</template>