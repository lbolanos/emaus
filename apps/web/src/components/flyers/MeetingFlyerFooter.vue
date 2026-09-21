<template>
	<footer class="print-exact relative h-[80px] flex items-center justify-center px-8 overflow-hidden print:overflow-visible">
		<div
			class="absolute inset-0 bg-cover bg-center z-0"
			:style="{ backgroundImage: `url('${backgroundImage}')` }"
		>
			<div class="absolute inset-0 bg-gradient-to-r from-black via-gray-900 to-black opacity-60 print:opacity-90"></div>
		</div>

		<div class="relative z-10 text-center">
			<h2
				v-if="content.footerText"
				class="text-[40px] font-bold text-white leading-none mb-2 font-display drop-shadow-2xl"
				style="font-family: 'Dancing Script', cursive; text-shadow: 4px 4px 12px rgba(0, 0, 0, 0.6)"
			>
				{{ content.footerText }}
			</h2>
		</div>
	</footer>
</template>

<script setup lang="ts">
import type { MeetingFlyerContent } from '@/composables/useMeetingFlyerContent';

defineProps<{
	content: MeetingFlyerContent;
	backgroundImage: string;
}>();
</script>
