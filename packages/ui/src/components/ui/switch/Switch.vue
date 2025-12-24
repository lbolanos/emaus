<script setup lang="ts">
import { computed } from 'vue'
import type { HTMLAttributes } from "vue"
import { SwitchRoot, SwitchThumb, useForwardPropsEmits } from "reka-ui"
import { cn } from '../../../lib/utils'

interface SwitchProps {
	checked?: boolean
	defaultChecked?: boolean
	disabled?: boolean
	required?: boolean
	name?: string
	id?: string
	class?: HTMLAttributes["class"]
	modelValue?: boolean
}

const props = withDefaults(defineProps<SwitchProps>(), {
	disabled: false,
	required: false,
})

const emits = defineEmits<{
	(e: 'update:modelValue', payload: boolean): void
	(e: 'update:checked', payload: boolean): void
}>()

const modelValue = computed({
	get() {
		return props.modelValue ?? props.checked ?? false
	},
	set(value) {
		console.log('[Switch] updating value:', value)
		emits('update:modelValue', value)
		emits('update:checked', value)
	},
})

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
	<SwitchRoot
		v-bind="forwarded"
		v-model:checked="modelValue"
		:class="cn(
			'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
			props.class,
		)"
	>
		<SwitchThumb
			:class="cn('pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5')"
		>
			<slot name="thumb" />
		</SwitchThumb>
	</SwitchRoot>
</template>
