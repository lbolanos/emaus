<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 py-6 print:p-0 print:bg-white print:min-h-0">
    <!-- Print Button -->
    <div class="fixed top-6 right-6 z-50 print:hidden">
      <Button @click="handlePrint" class="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 transition-all hover:scale-105 hover:shadow-blue-500/50 border border-blue-500/30">
        <Printer class="w-5 h-5" />
        <span class="font-semibold">{{ t('retreatFlyer.printButton') }}</span>
      </Button>
    </div>

    <!-- Flyer Container -->
    <div class="max-w-[850px] mx-auto px-4 print:max-w-none print:w-full print:px-0">
      <div
        id="printable-area"
        class="print-optimized shadow-2xl print:shadow-none rounded-3xl overflow-hidden relative bg-white border border-gray-200"
        :style="flyerStyles"
      >
        <!-- Header Section -->
        <header class="relative h-[140px] px-8 py-4 flex flex-row items-center justify-between overflow-hidden print:h-[130px] print:px-6 print:py-3" style="height: 154px;">
          <!-- Background Image with enhanced overlay -->
          <div class="absolute inset-0 bg-cover bg-center z-0" style="background-image: url('/header_bck.png');">
            <div class="absolute inset-0 bg-gradient-to-r from-blue-900/80 via-blue-800/70 to-blue-900/80"></div>
            <div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20"></div>
          </div>

          <!-- Emaús Logo Section -->
          <div class="relative z-10 flex flex-col items-center flex-shrink-0 mr-6 drop-shadow-2xl">
            <div class="relative mb-1.5 transform hover:scale-110 transition-all duration-300 hover:rotate-3">
              <div class="absolute inset-0 bg-white/20 rounded-full blur-xl"></div>
              <img :src="retreatTypeLogo" alt="Emaus Logo" class="w-[90px] h-[90px] object-contain filter drop-shadow-2xl relative z-10" />
            </div>
            <h2 class="text-[22px] font-black uppercase tracking-[0.35em] text-white leading-none font-header drop-shadow-lg">Emaús</h2>
            <div class="flex items-center gap-2 mt-1">
              <p class="text-[11px] text-white/95 text-center uppercase font-bold leading-tight tracking-[0.2em] drop-shadow-md">{{ retreatParish }}</p>
              <p v-if="retreatNumber" class="text-[15px] text-yellow-300 text-center uppercase font-black leading-tight tracking-[0.25em] drop-shadow-lg font-header px-3 py-0.5 bg-yellow-500/20 rounded-full border border-yellow-400/30">
                {{ retreatNumber }}
              </p>
            </div>
          </div>

          <!-- Main Title -->
          <div class="relative z-10 text-right flex-1 pr-2">
            <p class="text-[17px] text-white/95 font-bold mb-0.5 uppercase tracking-[0.25em] drop-shadow-lg">{{ subtitleTextRefined }}</p>
            <h1 class="text-[68px] font-bold text-white leading-[0.9] transform -rotate-1 origin-bottom-right pb-1 font-display"
                style="font-family: 'Miltonian Tattoo', cursive; filter: drop-shadow(5px 5px 10px rgba(0,0,0,0.7)); text-shadow: 4px 4px 8px rgba(0,0,0,0.5);">
              {{ titleTextRefined }}
            </h1>
            <p class="text-[13px] text-white/95 italic font-medium tracking-wide mt-4 drop-shadow-lg leading-tight max-w-[420px] ml-auto">"{{ quoteTextRefined }}"</p>
          </div>
        </header>

        <!-- Retreat Type Banner -->
        <div class="relative z-20">
          <div class="bg-blue-900/80 backdrop-blur-sm text-white p-2 shadow-xl border-y border-blue-500/30 print:bg-blue-900/80 print:text-white">
            <div class="flex flex-col md:flex-row print:flex-row items-center justify-center gap-2 md:gap-6 print:gap-2 text-center">
              <h3 class="text-xl md:text-2xl font-bold uppercase tracking-widest font-header">{{ catholicRetreatText }}</h3>
              <span class="hidden md:block print:block w-px h-8 bg-blue-500/30"></span>
              <div class="flex items-center gap-3">
                <span class="text-sm opacity-80 uppercase tracking-wide">{{ emausForText }}</span>
                <span class="text-xl font-bold uppercase text-yellow-300 tracking-widest border border-yellow-400/60 px-5 py-1 rounded-lg bg-gradient-to-r from-yellow-500/20 to-yellow-400/20 backdrop-blur-sm shadow-inner print:text-yellow-400 print:border-yellow-400">
                  {{ retreatTypeText }}
                </span>
                <span class="hidden md:block print:block w-[1.5px] h-9 bg-blue-300/40"></span>
                <p class="text-[20px] font-bold text-white tracking-wide drop-shadow-md">{{ formatDateRange }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Main Content Area -->
        <div class="relative p-5 print:p-4"
             data-main-content
             :style="{
               backgroundImage: 'url(/jesus2.png)',
               backgroundSize: 'cover',
               backgroundPosition: 'center',
               minHeight: calculatedHeight + 'px'
             }">
          <!-- Semi-transparent overlay for better readability -->
          <div class="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/10 pointer-events-none"></div>

          <!-- Intro Card - Enhanced with better shadow and border -->
          <div class="absolute z-10" style="top: -5px; left: 15px; width: 560px;">
            <div class=" p-6 rounded-2xl print: print:shadow-lg hover:shadow-blue-500/20 transition-all">
              <p class="text-[19px] text-gray-900 text-center leading-relaxed font-medium" style="font-family: 'Playfair Display', serif;">
                <span class="font-bold" v-html="encounterDescriptionText.replace(/\n/g, '<br>')"></span>
              </p>
              <div class="mt-4 text-center">
                <span class="inline-block font-black text-blue-800 text-[28px] px-6 py-2.5 from-blue-50 to-indigo-50 rounded-xl tracking-wide shadow-lg border-2 border-blue-200 hover:scale-105 transition-transform" style="font-family: 'Playfair Display', serif;">
                  {{ dareToLiveItText }}
                </span>
              </div>
            </div>
          </div>

          <!-- Start Time Card - Enhanced -->
          <div class="absolute z-10  p-5 rounded-2xl print: hover:shadow-blue-500/20 transition-all"
               style="top: 180px; left: 15px; width: 490px;">
            <div class="flex gap-4 items-start group">
              <div class="bg-gradient-to-br from-blue-500 to-blue-700 p-3.5 rounded-xl text-white shadow-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                <Clock class="w-7 h-7" />
              </div>
              <div class="flex-1">
                <h4 class="font-black text-[15px] uppercase text-gray-500 tracking-[0.15em] mb-1.5">{{ t('retreatFlyer.startTime') }}</h4>
                <p class="text-[17px] text-blue-700 font-bold mb-0.5">{{ formatDate(startDate) }}</p>
                <p class="text-[22px] font-black text-gray-900 mt-1">{{ openingTimeDisplay }}</p>
                <div class="mt-3 backdrop-blur-sm border-l-4 border-red-500 p-3.5 rounded-r-xl shadow-md">
                  <p class="text-[13px] text-red-700 font-bold flex items-center gap-2.5">
                    <AlertTriangle class="w-5 h-5 flex-shrink-0 animate-pulse" />
                    <span>{{ registrationDeadline }}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Contact Information Card - Compacted -->
          <div class="absolute z-10 p-3 print: hover:shadow-green-500/20 transition-all "
               style="top: 294px; left: 488px; width: 300px;">
            <h4 class="text-[12px] font-black text-gray-700 uppercase mb-2 flex items-center justify-end gap-2 tracking-[0.1em] text-right">
              {{ t('retreatFlyer.information') }}
              <div class="bg-gradient-to-br from-blue-400 to-blue-600 p-1.5 rounded-lg shadow">
                <Info class="w-4 h-4 text-white" />
              </div>
            </h4>
            <div class="space-y-2">
              <div v-for="(phone, index) in contactPhones" :key="phone?.number || index"
                   class="p-2 rounded-lg shadow-sm border border-green-200/60 hover:shadow-md transition-all">
                <div class="flex items-center justify-end gap-2">
                  <div class="text-right">
                    <span class="font-bold text-gray-700 block text-[9px] uppercase mb-0.5 tracking-wider">{{ phone?.name || t('retreatFlyer.contact') }}</span>
                    <span class="text-gray-900 font-black font-mono text-[14px]">{{ phone?.number }}</span>
                  </div>
                  <div class="bg-gradient-to-br from-green-500 to-green-600 p-1.5 rounded-full text-white flex-shrink-0 shadow">
                    <Phone class="w-3 h-3" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- End Time Card - Enhanced -->
          <div class="absolute z-10  p-5 print: hover:shadow-green-500/20 transition-all"
               style="top: 370px; left: 15px; width: 460px;">
            <div class="flex gap-4 items-start group">
              <div class="bg-gradient-to-br from-green-500 to-green-700 p-3.5 rounded-xl text-white shadow-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                <Calendar class="w-7 h-7" />
              </div>
              <div class="flex-1">
                <h4 class="font-black text-[15px] uppercase text-gray-500 tracking-[0.15em] mb-1.5">{{ t('retreatFlyer.endTime') }}</h4>
                <p class="text-[17px] text-green-700 font-bold mb-1">{{ formatDate(endDate) }}</p>
                <div class="mt-3 p-4 rounded-xl border-2 border-blue-200/60 shadow-md">
                  <p class="font-bold text-blue-900 text-[16px] mb-2">{{ closingLocation }}</p>
                  <p class="text-amber-700 font-bold uppercase text-[12px] flex items-center gap-2 bg-amber-50/80 px-3 py-2 rounded-lg border border-amber-200">
                    <Users class="w-5 h-5 flex-shrink-0" /> {{ arrivalTimeNoteText }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- What to Bring Card - Enhanced -->
          <div class="absolute z-10  p-3 print: hover:shadow-purple-500/20 transition-all"
               style="top: 708px; left: 59px; width: 677px;">
            <h4 class="font-black text-[13px] uppercase bg-gradient-to-r from-purple-400 via-purple-300 to-purple-400 bg-clip-text text-transparent mb-2 flex items-center gap-2 border-b border-purple-200/50 pb-2 tracking-[0.1em]">
              <div class="bg-gradient-to-br from-purple-400 to-purple-600 p-2 rounded-lg shadow">
                <Backpack class="w-4 h-4 text-white" />
              </div>
              {{ whatToBringText }}
            </h4>

            <ul v-if="thingsToBringItems.length > 0" class="grid grid-cols-4 gap-x-2 gap-y-1.5 text-[11px] text-gray-100">
              <li v-for="item in thingsToBringItems" :key="item" class="flex items-center gap-1.5 hover:translate-x-1 transition-transform">
                <div class="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 shadow-sm flex-shrink-0"></div>
                <span class="font-medium">{{ item }}</span>
              </li>
            </ul>

            <ul v-else class="grid grid-cols-4 gap-x-2 gap-y-1.5 text-[11px] text-gray-100">
              <li class="flex items-center gap-1.5 hover:translate-x-1 transition-transform">
                <div class="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 shadow-sm"></div>
                <span class="font-medium">{{ t('retreatFlyer.defaultItems.personalThermos') }}</span>
              </li>
              <li class="flex items-center gap-1.5 hover:translate-x-1 transition-transform">
                <div class="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 shadow-sm"></div>
                <span class="font-medium">{{ t('retreatFlyer.defaultItems.towel') }}</span>
              </li>
              <li class="flex items-center gap-1.5 hover:translate-x-1 transition-transform">
                <div class="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 shadow-sm"></div>
                <span class="font-medium">{{ t('retreatFlyer.defaultItems.toiletries') }}</span>
              </li>
              <li class="flex items-center gap-1.5 hover:translate-x-1 transition-transform">
                <div class="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 shadow-sm"></div>
                <span class="font-medium">{{ t('retreatFlyer.defaultItems.jacketSweatshirt') }}</span>
              </li>
              <li class="flex items-center gap-1.5 hover:translate-x-1 transition-transform">
                <div class="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 shadow-sm"></div>
                <span class="font-medium">{{ t('retreatFlyer.defaultItems.comfortableClothes') }}</span>
              </li>
            </ul>
          </div>

          <!-- Payment Information Card - Enhanced -->
          <div class="absolute z-10 print:bg-yellow-50 hover:shadow-yellow-500/30 transition-all"
               style="top: 471px; left: 460px; width: 330px;">
            <div class="text-center mb-4 pb-4 border-b-2 border-yellow-200">
              <span class="text-[22px] font-black uppercase text-blue-700 tracking-[0.2em] block mb-2">{{ t('retreatFlyer.cost') }}</span>
              <div class="text-[42px] font-black text-gray-900 leading-none font-header drop-shadow-md bg-gradient-to-r from-yellow-200/50 to-orange-200/50 px-4 py-2 rounded-xl inline-block border-2 border-yellow-300/50">
                {{ formatCost }}
              </div>
            </div>
            <div class="space-y-3 text-[12px]">
              <div v-if="paymentInfo" class="text-gray-700 text-center leading-relaxed bg-white/60 p-3 rounded-lg">
                <span v-html="paymentInfo" class="font-semibold"></span>
              </div>
              <div v-if="paymentMethods" class="bg-white/80 p-3.5 rounded-xl shadow-md border border-yellow-200">
                <span class="block text-[11px] text-gray-500 uppercase tracking-[0.15em] mb-2 font-black">{{ t('retreatFlyer.paymentMethods') }}</span>
                <span class="font-bold text-gray-900 text-center block text-[13px]">{{ paymentMethods }}</span>
              </div>
            </div>
          </div>

          <!-- Location Card - Enhanced -->
          <div class="absolute z-10 p-5 print: hover:shadow-red-500/20 transition-all"
               style="top: 584px; left: 15px; width: 440px;">
            <div class="flex gap-4 items-start group">
              <div class="bg-gradient-to-br from-red-500 to-red-700 p-3.5 rounded-xl text-white shadow-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                <MapPin class="w-7 h-7" />
              </div>
              <div class="flex-1">
                <h4 class="font-black text-[15px] uppercase bg-gradient-to-r from-red-600 via-orange-500 to-red-600 bg-clip-text text-transparent tracking-[0.15em] mb-1.5">{{ t('retreatFlyer.location') }}</h4>
                <p class="text-[18px] font-black text-white leading-tight">{{ retreatLocation }}</p>
                <p class="text-[12px] text-gray-200 leading-snug mt-1.5 font-medium">{{ retreatAddress }}</p>
              </div>
              <!-- Google Maps QR Code -->
              <div v-if="googleMapsUrl && showQrCodesLocation" class="flex flex-col items-center gap-2">
                <div class="p-2.5 bg-white rounded-xl shadow-xl border-2 border-red-200 hover:scale-105 transition-transform">
                  <QrcodeVue :value="googleMapsUrl" :size="75" level="L" background="#ffffff" class="rounded-lg" />
                </div>
                <span class="text-[10px] text-gray-200 font-black uppercase tracking-wider">{{ t('retreatFlyer.locationQR') }}</span>
              </div>
            </div>
          </div>

          <!-- Registration QR Code Card - Enhanced -->
          <div v-if="showQrCodesRegistration" class="absolute z-10  p-5 print:bg-blue-50 text-center hover:shadow-blue-500/30 transition-all"
               style="top: 10px; right: 44px; width: 200px;">
            <h3 class="text-[24px] font-black text-blue-700 uppercase mb-2 tracking-[0.15em] drop-shadow-sm">{{ registerText }}</h3>
            <p class="text-[11px] text-gray-600 mb-4 font-bold leading-tight">{{ scanToRegisterText }}</p>

            <div class="flex justify-center mb-4">
              <div class="p-3 bg-white rounded-xl shadow-xl border-2 border-blue-300 hover:scale-105 transition-transform">
                <QrcodeVue :value="registrationUrl" :size="110" level="L" background="#ffffff" class="rounded-lg" />
              </div>
            </div>

            <div class="print:hidden">
            </div>
            <div class="mt-3 text-[9px] text-gray-500 font-mono uppercase tracking-[0.15em] bg-white/50 px-2 py-1 rounded">{{ registrationDomain }}</div>
          </div>
        </div>

        <!-- Footer - Enhanced -->
        <footer class="relative h-[100px] flex items-center justify-between px-8 overflow-hidden mt-auto print:h-[90px] print:px-6">
          <!-- Footer Background Image -->
          <div class="absolute inset-0 bg-cover bg-center z-0" style="background-image: url('/footer.png');">
            <div class="absolute inset-0 bg-gradient-to-r from-black via-gray-900 to-black opacity-95 print:opacity-90"></div>
          </div>

          <div class="relative z-10 flex flex-col justify-center h-full">
            <h2 class="text-[56px] font-bold text-white leading-none mb-2 font-display drop-shadow-2xl transform hover:scale-105 transition-transform" 
                style="font-family: 'Dancing Script', cursive; text-shadow: 4px 4px 12px rgba(0,0,0,0.6);">
              {{ comeText }}
            </h2>
            <div class="bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-400 text-black text-[12px] font-black px-5 py-2.5 rounded-full uppercase w-max tracking-[0.2em] shadow-2xl print:bg-yellow-400 animate-pulse hover:scale-105 transition-transform border-2 border-yellow-300">
              {{ limitedCapacityText }}
            </div>
          </div>

          <div class="relative z-10 max-w-md text-right flex flex-col justify-center h-full">
            <h3 class="text-[28px] font-black text-white uppercase tracking-[0.25em] mb-2 font-header drop-shadow-xl">
              {{ dontMissItText }}
            </h3>
            <p class="text-[11px] text-gray-300 leading-tight max-w-[240px] ml-auto drop-shadow-md font-medium">
              {{ reservationNoteText }}
            </p>
          </div>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
// Ensure this path matches your project structure
import { useRetreatStore } from '@/stores/retreatStore';
import { Button } from '@repo/ui';
import {
  MapPin,
  Clock,
  Calendar,
  Backpack,
  Check,
  Users,
  Info,
  Phone,
  Printer,
  AlertTriangle
} from 'lucide-vue-next';
import QrcodeVue from 'qrcode.vue';

const route = useRoute();
const retreatStore = useRetreatStore();
const { t } = useI18n();
const selectedRetreat = computed(() => retreatStore.selectedRetreat);
const walkerRegistrationLink = computed(() => retreatStore.walkerRegistrationLink);

// Dynamic data from retreat store
// Dynamic data from retreat store
// Cast to any to accept 'house' property which exists at runtime/API but not in stricter Zod schema
const retreatData = computed(() => (selectedRetreat.value as any) || null);

// Calculate the dynamic height needed for the main content area based on actual DOM elements
const mainContentHeight = ref(400);

const calculateContentHeight = () => {
  nextTick(() => {
    // Find all absolutely positioned cards within the main content area
    const mainContent = document.querySelector('[data-main-content]');
    if (!mainContent) return;

    const cards = mainContent.querySelectorAll('.absolute');
    let maxBottom = 0;

    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const parentRect = mainContent.getBoundingClientRect();
      const relativeBottom = rect.bottom - parentRect.top;
      maxBottom = Math.max(maxBottom, relativeBottom);
    });

    // Set height with padding
    mainContentHeight.value = maxBottom + 40;
  });
};

const calculatedHeight = computed(() => {
  // Use a reasonable minimum height during initial render
  return mainContentHeight.value;
});

const retreatTypeText = computed(() => {
  // Use explicit type if available
  if (retreatData.value?.retreat_type) {
    return t(`retreatModal.types.${retreatData.value.retreat_type}`);
  }

  // Try to determine retreat type from available data
  const parish = retreatData.value?.parish?.toLowerCase() || '';
  const houseName = retreatData.value?.house?.name?.toLowerCase() || '';
  const paymentInfo = retreatData.value?.paymentInfo?.toLowerCase() || '';

  // Simple heuristic-based type detection
  if (parish.includes('mujer') || houseName.includes('mujer') || paymentInfo.includes('mujer')) {
    return t('retreatModal.types.women');
  }
  if (parish.includes('joven') || houseName.includes('joven') || paymentInfo.includes('joven')) {
    return 'JÓVENES';
  }
  if (parish.includes('matrimonio') || houseName.includes('matrimonio') || paymentInfo.includes('matrimonio')) {
    return t('retreatModal.types.couples');
  }

  // Default fallback based on typical Emaús retreat types
  return t('retreatModal.types.men');
});

const retreatTypeLogo = computed(() => {
  // Use explicit type if available
  if (retreatData.value?.retreat_type) {
    const logos: Record<string, string> = {
      men: '/man_logo.png',
      women: '/woman_logo.png',
      couples: '/crossRoseButtT.png', // Default to man logo for couples
      effeta: '/crossRoseButtT.png'   // Default to man logo for effeta
    };
    return logos[retreatData.value.retreat_type] || '/crossRoseButtT.png';
  }

  // Try to determine retreat type from available data
  const parish = retreatData.value?.parish?.toLowerCase() || '';
  const houseName = retreatData.value?.house?.name?.toLowerCase() || '';
  const paymentInfo = retreatData.value?.paymentInfo?.toLowerCase() || '';

  // Simple heuristic-based type detection
  if (parish.includes('mujer') || houseName.includes('mujer') || paymentInfo.includes('mujer')) {
    return '/woman_logo.png';
  }
  if (parish.includes('matrimonio') || houseName.includes('matrimonio') || paymentInfo.includes('matrimonio')) {
    return '/man_logo.png'; // Couples use man logo
  }

  // Default fallback (men, joven, effeta, and unknown)
  return '/man_logo.png';
});

const retreatNumber = computed(() => {
  return retreatData.value?.retreat_number_version || '';
});

const formatDateRange = computed(() => {
  if (!retreatData.value?.startDate || !retreatData.value?.endDate) return '';
  const start = retreatData.value.startDate instanceof Date ? retreatData.value.startDate : new Date(retreatData.value.startDate);
  const end = retreatData.value.endDate instanceof Date ? retreatData.value.endDate : new Date(retreatData.value.endDate);
  return `${start.getDate()} al ${end.getDate()} de ${start.toLocaleDateString('es-ES', { month: 'long' })}`;
});

const formatDate = (dateValue: Date | string | undefined) => {
  if (!dateValue) return '';
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  };
  return date.toLocaleDateString('es-ES', options);
};

const startDate = computed(() => retreatData.value?.startDate);
const endDate = computed(() => retreatData.value?.endDate);

const retreatParish = computed(() => {
  const parish = retreatData.value?.parish;
  return parish;
});

const openingTimeDisplay = computed(() => {
  const walkerArrivalTime = retreatData.value?.walkerArrivalTime;

  if (walkerArrivalTime) {
    const [hours, minutes] = walkerArrivalTime.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour || 12;
    return `${displayHour}:${minutes || '00'} ${ampm} EN PUNTO`;
  }

  return '5:00 PM EN PUNTO';
});

const registrationDeadline = computed(() => {
  const openingNotes = retreatData.value?.openingNotes;

  if (openingNotes && openingNotes.trim()) {
    return openingNotes.trim();
  }

  const walkerArrivalTime = retreatData.value?.walkerArrivalTime;
  if (walkerArrivalTime) {
    const [hours, minutes] = walkerArrivalTime.split(':');
    const hour = parseInt(hours) + 0.5; // Add 30 minutes
    const displayHour = hour > 12 ? Math.floor(hour - 12) : Math.floor(hour);
    const displayMinutes = hour % 1 !== 0 ? '30' : minutes || '00';
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `Llegar ${displayHour}:${displayMinutes} ${ampm} máximo para registro`;
  }

  return 'Llegar 5:30 PM máximo para registro';
});

const retreatLocation = computed(() => {
  return retreatData.value?.house?.name || retreatData.value?.parish || 'Casa de Retiro';
});

const retreatAddress = computed(() => {
  const house = retreatData.value?.house;
  if (!house) return '';

  const addressParts = [
    house.address1,
    house.address2,
    house.city,
    house.state,
    house.zipCode,
    house.country
  ].filter(part => part && part.trim());

  return addressParts.join(', ');
});


const closingLocation = computed(() => {
  return retreatData.value?.closingNotes;
});


const thingsToBringItems = computed(() => {
  const notes = retreatData.value?.thingsToBringNotes;
  if (!notes) return [];

  // Parse the thingsToBringNotes to extract individual items
  // Handle different formats: bullet points, numbered lists, etc.
  const items = notes
    .split(/[\n•*]/) // Split by newlines or bullet characters
    .map((item: string) => item.trim())
    .map((item: string) => item.replace(/^[•*\-\d.]\s*/, '')) // Remove leading bullet/number characters
    .filter((item: string) => item.length > 0)
    .map((item: string) => {
      // Clean up the item text
      return item
        .replace(/\(para tu uso\)/gi, '')
        .replace(/etc\./gi, '')
        .trim();
    })
    .filter((item: string) => item.length > 0);

  return items;
});

const formatCost = computed(() => {
  const cost = retreatData.value?.cost;
  if (!cost) return '$ 2,800';

  // Parse cost as number and format as currency
  const numericCost = parseFloat(cost.toString().replace(/[^0-9.]/g, ''));
  if (isNaN(numericCost)) return cost.trim();

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(numericCost);
});

const paymentInfo = computed(() => {
  const paymentInfoRaw = retreatData.value?.paymentInfo;
  if (!paymentInfoRaw) return '';

  // Fix character encoding issues (replace \u001f and other control characters) and replace line feeds with <br>
  // eslint-disable-next-line no-control-regex
  let info = paymentInfoRaw.replace(/\n/g, '<br>').replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
  console.log('Formatted Payment Info:', info);
  return info;
});
const paymentMethods = computed(() => retreatData.value?.paymentMethods);

const contactPhones = computed(() => {
  const phones = retreatData.value?.contactPhones;
  if (!phones) return [];

  try {
    // Handle different phone formats
    let phoneStr: string;
    if (Array.isArray(phones)) {
      phoneStr = phones.join('\n');
    } else {
      phoneStr = phones.toString();
    }

    // Split by newlines or commas and clean up
    return phoneStr
      .split(/[\n,]+/)
      .map(phone => phone.trim())
      .filter(phone => phone.length > 0)
      .map(phone => {
        // Extract phone number patterns and keep the name
        const match = phone.match(/(.+?)\s*(\d[\d\s-]*\d)/);
        if (match) {
          return { name: match[1].trim(), number: match[2].trim() };
        }
        // If no name found, try to extract just the number
        const numberMatch = phone.match(/(\d[\d\s-]*\d)/);
        return numberMatch ? { name: 'Contacto', number: numberMatch[1] } : null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
});

const registrationUrl = computed(() => {
  return walkerRegistrationLink.value || 'https://emaus.cc/';
});

const registrationDomain = computed(() => {
  const url = registrationUrl.value;
  try {
    const domain = new URL(url).hostname;
    return domain.replace('www.', '');
  } catch {
    return 'emaus.cc';
  }
});

const googleMapsUrl = computed(() => {
  let googleMapsUrlTmp = retreatData.value?.house?.googleMapsUrl;
  if (googleMapsUrlTmp && googleMapsUrlTmp.trim()) {
    console.log('Google Maps URL found:', googleMapsUrlTmp);
    return googleMapsUrlTmp.trim();
  }
  return googleMapsUrlTmp;
});

const flyerOptions = computed(() => (retreatData.value as any)?.flyer_options);

const titleText = computed(() => {
  return flyerOptions.value?.hopeOverride || flyerOptions.value?.titleOverride || t('retreatFlyer.hope');
});

const subtitleText = computed(() => {
  return flyerOptions.value?.weekendOfHopeOverride || flyerOptions.value?.subtitleOverride || t('retreatFlyer.weekendOfHope');
});

const quoteText = computed(() => {
  return flyerOptions.value?.hopeQuoteOverride || t('retreatFlyer.hopeQuote');
});

const showQrCodes = computed(() => {
  return flyerOptions.value?.showQrCodes ?? true;
});

const showQrCodesLocation = computed(() => {
  return flyerOptions.value?.showQrCodesLocation ?? showQrCodes.value;
});

const showQrCodesRegistration = computed(() => {
  return flyerOptions.value?.showQrCodesRegistration ?? showQrCodes.value;
});

// New override computed properties
const catholicRetreatText = computed(() => flyerOptions.value?.catholicRetreatOverride || t('retreatFlyer.catholicRetreat'));
const emausForText = computed(() => flyerOptions.value?.emausForOverride || t('retreatFlyer.emausFor'));
// Map weekendOfHopeOverride to subtitleOverride if not explicit, but prefer weekendOfHopeOverride if present
const weekendOfHopeOverrideText = computed(() => flyerOptions.value?.weekendOfHopeOverride || flyerOptions.value?.subtitleOverride || t('retreatFlyer.weekendOfHope'));
// Using subtitleText computed above might be cleaner, let's update subtitleText and titleText to use the new keys too if they are more "primary" now.
// Actually, I should update the older computed props to check the new keys too for backward compatibility or clarity.

const encounterDescriptionText = computed(() => flyerOptions.value?.encounterDescriptionOverride || t('retreatFlyer.encounterDescription'));
const dareToLiveItText = computed(() => flyerOptions.value?.dareToLiveItOverride || t('retreatFlyer.dareToLiveIt'));
const arrivalTimeNoteText = computed(() => flyerOptions.value?.arrivalTimeNoteOverride || t('retreatFlyer.arrivalTimeNote'));
const whatToBringText = computed(() => flyerOptions.value?.whatToBringOverride || t('retreatFlyer.whatToBring'));
const registerText = computed(() => flyerOptions.value?.registerOverride || t('retreatFlyer.register'));
const scanToRegisterText = computed(() => flyerOptions.value?.scanToRegisterOverride || t('retreatFlyer.scanToRegister'));
const goToRegistrationText = computed(() => flyerOptions.value?.goToRegistrationOverride || t('retreatFlyer.goToRegistration'));
const limitedCapacityText = computed(() => flyerOptions.value?.limitedCapacityOverride || t('retreatFlyer.limitedCapacity'));
const dontMissItText = computed(() => flyerOptions.value?.dontMissItOverride || t('retreatFlyer.dontMissIt'));
const reservationNoteText = computed(() => flyerOptions.value?.reservationNoteOverride || t('retreatFlyer.reservationNote'));
const comeText = computed(() => flyerOptions.value?.comeOverride || t('retreatFlyer.come'));

// Update valid existing ones to prefer new keys if mapped
// titleText was using titleOverride. Let's make it look at hopeOverride too.
// The user sees 'Header: Hope (Title)' and fills hopeOverride.
// TitleText is what displays the big main title.
const titleTextRefined = computed(() => {
    if (flyerOptions.value?.hopeOverride) return flyerOptions.value.hopeOverride;
    if (flyerOptions.value?.titleOverride) return flyerOptions.value.titleOverride;
    return t('retreatFlyer.hope');
});
const subtitleTextRefined = computed(() => {
    if (flyerOptions.value?.weekendOfHopeOverride) return flyerOptions.value.weekendOfHopeOverride;
    if (flyerOptions.value?.subtitleOverride) return flyerOptions.value.subtitleOverride;
    return t('retreatFlyer.weekendOfHope');
});
const quoteTextRefined = computed(() => {
    if (flyerOptions.value?.hopeQuoteOverride) return flyerOptions.value.hopeQuoteOverride;
    return t('retreatFlyer.hopeQuote');
});

// Since I am replacing the old computed props, I need to make sure I don't leave duplicates.
// The code earlier (lines 535-555) had titleText, subtitleText, etc.
// I will override the return values of those variables in the chunk below or replace the whole block.
// To avoid conflicts, I will replace the block from 543 to 557.

// Styling for the flyer
const flyerStyles = {
  fontFamily: "'Roboto', sans-serif",
  // We use max-width in mm to match A4 paper
  width: '100%',
  maxWidth: '210mm',
  margin: '0 auto',
};

// Print functionality
const handlePrint = () => {
  window.print();
};

// Load retreat data and calculate initial height
onMounted(async () => {
  const retreatId = route.params.id as string;
  if (retreatId && !selectedRetreat.value) {
    retreatStore.selectRetreat(retreatId);
  }
  // Calculate height after component is mounted
  await nextTick();
  calculateContentHeight();
});

// Watch for changes in QR code visibility
watch(showQrCodesRegistration, () => {
  nextTick(() => {
    calculateContentHeight();
  });
});

// Also recalculate when window resizes
if (typeof window !== 'undefined') {
  window.addEventListener('resize', calculateContentHeight);
}
</script>

<style>
/* Global Print Styles */
@media print {
  body * {
    visibility: hidden;
  }

  #printable-area, 
  #printable-area * {
    visibility: visible;
  }

  #printable-area {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }
  
  @page {
    size: A4;
    margin: 5mm;
  }
}
</style>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Miltonian+Tattoo&family=Oswald:wght@300;400;500;700;900&family=Roboto:ital,wght@0,300;0,400;0,500;0,700;0,900;1,400&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&display=swap');

.print-optimized {
  width: 100%;
  max-width: 850px;
  margin: 0 auto;
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

/* Enhanced hover effects */
.group:hover {
  transform: translateY(-2px);
}

/* Pulse animation for important elements */
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>