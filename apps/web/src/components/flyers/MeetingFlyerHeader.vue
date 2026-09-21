<template>
	<header
		class="print-exact relative min-h-[140px] px-8 py-5 flex flex-row items-center justify-between overflow-hidden print:min-h-[120px] print:px-6 print:py-3 print:overflow-visible"
	>
		<div
			class="absolute inset-0 bg-cover bg-center z-0"
			:style="{ backgroundImage: `url('${backgroundImage}')` }"
		>
			<div class="absolute inset-0 bg-gradient-to-r from-blue-900/80 via-blue-800/70 to-blue-900/80"></div>
			<div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20"></div>
		</div>

		<!-- Logo column: "EMAÚS" is dropped when the community's own name carries it -->
		<div class="relative z-10 flex flex-col items-center flex-shrink-0 mr-6 drop-shadow-2xl">
			<div class="relative mb-1.5 transform hover:scale-110 transition-all duration-300 hover:rotate-3">
				<div class="absolute inset-0 bg-white/20 rounded-full blur-xl"></div>
				<img
					:src="logo"
					alt="Emaús Logo"
					class="w-[90px] h-[90px] object-contain filter drop-shadow-2xl relative z-10"
				/>
			</div>
			<h2
				v-if="content.showEmausLine"
				class="text-[22px] font-black uppercase tracking-[0.35em] text-white leading-none font-header drop-shadow-lg"
			>
				{{ content.emausLine }}
			</h2>
			<div class="flex items-center gap-2 mt-1">
				<p
					v-if="content.showEmausLine || content.communityName"
					class="text-[11px] text-white/95 text-center uppercase font-bold leading-tight tracking-[0.2em] drop-shadow-md"
				>
					{{ content.communityName }}
				</p>
			</div>
		</div>

		<!-- The title lives in the chrome, like the retreat's banner: overridable as
		     text, hidden as text, but never dragged around -->
		<div class="relative z-10 text-right flex-1">
			<p
				v-if="content.kickerText"
				class="text-[17px] text-white/95 font-bold mb-0.5 uppercase tracking-[0.25em] drop-shadow-lg"
			>
				{{ content.kickerText }}
			</p>
			<h1
				v-if="content.titleText"
				id="flyer-title"
				data-flyer-title
				class="flyer-title font-bold text-white leading-[0.9] transform -rotate-1 origin-bottom-right pb-1 font-display break-words"
				:class="titleSizeClass"
				style="font-family: 'Miltonian Tattoo', cursive; filter: drop-shadow(5px 5px 10px rgba(0, 0, 0, 0.7)); text-shadow: 4px 4px 8px rgba(0, 0, 0, 0.5)"
			>
				{{ content.titleText }}
			</h1>
		</div>
	</header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MeetingFlyerContent } from '@/composables/useMeetingFlyerContent';

const props = defineProps<{
	content: MeetingFlyerContent;
	backgroundImage: string;
	logo: string;
}>();

// The display font is expressive but wide: a long meeting title at full size
// runs into the header edges. Step the size down as the title grows instead.
const titleSizeClass = computed(() => {
	const length = props.content.titleText?.trim().length ?? 0;
	if (length > 40) return 'text-[34px] print:text-[30px]';
	if (length > 22) return 'text-[44px] print:text-[38px]';
	return 'text-[64px] print:text-[56px]';
});
</script>
