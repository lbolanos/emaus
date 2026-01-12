<template>
	<div
		id="printable-area"
		class="poster-container relative w-full overflow-hidden rounded-3xl print:rounded-none shadow-2xl print:shadow-none"
		:style="{ backgroundImage: `url('/poster.png')` }"
	>
		<!-- Overlay for better contrast -->
		<div class="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/50 print:hidden"></div>
		
		<main class="relative flex min-h-[600px] w-full items-center justify-center p-8 md:p-12 print:p-6 print:min-h-0">
			<!-- Main Content Card with enhanced glassmorphism -->
			<section class="glass-card-premium relative flex max-w-2xl flex-col items-center justify-center rounded-3xl px-8 py-10 text-center sm:px-12 sm:py-12 md:px-16 md:py-14 shadow-2xl">
				<!-- Decorative top accent -->
				<div class="absolute -top-1 left-1/2 -translate-x-1/2 w-24 h-1 bg-gradient-to-r from-transparent via-emaus-gold to-transparent rounded-full"></div>
				
				<!-- Decorative corner elements -->
				<div class="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-emaus-gold/50 rounded-tl-lg"></div>
				<div class="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-emaus-gold/50 rounded-tr-lg"></div>
				<div class="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-emaus-gold/50 rounded-bl-lg"></div>
				<div class="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-emaus-gold/50 rounded-br-lg"></div>

				<!-- Title with enhanced styling -->
				<h1 class="font-serif-title text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-[0.15em] text-emaus-gold shadow-text-gold leading-tight mb-4 animate-fade-in">
					{{ communityName }}
				</h1>

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
					<p class="text-xl sm:text-2xl md:text-3xl text-white font-bold capitalize text-shadow-strong">
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
				<p v-if="processedDescription" class="mb-5 text-sm sm:text-base md:text-lg text-white font-medium leading-relaxed max-w-lg px-4 text-shadow-medium">
					{{ processedDescription }}
				</p>

				<!-- Another decorative divider -->
				<div class="flex items-center gap-4 mb-5 w-full max-w-xs">
					<div class="flex-1 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
					<svg class="w-4 h-4 text-emaus-gold/80" fill="currentColor" viewBox="0 0 24 24">
						<path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
					</svg>
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
			<div v-if="community?.googleMapsUrl" class="qr-container absolute bottom-4 left-4 flex flex-col items-center gap-2 md:bottom-6 md:left-6 print:bottom-2 print:left-2">
				<div class="qr-card relative overflow-hidden rounded-xl p-1 bg-gradient-to-br from-emaus-gold via-amber-400 to-emaus-gold shadow-lg">
					<div class="bg-white rounded-lg p-2">
						<QrcodeVue :value="community.googleMapsUrl" :size="80" level="L" background="#ffffff" class="rounded-sm" />
					</div>
				</div>
				<span class="qr-label text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full border border-white/20">
					📍 Ubicación
				</span>
			</div>

			<!-- Decorative bottom right element -->
			<div class="absolute bottom-6 right-6 opacity-60 print:hidden">
				<div class="text-emaus-gold/40 text-6xl font-serif-title tracking-widest" style="writing-mode: vertical-rl;">
					Emaú
				</div>
			</div>
		</main>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import QrcodeVue from 'qrcode.vue';

const props = defineProps<{
	meeting: any;
	community: any;
	formattedDate: string;
	formattedAddress: string;
	processedDescription: string;
	communityName: string;
}>();

const formattedDateOnly = computed(() => {
	if (!props.meeting?.startDate) return '';
	const d = new Date(props.meeting.startDate);
	return d.toLocaleDateString('es-ES', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
	});
});

const formattedTime = computed(() => {
	if (!props.meeting?.startDate) return '';
	const d = new Date(props.meeting.startDate);
	return d.toLocaleTimeString('es-ES', {
		hour: '2-digit',
		minute: '2-digit',
	});
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

/* Enhanced Glassmorphism with better contrast */
.glass-card-premium {
	background: linear-gradient(
		135deg,
		rgba(30, 30, 40, 0.65) 0%,
		rgba(20, 20, 30, 0.55) 50%,
		rgba(30, 30, 40, 0.60) 100%
	);
	backdrop-filter: blur(20px) saturate(180%);
	-webkit-backdrop-filter: blur(20px) saturate(180%);
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
