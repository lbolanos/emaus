<template>
	<div class="p-4">
		<p
			v-if="content.encounterDescriptionHtml"
			class="text-[18px] text-[color:var(--fb-text)] text-center leading-relaxed font-medium"
			style="font-family: 'Playfair Display', serif"
		>
			<span class="font-bold" v-html="content.encounterDescriptionHtml"></span>
		</p>
		<div v-if="content.dareToLiveItText" class="mt-3 text-center">
			<span
				class="inline-block font-black text-[color:var(--fb-heading)] text-[26px] px-5 py-2 rounded-xl tracking-wide border-2 border-current/30"
				style="font-family: 'Playfair Display', serif"
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
