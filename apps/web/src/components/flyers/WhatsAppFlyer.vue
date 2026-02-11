<template>
	<div
		id="printable-area"
		class="whatsapp-container relative overflow-hidden rounded-2xl shadow-2xl"
		:style="{ backgroundImage: `url('/poster.png')` }"
	>
		<!-- Light overlay -->
		<div class="absolute inset-0 bg-gradient-to-b from-white/60 via-white/40 to-white/65"></div>

		<main class="relative flex h-[600px] w-[600px] items-center justify-center p-6">
			<!-- Main Content Card -->
			<section class="glass-card-wa relative flex w-full max-w-md flex-col items-center justify-center rounded-2xl px-6 py-6 text-center shadow-2xl">
				<!-- Decorative top accent -->
				<div class="absolute -top-1 left-1/2 -translate-x-1/2 w-20 h-1 bg-gradient-to-r from-transparent via-emaus-gold to-transparent rounded-full"></div>

				<!-- Title -->
				<h1 class="font-serif-title text-3xl sm:text-4xl font-bold tracking-[0.12em] text-emaus-gold-dark leading-tight mb-3">
					{{ communityName }}
				</h1>

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
					<p class="text-lg text-gray-900 font-bold capitalize">
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
				<p v-if="processedDescription" class="mb-4 text-sm text-gray-700 font-medium leading-relaxed max-w-sm px-2 line-clamp-3">
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
		</main>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

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
		rgba(255, 255, 255, 0.82) 0%,
		rgba(255, 255, 255, 0.72) 50%,
		rgba(255, 255, 255, 0.78) 100%
	);
	backdrop-filter: blur(20px) saturate(180%);
	-webkit-backdrop-filter: blur(20px) saturate(180%);
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
