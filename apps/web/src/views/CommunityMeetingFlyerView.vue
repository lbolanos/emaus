<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 py-6 print:p-0 print:bg-white print:min-h-0">
    <!-- Top Bar with Style Selector and Action Buttons -->
    <div class="fixed top-20 right-8 z-50 print:hidden flex items-center gap-3">
      <!-- Style Selector -->
      <div class="flex items-center gap-2 bg-white rounded-lg shadow-lg p-1">
        <button
          @click="setFlyerStyle('default')"
          :class="flyerStyle === 'default' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
          class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors">
          Estilo Default
        </button>
        <button
          @click="setFlyerStyle('poster')"
          :class="flyerStyle === 'poster' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
          class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors">
          Estilo Poster
        </button>
      </div>

      <!-- Action Buttons -->
      <Button @click="handleEditMeeting" variant="outline" size="icon" title="Editar reunión">
        <Pencil class="w-4 h-4" />
      </Button>
      <Button @click="handleGoBack" variant="outline">
        Volver
      </Button>
      <Button @click="handlePrint" class="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 transition-all hover:scale-105 hover:shadow-blue-500/50 border border-blue-500/30">
        <Printer class="w-5 h-5" />
        <span class="font-semibold">Imprimir Flyer</span>
      </Button>
    </div>

    <!-- Flyer Container - Dynamic Component -->
    <div class="max-w-[850px] mx-auto px-4 print:max-w-[210mm] print:w-[210mm] print:mx-0 print:px-0">
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
import { Printer, Pencil } from 'lucide-vue-next';
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

const route = useRoute();
const router = useRouter();
const communityStore = useCommunityStore();

const meeting = ref<any>(null);
const community = ref<any>(null);
const flyerStyle = ref<FlyerStyle>(getSavedFlyerStyle());

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
