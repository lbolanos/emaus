<script setup lang="ts">
import { computed } from 'vue'
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { SwitchRoot, SwitchThumb } from "reka-ui"
import { cn } from '../../../lib/utils'

/**
 * reka-ui's SwitchRoot only understands `modelValue` / `update:modelValue`. The
 * legacy `checked` / `update:checked` pair (radix-vue) is still accepted here so
 * older call sites keep working, but it is mapped onto the current API — passing
 * `checked` straight through left the switch stuck on "off" and never fired a
 * change event.
 *
 * The forward is written by hand on purpose: `useForwardPropsEmits` would re-emit
 * `update:modelValue` on top of the one this component already emits, firing every
 * consumer's handler twice.
 */
interface SwitchProps {
	/** @deprecated use `modelValue` / `v-model` */
	checked?: boolean
	/** @deprecated use `defaultValue` semantics via `modelValue` */
	defaultChecked?: boolean
	disabled?: boolean
	required?: boolean
	name?: string
	id?: string
	class?: HTMLAttributes["class"]
	modelValue?: boolean
}

// `checked`/`modelValue`/`defaultChecked` default to `undefined` on purpose: Vue casts
// an absent boolean prop to `false`, which would make `modelValue ?? checked` always
// resolve to `false` and ignore the legacy prop.
const props = withDefaults(defineProps<SwitchProps>(), {
	checked: undefined,
	defaultChecked: undefined,
	modelValue: undefined,
	disabled: false,
	required: false,
})

const emits = defineEmits<{
	(e: 'update:modelValue', payload: boolean): void
	(e: 'update:checked', payload: boolean): void
}>()

// `class` is applied below; the value props are replaced by the v-model binding.
const delegatedProps = reactiveOmit(props, 'class', 'checked', 'defaultChecked', 'modelValue')

const state = computed({
	get() {
		return props.modelValue ?? props.checked ?? props.defaultChecked ?? false
	},
	set(value) {
		emits('update:modelValue', value)
		emits('update:checked', value)
	},
})
</script>

<template>
	<SwitchRoot
		v-bind="delegatedProps"
		v-model="state"
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
