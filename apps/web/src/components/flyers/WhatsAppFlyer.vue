<template>
	<div
		id="printable-area"
		class="whatsapp-container relative flex p-8 overflow-hidden rounded-2xl shadow-2xl"
		:style="containerStyle"
	>
		<!-- Light overlay -->
		<div class="absolute inset-0 bg-gradient-to-b from-white/60 via-white/40 to-white/65"></div>

		<!-- Main Content Card - fills entire container -->
		<section class="glass-card-wa relative flex h-full w-full flex-col items-center justify-center rounded-2xl px-8 py-6 text-center">
			<!-- Emaús header — hidden when the community name already carries the brand
			     (e.g. "Emaús del Valle" would read "EMAÚS / Emaús del Valle"). -->
			<h2 v-if="showBrandHeader" class="font-serif-title text-4xl font-bold tracking-[0.2em] text-emaus-gold-dark mb-3">EMAÚS</h2>

			<!-- Meeting title leads; the community becomes the supporting line -->
			<h1 class="font-serif-title text-2xl sm:text-3xl font-bold tracking-[0.06em] text-emaus-gold-dark leading-tight mb-2">
				{{ heroTitle }}
			</h1>

			<!-- Community as the supporting line -->
			<p v-if="showCommunitySubtitle" class="text-[11px] uppercase tracking-[0.3em] text-gray-600 font-semibold mb-3">
				{{ communityName }}
			</p>

			<!-- Decorative divider -->
			<div class="flex items-center gap-3 mb-4 w-full max-w-xs">
				<div class="flex-1 h-px bg-gradient-to-r from-transparent via-gray-400/60 to-transparent"></div>
				<div class="w-2 h-2 rotate-45 bg-emaus-gold/80"></div>
				<div class="flex-1 h-px bg-gradient-to-r from-transparent via-gray-400/60 to-transparent"></div>
			</div>

			<!-- Date with icon -->
			<div class="flex items-center gap-2.5 mb-2">
				<svg class="w-4 h-4 text-emaus-gold-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
				</svg>
				<p class="text-lg text-gray-900 font-bold first-letter:uppercase">
					{{ formattedDateOnly }}
				</p>
			</div>

			<!-- Time -->
			<div class="flex items-center gap-2.5 mb-4">
				<svg class="w-4 h-4 text-emaus-gold-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<p class="text-base text-gray-800 font-semibold tracking-wide">
					{{ formattedTime }} hrs.
				</p>
			</div>

			<!-- Description -->
			<p v-if="processedDescription" class="mb-4 text-sm text-gray-700 font-medium leading-relaxed max-w-sm px-2 line-clamp-5 whitespace-pre-line">
				{{ processedDescription }}
			</p>

			<!-- Location with icon -->
			<div class="flex items-center gap-2.5">
				<svg class="w-4 h-4 text-emaus-gold-dark flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
				</svg>
				<p class="text-sm text-gray-800 font-semibold leading-snug text-center">
					{{ locationMessage }}
				</p>
			</div>
		</section>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { showEmausBrandLine } from '@/utils/meetingFlyer';
import { useMeetingFlyerDateTime } from '@/composables/useMeetingFlyerDateTime';

const props = defineProps<{
	meeting: any;
	community: any;
	formattedAddress: string;
	processedDescription: string;
	communityName: string;
	/** Community-picked background; falls back to the shipped default art. */
	backgroundUrl?: string;
	/** Community-tuned glass card opacity (0.3–1); unset → style default. */
	cardOpacity?: number;
}>();

// Background image + the --card-a knob the glass card reads (same mechanism
// as the poster style).
const containerStyle = computed(() => ({
	backgroundImage: `url('${props.backgroundUrl || '/poster.png'}')`,
	...(props.cardOpacity !== undefined
		? { '--card-a': String(props.cardOpacity) }
		: {}),
}));

const showBrandHeader = computed(() => showEmausBrandLine(props.communityName));

// Same hierarchy as the poster style: the meeting title leads; without one,
// the community name keeps the leading role (no subtitle to duplicate it).
const heroTitle = computed(() => props.meeting?.title?.trim() || props.communityName);
const showCommunitySubtitle = computed(() => !!props.meeting?.title?.trim());

const { formattedDateOnly, formattedTime } = useMeetingFlyerDateTime(
	() => props.meeting,
	() => props.community,
);

const locationMessage = computed(() => {
	return props.formattedAddress || 'Ubicación por definir';
});
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&display=swap');

/* Container styles - fixed square */
.whatsapp-container {
	width: 600px;
	height: 600px;
	aspect-ratio: 1 / 1;
	background-size: cover;
	background-position: center;
	background-repeat: no-repeat;
}

/* Light glassmorphism card */
.glass-card-wa {
	background: linear-gradient(
		135deg,
		rgba(255, 255, 255, var(--card-a, 0.85)) 0%,
		rgba(255, 255, 255, var(--card-a, 0.78)) 50%,
		rgba(255, 255, 255, var(--card-a, 0.82)) 100%
	);
	backdrop-filter: blur(12px) saturate(180%);
	-webkit-backdrop-filter: blur(12px) saturate(180%);
	border: 1px solid rgba(255, 255, 255, 0.6);
	box-shadow:
		0 8px 32px rgba(0, 0, 0, 0.12),
		0 16px 48px rgba(0, 0, 0, 0.08),
		inset 0 1px 0 rgba(255, 255, 255, 0.8),
		inset 0 -1px 0 rgba(0, 0, 0, 0.05);
}

/* Darker gold for light backgrounds */
.text-emaus-gold-dark {
	color: #A67C00;
}

.text-emaus-gold {
	color: #D4AF37;
}

.bg-emaus-gold {
	background-color: #D4AF37;
}

/* Serif title font */
.font-serif-title {
	font-family: 'Cinzel', serif;
	font-weight: 600;
}
</style>
