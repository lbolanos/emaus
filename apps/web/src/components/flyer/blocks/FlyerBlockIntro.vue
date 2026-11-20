<template>
	<div class="p-4">
		<p
			v-if="content.encounterDescriptionHtml"
			class="text-[length:calc(1.125rem*var(--fb-text-scale,1))] text-[color:var(--fb-text)] leading-relaxed font-medium"
		>
			<span class="font-bold" v-html="content.encounterDescriptionHtml"></span>
		</p>
		<div v-if="content.dareToLiveItText" class="mt-3">
			<span
				class="inline-block font-black text-[color:var(--fb-heading)] text-[length:calc(1.625rem*var(--fb-heading-scale,1))] px-5 py-2 rounded-xl tracking-wide border-2 border-current/30"
			>
				{{ content.dareToLiveItText }}
			</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { FlyerContent } from '@/composables/useFlyerContent';

defineProps<{ content: FlyerContent }>();
</script>
