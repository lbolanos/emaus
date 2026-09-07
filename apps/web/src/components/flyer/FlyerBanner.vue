<template>
	<div class="relative z-20">
		<div
			data-banner
			class="print-exact bg-blue-900/80 backdrop-blur-sm text-white p-2 shadow-xl border-y border-blue-500/30 print:bg-blue-900 print:text-white print:backdrop-blur-none"
		>
			<div
				data-banner-row
				class="flex flex-col md:flex-row print:flex-row items-center justify-center gap-2 md:gap-6 print:gap-2 text-center"
			>
				<h3
					v-if="content.catholicRetreatText"
					data-banner-title
					class="text-xl md:text-2xl font-bold uppercase tracking-widest font-header"
				>
					{{ content.catholicRetreatText }}
				</h3>
				<span
					v-if="content.catholicRetreatText"
					data-banner-divider
					class="hidden md:block print:block w-px h-8 bg-blue-500/30"
				></span>
				<div class="flex items-center gap-3">
					<span
						v-if="content.emausForText"
						class="text-sm opacity-80 uppercase tracking-wide print:opacity-100"
					>
						{{ content.emausForText }}
					</span>
					<span
						class="print-exact text-xl font-bold uppercase text-yellow-300 tracking-widest border border-yellow-400/60 px-5 py-1 rounded-lg bg-gradient-to-r from-yellow-500/20 to-yellow-400/20 backdrop-blur-sm shadow-inner print:text-yellow-400 print:border-yellow-400 print:bg-yellow-500/20 print:backdrop-blur-none"
					>
						{{ content.retreatTypeText }}
					</span>
					<span
						data-banner-divider
						class="hidden md:block print:block w-[1.5px] h-9 bg-blue-300/40"
					></span>
					<p
						v-if="content.formatDateRange"
						class="text-[20px] font-bold text-white tracking-wide drop-shadow-md"
					>
						{{ content.formatDateRange }}
					</p>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { FlyerContent } from '@/composables/useFlyerContent';

defineProps<{ content: FlyerContent }>();
</script>
