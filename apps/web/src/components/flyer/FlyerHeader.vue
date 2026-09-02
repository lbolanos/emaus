<template>
	<header
		class="print-exact relative h-[140px] px-8 py-4 flex flex-row items-center justify-between overflow-hidden print:overflow-visible print:bg-blue-900 print:h-[130px] print:px-6 print:py-3"
		style="height: 154px"
	>
		<div
			class="absolute inset-0 bg-cover bg-center z-0"
			:style="{ backgroundImage: `url('${backgroundImage}')` }"
		>
			<div
				class="absolute inset-0 bg-gradient-to-r from-blue-900/80 via-blue-800/70 to-blue-900/80"
			></div>
			<div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20"></div>
		</div>

		<div class="relative z-10 flex flex-col items-center flex-shrink-0 mr-6 drop-shadow-2xl">
			<div class="relative mb-1.5 transform hover:scale-110 transition-all duration-300 hover:rotate-3">
				<div class="absolute inset-0 bg-white/20 rounded-full blur-xl"></div>
				<img
					:src="logo"
					alt="Emaus Logo"
					class="w-[90px] h-[90px] object-contain filter drop-shadow-2xl relative z-10"
				/>
			</div>
			<h2
				class="text-[22px] font-black uppercase tracking-[0.35em] text-white leading-none font-header drop-shadow-lg"
			>
				Emaús
			</h2>
			<div class="flex items-center gap-2 mt-1">
				<p
					class="text-[11px] text-white/95 text-center uppercase font-bold leading-tight tracking-[0.2em] drop-shadow-md"
				>
					{{ content.retreatParish }}
				</p>
				<p
					v-if="content.retreatNumber"
					class="text-[15px] text-yellow-300 text-center uppercase font-black leading-tight tracking-[0.25em] drop-shadow-lg font-header px-3 py-0.5 bg-yellow-500/20 rounded-full border border-yellow-400/30"
				>
					{{ content.retreatNumber }}
				</p>
			</div>
		</div>

		<div class="relative z-10 text-right flex-1 pr-2">
			<p
				v-if="content.subtitleText"
				class="text-[17px] text-white/95 font-bold mb-0.5 uppercase tracking-[0.25em] drop-shadow-lg"
			>
				{{ content.subtitleText }}
			</p>
			<h1
				v-if="content.titleText"
				id="flyer-title"
				data-flyer-title
				class="flyer-title text-[68px] font-bold text-white leading-[0.9] transform -rotate-1 origin-bottom-right pb-1"
				style="font-family: 'Miltonian Tattoo', cursive"
			>
				{{ content.titleText }}
			</h1>
			<p
				v-if="content.quoteText"
				class="text-[13px] text-white/95 italic font-medium tracking-wide mt-10 drop-shadow-lg leading-tight max-w-[420px] ml-auto whitespace-pre-line"
			>
				"{{ content.quoteText }}"
			</p>
		</div>
	</header>
</template>

<script setup lang="ts">
import type { FlyerContent } from '@/composables/useFlyerContent';

defineProps<{
	content: FlyerContent;
	backgroundImage: string;
	logo: string;
}>();
</script>
