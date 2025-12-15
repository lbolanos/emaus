<template>
  <!-- Added print:p-0 and print:bg-white to remove outer padding/color during print -->
  <div class="min-h-screen bg-gray-100 py-4 print:p-0 print:bg-white print:min-h-0">
    <!-- Print Button (Hidden during print) -->
    <div class="right-4 z-50 print:hidden">
      <Button @click="handlePrint" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow flex items-center">
        <Printer class="w-4 h-4 mr-2" />
        {{ t('retreatFlyer.printButton') }}
      </Button>
    </div>

    <!-- Flyer Container -->
    <!-- Added print:max-w-none print:w-full to ensure full width -->
    <div class="max-w-4xl mx-auto print:max-w-none print:w-full">
      <!-- Added id="printable-area" for the CSS isolation trick -->
      <div
        id="printable-area"
        class="print-optimized shadow-2xl print:shadow-none rounded-3xl overflow-hidden relative"
        :style="flyerStyles"
      >
        <!-- Header Section -->
        <header class="relative h-38 px-6 py-1 flex flex-row items-center justify-between overflow-hidden print:px-6 print:py-3">
          <!-- Background Image -->
          <div class="absolute inset-0 bg-cover bg-center z-0"
               style="background-image: url('/header_bck.png');">
            <div class="absolute inset-0 bg-gradient-to-b from-black/30 to-transparent"></div>
          </div>

          <!-- Emaús Logo Section -->
          <div class="relative z-10 flex flex-col items-center flex-shrink-0 mr-6 drop-shadow-lg">
            <div class="relative mb-2 transform hover:scale-105 transition-transform duration-300">
              <!-- Dynamic Logo Image -->
              <img :src="retreatTypeLogo" alt="Emaus Logo" class="w-20 h-20 object-contain filter drop-shadow-md" />
            </div>
            <h2 class="text-xl font-bold uppercase tracking-[0.2em] text-white leading-none font-header text-shadow-sm">Emaús</h2>
            <p class="text-[0.7rem] text-white/90 text-center uppercase font-medium leading-tight mt-1 tracking-wider">{{ retreatParish }}</p>
            <p v-if="retreatNumber" class="text-[0.9rem] text-yellow-300 text-center uppercase font-bold leading-tight tracking-wider drop-shadow-md font-header">{{ retreatNumber }}</p>
          </div>

          <!-- Main Title -->
          <div class="relative z-10 text-right flex-1">
            <p class="text-base md:text-lg text-white/90 font-medium mb-[-5px] mr-2 uppercase tracking-widest text-shadow-sm">{{ subtitleText }}</p>
            <h1 class="text-5xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-300 leading-none transform -rotate-2 origin-bottom-right pb-4 pr-2 font-display"
                style="font-family: 'Miltonian Tattoo', cursive; filter: drop-shadow(10px 17px 2px rgba(0,0,0,0.5));">{{ titleText }}</h1>
            <p class="text-sm text-white/80 italic font-light tracking-wide">"{{ quoteText }}"</p>
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
                <span class="hidden md:block print:block w-px h-8 bg-blue-500/30"></span>
                <p class="text-xl font-bold text-white tracking-wide">{{ formatDateRange }}</p>
              </div>
          </div>
        </div>
        </div>

        <!-- Main Content Grid -->
        <div class="grid grid-cols-1 md:grid-cols-12 gap-4 p-3 print:grid-cols-12 print:gap-4 print:p-3"
             style="background-image: url('/jesus_bg.png'); background-size: cover; background-position: center;">
          
          <!-- Left Column - Event Details -->
          <div class="md:col-span-7 space-y-2 print:col-span-7">
            <!-- Intro Card -->
            <div class="bg-white/40 backdrop-blur-sm p-3 rounded-2xl shadow-lg border border-white/40 print:bg-white/80 print:shadow-none print:rounded-none print:border-none print:p-3">
              <p class="text-lg text-gray-700 italic text-center leading-relaxed">
                {{ encounterDescriptionText }} <br/>
                <span class="font-bold text-blue-700 not-italic text-xl mt-2 block">{{ dareToLiveItText }}</span>
              </p>
            </div>

            <!-- Details Cards -->
            <div class="bg-white/40 backdrop-blur-sm p-3 rounded-2xl shadow-lg border border-white/40 space-y-3 print:bg-white/80 print:shadow-none print:rounded-none print:border-none print:space-y-2 print:p-3">
              <!-- Location -->
              <div class="flex gap-3 items-start group">
                <div class="bg-blue-100 p-2 rounded-xl text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300 print:bg-blue-50">
                  <MapPin class="w-5 h-5" />
                </div>
                <div class="flex-1">
                  <h4 class="font-bold text-lg uppercase text-gray-800 tracking-wide">{{ t('retreatFlyer.location') }} {{ retreatLocation }}</h4>
                  <p class="text-gray-600 leading-tight">{{ retreatAddress }}</p>
                </div>
                <!-- Google Maps QR Code -->
                <div v-if="googleMapsUrl && showQrCodesLocation" class="flex flex-col items-center gap-1">
                  <div class="p-1 bg-white rounded-xl shadow-sm">
                    <QrcodeVue :value="googleMapsUrl" :size="70" level="L" background="#ffffff" class="rounded-lg" />
                  </div>
                  <span class="text-xs text-gray-500 font-medium">{{ t('retreatFlyer.locationQR') }}</span>
                </div>
              </div>

              <!-- Start Time -->
              <div class="flex gap-3 items-start group">
                <div class="bg-blue-100 p-2 rounded-xl text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300 print:bg-blue-50">
                  <Clock class="w-5 h-5" />
                </div>
                <div>
                  <h4 class="font-bold text-lg uppercase text-gray-800 tracking-wide">{{ t('retreatFlyer.startTime') }} {{ formatDate(startDate) }}</h4>
                  <p class="text-base font-bold text-gray-800">{{ openingTimeDisplay }}</p>
                  <p class="text-sm text-red-600 font-bold flex items-center gap-1 mt-1 bg-red-50 px-2 py-0.5 rounded-md w-full text-justify">
                    <AlertTriangle class="w-4 h-4" /> {{ registrationDeadline }}
                  </p>
                </div>
              </div>

              <!-- End Time -->
              <div class="flex gap-3 items-start group">
                <div class="bg-blue-100 p-2 rounded-xl text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300 print:bg-blue-50">
                  <Calendar class="w-5 h-5" />
                </div>
                <div>
                  <h4 class="font-bold text-lg uppercase text-gray-800 tracking-wide">{{ t('retreatFlyer.endTime') }} {{ formatDate(endDate) }}</h4>
                  <div class="text-sm bg-gray-50/80 p-3 rounded-lg border border-gray-200 print:bg-gray-50">
                    <p class="font-bold text-blue-700">{{ closingLocation }}</p>
                    <p class="text-amber-600 font-bold uppercase text-xs flex items-center gap-1 mt-1">
                      <Users class="w-4 h-4" /> {{ arrivalTimeNoteText }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- What to Bring -->
            <div class="bg-white/40 backdrop-blur-sm p-3 rounded-2xl shadow-lg border border-white/40 print:bg-white/80 print:shadow-none print:rounded-none print:border-none print:p-3">
              <h4 class="font-bold text-base uppercase text-gray-800 mb-4 flex items-center gap-2 border-b border-gray-200 pb-2">
                <Backpack class="w-5 h-5 text-blue-600" /> {{ whatToBringText }}
              </h4>

              <!-- Dynamic items list if available -->
              <ul v-if="thingsToBringItems.length > 0" class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm text-gray-700">
                <li v-for="item in thingsToBringItems" :key="item" class="flex items-center gap-2">
                  <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                  {{ item }}
                </li>
              </ul>

              <!-- Default items list when no dynamic data -->
              <ul v-else class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm text-gray-700">
                <li class="flex items-center gap-2">
                  <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div> {{ t('retreatFlyer.defaultItems.personalThermos') }}
                </li>
                <li class="flex items-center gap-2">
                  <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div> {{ t('retreatFlyer.defaultItems.towel') }}
                </li>
                <li class="flex items-center gap-2">
                  <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div> {{ t('retreatFlyer.defaultItems.toiletries') }}
                </li>
                <li class="flex items-center gap-2">
                  <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div> {{ t('retreatFlyer.defaultItems.jacketSweatshirt') }}
                </li>
                <li class="flex items-center gap-2">
                  <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div> {{ t('retreatFlyer.defaultItems.comfortableClothes') }}
                </li>
              </ul>

            </div>
          </div>

          <!-- Right Column - Registration & Payment -->
          <div class="md:col-span-5 space-y-3 print:col-span-5">
            

            <!-- Payment Information -->
            <div class="bg-gradient-to-br from-yellow-50/40 to-orange-50/40 backdrop-blur-sm p-3 rounded-2xl border border-yellow-200 shadow-lg print:shadow-none print:bg-yellow-50/30 print:p-3">
              <div class="flex justify-between items-end mb-4 border-b border-yellow-200/50 pb-3">
                <span class="text-sm font-bold uppercase text-gray-500 tracking-wider">{{ t('retreatFlyer.cost') }}</span>
                <span class="text-3xl font-bold text-gray-800 leading-none font-header">{{ formatCost }}</span>
              </div>
              <div class="space-y-3 text-sm">
                <div v-if="paymentInfo" class="text-gray-700 bg-white/50 p-3 rounded-lg border border-yellow-100">
                  <span v-html="paymentInfo"></span>
                </div>
                <div v-if="paymentMethods">
                  <span class="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">{{ t('retreatFlyer.paymentMethods') }}</span>
                  <span class="font-bold text-gray-800">{{ paymentMethods }}</span>
                </div>
              </div>
            </div>

            <!-- Contact Information -->
            <div class="bg-white/40 backdrop-blur-sm p-3 rounded-2xl shadow-lg border border-white/40 print:shadow-none print:bg-white/60 print:p-3">
              <h4 class="text-sm font-bold text-gray-400 uppercase mb-3 flex items-center gap-2 tracking-wider">
                <Info class="w-4 h-4" /> {{ t('retreatFlyer.information') }}
              </h4>
              <div class="bg-white p-3 rounded-xl shadow-sm border border-gray-100 hover:border-blue-200 transition-colors print:shadow-none">
                <div class="flex items-start gap-3">
                  <div class="bg-green-100 p-1.5 rounded-full text-green-600 flex-shrink-0 mt-0.5">
                    <Phone class="w-4 h-4" />
                  </div>
                  <div class="space-y-2">
                    <div v-for="(phone, index) in contactPhones" :key="phone?.number || index" class="text-sm">
                      <span class="font-bold text-gray-800 block text-xs uppercase text-gray-400">{{ phone?.name || t('retreatFlyer.contact') }}</span>
                      <span class="text-gray-700 font-medium font-mono">{{ phone?.number }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <!-- Registration QR Code -->
            <div v-if="showQrCodesRegistration" class="bg-white/40 backdrop-blur-sm p-3 rounded-2xl shadow-lg border border-yellow-200/50 text-center relative overflow-hidden group hover:shadow-xl transition-shadow duration-300 print:shadow-none print:bg-white/60  print:p-3">
              <div class="absolute top-0 right-0 w-24 h-24 bg-yellow-400/20 rounded-bl-full -mr-10 -mt-10 z-0 transition-transform group-hover:scale-110 duration-500"></div>
              <div class="absolute bottom-0 left-0 w-16 h-16 bg-blue-400/10 rounded-tr-full -ml-8 -mb-8 z-0"></div>

              <h3 class="relative z-10 text-2xl font-bold text-blue-700 uppercase mb-1 tracking-wide">{{ registerText }}</h3>
              <p class="relative z-10 text-sm text-gray-600 mb-4 font-medium">{{ scanToRegisterText }}</p>

              <div class="flex justify-center mb-4 relative z-10">
                <div class="p-2 bg-white rounded-xl shadow-sm">
                  <QrcodeVue :value="registrationUrl" :size="70" level="L" background="#ffffff" class="rounded-lg" />
                </div>
              </div>

              <div class="print:hidden relative z-10">
                  <a :href="registrationUrl" target="_blank"
                     class="block w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3 px-6 rounded-xl text-sm shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5">
                    {{ goToRegistrationText }}
                  </a>
              </div>
              <div class="mt-3 text-[10px] text-gray-400 font-mono uppercase tracking-wider">{{ registrationDomain }}</div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <footer class="relative bg-black h-20 flex items-center justify-between px-6 overflow-hidden mt-auto print:bg-black print:h-20">
           <!-- Note: Background images often don't print by default. We keep the fallback color strong. -->
          <div class="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black opacity-90 print:opacity-80"></div>

          <div class="relative z-10 flex flex-col justify-center h-full">
            <h2 class="text-4xl md:text-5xl font-bold text-white leading-none mb-1 font-display drop-shadow-lg" style="font-family: 'Dancing Script', cursive;">{{ comeText }}</h2>
            <div class="bg-yellow-500 text-black text-[10px] md:text-xs font-bold px-3 py-1 rounded-full uppercase w-max tracking-wider shadow-lg print:bg-yellow-500 print:text-black">{{ limitedCapacityText }}</div>
          </div>

          <div class="relative z-10 max-w-lg text-right flex flex-col justify-center h-full">
            <h3 class="text-xl md:text-2xl font-bold text-white uppercase tracking-widest mb-1 font-header">{{ dontMissItText }}</h3>
            <p class="text-[10px] text-gray-400 leading-tight opacity-80 max-w-[200px] ml-auto">
              {{ reservationNoteText }}
            </p>
          </div>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
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

// Load retreat data
onMounted(async () => {
  const retreatId = route.params.id as string;
  if (retreatId && !selectedRetreat.value) {
    retreatStore.selectRetreat(retreatId);
  }
});
</script>

<style>
/* Global Print Styles (Non-scoped)
  This is the key to printing JUST the flyer.
*/
@media print {
  /* 1. Hide every single element on the page... */
  body * {
    visibility: hidden;
  }

  /* 2. ...EXCEPT the flyer specific ID and its children. */
  #printable-area, 
  #printable-area * {
    visibility: visible;
  }

  /* 3. Position the flyer at the absolute top-left of the paper. */
  #printable-area {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  
  /* Reset margins for the page */
  @page {
    size: auto;
    margin: 5mm;
  }
}
</style>

<style scoped>
/* Import fonts */
@import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Miltonian+Tattoo&family=Oswald:wght@300;400;500;700&family=Roboto:ital,wght@0,300;0,400;0,500;0,700;1,400&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

/* Regular screen styles */
.print-optimized {
  width: 100%;
  max-width: 210mm;
  margin: 0 auto;
}

.font-display {
  font-family: 'Dancing Script', cursive;
}

.font-header {
  font-family: 'Oswald', sans-serif;
}
</style>