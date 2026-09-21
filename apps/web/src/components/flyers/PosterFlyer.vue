<template>
	<div
		id="printable-area"
		class="poster-container relative w-full overflow-hidden rounded-3xl print:rounded-none shadow-2xl print:shadow-none"
		:style="containerStyle"
	>
		<!-- Overlay for better contrast — dense enough that a busy background
		     image doesn't fight the text, while the edges still let it breathe -->
		<div class="absolute inset-0 bg-gradient-to-b from-black/55 via-black/40 to-black/65 print:hidden"></div>
		
		<main class="relative flex min-h-[600px] w-full items-center justify-center p-8 md:p-12 print:p-6 print:min-h-0">
			<!-- Main Content Card with enhanced glassmorphism -->
			<section class="glass-card-premium relative flex max-w-2xl flex-col items-center justify-center rounded-3xl px-8 py-10 text-center sm:px-12 sm:py-12 md:px-16 md:py-14 shadow-2xl">
				<!-- Decorative top accent -->
				<div class="absolute -top-1 left-1/2 -translate-x-1/2 w-24 h-1 bg-gradient-to-r from-transparent via-emaus-gold to-transparent rounded-full"></div>

				<!-- Emaús brand — same anti-duplication guard as the WhatsApp style:
				     "EMAÚS / Emaús del Valle" stacked would read as a stutter. -->
				<h2 v-if="showBrandHeader" class="font-serif-title text-sm sm:text-base font-semibold tracking-[0.45em] text-white/80 mb-4">
					EMAÚS
				</h2>

				<!-- Meeting title leads; the community becomes the supporting line -->
				<h1 class="font-serif-title text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-[0.08em] text-emaus-gold shadow-text-gold leading-tight mb-2 animate-fade-in">
					{{ heroTitle }}
				</h1>

				<!-- Community as the supporting line -->
				<p v-if="showCommunitySubtitle" class="text-xs sm:text-sm uppercase tracking-[0.35em] text-white/85 font-semibold mb-4 text-shadow-medium">
					{{ communityName }}
				</p>

				<!-- Decorative divider -->
				<div class="flex items-center gap-4 mb-6 w-full max-w-sm">
					<div class="flex-1 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"></div>
					<div class="w-2 h-2 rotate-45 bg-emaus-gold/80"></div>
					<div class="flex-1 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"></div>
				</div>

				<!-- Date with icon -->
				<div class="flex items-center gap-3 mb-3">
					<svg class="w-5 h-5 text-emaus-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
					</svg>
					<p class="text-xl sm:text-2xl md:text-3xl text-white font-bold first-letter:uppercase text-shadow-strong">
						{{ formattedDateOnly }}
					</p>
				</div>

				<!-- Time with enhanced presentation -->
				<div class="flex items-center gap-3 mb-5">
					<svg class="w-5 h-5 text-emaus-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<p class="text-lg sm:text-xl md:text-2xl text-white font-semibold tracking-wide text-shadow-strong">
						{{ formattedTime }} hrs.
					</p>
				</div>

				<!-- Description with better styling -->
				<p v-if="processedDescription" class="mb-5 text-sm sm:text-base md:text-lg text-white font-medium leading-relaxed max-w-lg px-4 text-shadow-medium whitespace-pre-line">
					{{ processedDescription }}
				</p>

				<!-- Another decorative divider (same motif as the one above) -->
				<div class="flex items-center gap-4 mb-5 w-full max-w-xs">
					<div class="flex-1 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
					<div class="w-2 h-2 rotate-45 bg-emaus-gold/80"></div>
					<div class="flex-1 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
				</div>

				<!-- Location with icon -->
				<div class="flex items-center gap-3">
					<svg class="w-5 h-5 text-emaus-gold flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
					</svg>
					<p class="text-sm sm:text-base md:text-lg text-white font-semibold leading-snug text-center text-shadow-strong">
						{{ locationMessage }}
					</p>
				</div>
			</section>

			<!-- QR Code Section - Enhanced -->
			<div v-if="community?.googleMapsUrl && community.googleMapsUrl.trim()" class="qr-container absolute bottom-4 left-4 flex flex-col items-center gap-2 md:bottom-6 md:left-6 print:bottom-2 print:left-2">
				<div class="qr-card relative overflow-hidden rounded-xl p-1 bg-gradient-to-br from-emaus-gold via-amber-400 to-emaus-gold shadow-lg">
					<div class="bg-white rounded-lg p-2">
						<QrcodeVue :value="community.googleMapsUrl" :size="110" level="L" background="#ffffff" render-as="canvas" class="rounded-sm" />
					</div>
				</div>
				<span class="qr-label text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full border border-white/20">
					📍 Ubicación
				</span>
			</div>

			<!-- Decorative bottom right element -->
			<div class="absolute bottom-6 right-6 opacity-60 print:hidden">
				<div class="text-emaus-gold/40 text-6xl font-serif-title tracking-widest" style="writing-mode: vertical-rl;">
					Emaús
				</div>
			</div>
		</main>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import QrcodeVue from 'qrcode.vue';
import { formatMeetingDateOnly, formatMeetingTimeOnly } from '@/utils/meetingFlyer';

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

// Background image + the --card-a knob the glass card reads. Driving the alpha
// through a CSS var keeps the gradient in one place while the community dials
// the transparency.
const containerStyle = computed(() => ({
	backgroundImage: `url('${props.backgroundUrl || '/poster.png'}')`,
	...(props.cardOpacity !== undefined
		? { '--card-a': String(props.cardOpacity) }
		: {}),
}));

// The meeting title leads the hierarchy; without one, the community name
// keeps the leading role (and then there is no subtitle to duplicate it).
const heroTitle = computed(() => props.meeting?.title?.trim() || props.communityName);
const showCommunitySubtitle = computed(() => !!props.meeting?.title?.trim());
const showBrandHeader = computed(() => !/^ema[úu]s\b/i.test(props.communityName.trim()));

const formattedDateOnly = computed(() => {
	if (!props.meeting?.startDate) return '';
	return formatMeetingDateOnly(props.meeting.startDate, props.community);
});

const formattedTime = computed(() => {
	if (!props.meeting?.startDate) return '';
	return formatMeetingTimeOnly(props.meeting.startDate, props.community);
});

const locationMessage = computed(() => {
	return props.formattedAddress || 'Ubicación por definir';
});
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&display=swap');

/* Container styles */
.poster-container {
	background-size: cover;
	background-position: center;
	background-repeat: no-repeat;
	min-height: 600px;
}

/* Glassmorphism — opaque enough to rest text on a busy background.
   No saturate() here: it re-saturates the image showing through and
   brings back the visual noise the veil is trying to calm. */
.glass-card-premium {
	background: linear-gradient(
		135deg,
		rgba(24, 24, 34, var(--card-a, 0.82)) 0%,
		rgba(16, 16, 26, var(--card-a, 0.78)) 50%,
		rgba(24, 24, 34, var(--card-a, 0.80)) 100%
	);
	backdrop-filter: blur(20px);
	-webkit-backdrop-filter: blur(20px);
	border: 1px solid rgba(255, 255, 255, 0.15);
	box-shadow:
		0 8px 32px rgba(0, 0, 0, 0.4),
		0 16px 48px rgba(0, 0, 0, 0.2),
		inset 0 1px 0 rgba(255, 255, 255, 0.1),
		inset 0 -1px 0 rgba(0, 0, 0, 0.2);
}

/* Text shadow utilities for better readability */
.text-shadow-strong {
	text-shadow: 
		0 1px 2px rgba(0, 0, 0, 0.8),
		0 2px 4px rgba(0, 0, 0, 0.6),
		0 4px 8px rgba(0, 0, 0, 0.4);
}

.text-shadow-medium {
	text-shadow: 
		0 1px 2px rgba(0, 0, 0, 0.7),
		0 2px 4px rgba(0, 0, 0, 0.4);
}

/* Gold color */
.text-emaus-gold {
	color: #D4AF37;
}

.bg-emaus-gold {
	background-color: #D4AF37;
}

.border-emaus-gold {
	border-color: #D4AF37;
}

/* Enhanced text shadow for gold text */
.shadow-text-gold {
	text-shadow: 
		0 2px 4px rgba(0, 0, 0, 0.5),
		0 4px 8px rgba(0, 0, 0, 0.3),
		0 0 40px rgba(212, 175, 55, 0.3);
}

/* Serif title font */
.font-serif-title {
	font-family: 'Cinzel', serif;
	font-weight: 600;
}

/* QR Code hover effect */
.qr-container {
	transition: transform 0.3s ease, opacity 0.3s ease;
}

.qr-container:hover {
	transform: scale(1.05);
}

.qr-card {
	transition: box-shadow 0.3s ease;
}

.qr-card:hover {
	box-shadow: 0 0 20px rgba(212, 175, 55, 0.5);
}

/* Fade in animation for title */
@keyframes fadeIn {
	from {
		opacity: 0;
		transform: translateY(-10px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.animate-fade-in {
	animation: fadeIn 0.8s ease-out;
}

/* Print styles */
@media print {
	.poster-container {
		min-height: auto;
		page-break-inside: avoid;
	}

	.glass-card-premium {
		background: rgba(255, 255, 255, 0.95);
		border: 2px solid #333;
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
	}

	.text-emaus-gold {
		color: #1a1a1a !important;
	}

	.text-white,
	.text-white\/90,
	.text-white\/95 {
		color: #000 !important;
	}

	.shadow-text-gold {
		text-shadow: none;
	}

	.qr-card {
		background: #fff;
		border: 2px solid #333;
	}

	.qr-label {
		background: #f0f0f0;
		color: #333;
		border-color: #333;
	}

	/* Hide decorative elements in print */
	.poster-container > div:first-child {
		display: none;
	}
}

/* Responsive adjustments */
@media (max-width: 640px) {
	.poster-container {
		min-height: 500px;
	}

	.glass-card-premium {
		padding-left: 1.5rem;
		padding-right: 1.5rem;
	}
}
</style>
