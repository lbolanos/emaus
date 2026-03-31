<script setup lang="ts">
import type { TdHTMLAttributes } from 'vue'
import { cn } from '../../../lib/utils'

const props = defineProps<{
  class?: TdHTMLAttributes['class']
}>()
</script>

<template>
  <td :class="cn('px-2 py-1 align-middle [&:has([role=checkbox])]:pr-0', props.class)">
    <slot />
  </td>
</template>
