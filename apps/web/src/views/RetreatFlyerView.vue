<template>
  <div class="min-h-screen bg-gray-100 py-4">
    <!-- Print Button -->
    <div class="right-4 z-50 print:hidden">
      <Button @click="handlePrint" class="bg-blue-600 hover:bg-blue-700">
        <Printer class="w-4 h-4 mr-2" />
        Imprimir Flyer
      </Button>
    </div>

    <!-- Flyer Container -->
    <div class="max-w-4xl mx-auto">
      <div
        class="print-optimized bg-white shadow-lg"
        :style="flyerStyles"
      >
        <!-- Header Section -->
        <header class="relative bg-blue-50 border-b-4 border-blue-700 px-6 py-4 flex flex-row items-center justify-between overflow-hidden">
          <!-- Background Pattern -->
          <div class="absolute inset-0 opacity-10 bg-cover bg-center"
               :style="{ backgroundImage: 'url(\'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjwvc3ZnPg==\')' }">
          </div>

          <!-- Emaús Logo Section -->
          <div class="relative z-10 flex flex-col items-center flex-shrink-0 mr-4">
            <div class="relative mb-1">
              <!-- Custom Cross and Rose Logo -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="80" height="80" class="relative">
                <!-- Cross -->
                <rect x="85" y="20" width="30" height="160" fill="#8B4513" rx="2"/>
                <rect x="40" y="60" width="120" height="30" fill="#8B4513" rx="2"/>

                <!-- Cross border/outline -->
                <rect x="85" y="20" width="30" height="160" fill="none" stroke="#5D3A1A" stroke-width="2" rx="2"/>
                <rect x="40" y="60" width="120" height="30" fill="none" stroke="#5D3A1A" stroke-width="2" rx="2"/>

                <!-- Rose center -->
                <circle cx="100" cy="75" r="18" fill="#C41E3A"/>

                <!-- Rose petals - outer layer -->
                <ellipse cx="100" cy="55" rx="12" ry="10" fill="#E32636"/>
                <ellipse cx="118" cy="68" rx="10" ry="12" fill="#DC143C"/>
                <ellipse cx="115" cy="88" rx="12" ry="10" fill="#E32636"/>
                <ellipse cx="85" cy="88" rx="12" ry="10" fill="#DC143C"/>
                <ellipse cx="82" cy="68" rx="10" ry="12" fill="#E32636"/>

                <!-- Rose petals - inner layer -->
                <ellipse cx="100" cy="62" rx="8" ry="7" fill="#8B0000"/>
                <ellipse cx="110" cy="72" rx="7" ry="8" fill="#A52A2A"/>
                <ellipse cx="107" cy="82" rx="8" ry="6" fill="#8B0000"/>
                <ellipse cx="93" cy="82" rx="8" ry="6" fill="#A52A2A"/>
                <ellipse cx="90" cy="72" rx="7" ry="8" fill="#8B0000"/>

                <!-- Rose center detail -->
                <circle cx="100" cy="75" r="6" fill="#800020"/>
                <path d="M97 72 Q100 68 103 72 Q106 76 100 80 Q94 76 97 72" fill="#4A0010"/>

                <!-- Rose leaves -->
                <ellipse cx="130" cy="90" rx="15" ry="8" fill="#228B22" transform="rotate(30 130 90)"/>
                <ellipse cx="70" cy="90" rx="15" ry="8" fill="#228B22" transform="rotate(-30 70 90)"/>
                <path d="M130 90 L118 85" stroke="#006400" stroke-width="1" fill="none"/>
                <path d="M70 90 L82 85" stroke="#006400" stroke-width="1" fill="none"/>

                <!-- Small leaf veins -->
                <path d="M125 88 L130 90 L125 92" stroke="#006400" stroke-width="0.5" fill="none"/>
                <path d="M75 88 L70 90 L75 92" stroke="#006400" stroke-width="0.5" fill="none"/>

                <!-- Text EMAUS -->
                <text x="100" y="195" font-family="Georgia, serif" font-size="18" font-weight="bold" fill="#8B4513" text-anchor="middle">EMAUS</text>
              </svg>
            </div>
            <h2 class="text-lg font-bold uppercase tracking-widest text-gray-800 leading-none">Emaús</h2>
            <p class="text-[0.65rem] text-gray-600 text-center uppercase font-semibold leading-tight mt-1">Tlalpan XI<br/>Del Valle III</p>
          </div>

          <!-- Main Title -->
          <div class="relative z-10 text-right flex-1">
            <p class="text-sm md:text-base text-blue-600 font-semibold mb-[-10px] mr-2 uppercase tracking-wide">un fin de semana de</p>
            <h1 class="text-6xl md:text-8xl font-bold text-red-600 leading-none transform -rotate-1 origin-bottom-right pb-2 pr-2"
                style="font-family: 'Miltonian Tattoo', cursive; text-shadow: 14px 11px 7px rgba(0, 0, 0, 0.3);">Esperanza</h1>
            <p class="text-sm text-gray-500 italic">"La esperanza no decepciona: es silenciosa, humilde y fuerte"</p>
          </div>
        </header>

        <!-- Retreat Type Banner -->
        <div class="bg-gradient-to-r from-blue-700 to-blue-900 text-white p-3 shadow-md relative z-20">
          <div class="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-8 text-center">
            <h3 class="text-xl md:text-2xl font-bold uppercase tracking-wide">Retiro Católico</h3>
            <span class="hidden md:block w-px h-6 bg-blue-400/50"></span>
            <div class="flex items-center gap-2">
              <span class="text-sm opacity-90">Emaús para</span>
              <span class="text-lg font-bold uppercase text-yellow-300 tracking-wider border-2 border-yellow-300 px-2 rounded">
                {{ retreatTypeText }}
              </span>
            </div>
            <span class="hidden md:block w-px h-6 bg-blue-400/50"></span>
            <p class="text-xl font-bold text-white">{{ formatDateRange }}</p>
          </div>
        </div>

        <!-- Main Content Grid -->
        <div class="grid grid-cols-1 md:grid-cols-12 gap-0">
          <!-- Left Column - Event Details -->
          <div class="md:col-span-7 p-5 space-y-5 bg-white border-r border-gray-100">
            <p class="text-sm text-gray-600 italic text-center mb-4 border-b border-gray-100 pb-2">
              Un encuentro de esperanza donde sentirás paz, amor y tranquilidad. <br/>
              <span class="font-bold text-blue-600 not-italic">¡Atrévete, vívelo!</span>
            </p>

            <!-- Location -->
            <div class="flex gap-3 items-start">
              <div class="bg-blue-100 p-2 rounded-lg text-blue-700">
                <MapPin class="w-5 h-5" />
              </div>
              <div>
                <h4 class="font-bold text-base uppercase text-gray-800">Lugar: {{ retreatLocation }}</h4>
                <p class="text-sm text-gray-600 leading-tight">{{ retreatAddress }}</p>
              </div>
            </div>

            <!-- Start Time -->
            <div class="flex gap-3 items-start">
              <div class="bg-blue-100 p-2 rounded-lg text-blue-700">
                <Clock class="w-5 h-5" />
              </div>
              <div>
                <h4 class="font-bold text-base uppercase text-gray-800">INICIO: {{ formatDate(startDate) }}</h4>
                <p class="text-sm font-bold text-gray-800">{{ openingNotes || '5:00 PM EN PUNTO' }}</p>
                <p class="text-xs text-red-500 font-semibold flex items-center gap-1">
                  <AlertTriangle class="w-4 h-4" /> Llegar 5:30 PM máximo para registro
                </p>
              </div>
            </div>

            <!-- End Time -->
            <div class="flex gap-3 items-start">
              <div class="bg-blue-100 p-2 rounded-lg text-blue-700">
                <Calendar class="w-5 h-5" />
              </div>
              <div>
                <h4 class="font-bold text-base uppercase text-gray-800">FIN: {{ formatDate(endDate) }}</h4>
                <p class="text-sm font-bold text-gray-800 mb-1">6:30 PM con Misa de Cierre</p>
                <div class="text-xs bg-gray-50 p-2 rounded border border-gray-200">
                  <p class="font-bold text-blue-600">{{ closingLocation || 'Pqia. La Esperanza de María' }}</p>
                  <p class="mb-1 text-gray-500">{{ closingAddress || 'Alborada 430, Parques del Pedregal' }}</p>
                  <p class="text-amber-600 font-bold uppercase text-[10px] flex items-center gap-1">
                    <Users class="w-4 h-4" /> Importante que tu familia asista
                  </p>
                </div>
              </div>
            </div>

            <!-- What to Bring -->
            <div class="mt-2 pt-4 border-t border-dashed border-gray-200">
              <h4 class="font-bold text-sm uppercase text-gray-800 mb-2 flex items-center gap-2">
                <Backpack class="w-5 h-5 text-blue-600" /> Qué llevar:
              </h4>
              <ul class="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-gray-700">
                <li class="flex items-center gap-1">
                  <Check class="w-4 h-4 text-green-500" /> Termo personal
                </li>
                <li class="flex items-center gap-1">
                  <Check class="w-4 h-4 text-green-500" /> Toalla
                </li>
                <li class="flex items-center gap-1">
                  <Check class="w-4 h-4 text-green-500" /> Artículos de Aseo
                </li>
                <li class="flex items-center gap-1">
                  <Check class="w-4 h-4 text-green-500" /> Chamarra/Sudadera
                </li>
                <li class="flex items-center gap-1">
                  <Check class="w-4 h-4 text-green-500" /> Ropa cómoda
                </li>
                <li class="col-span-2 text-gray-400 italic text-[10px] mt-1 ml-5">
                  * Sábanas y cobijas incluidas
                </li>
              </ul>
              <div v-if="thingsToBringNotes" class="mt-2 text-xs text-gray-600 italic">
                {{ thingsToBringNotes }}
              </div>
            </div>
          </div>

          <!-- Right Column - Registration & Payment -->
          <div class="md:col-span-5 bg-yellow-50/30 p-5 flex flex-col gap-4 border-l border-gray-100">
            <!-- Registration QR Code -->
            <div class="bg-white p-4 rounded-xl shadow-sm border border-yellow-200 text-center relative overflow-hidden">
              <div class="absolute top-0 right-0 w-16 h-16 bg-yellow-100 rounded-bl-full -mr-8 -mt-8 z-0"></div>
              <h3 class="relative z-10 text-xl font-bold text-blue-600 uppercase mb-1">¡Regístrate!</h3>
              <p class="relative z-10 text-xs text-gray-500 mb-3">Escanea para asegurar tu lugar</p>
              <div class="flex justify-center mb-3">
                <QrcodeVue :value="registrationUrl" :size="128" level="H" class="border-4 border-white shadow-md rounded-lg" />
              </div>
              <a :href="registrationUrl" target="_blank"
                 class="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full text-sm shadow transition-colors">
                Ir al Registro
              </a>
              <div class="mt-1 text-[10px] text-gray-400 font-mono">{{ registrationDomain }}</div>
            </div>

            <!-- Payment Information -->
            <div class="bg-gradient-to-br from-yellow-50 to-orange-50 p-4 rounded-xl border border-yellow-200 shadow-sm">
              <div class="flex justify-between items-end mb-2 border-b border-yellow-200 pb-2">
                <span class="text-xs font-bold uppercase text-gray-500">Costo</span>
                <span class="text-2xl font-bold text-gray-800 leading-none">{{ formatCost }}</span>
              </div>
              <div class="space-y-2 text-xs">
                <div v-if="paymentInfo" class="text-gray-600">
                  {{ paymentInfo }}
                </div>
                <div v-if="paymentMethods">
                  <span class="block text-[10px] text-gray-500 uppercase">Métodos de pago</span>
                  <span class="font-bold text-gray-800">{{ paymentMethods }}</span>
                </div>
              </div>
            </div>

            <!-- Contact Information -->
            <div class="mt-auto">
              <h4 class="text-sm font-bold text-gray-400 uppercase mb-2 flex items-center gap-1">
                <Info class="w-4 h-4" /> Informes
              </h4>
              <div class="grid grid-cols-1 gap-2">
                <a v-for="phone in contactPhones" :key="phone"
                   :href="`tel:${phone}`"
                   class="flex items-center gap-2 bg-white p-2 rounded shadow-sm hover:shadow transition-shadow">
                  <Phone class="w-4 h-4 text-green-600" />
                  <div class="text-xs">
                    <span class="font-bold text-gray-800">Contacto</span>
                    <span class="text-gray-600 ml-1">{{ phone }}</span>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <footer class="relative bg-black h-24 md:h-28 flex items-center justify-between px-6 overflow-hidden mt-auto">
          <div class="absolute inset-0 opacity-40 bg-cover bg-center"
               :style="{ backgroundImage: 'url(\'https://images.unsplash.com/photo-1495616811223-4d98c6e9d869?q=80&w=2600&auto=format&fit=crop\')' }">
          </div>
          <div class="absolute inset-0 bg-gradient-to-r from-black via-transparent to-black opacity-90"></div>

          <div class="relative z-10 flex flex-col justify-center h-full">
            <h2 class="text-4xl md:text-5xl font-bold text-white leading-none mb-1" style="font-family: 'Dancing Script', cursive;">Ven</h2>
            <div class="bg-yellow-500 text-black text-[10px] md:text-xs font-bold px-2 py-0.5 rounded uppercase w-max">Cupo Limitado</div>
          </div>

          <div class="relative z-10 max-w-lg text-right flex flex-col justify-center h-full">
            <h3 class="text-lg md:text-xl font-bold text-white uppercase tracking-wider mb-1">¡No te lo pierdas!</h3>
            <p class="text-[9px] text-gray-400 leading-tight opacity-90">
              * Para asegurar lugar: llenar formato en línea y cubrir el 50% del costo.
            </p>
          </div>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
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
const serverRegistrationLink = computed(() => retreatStore.serverRegistrationLink);

// Dynamic data from retreat store
const retreatData = computed(() => selectedRetreat.value || null);

const retreatTypeText = computed(() => {
  // This could be dynamic based on retreat data or configurable
  return 'HOMBRES'; // Could be 'MUJERES', 'JOVENES', etc.
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

const retreatLocation = computed(() =>
  'Centro Cruces' // Default location since house details aren't in the basic retreat schema
);

const retreatAddress = computed(() =>
  'Calle de la Moneda 85A, Col. Tlalpan, CDMX' // Default address
);

const openingNotes = computed(() => retreatData.value?.openingNotes);
const closingNotes = computed(() => retreatData.value?.closingNotes);
const closingLocation = computed(() => 'Pqia. La Esperanza de María'); // Default closing location
const closingAddress = computed(() => 'Alborada 430, Parques del Pedregal'); // Default closing address
const thingsToBringNotes = computed(() => retreatData.value?.thingsToBringNotes);

const formatCost = computed(() => {
  const cost = retreatData.value?.cost;
  if (!cost) return '$ 2,800';

  // Cost is always a string according to the schema
  return cost.trim();
});

const paymentInfo = computed(() => retreatData.value?.paymentInfo);
const paymentMethods = computed(() => retreatData.value?.paymentMethods);

const contactPhones = computed(() => {
  const phones = retreatData.value?.contactPhones;
  if (!phones) return ['55 1298-4941', '55 5455-0764']; // Default fallback

  // contactPhones is a string, parse it as comma-separated values
  try {
    return phones.split(',').map(phone => phone.trim()).filter(phone => phone.length > 0);
  } catch {
    return ['55 1298-4941', '55 5455-0764']; // Default fallback
  }
});

const registrationUrl = computed(() => {
  // Use walker registration link by default, could be made configurable
  return walkerRegistrationLink.value || 'https://www.emaus.mx/tlalpan';
});

const registrationDomain = computed(() => {
  const url = registrationUrl.value;
  try {
    const domain = new URL(url).hostname;
    return domain.replace('www.', '');
  } catch {
    return 'emaus.mx/tlalpan';
  }
});

// Styling for the flyer
const flyerStyles = {
  fontFamily: "'Roboto', sans-serif",
  width: '100%',
  maxWidth: '210mm',
  margin: '0 auto',
  backgroundColor: 'white',
  boxShadow: '0 0 20px rgba(0,0,0,0.1)'
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

<style scoped>
/* Import fonts */
@import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Miltonian+Tattoo&family=Oswald:wght@300;400;500;700&family=Roboto:ital,wght@0,300;0,400;0,500;0,700;1,400&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

/* Print-optimized styles */
.print-optimized {
  width: 100%;
  max-width: 210mm;
  margin: 0 auto;
  background: white;
  box-shadow: 0 0 20px rgba(0,0,0,0.1);
}

/* Print styles */
@media print {
  body {
    background: white !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .print-optimized {
    box-shadow: none;
    max-width: none;
    width: 100%;
  }

  .print-hidden {
    display: none !important;
  }

  /* Ensure colors are preserved in print */
  .bg-blue-50 { background-color: #eff6ff !important; }
  .bg-blue-700 { background-color: #1d4ed8 !important; }
  .bg-yellow-50 { background-color: #fefce8 !important; }
  .bg-yellow-100 { background-color: #fef3c7 !important; }
  .bg-black { background-color: #000000 !important; }
  .text-blue-600 { color: #2563eb !important; }
  .text-red-600 { color: #dc2626 !important; }
  .text-yellow-300 { color: #fde047 !important; }
  .text-white { color: #ffffff !important; }

  /* Page setup */
  @page {
    margin: 1cm;
    size: A4;
  }

  /* Force proper scaling */
  .print-optimized {
    transform: scale(1);
    transform-origin: top left;
  }
}

/* Text shadow for better readability */
.text-shadow {
  text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
}

/* Custom font classes */
.font-display {
  font-family: 'Dancing Script', cursive;
}

.font-header {
  font-family: 'Oswald', sans-serif;
}
</style>