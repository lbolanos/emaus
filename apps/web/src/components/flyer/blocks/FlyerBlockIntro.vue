<template>
	<div class="p-4 rounded-2xl">
		<p
			class="text-[18px] text-gray-900 text-center leading-relaxed font-medium"
			style="font-family: 'Playfair Display', serif"
		>
			<span class="font-bold" v-html="content.encounterDescriptionHtml"></span>
		</p>
		<div class="mt-3 text-center">
			<span
				class="inline-block font-black text-blue-800 text-[26px] px-5 py-2 from-blue-50 to-indigo-50 rounded-xl tracking-wide shadow-lg border-2 border-blue-200"
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
