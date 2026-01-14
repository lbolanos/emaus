<template>
	<div
		id="printable-area"
		class="print-optimized shadow-2xl print:shadow-none rounded-3xl overflow-hidden relative bg-white border border-gray-200"
	>
		<!-- Header Section -->
		<header class="relative h-[140px] px-8 py-4 flex flex-row items-center justify-between overflow-hidden print:h-[130px] print:px-6 print:py-3">
			<!-- Background Image with enhanced overlay -->
			<div class="absolute inset-0 bg-cover bg-center z-0" style="background-image: url('/header_bck.png')">
				<div class="absolute inset-0 bg-gradient-to-r from-blue-900/80 via-blue-800/70 to-blue-900/80"></div>
				<div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20"></div>
			</div>

			<!-- Emaús Logo Section -->
			<div class="relative z-10 flex flex-col items-center flex-shrink-0 mr-6 drop-shadow-2xl">
				<div class="relative mb-1.5 transform hover:scale-110 transition-all duration-300 hover:rotate-3">
					<div class="absolute inset-0 bg-white/20 rounded-full blur-xl"></div>
					<img src="/man_logo.png" alt="Emaús Logo" class="w-[90px] h-[90px] object-contain filter drop-shadow-2xl relative z-10" />
				</div>
				<h2 class="text-[22px] font-black uppercase tracking-[0.35em] text-white leading-none font-header drop-shadow-lg">Emaús</h2>
				<div class="flex items-center gap-2 mt-1">
					<p class="text-[11px] text-white/95 text-center uppercase font-bold leading-tight tracking-[0.2em] drop-shadow-md">{{ communityName }}</p>
				</div>
			</div>

			<!-- Main Title -->
			<div class="relative z-10 text-right flex-1 pr-2">
				<p class="text-[17px] text-white/95 font-bold mb-0.5 uppercase tracking-[0.25em] drop-shadow-lg">Reunión de Comunidad</p>
				<h1 class="text-[68px] font-bold text-white leading-[0.9] transform -rotate-1 origin-bottom-right pb-1 font-display"
						style="font-family: 'Miltonian Tattoo', cursive; filter: drop-shadow(5px 5px 10px rgba(0,0,0,0.7)); text-shadow: 4px 4px 8px rgba(0,0,0,0.5);">
					{{ meeting?.title || '' }}
				</h1>
			</div>
		</header>

		<!-- Main Content Area -->
		<div class="relative p-8 print:p-6 min-h-[600px]">
			<!-- Semi-transparent overlay for better readability -->
			<div class="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/10 pointer-events-none"></div>

			<!-- Date and Time Card -->
			<div class="relative z-10 mb-6 p-6 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg border border-blue-200">
				<div class="flex gap-4 items-start">
					<div class="bg-gradient-to-br from-blue-500 to-blue-700 p-3.5 rounded-xl text-white shadow-xl">
						<Calendar class="w-7 h-7" />
					</div>
					<div class="flex-1">
						<h4 class="font-black text-[15px] uppercase text-gray-500 tracking-[0.15em] mb-1.5">Fecha y Hora</h4>
						<p class="text-[20px] font-black text-gray-900">{{ formattedDate }}</p>
						<p v-if="!meeting?.isAnnouncement" class="text-[16px] text-blue-700 font-bold mt-1">Duración: {{ formattedDuration }}</p>
					</div>
				</div>
			</div>

			<!-- Description Card -->
			<div v-if="processedDescription" class="relative z-10 mb-6 p-6 rounded-2xl bg-white/80 shadow-lg border border-gray-200">
				<div class="flex gap-4 items-start">
					<div class="bg-gradient-to-br from-purple-500 to-purple-700 p-3.5 rounded-xl text-white shadow-xl">
						<FileText class="w-7 h-7" />
					</div>
					<div class="flex-1">
						<h4 class="font-black text-[15px] uppercase text-gray-500 tracking-[0.15em] mb-2">Descripción</h4>
						<div class="text-[16px] text-gray-800 leading-relaxed whitespace-pre-wrap">{{ processedDescription }}</div>
					</div>
				</div>
			</div>

			<!-- Location Card with QR Code -->
			<div class="relative z-10 p-6 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 shadow-lg border border-green-200">
				<div class="flex gap-4 items-start">
					<div class="bg-gradient-to-br from-green-500 to-green-700 p-3.5 rounded-xl text-white shadow-xl">
						<MapPin class="w-7 h-7" />
					</div>
					<div class="flex-1">
						<h4 class="font-black text-[15px] uppercase bg-gradient-to-r from-green-600 via-green-500 to-green-600 bg-clip-text text-transparent tracking-[0.15em] mb-1.5">Ubicación</h4>
						<p class="text-[18px] font-black text-black leading-tight mb-2">{{ communityName }}</p>
						<p class="text-[14px] text-gray-700 leading-snug">{{ formattedAddress }}</p>
					</div>
					<!-- Google Maps QR Code -->
					<div v-if="community?.googleMapsUrl && community.googleMapsUrl.trim()" class="flex flex-col items-center gap-2 flex-shrink-0">
						<div class="p-2.5 bg-white rounded-xl shadow-xl border-2 border-green-200">
							<QrcodeVue :value="community.googleMapsUrl" :size="100" level="L" background="#ffffff" render-as="canvas" class="rounded-lg" />
						</div>
						<span class="text-[10px] text-black font-black uppercase tracking-wider">Escanea para ver en Maps</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Footer -->
		<footer class="relative h-[80px] flex items-center justify-center px-8 overflow-hidden">
			<!-- Footer Background Image -->
			<div class="absolute inset-0 bg-cover bg-center z-0" style="background-image: url('/footer.png');">
				<div class="absolute inset-0 bg-gradient-to-r from-black via-gray-900 to-black opacity-60 print:opacity-90"></div>
			</div>

			<div class="relative z-10 text-center">
				<h2 class="text-[40px] font-bold text-white leading-none mb-2 font-display drop-shadow-2xl"
						style="font-family: 'Dancing Script', cursive; text-shadow: 4px 4px 12px rgba(0,0,0,0.6);">
					¡Te esperamos!
				</h2>
			</div>
		</footer>
	</div>
</template>

<script setup lang="ts">
import QrcodeVue from 'qrcode.vue';
import { Calendar, FileText, MapPin } from 'lucide-vue-next';

defineProps<{
	meeting: any;
	community: any;
	formattedDate: string;
	formattedDuration: string;
	formattedAddress: string;
	processedDescription: string;
	communityName: string;
}>();
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Miltonian+Tattoo&family=Oswald:wght@300;400;500;700;900&family=Roboto:ital,wght@0,300;0,400;0,500;0,700;0,900;1,400&display=swap');

.print-optimized {
	width: 100%;
	max-width: 850px;
	margin: 0 auto;
}

@media print {
	.print-optimized {
		width: 210mm !important;
		max-width: 210mm !important;
		margin: 0 !important;
	}
}

.font-display {
	font-family: 'Dancing Script', cursive;
}

.font-header {
	font-family: 'Oswald', sans-serif;
}

/* Smooth transitions */
* {
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
