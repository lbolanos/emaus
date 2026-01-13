<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="$emit('update:open', false)"></div>

        <!-- Modal Content -->
        <div class="relative bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <!-- Close Button -->
          <button
            @click.stop="$emit('update:open', false)"
            class="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-white/90 backdrop-blur shadow-lg flex items-center justify-center hover:bg-white hover:scale-110 transition-all cursor-pointer"
            type="button"
          >
            <X :size="20" class="text-stone-600 pointer-events-none" />
          </button>

          <!-- Flyer Header -->
          <div class="relative h-36 bg-gradient-to-br from-blue-900 to-blue-800 rounded-t-3xl overflow-hidden">
            <div class="absolute inset-0 bg-cover bg-center opacity-30" style="background-image: url('/header_bck.png');"></div>
            <div class="relative z-10 h-full flex flex-col md:flex-row items-center justify-center gap-6 text-white p-6">
              <img :src="retreatTypeLogo" alt="Emaus Logo" class="w-16 h-16 object-contain" />
              <div class="text-center">
                <h2 class="text-2xl font-bold uppercase tracking-widest">Emaús</h2>
                <p class="text-sm opacity-90 mt-1">{{ retreat?.parish }}</p>
              </div>
              <p v-if="retreat?.retreat_number_version" class="text-lg font-bold text-yellow-300">
                {{ retreat.retreat_number_version }}
              </p>
            </div>
          </div>

          <!-- Flyer Content - Two Column Layout -->
          <div class="p-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Left Column -->
              <div class="space-y-4">
                <!-- Start Date/Time -->
                <div class="bg-stone-50 rounded-xl p-4">
                  <div class="flex items-center gap-2 text-stone-500 mb-2">
                    <Calendar :size="16" />
                    <span class="text-xs font-semibold uppercase tracking-wider">{{ t('retreatFlyer.startTime') }}</span>
                  </div>
                  <p class="text-base font-bold text-stone-900">{{ formatDate(retreat?.startDate) }}</p>
                  <p class="text-sm text-stone-600">{{ formatTime(retreat?.walkerArrivalTime) }}</p>
                </div>

                <!-- Location -->
                <div class="bg-stone-50 rounded-xl p-4">
                  <div class="flex items-center gap-2 text-stone-500 mb-2">
                    <MapPin :size="16" />
                    <span class="text-xs font-semibold uppercase tracking-wider">{{ t('retreatFlyer.location') }}</span>
                  </div>
                  <p class="text-base font-bold text-stone-900">{{ retreat?.house?.name || retreat?.parish }}</p>
                  <p v-if="retreat?.house" class="text-xs text-stone-600 mt-1">
                    {{ formatAddress(retreat.house) }}
                  </p>
                  <a
                    v-if="retreat?.house?.googleMapsUrl"
                    :href="retreat.house.googleMapsUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <ExternalLink :size="12" />
                    {{ t('landing.viewInMaps') }}
                  </a>
                </div>

                <!-- Cost -->
                <div v-if="retreat?.cost" class="bg-stone-50 rounded-xl p-4">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-xs font-semibold uppercase tracking-wider text-stone-500">{{ t('retreatFlyer.cost') }}</p>
                      <p class="text-2xl font-bold text-stone-900 mt-1">{{ formatCost(retreat.cost) }}</p>
                    </div>
                    <div v-if="retreat.paymentInfo" class="flex-1 ml-4 text-xs text-stone-600">
                      <span v-html="retreat.paymentInfo.replace(/\n/g, '<br>')"></span>
                    </div>
                  </div>
                  <p v-if="retreat.paymentMethods" class="text-xs text-stone-600 mt-2">
                    <span class="font-semibold">{{ t('retreatFlyer.paymentMethods') }}:</span> {{ retreat.paymentMethods }}
                  </p>
                </div>

                <!-- Opening Notes -->
                <div v-if="retreat?.openingNotes" class="bg-red-50 border border-red-200 rounded-xl p-3">
                  <div class="flex items-center gap-2 text-red-600 mb-1">
                    <AlertTriangle :size="14" />
                    <span class="text-xs font-semibold uppercase tracking-wider">{{ t('landing.important') }}</span>
                  </div>
                  <p class="text-xs text-red-700">{{ retreat.openingNotes }}</p>
                </div>
              </div>

              <!-- Right Column -->
              <div class="space-y-4">
                <!-- End Date/Time -->
                <div class="bg-stone-50 rounded-xl p-4">
                  <div class="flex items-center gap-2 text-stone-500 mb-2">
                    <Clock :size="16" />
                    <span class="text-xs font-semibold uppercase tracking-wider">{{ t('retreatFlyer.endTime') }}</span>
                  </div>
                  <p class="text-base font-bold text-stone-900">{{ formatDate(retreat?.endDate) }}</p>
                  <p v-if="retreat?.closingNotes" class="text-sm text-stone-600">{{ retreat.closingNotes }}</p>
                </div>

                <!-- Contact -->
                <div v-if="retreat?.contactPhones" class="bg-stone-50 rounded-xl p-4">
                  <div class="flex items-center gap-2 text-stone-500 mb-2">
                    <Phone :size="16" />
                    <span class="text-xs font-semibold uppercase tracking-wider">{{ t('retreatFlyer.information') }}</span>
                  </div>
                  <div class="space-y-2">
                    <div v-for="(phone, index) in parsedPhones" :key="index" class="flex items-center gap-2">
                      <div class="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-600 flex-shrink-0">
                        <Phone :size="12" />
                      </div>
                      <div>
                        <p v-if="phone.name" class="text-[10px] text-stone-500 uppercase">{{ phone.name }}</p>
                        <p class="font-mono font-bold text-stone-900 text-sm">{{ phone.number }}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- What to Bring -->
                <div v-if="retreat?.thingsToBringNotes" class="bg-stone-50 rounded-xl p-4">
                  <div class="flex items-center gap-2 text-stone-500 mb-2">
                    <Backpack :size="16" />
                    <span class="text-xs font-semibold uppercase tracking-wider">{{ t('retreatFlyer.whatToBring') }}</span>
                  </div>
                  <p class="text-xs text-stone-600 whitespace-pre-line">{{ retreat.thingsToBringNotes }}</p>
                </div>
              </div>
            </div>

            <!-- CTA -->
            <div class="relative pt-6">
              <!-- Centered Walker Registration -->
              <div class="text-center">
                <router-link
                  v-if="retreat?.id"
                  :to="`/register/walker/${retreat.id}`"
                  class="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-stone-800 text-white font-medium hover:bg-stone-700 transition-all"
                >
                  <UserPlus :size="18" />
                  {{ t('landing.registerNow') }}
                </router-link>
                <router-link
                  v-else
                  to="/login"
                  class="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-stone-800 text-white font-medium hover:bg-stone-700 transition-all"
                >
                  <UserPlus :size="18" />
                  {{ t('landing.registerNow') }}
                </router-link>
              </div>
              <!-- Server Registration - Bottom Right -->
              <router-link
                v-if="retreat?.id"
                :to="`/register/server/${retreat.id}`"
                class="absolute bottom-0 right-0 inline-flex items-center gap-1 px-4 py-2 rounded-full bg-white border border-stone-200 text-stone-600 text-xs font-medium hover:bg-stone-50 hover:border-stone-300 transition-all"
              >
                <span>{{ t('landing.registerServer') }}</span>
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Calendar,
  Clock,
  MapPin,
  Phone,
  Backpack,
  AlertTriangle,
  X,
  ExternalLink,
  UserPlus
} from 'lucide-vue-next';

interface House {
  name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  googleMapsUrl?: string;
}

interface Retreat {
  id: string;
  parish?: string;
  retreat_number_version?: string;
  startDate?: string;
  endDate?: string;
  walkerArrivalTime?: string;
  closingNotes?: string;
  cost?: number | string;
  paymentInfo?: string;
  paymentMethods?: string;
  contactPhones?: string | string[];
  thingsToBringNotes?: string;
  openingNotes?: string;
  house?: House;
  retreat_type?: string;
}

const props = defineProps<{
  open: boolean;
  retreat: Retreat | null;
}>();

defineEmits<{
  'update:open': [value: boolean];
}>();

const { t } = useI18n();

const retreatTypeLogo = computed(() => {
  if (!props.retreat) return '/crossRoseButtT.png';

  const type = props.retreat.retreat_type?.toLowerCase();
  const parish = props.retreat.parish?.toLowerCase() || '';

  if (type === 'women' || parish.includes('mujer')) {
    return '/woman_logo.png';
  }

  return '/man_logo.png';
});

const parsedPhones = computed(() => {
  const phones = props.retreat?.contactPhones;
  if (!phones) return [];

  try {
    let phoneStr: string;
    if (Array.isArray(phones)) {
      phoneStr = phones.join('\n');
    } else {
      phoneStr = phones.toString();
    }

    return phoneStr
      .split(/[\n,]+/)
      .map(phone => phone.trim())
      .filter(phone => phone.length > 0)
      .map(phone => {
        const match = phone.match(/(.+?)\s*(\d[\d\s-]*\d)/);
        if (match) {
          return { name: match[1].trim(), number: match[2].trim() };
        }
        const numberMatch = phone.match(/(\d[\d\s-]*\d)/);
        return numberMatch ? { name: 'Contacto', number: numberMatch[1] } : null;
      })
      .filter((p): p is { name: string; number: string } => p !== null);
  } catch {
    return [];
  }
});

const formatDate = (dateValue?: string) => {
  if (!dateValue) return '';

  const date = new Date(dateValue);
  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};

const formatTime = (timeValue?: string) => {
  if (!timeValue) return '5:00 PM';

  const [hours, minutes] = timeValue.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour || 12;
  return `${displayHour}:${minutes || '00'} ${ampm}`;
};

const formatCost = (cost: number | string) => {
  const numericCost = parseFloat(cost.toString().replace(/[^0-9.]/g, ''));
  if (isNaN(numericCost)) return cost.toString();

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(numericCost);
};

const formatAddress = (house: House) => {
  const parts = [
    house.address1,
    house.address2,
    house.city,
    house.state,
    house.zipCode,
    house.country
  ].filter(part => part && part.trim());

  return parts.join(', ');
};
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .relative,
.modal-leave-active .relative {
  transition: all 0.3s ease;
}

.modal-enter-from .relative,
.modal-leave-to .relative {
  transform: scale(0.95) translateY(20px);
  opacity: 0;
}
</style>
