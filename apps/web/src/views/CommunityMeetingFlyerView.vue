<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50/50 to-indigo-100/30 py-8 print:p-0 print:bg-white print:min-h-0">
    <!-- Enhanced Floating Toolbar -->
    <div class="floating-toolbar fixed top-20 right-4 md:right-8 z-50 print:hidden flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
      <!-- Style Selector - Enhanced -->
      <div class="toolbar-glass flex items-center gap-1 rounded-xl p-1 shadow-xl">
        <button
          @click="setFlyerStyle('default')"
          :class="[
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
            flyerStyle === 'default' 
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30' 
              : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
          ]">
          <LayoutTemplate class="w-4 h-4" />
          <span class="hidden sm:inline">Default</span>
        </button>
        <button
          @click="setFlyerStyle('poster')"
          :class="[
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
            flyerStyle === 'poster' 
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30' 
              : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
          ]">
          <Image class="w-4 h-4" />
          <span class="hidden sm:inline">Poster</span>
        </button>
      </div>

      <!-- Action Buttons Group -->
      <div class="toolbar-glass flex items-center gap-1 rounded-xl p-1 shadow-xl">
        <Button 
          @click="handleEditMeeting" 
          variant="ghost" 
          size="icon" 
          title="Editar reunión"
          class="rounded-lg hover:bg-gray-100/80 transition-all"
        >
          <Pencil class="w-4 h-4 text-gray-600" />
        </Button>
        <Button 
          @click="handleGoBack" 
          variant="ghost"
          class="rounded-lg hover:bg-gray-100/80 transition-all text-gray-600 gap-2"
        >
          <ArrowLeft class="w-4 h-4" />
          <span class="hidden sm:inline">Volver</span>
        </Button>
      </div>

      <!-- Print Button - Premium styled -->
      <Button
        @click="handlePrint"
        class="print-button bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-700 hover:via-blue-600 hover:to-indigo-700 text-white px-5 py-2.5 rounded-xl shadow-xl flex items-center gap-2.5 transition-all duration-300 hover:scale-[1.02] hover:shadow-blue-500/40 border border-white/20"
      >
        <Printer class="w-5 h-5" />
        <span class="font-semibold hidden sm:inline">Imprimir</span>
      </Button>

      <!-- Copy Image Button -->
      <Button
        @click="handleCopyImage"
        :disabled="isCopying"
        class="copy-button bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-700 hover:via-emerald-600 hover:to-teal-700 text-white px-5 py-2.5 rounded-xl shadow-xl flex items-center gap-2.5 transition-all duration-300 hover:scale-[1.02] hover:shadow-emerald-500/40 border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Loader2 v-if="isCopying" class="w-5 h-5 animate-spin" />
        <Check v-else-if="copySuccess" class="w-5 h-5" />
        <Copy v-else class="w-5 h-5" />
        <span class="font-semibold hidden sm:inline">
          {{ isCopying ? 'Copiando...' : copySuccess ? '¡Copiado!' : 'Copiar imagen' }}
        </span>
      </Button>
    </div>

    <!-- Breadcrumb Navigation -->
    <div class="max-w-[850px] mx-auto px-4 pt-16 sm:pt-4 print:hidden">
      <div class="flex items-center text-sm text-gray-600 mb-4">
        <router-link 
          :to="{ name: 'community-meetings', params: { id: route.params.id } }" 
          class="hover:underline hover:text-gray-900 transition-colors"
        >
          {{ $t('community.meeting.title') }}
        </router-link>
        <ChevronRight class="w-4 h-4 mx-1" />
        <span class="truncate max-w-[200px]">{{ meeting?.title || 'Flyer' }}</span>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center min-h-[400px]">
      <div class="flex flex-col items-center gap-4">
        <div class="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
        <p class="text-gray-500 font-medium">Cargando flyer...</p>
      </div>
    </div>

    <!-- Flyer Container - Dynamic Component -->
    <div v-else ref="flyerRef" class="max-w-[850px] mx-auto px-4 pt-20 sm:pt-4 print:max-w-[210mm] print:w-[210mm] print:mx-0 print:px-0 print:pt-0">
      <component
        :is="flyerComponent"
        :meeting="meeting"
        :community="community"
        :formatted-date="formattedDate"
        :formatted-duration="formattedDuration"
        :formatted-address="formattedAddress"
        :processed-description="processedDescription"
        :community-name="communityName"
      />
    </div>

    <!-- Meeting Form Modal -->
    <MeetingFormModal
      v-if="community"
      v-model:open="isMeetingModalOpen"
      :community-id="community.id"
      :meeting-to-edit="meetingToEdit"
      @updated="handleMeetingUpdated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCommunityStore } from '@/stores/communityStore';
import { Button } from '@repo/ui';
import { Printer, Pencil, ArrowLeft, LayoutTemplate, Image, Copy, Check, Loader2, ChevronRight } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import DefaultFlyer from '@/components/flyers/DefaultFlyer.vue';
import PosterFlyer from '@/components/flyers/PosterFlyer.vue';
import MeetingFormModal from '@/components/community/MeetingFormModal.vue';
import { getSavedFlyerStyle, saveFlyerStyle, type FlyerStyle } from '@/utils/flyerStorage';
import {
  replaceFlyerVariables,
  formatDuration,
  formatMeetingDate,
  formatMeetingTime,
  formatCommunityAddress,
  type MeetingFlyerData
} from '@/utils/meetingFlyer';
import { useToast } from '@repo/ui';

const route = useRoute();
const router = useRouter();
const { t: $t } = useI18n();
const communityStore = useCommunityStore();
const { toast } = useToast();

const meeting = ref<any>(null);
const community = ref<any>(null);
const flyerStyle = ref<FlyerStyle>(getSavedFlyerStyle());
const isLoading = ref(true);
const flyerRef = ref<HTMLElement | null>(null);
const isCopying = ref(false);
const copySuccess = ref(false);

// Meeting modal state
const isMeetingModalOpen = ref(false);
const meetingToEdit = ref<any>(null);

const setFlyerStyle = (style: FlyerStyle) => {
  flyerStyle.value = style;
  saveFlyerStyle(style);
};

const flyerComponent = computed(() => {
  return flyerStyle.value === 'poster' ? PosterFlyer : DefaultFlyer;
});

// Format the date for display
const formattedDate = computed(() => {
  if (!meeting.value?.startDate) return '';
  return formatMeetingDate(meeting.value.startDate);
});

// Format the duration for display
const formattedDuration = computed(() => {
  if (!meeting.value?.durationMinutes) return '';
  return formatDuration(meeting.value.durationMinutes);
});

// Get community name
const communityName = computed(() => {
  return community.value?.name || '';
});

// Format the community address
const formattedAddress = computed(() => {
  if (!community.value) return '';
  return formatCommunityAddress(community.value);
});

// Process description with template variables
const processedDescription = computed(() => {
  if (!meeting.value || !community.value) return '';

  const flyerData: MeetingFlyerData = {
    fecha: formattedDate.value,
    hora: formatMeetingTime(meeting.value.startDate),
    nombre: meeting.value.title || '',
    descripcion: meeting.value.description || '',
    duracion: formattedDuration.value,
    ubicacion: formattedAddress.value,
    comunidad: communityName.value,
  };

  // Use the custom template if provided, otherwise use default
  const template = meeting.value.flyerTemplate || undefined;
  return replaceFlyerVariables(template, flyerData);
});

// Print functionality
const handlePrint = () => {
  window.print();
};

// Go back to meetings list
const handleGoBack = () => {
  router.push({ name: 'community-meetings', params: { id: route.params.id } });
};

// Edit meeting
const handleEditMeeting = () => {
  meetingToEdit.value = meeting.value;
  isMeetingModalOpen.value = true;
};

// Copy flyer as image to clipboard
const handleCopyImage = async () => {
  if (!flyerRef.value || isCopying.value) return;

  isCopying.value = true;
  copySuccess.value = false;

  try {
    // Find the actual flyer element (first child of the container)
    const flyerElement = flyerRef.value.firstElementChild as HTMLElement;
    if (!flyerElement) {
      throw new Error('No se encontró el elemento del flyer');
    }

    // Ensure the element has dimensions
    const rect = flyerElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      throw new Error('El flyer no tiene dimensiones válidas');
    }

    // Wait for all elements to be fully rendered
    await new Promise(resolve => setTimeout(resolve, 200));

    // Ensure all images are loaded
    const imagePromises: Promise<void>[] = [];
    flyerElement.querySelectorAll('img').forEach((img) => {
      if (!img.complete) {
        imagePromises.push(
          new Promise((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            if (img.complete) resolve();
          })
        );
      }
    });
    await Promise.all(imagePromises);

    // Check canvas elements (QR codes) have proper dimensions
    const canvases = flyerElement.querySelectorAll('canvas');
    for (const canvas of canvases) {
      if (canvas.width === 0 || canvas.height === 0) {
        throw new Error('El código QR no está listo. Espere un momento y vuelva a intentar.');
      }
    }

    // Use modern-screenshot which handles CSS gradients, SVGs, and canvases properly
    const { domToBlob } = await import('modern-screenshot');
    const blob = await domToBlob(flyerElement, {
      scale: 2,
      backgroundColor: '#ffffff',
    });

    // Copy to clipboard using Clipboard API
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);

    copySuccess.value = true;
    toast({
      title: '¡Flyer copiado!',
      description: 'La imagen se ha copiado al portapapeles.',
    });

    // Reset success state after 2 seconds
    setTimeout(() => {
      copySuccess.value = false;
    }, 2000);
  } catch (error) {
    console.error('Error generating image:', error);
    toast({
      title: 'Error al generar imagen',
      description: 'No se pudo capturar el flyer como imagen.',
      variant: 'destructive',
    });
  } finally {
    isCopying.value = false;
  }
};

// Handle meeting updated
const handleMeetingUpdated = async () => {
  // Refresh meeting data
  const communityId = route.params.id as string;
  const meetingId = route.params.meetingId as string;

  await communityStore.fetchMeetings(communityId);
  const foundMeeting = communityStore.meetings?.find((m: any) => m.id === meetingId);
  if (foundMeeting) {
    meeting.value = foundMeeting;
  }
};

// Load meeting and community data
onMounted(async () => {
  const communityId = route.params.id as string;
  const meetingId = route.params.meetingId as string;

  try {
    // Fetch community data
    await communityStore.fetchCommunity(communityId);
    community.value = communityStore.currentCommunity;

    // Find the meeting in the list
    await communityStore.fetchMeetings(communityId);
    const foundMeeting = communityStore.meetings?.find((m: any) => m.id === meetingId);
    if (foundMeeting) {
      meeting.value = foundMeeting;
    }
  } catch (error) {
    console.error('Failed to load meeting flyer data:', error);
  } finally {
    isLoading.value = false;
  }
});
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
    width: 210mm;
    max-width: 210mm;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    overflow: hidden;
  }

  @page {
    size: A4;
    margin: 5mm;
  }

  /* Ensure all absolutely positioned elements stay within bounds */
  #printable-area .absolute {
    max-width: 210mm;
  }
}
</style>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Miltonian+Tattoo&family=Oswald:wght@300;400;500;700;900&family=Roboto:ital,wght@0,300;0,400;0,500;0,700;0,900;1,400&display=swap');

/* Frosted glass toolbar */
.toolbar-glass {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px) saturate(180%);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.7);
}

/* Floating toolbar animation */
.floating-toolbar {
  animation: slideInFromTop 0.4s ease-out;
}

@keyframes slideInFromTop {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Print button glow effect */
.print-button {
  position: relative;
  overflow: hidden;
}

.print-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
  transition: left 0.5s ease;
}

.print-button:hover::before {
  left: 100%;
}

/* Copy button glow effect */
.copy-button {
  position: relative;
  overflow: hidden;
}

.copy-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
  transition: left 0.5s ease;
}

.copy-button:hover::before {
  left: 100%;
}

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

/* Smooth transitions for interactive elements only */
button, a, .transition-all {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
