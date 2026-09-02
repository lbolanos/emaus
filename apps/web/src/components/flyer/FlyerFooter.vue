<template>
	<footer
		class="print-exact relative min-h-[120px] flex items-center justify-between gap-6 px-8 py-3 overflow-hidden mt-auto print:bg-gray-900 print:min-h-[110px] print:px-8"
	>
		<div
			class="absolute inset-0 bg-cover bg-center z-0"
			:style="{ backgroundImage: `url('${backgroundImage}')` }"
		>
			<div
				class="absolute inset-0 bg-gradient-to-r from-blue-900/90 via-gray-900/80 to-blue-900/90 print:opacity-90"
			></div>
		</div>

		<div
			class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-400 z-10"
		></div>

		<div class="relative z-10 flex flex-col justify-center h-full">
			<h2
				data-ven-text
				class="text-[52px] font-bold text-white leading-none mb-2 font-display drop-shadow-2xl"
				style="font-family: 'Dancing Script', cursive; text-shadow: 4px 4px 12px rgba(0, 0, 0, 0.6)"
			>
				{{ content.comeText }}
			</h2>
			<div
				class="bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-400 text-black text-[13px] font-black px-6 py-1.5 rounded-full uppercase w-max tracking-[0.25em] shadow-2xl print:bg-yellow-400 animate-pulse border-2 border-yellow-300"
			>
				{{ content.limitedCapacityText }}
			</div>
		</div>

		<div class="relative z-10 max-w-md text-right flex flex-col justify-center h-full min-w-0">
			<h3
				class="text-[28px] font-black text-white uppercase tracking-[0.2em] mb-2 font-header drop-shadow-xl"
				style="text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.5)"
			>
				{{ content.dontMissItText }}
			</h3>
			<p
				class="text-[12px] text-gray-100 leading-tight max-w-[260px] ml-auto drop-shadow-md font-semibold"
			>
				{{ content.reservationNoteText }}
			</p>
		</div>
	</footer>
</template>

<script setup lang="ts">
import type { FlyerContent } from '@/composables/useFlyerContent';

defineProps<{
	content: FlyerContent;
	backgroundImage: string;
}>();
</script>
