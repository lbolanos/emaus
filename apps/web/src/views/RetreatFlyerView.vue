<template>
  <!-- Added print:p-0 and print:bg-white to remove outer padding/color during print -->
  <div class="min-h-screen bg-gray-100 py-4 print:p-0 print:bg-white print:min-h-0">
    <!-- Print Button (Hidden during print) -->
    <div class="right-4 z-50 print:hidden">
      <Button @click="handlePrint" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow flex items-center">
        <Printer class="w-4 h-4 mr-2" />
        Imprimir Flyer
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
              <!-- Logo Image -->
              <img src="/crossRoseButtT.png" alt="Emaus Logo" class="w-20 h-20 object-contain filter drop-shadow-md" />
            </div>
            <h2 class="text-xl font-bold uppercase tracking-[0.2em] text-white leading-none font-header text-shadow-sm">Emaús</h2>
            <p class="text-[0.7rem] text-white/90 text-center uppercase font-medium leading-tight mt-1 tracking-wider">{{ retreatParish }}</p>
          </div>

          <!-- Main Title -->
          <div class="relative z-10 text-right flex-1">
            <p class="text-base md:text-lg text-white/90 font-medium mb-[-5px] mr-2 uppercase tracking-widest text-shadow-sm">un fin de semana de</p>
            <h1 class="text-5xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-300 leading-none transform -rotate-2 origin-bottom-right pb-4 pr-2 font-display"
                style="font-family: 'Miltonian Tattoo', cursive; filter: drop-shadow(10px 17px 2px rgba(0,0,0,0.5));">Esperanza</h1>
            <p class="text-sm text-white/80 italic font-light tracking-wide">"La esperanza no decepciona: es silenciosa, humilde y fuerte"</p>
          </div>
        </header>

        <!-- Retreat Type Banner -->
        <div class="relative z-20">
          <div class="bg-blue-900/80 backdrop-blur-sm text-white p-2 shadow-xl border-y border-blue-500/30 print:bg-blue-900/80 print:text-white">
            <div class="flex flex-col md:flex-row print:flex-row items-center justify-center gap-2 md:gap-6 print:gap-2 text-center">
              <h3 class="text-xl md:text-2xl font-bold uppercase tracking-widest font-header">Retiro Católico</h3>
              <span class="hidden md:block print:block w-px h-8 bg-blue-500/30"></span>
              <div class="flex items-center gap-3">
                <span class="text-sm opacity-80 uppercase tracking-wide">Emaús para</span>
                <span class="text-xl font-bold uppercase text-yellow-300 tracking-widest border border-yellow-400/60 px-5 py-1 rounded-lg bg-gradient-to-r from-yellow-500/20 to-yellow-400/20 backdrop-blur-sm shadow-inner print:text-yellow-400 print:border-yellow-400">
                  {{ retreatTypeText }}
                </span>
              </div>
              <span class="hidden md:block print:block w-px h-8 bg-blue-500/30"></span>
              <p class="text-xl font-bold text-white tracking-wide">{{ formatDateRange }}</p>
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
                Un encuentro de esperanza donde sentirás paz, amor y tranquilidad. <br/>
                <span class="font-bold text-blue-700 not-italic text-xl mt-2 block">¡Atrévete, vívelo!</span>
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
                  <h4 class="font-bold text-lg uppercase text-gray-800 tracking-wide">Lugar: {{ retreatLocation }}</h4>
                  <p class="text-gray-600 leading-tight">{{ retreatAddress }}</p>
                </div>
                <!-- Google Maps QR Code -->
                <div v-if="googleMapsUrl" class="flex flex-col items-center gap-1">
                  <div class="p-1 bg-white rounded-xl shadow-sm">
                    <QrcodeVue :value="googleMapsUrl" :size="70" level="L" background="#ffffff" class="rounded-lg" />
                  </div>
                  <span class="text-xs text-gray-500 font-medium">Ubicación</span>
                </div>
              </div>

              <!-- Start Time -->
              <div class="flex gap-3 items-start group">
                <div class="bg-blue-100 p-2 rounded-xl text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300 print:bg-blue-50">
                  <Clock class="w-5 h-5" />
                </div>
                <div>
                  <h4 class="font-bold text-lg uppercase text-gray-800 tracking-wide">INICIO: {{ formatDate(startDate) }}</h4>
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
                  <h4 class="font-bold text-lg uppercase text-gray-800 tracking-wide">FIN: {{ formatDate(endDate) }}</h4>
                  <div class="text-sm bg-gray-50/80 p-3 rounded-lg border border-gray-200 print:bg-gray-50">
                    <p class="font-bold text-blue-700">{{ closingLocation }}</p>
                    <p class="text-amber-600 font-bold uppercase text-xs flex items-center gap-1 mt-1">
                      <Users class="w-4 h-4" /> Importante que tu familia asista
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- What to Bring -->
            <div class="bg-white/40 backdrop-blur-sm p-3 rounded-2xl shadow-lg border border-white/40 print:bg-white/80 print:shadow-none print:rounded-none print:border-none print:p-3">
              <h4 class="font-bold text-base uppercase text-gray-800 mb-4 flex items-center gap-2 border-b border-gray-200 pb-2">
                <Backpack class="w-5 h-5 text-blue-600" /> Qué llevar:
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
                  <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div> Termo personal
                </li>
                <li class="flex items-center gap-2">
                  <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div> Toalla
                </li>
                <li class="flex items-center gap-2">
                  <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div> Artículos de Aseo
                </li>
                <li class="flex items-center gap-2">
                  <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div> Chamarra/Sudadera
                </li>
                <li class="flex items-center gap-2">
                  <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div> Ropa cómoda
                </li>
              </ul>

            </div>
          </div>

          <!-- Right Column - Registration & Payment -->
          <div class="md:col-span-5 space-y-3 print:col-span-5">
            

            <!-- Payment Information -->
            <div class="bg-gradient-to-br from-yellow-50/40 to-orange-50/40 backdrop-blur-sm p-3 rounded-2xl border border-yellow-200 shadow-lg print:shadow-none print:bg-yellow-50/30 print:p-3">
              <div class="flex justify-between items-end mb-4 border-b border-yellow-200/50 pb-3">
                <span class="text-sm font-bold uppercase text-gray-500 tracking-wider">Costo:</span>
                <span class="text-3xl font-bold text-gray-800 leading-none font-header">{{ formatCost }}</span>
              </div>
              <div class="space-y-3 text-sm">
                <div v-if="paymentInfo" class="text-gray-700 bg-white/50 p-3 rounded-lg border border-yellow-100">
                  <span v-html="paymentInfo"></span>
                </div>
                <div v-if="paymentMethods">
                  <span class="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Métodos de pago</span>
                  <span class="font-bold text-gray-800">{{ paymentMethods }}</span>
                </div>
              </div>
            </div>

            <!-- Contact Information -->
            <div class="bg-white/40 backdrop-blur-sm p-3 rounded-2xl shadow-lg border border-white/40 print:shadow-none print:bg-white/60 print:p-3">
              <h4 class="text-sm font-bold text-gray-400 uppercase mb-3 flex items-center gap-2 tracking-wider">
                <Info class="w-4 h-4" /> Informes
              </h4>
              <div class="bg-white p-3 rounded-xl shadow-sm border border-gray-100 hover:border-blue-200 transition-colors print:shadow-none">
                <div class="flex items-start gap-3">
                  <div class="bg-green-100 p-1.5 rounded-full text-green-600 flex-shrink-0 mt-0.5">
                    <Phone class="w-4 h-4" />
                  </div>
                  <div class="space-y-2">
                    <div v-for="(phone, index) in contactPhones" :key="phone.number || index" class="text-sm">
                      <span class="font-bold text-gray-800 block text-xs uppercase text-gray-400">{{ phone.name }}</span>
                      <span class="text-gray-700 font-medium font-mono">{{ phone.number }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <!-- Registration QR Code -->
            <div class="bg-white/40 backdrop-blur-sm p-3 rounded-2xl shadow-lg border border-yellow-200/50 text-center relative overflow-hidden group hover:shadow-xl transition-shadow duration-300 print:shadow-none print:bg-white/60  print:p-3">
              <div class="absolute top-0 right-0 w-24 h-24 bg-yellow-400/20 rounded-bl-full -mr-10 -mt-10 z-0 transition-transform group-hover:scale-110 duration-500"></div>
              <div class="absolute bottom-0 left-0 w-16 h-16 bg-blue-400/10 rounded-tr-full -ml-8 -mb-8 z-0"></div>
              
              <h3 class="relative z-10 text-2xl font-bold text-blue-700 uppercase mb-1 tracking-wide">¡Regístrate!</h3>
              <p class="relative z-10 text-sm text-gray-600 mb-4 font-medium">Escanea para asegurar tu lugar</p>
              
              <div class="flex justify-center mb-4 relative z-10">
                <div class="p-2 bg-white rounded-xl shadow-sm">
                  <QrcodeVue :value="registrationUrl" :size="70" level="L" background="#ffffff" class="rounded-lg" />
                </div>
              </div>
              
              <div class="print:hidden relative z-10">
                  <a :href="registrationUrl" target="_blank"
                     class="block w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3 px-6 rounded-xl text-sm shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5">
                    Ir al Registro
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
            <h2 class="text-4xl md:text-5xl font-bold text-white leading-none mb-1 font-display drop-shadow-lg" style="font-family: 'Dancing Script', cursive;">Ven</h2>
            <div class="bg-yellow-500 text-black text-[10px] md:text-xs font-bold px-3 py-1 rounded-full uppercase w-max tracking-wider shadow-lg print:bg-yellow-500 print:text-black">Cupo Limitado</div>
          </div>

          <div class="relative z-10 max-w-lg text-right flex flex-col justify-center h-full">
            <h3 class="text-xl md:text-2xl font-bold text-white uppercase tracking-widest mb-1 font-header">¡No te lo pierdas!</h3>
            <p class="text-[10px] text-gray-400 leading-tight opacity-80 max-w-[200px] ml-auto">
              * Para asegurar lugar: llenar formato en línea y cubrir el 50% del costo.
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
const selectedRetreat = computed(() => retreatStore.selectedRetreat);
const walkerRegistrationLink = computed(() => retreatStore.walkerRegistrationLink);

// Dynamic data from retreat store
const retreatData = computed(() => selectedRetreat.value || null);

const retreatTypeText = computed(() => {
  // Try to determine retreat type from available data
  const parish = retreatData.value?.parish?.toLowerCase() || '';
  const houseName = retreatData.value?.house?.name?.toLowerCase() || '';
  const paymentInfo = retreatData.value?.paymentInfo?.toLowerCase() || '';

  // Simple heuristic-based type detection
  if (parish.includes('mujer') || houseName.includes('mujer') || paymentInfo.includes('mujer')) {
    return 'MUJERES';
  }
  if (parish.includes('joven') || houseName.includes('joven') || paymentInfo.includes('joven')) {
    return 'JÓVENES';
  }
  if (parish.includes('matrimonio') || houseName.includes('matrimonio') || paymentInfo.includes('matrimonio')) {
    return 'MATRIMONIOS';
  }

  // Default fallback based on typical Emaús retreat types
  return 'HOMBRES';
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
    .map(item => item.trim())
    .map(item => item.replace(/^[•\*\-\d\.]\s*/, '')) // Remove leading bullet/number characters
    .filter(item => item.length > 0)
    .map(item => {
      // Clean up the item text
      return item
        .replace(/\(para tu uso\)/gi, '')
        .replace(/etc\./gi, '')
        .trim();
    })
    .filter(item => item.length > 0);

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