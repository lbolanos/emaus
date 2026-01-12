<template>
	<div class="relative min-h-[500px] w-full overflow-hidden bg-cover bg-center bg-no-repeat rounded-3xl print:rounded-none print:min-h-0"
		 style="background-image: url('/poster.png')">
		<main class="relative flex min-h-[500px] w-full items-center justify-center bg-black/10 print:bg-transparent p-6 print:p-0">
			<section class="glass-card flex max-w-5xl flex-col items-center justify-center rounded-2xl px-10 py-14 text-center sm:px-14 sm:py-10 md:px-16 md:py-10">
				<!-- Title -->
				<h1 class="font-serif-title text-4xl md:text-6xl font-bold tracking-widest text-emaus-gold shadow-text-gold whitespace-nowrap mb-6">
					{{ communityName }}
				</h1>

				<!-- Date -->
				<p class="mb-2 text-2xl text-white md:text-3xl font-extrabold">
					{{ formattedDateOnly }}
				</p>

				<!-- Time -->
				<p class="mb-2 text-lg text-white md:text-xl font-normal">
					{{ formattedTime }} hrs.
				</p>

				<!-- Template/Description -->
				<p v-if="processedDescription" class="mb-2 text-base text-white/95 md:text-lg font-normal leading-relaxed">
					{{ processedDescription }}
				</p>

				<!-- Location -->
				<p class="text-base text-white md:text-lg font-medium">
					{{ locationMessage }}
				</p>
			</section>

			<!-- QR Code Section -->
			<div v-if="community?.googleMapsUrl" class="absolute bottom-1 left-1 flex flex-col items-center gap-2 md:bottom-1 md:left-1">
				<div class="glass-card overflow-hidden rounded-lg p-2">
					<QrcodeVue :value="community.googleMapsUrl" :size="75" level="L" background="#ffffff" class="rounded-sm h-[120px] w-[120px]" />
				</div>
				<span class="text-[10px] font-bold uppercase tracking-wider text-white md:text-xs">
					Ubicación
				</span>
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
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap');

/* Glassmorphism utility class for the main card */
.glass-card {
	background: rgba(255, 255, 255, 0.1);
	backdrop-filter: blur(5px);
	-webkit-backdrop-filter: blur(5px);
	border: 2px solid rgba(255, 255, 255, 0.5);
	box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
}

.shadow-text-gold {
	text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.6);
}

.text-emaus-gold {
	color: #E5C375;
}

.font-serif-title {
	font-family: 'Cinzel', serif;
}

/* Print styles */
@media print {
	.glass-card {
		background: rgba(255, 255, 255, 0.95);
		border: 2px solid #000;
	}

	.text-emaus-gold {
		color: #1a1a1a;
	}

	.text-white,
	.text-white\/95 {
		color: #000 !important;
	}
}
</style>
