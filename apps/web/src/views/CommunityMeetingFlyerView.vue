<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50/50 to-indigo-100/30 py-8 print:p-0 print:bg-white print:min-h-0">
    <!-- Enhanced Floating Toolbar -->
    <!-- Fully in-flow (no sticky): the natural top of this toolbar (~48px) sits
         ABOVE any sticky top we could declare below the navbar (~80px), and a
         sticky element whose declared top is greater than its natural position
         gets pushed DOWN at the top of the page — overlapping the breadcrumb
         below. In-flow, nothing can overlap; sm:w-fit + sm:ml-auto keep it
         right-aligned. -->
    <div class="floating-toolbar z-50 print:hidden flex flex-col sm:flex-row sm:w-fit sm:ml-auto sm:mr-8 items-stretch sm:items-center gap-2 sm:gap-3 mb-4">
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
          <span class="sr-only sm:not-sr-only">Default</span>
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
          <span class="sr-only sm:not-sr-only">Poster</span>
        </button>
        <button
          @click="setFlyerStyle('whatsapp')"
          :class="[
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
            flyerStyle === 'whatsapp'
              ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg shadow-green-500/30'
              : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
          ]">
          <MessageCircle class="w-4 h-4" />
          <span class="sr-only sm:not-sr-only">WhatsApp</span>
        </button>
        <button
          @click="setFlyerStyle('custom')"
          :class="[
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
            flyerStyle === 'custom'
              ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-500/30'
              : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
          ]">
          <Palette class="w-4 h-4" />
          <span class="sr-only sm:not-sr-only">Personalizado</span>
        </button>
      </div>

      <!-- Background picker — only for the styles that render a background image.
           'custom' manages its background (and everything else) in the design editor,
           so the gallery picker and the card-opacity slider don't apply to it.
           Popover (not Dialog): the reka-ui Popover+Command freeze bug only
           happens inside Dialogs; this toolbar is plain in-flow DOM. -->
      <div v-if="flyerStyle !== 'default' && flyerStyle !== 'custom'" class="toolbar-glass flex items-center gap-1 rounded-xl p-1 shadow-xl">
        <Popover v-model:open="isBackgroundPickerOpen">
          <PopoverTrigger as-child>
            <Button
              variant="ghost"
              class="rounded-lg hover:bg-gray-100/80 transition-all text-gray-600 gap-2"
              title="Cambiar el fondo del flyer"
              :disabled="isSavingBackground"
            >
              <Loader2 v-if="isSavingBackground" class="w-4 h-4 animate-spin" />
              <Image v-else class="w-4 h-4" />
              <span class="sr-only sm:not-sr-only">{{ isSavingBackground ? 'Guardando...' : 'Fondo' }}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" class="w-80 p-3">
            <p class="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Galería de fondos</p>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="preset in FLYER_BACKGROUND_PRESETS"
                :key="preset"
                type="button"
                class="overflow-hidden rounded-lg border text-left transition-all disabled:opacity-50"
                :class="community?.flyerBackgroundUrl === `/${preset}`
                  ? 'border-blue-600 ring-2 ring-blue-500/40'
                  : 'border-gray-200 hover:border-gray-400'"
                :disabled="isSavingBackground"
                @click="handleSelectPreset(preset)"
              >
                <img :src="`/${preset}`" :alt="PRESET_LABELS[preset]" class="h-20 w-full object-cover" />
                <span class="block bg-white px-2 py-1.5 text-xs font-medium text-gray-700">{{ PRESET_LABELS[preset] }}</span>
              </button>
            </div>

            <div class="mt-3 border-t border-gray-100 pt-3">
              <label for="flyer-card-opacity" class="mb-1.5 flex items-center justify-between text-xs font-medium text-gray-600">
                <span>Transparencia del recuadro</span>
                <span class="tabular-nums text-gray-500">{{ Math.round(cardTransparency * 100) }}%</span>
              </label>
              <input
                id="flyer-card-opacity"
                v-model.number="cardTransparency"
                type="range"
                min="0"
                max="0.7"
                step="0.05"
                class="w-full accent-blue-600"
                :disabled="isSavingOpacity"
                @change="handleOpacityChange"
              />
            </div>

            <div class="mt-3 space-y-1 border-t border-gray-100 pt-3">
              <Button
                variant="ghost"
                class="w-full justify-start gap-2 text-gray-700"
                :disabled="isSavingBackground"
                @click="handlePickBackground"
              >
                <Upload class="h-4 w-4" />
                Subir mi imagen…
              </Button>
              <Button
                v-if="community?.flyerBackgroundUrl"
                variant="ghost"
                class="w-full justify-start gap-2 text-gray-700"
                :disabled="isSavingBackground"
                @click="handleResetBackground"
              >
                <RotateCcw class="h-4 w-4" />
                Restaurar por defecto
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <!-- Action Buttons Group -->
      <div class="toolbar-glass flex items-center gap-1 rounded-xl p-1 shadow-xl">
        <!-- Always reachable: the design is per community, not per style, and the
             editor is also how you get a custom flyer in the first place. -->
        <Button
          @click="handleEditDesign"
          variant="ghost"
          size="icon"
          title="Editar diseño"
          class="rounded-lg hover:bg-gray-100/80 transition-all"
        >
          <Palette class="w-4 h-4 text-gray-600" />
        </Button>
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
          <span class="sr-only sm:not-sr-only">Volver</span>
        </Button>
      </div>

      <!-- Print Button - Premium styled -->
      <Button
        @click="handlePrint"
        class="print-button bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-700 hover:via-blue-600 hover:to-indigo-700 text-white px-5 py-2.5 rounded-xl shadow-xl flex items-center gap-2.5 transition-all duration-300 hover:scale-[1.02] hover:shadow-blue-500/40 border border-white/20"
      >
        <Printer class="w-5 h-5" />
        <span class="font-semibold sr-only sm:not-sr-only">Imprimir</span>
      </Button>

      <!-- Copy Image Button -->
      <Button
        @click="handleCopyImage"
        :disabled="isCopying"
        class="copy-button bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-700 hover:via-emerald-600 hover:to-teal-700 text-white px-5 py-2.5 rounded-xl shadow-xl flex items-center gap-2.5 transition-all duration-300 hover:scale-[1.02] hover:shadow-emerald-500/40 border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Loader2 v-if="isCopying" class="w-5 h-5 animate-spin" />
        <Check v-else-if="copySuccess" class="w-5 h-5" />
        <!-- Phones get the OS share sheet, not the clipboard — the icon and label
             say so before the tap surprises anyone. -->
        <Share2 v-else-if="prefersShare" class="w-5 h-5" />
        <Copy v-else class="w-5 h-5" />
        <span class="font-semibold sr-only sm:not-sr-only">
          {{ isCopying ? 'Copiando...' : copySuccess ? '¡Copiado!' : prefersShare ? 'Compartir' : 'Copiar imagen' }}
        </span>
      </Button>
    </div>

    <!-- Breadcrumb Navigation -->
    <div :class="[flyerStyle === 'whatsapp' ? 'max-w-[650px]' : 'max-w-[850px]', 'mx-auto px-4 print:hidden']">
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
    <!-- overflow-hidden while capturing: the canvas renders at 1:1 for the PNG
         (isCapturing), which is wider than a phone screen — clip the momentary
         flash instead of letting the page scroll sideways. -->
    <div
      v-else
      ref="flyerRef"
      :class="[flyerStyle === 'whatsapp' ? 'max-w-[650px]' : 'max-w-[850px]', 'mx-auto px-4 print:max-w-[210mm] print:w-[210mm] print:mx-0 print:px-0 print:pt-0', isCapturing ? 'overflow-hidden' : '']"
      :style="customContainerStyle"
    >
      <!-- The community's saved editor design. Every prop matters: the canvas falls
           back to its defaults for any prop it is not given, so a missing one reads
           as "nothing was customised" instead of as a bug (the retreat's lesson). -->
      <MeetingFlyerCanvas
        v-if="flyerStyle === 'custom'"
        ref="customCanvasRef"
        :meeting="meeting"
        :community="community"
        :flyer-options="community?.flyerOptions"
        :layout="savedMeetingLayout.blocks"
        :image-overrides="savedMeetingLayout.images"
        :theme="community?.flyerOptions?.theme"
        :block-styles="community?.flyerOptions?.blockStyles"
        :scale="effectiveScale"
      />
      <component
        :is="flyerComponent"
        v-else
        :meeting="meeting"
        :community="community"
        :formatted-duration="formattedDuration"
        :formatted-address="formattedAddress"
        :processed-description="processedDescription"
        :community-name="communityName"
        :background-url="community?.flyerBackgroundUrl || undefined"
        :card-opacity="roundedCardOpacity"
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
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCommunityStore } from '@/stores/communityStore';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@repo/ui';
import { Printer, Pencil, ArrowLeft, LayoutTemplate, Image, MessageCircle, Copy, Check, Loader2, ChevronRight, RotateCcw, Upload, Palette, Share2 } from 'lucide-vue-next';
import { FLYER_BACKGROUND_PRESETS, type FlyerBackgroundPreset } from '@repo/types';
import { pickFile } from '@/utils/filePicker';
import { useI18n } from 'vue-i18n';
import DefaultFlyer from '@/components/flyers/DefaultFlyer.vue';
import PosterFlyer from '@/components/flyers/PosterFlyer.vue';
import WhatsAppFlyer from '@/components/flyers/WhatsAppFlyer.vue';
import MeetingFlyerCanvas from '@/components/flyers/MeetingFlyerCanvas.vue';
import { resolveMeetingFlyerLayout } from '@/utils/meetingFlyerLayout';
import MeetingFormModal from '@/components/community/MeetingFormModal.vue';
import { getSavedFlyerStyle, saveFlyerStyle, type FlyerStyle } from '@/utils/flyerStorage';
import {
  replaceFlyerVariables,
  formatDuration,
  formatMeetingDateOnly,
  formatMeetingTime,
  formatCommunityAddress,
  titleCaseForDisplay,
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
  switch (flyerStyle.value) {
    case 'poster': return PosterFlyer;
    case 'whatsapp': return WhatsAppFlyer;
    default: return DefaultFlyer;
  }
});

// --- 'custom': the community's saved editor design, same treatment the retreat's
// published flyer gives its canvas (mobile scale, one-page print shrink-to-fit). ---

/** The design saved by the editor, reconciled against the default arrangement. */
const savedMeetingLayout = computed(() => resolveMeetingFlyerLayout(community.value?.flyerOptions ?? null));

const customCanvasRef = ref<{ $el: HTMLElement } | null>(null);
const customScale = ref(1);
const customCanvasHeight = ref(0);
let resizeObserver: ResizeObserver | null = null;

/** Print CSS takes full control of sizing, so the mobile downscale must be off then. */
const isPrinting = ref(false);
/** domToBlob sizes its canvas from the element's bounding rect, which carries the
 *  downscale: captured while scaled, only the scaled corner of the 850px design
 *  fits in the PNG (a phone reported the shared image cut at the right and bottom,
 *  2026-09-21). Same cure as print — render at 1:1 for the capture. */
const isCapturing = ref(false);
const effectiveScale = computed(() =>
  isPrinting.value || isCapturing.value ? 1 : customScale.value,
);

// The fixed 850px design has to fit the available width; the container's px-4 is
// not available width, so measure it out (the lesson the editor already learned).
const updateCustomScale = () => {
  // Skip while capturing: the container is held at the 850px design width then,
  // and re-measuring mid-capture would downscale (or drop the height) while
  // domToBlob is reading the element.
  if (isCapturing.value || flyerStyle.value !== 'custom' || !flyerRef.value) return;
  const styles = window.getComputedStyle(flyerRef.value);
  const horizontalPadding =
    parseFloat(styles.paddingLeft || '0') + parseFloat(styles.paddingRight || '0');
  customScale.value = Math.min((flyerRef.value.clientWidth - horizontalPadding) / 850, 1);
  const el = customCanvasRef.value?.$el;
  if (el) customCanvasHeight.value = el.scrollHeight;
};

/** A scaled element keeps its unscaled layout box, so the container must shrink too. */
const customWrapperHeight = computed(() => {
  if (customScale.value >= 1 || !customCanvasHeight.value) return undefined;
  return `${customCanvasHeight.value * customScale.value}px`;
});

// A4 minus this page's 5mm @page margin, in CSS px at 96dpi (1mm = 96/25.4 px).
const A4_USABLE_WIDTH_PX = (210 - 10) * (96 / 25.4);
const A4_USABLE_HEIGHT_PX = (297 - 10) * (96 / 25.4);
const FLYER_DESIGN_WIDTH_PX = 850;

/**
 * Shrink-to-fit for print: the block layout's height varies with the meeting's
 * content, so a fixed scale would spill onto a second page. A flyer is a one-page
 * document, so the limiting dimension decides the scale.
 */
const printScale = computed(() => {
  const widthScale = A4_USABLE_WIDTH_PX / FLYER_DESIGN_WIDTH_PX;
  const heightScale = customCanvasHeight.value
    ? A4_USABLE_HEIGHT_PX / customCanvasHeight.value
    : widthScale;
  // Truncate (never round up) and keep 1% of slack: browsers disagree slightly on
  // the px→mm mapping when printing, and rounding up spills onto a second page.
  return (Math.floor(Math.min(widthScale, heightScale) * 0.99 * 1000) / 1000).toFixed(3);
});

/** Height reservation for screen + the print factor, only while custom is showing. */
const customContainerStyle = computed(() => {
  if (flyerStyle.value !== 'custom') return undefined;
  return {
    // During capture the canvas must LAY OUT at the full design width: past
    // scale ≥ 1 it goes fluid (width 100%), and 100% of a phone container is
    // 352px — the 850px design stacks tall instead (measured 704×3822). Hold
    // the container at 850px with no padding for that moment; the reserved
    // height keeps the page from jumping (the flash is clipped, see template).
    ...(isCapturing.value ? { width: '850px', paddingLeft: '0', paddingRight: '0' } : {}),
    height: isPrinting.value ? undefined : customWrapperHeight.value,
    '--flyer-print-scale': printScale.value,
  } as Record<string, string | undefined>;
});

// Open the design editor (per community; the preview there renders this meeting).
const handleEditDesign = () => {
  router.push({
    name: 'community-meeting-flyer-edit',
    params: { id: route.params.id, meetingId: route.params.meetingId },
  });
};

// Format the duration for display
const formattedDuration = computed(() => {
  if (!meeting.value?.durationMinutes) return '';
  return formatDuration(meeting.value.durationMinutes);
});

// Get community name — display-cased ("Buen despacho" → "Buen Despacho"):
// the flyer is public-facing material and the stored name is typed in a hurry.
const communityName = computed(() => {
  return titleCaseForDisplay(community.value?.name || '');
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
    fecha: formatMeetingDateOnly(meeting.value.startDate, community.value),
    hora: formatMeetingTime(meeting.value.startDate, community.value),
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

// Print functionality. The custom canvas scales down on narrow screens; print CSS
// must take over, so the scale is dropped for the print render (and restored after).
const handlePrint = () => {
  isPrinting.value = true;
  nextTick(() => {
    window.print();
    isPrinting.value = false;
  });
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

// Custom flyer background (community-wide identity). Two roads: a gallery
// preset (public asset shipped with the repo) or an uploaded image (same flow
// as the meeting photo: pick → data-URI → the API stores it, S3 or inline dev).
const isSavingBackground = ref(false);
const isBackgroundPickerOpen = ref(false);

// Display names for the gallery thumbnails (order follows FLYER_BACKGROUND_PRESETS).
const PRESET_LABELS: Record<FlyerBackgroundPreset, string> = {
  'poster.png': 'Montaña clásica',
  'jesus_bg.png': 'Rostro de luz',
  'jesus2.png': 'Manos en ofrenda',
  'cta-bg.webp': 'Valle con niebla',
};

const handleSelectPreset = async (preset: FlyerBackgroundPreset) => {
  if (!community.value || isSavingBackground.value) return;

  isSavingBackground.value = true;
  try {
    const updated = await communityStore.setFlyerBackground(community.value.id, { preset });
    community.value = updated;
    isBackgroundPickerOpen.value = false;
    toast({ title: 'Fondo actualizado', description: `El flyer ya usa «${PRESET_LABELS[preset]}».` });
  } catch (error: any) {
    console.error('Failed to save flyer background preset:', error);
    toast({
      title: 'Error al guardar el fondo',
      description: error.message || 'No se pudo guardar el fondo de la galería.',
      variant: 'destructive',
    });
  } finally {
    isSavingBackground.value = false;
  }
};

const handlePickBackground = async () => {
  if (!community.value || isSavingBackground.value) return;
  // Close the popover so the flyer (and its saving spinner) stays in view
  // while the native file picker is open.
  isBackgroundPickerOpen.value = false;

  const file = await pickFile({ accept: 'image/png,image/jpeg,image/jpg,image/webp' });
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    toast({ title: 'Error', description: 'El archivo debe ser una imagen', variant: 'destructive' });
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    toast({ title: 'Error', description: 'La imagen no puede exceder 2MB', variant: 'destructive' });
    return;
  }

  const imageDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });

  isSavingBackground.value = true;
  try {
    const updated = await communityStore.setFlyerBackground(community.value.id, { imageDataUrl });
    community.value = updated;
    toast({ title: 'Fondo actualizado', description: 'El flyer ya usa tu imagen de fondo.' });
  } catch (error: any) {
    console.error('Failed to save flyer background:', error);
    toast({
      title: 'Error al guardar el fondo',
      description: error.message || 'No se pudo guardar la imagen de fondo.',
      variant: 'destructive',
    });
  } finally {
    isSavingBackground.value = false;
  }
};

// Transparency of the central glass card, dialled by the community. The slider
// speaks "transparency" (what the coordinator asked for); the stored value is
// the opacity (1 - transparency), clamped to the schema range 0.3–1. The flyer
// previews live via the card-opacity prop; @change (slider released) saves.
const cardTransparency = ref(0.2);
const isSavingOpacity = ref(false);

const syncCardTransparency = () => {
  cardTransparency.value = 1 - (community.value?.flyerCardOpacity ?? 0.8);
};

// 1 - 1 - x leaves float noise (0.30000000000000004) in the --card-a attribute;
// round it so the DOM style stays clean and matches the stored value.
const roundedCardOpacity = computed(() => Math.round((1 - cardTransparency.value) * 100) / 100);

const handleOpacityChange = async () => {
  if (!community.value) return;
  // Round away float noise from the 0.05 steps before clamping to 0.3–1.
  const opacity = Math.min(1, Math.max(0.3, Math.round((1 - cardTransparency.value) * 100) / 100));

  isSavingOpacity.value = true;
  try {
    const updated = await communityStore.setFlyerCardOpacity(community.value.id, opacity);
    community.value = updated;
  } catch (error: any) {
    console.error('Failed to save flyer card opacity:', error);
    toast({
      title: 'Error al guardar la transparencia',
      description: error.message || 'No se pudo guardar la transparencia del recuadro.',
      variant: 'destructive',
    });
  } finally {
    isSavingOpacity.value = false;
  }
};

const handleResetBackground = async () => {
  if (!community.value) return;
  try {
    const updated = await communityStore.clearFlyerBackground(community.value.id);
    community.value = updated;
    // "Restaurar por defecto" also clears the card opacity (one visual identity).
    syncCardTransparency();
    isBackgroundPickerOpen.value = false;
    toast({ title: 'Fondo restaurado', description: 'El flyer vuelve al fondo por defecto.' });
  } catch (error: any) {
    console.error('Failed to reset flyer background:', error);
    toast({
      title: 'Error al restaurar',
      description: error.message || 'No se pudo restaurar el fondo por defecto.',
      variant: 'destructive',
    });
  }
};

// --- Copy/share the flyer as an image ---
// Phones can't take the clipboard path: iOS Safari doesn't support image
// clipboard writes at all, and any await before clipboard.write() burns the
// user gesture the write needs. So the button follows the platform's
// capability: clipboard on desktop (the blob handed to ClipboardItem as a
// Promise, created synchronously with the click — the retreat flyer's
// pattern), the native share sheet on phones (sharing to WhatsApp is the
// actual use case there), and a PNG download as the last resort everywhere.

const supportsImageClipboard = () =>
	typeof ClipboardItem !== 'undefined' &&
	typeof ClipboardItem.supports === 'function' &&
	ClipboardItem.supports('image/png') &&
	!!navigator.clipboard?.write;

/** Wait until the flyer is fully painted (dimensions, images, QR) before capturing. */
const waitForFlyerReady = async (flyerElement: HTMLElement) => {
	const rect = flyerElement.getBoundingClientRect();
	if (rect.width === 0 || rect.height === 0) {
		throw new Error('El flyer no tiene dimensiones válidas');
	}

	await new Promise((resolve) => setTimeout(resolve, 200));

	const imagePromises: Promise<void>[] = [];
	flyerElement.querySelectorAll('img').forEach((img) => {
		if (!img.complete) {
			imagePromises.push(
				new Promise((resolve) => {
					img.onload = () => resolve();
					img.onerror = () => resolve();
					if (img.complete) resolve();
				}),
			);
		}
	});
	await Promise.all(imagePromises);

	const canvases = flyerElement.querySelectorAll('canvas');
	for (const canvas of canvases) {
		if (canvas.width === 0 || canvas.height === 0) {
			throw new Error('El código QR no está listo. Espere un momento y vuelva a intentar.');
		}
	}
};

const captureFlyerBlob = async (flyerElement: HTMLElement) => {
	// The capture must read the design at 1:1 (see isCapturing): one tick with the
	// downscale off before domToBlob measures the element.
	isCapturing.value = true;
	try {
		await nextTick();
		await waitForFlyerReady(flyerElement);
		// modern-screenshot handles CSS gradients, SVGs, and canvases properly
		const { domToBlob } = await import('modern-screenshot');
		const blob = await domToBlob(flyerElement, {
			scale: 2,
			backgroundColor: '#ffffff',
		});
		if (!blob) throw new Error('La captura del flyer devolvió una imagen vacía');
		return blob;
	} finally {
		isCapturing.value = false;
	}
};

const downloadFlyerBlob = (blob: Blob) => {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = 'flyer-reunion.png';
	a.click();
};

// The label tells the truth about what the tap will do (share sheet vs clipboard).
const prefersShare = ref(false);

const handleCopyImage = async () => {
	if (!flyerRef.value || isCopying.value) return;

	const flyerElement = flyerRef.value.firstElementChild as HTMLElement | null;
	if (!flyerElement) {
		toast({
			title: 'Error al generar imagen',
			description: 'No se encontró el elemento del flyer.',
			variant: 'destructive',
		});
		return;
	}

	isCopying.value = true;
	copySuccess.value = false;

	try {
		if (supportsImageClipboard()) {
			// The capture runs INSIDE the promise handed to ClipboardItem: awaiting
			// it here first would spend the user gesture before clipboard.write().
			const blobPromise = captureFlyerBlob(flyerElement);
			try {
				await navigator.clipboard.write([
					new ClipboardItem({ 'image/png': blobPromise }),
				]);

				copySuccess.value = true;
				toast({
					title: '¡Flyer copiado!',
					description: 'La imagen se ha copiado al portapapeles.',
				});
				setTimeout(() => {
					copySuccess.value = false;
				}, 2000);
				return;
			} catch (clipboardError) {
				// Clipboard refused (permissions, focus…): hand the PNG over as a
				// download instead. If the capture itself failed, the await below
				// rethrows and reaches the outer toast.
				console.error('Clipboard write failed, falling back to download:', clipboardError);
				const blob = await blobPromise;
				downloadFlyerBlob(blob);
				toast({
					title: 'Flyer descargado',
					description: 'No se pudo copiar al portapapeles; guardamos la imagen para que la adjuntes.',
				});
				return;
			}
		}

		// Phone path: build the PNG, then hand it to the OS share sheet.
		const blob = await captureFlyerBlob(flyerElement);
		const file = new File([blob], 'flyer-reunion.png', { type: 'image/png' });
		if (navigator.canShare?.({ files: [file] })) {
			try {
				await navigator.share({ files: [file], title: meeting.value?.title || 'Flyer' });
				// Resolved = the sheet closed (shared or dismissed): the user saw
				// what happened, nothing to add.
				return;
			} catch (shareError) {
				if ((shareError as DOMException)?.name === 'AbortError') return; // dismissed
				console.error('Share failed, falling back to download:', shareError);
			}
		}
		downloadFlyerBlob(blob);
		toast({
			title: 'Flyer descargado',
			description: 'Guardamos el volante como imagen para que la puedas adjuntar.',
		});
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
  // Which capability the copy button will use (decided once, from the platform).
  prefersShare.value = !supportsImageClipboard() && typeof navigator.canShare === 'function';

  const communityId = route.params.id as string;
  const meetingId = route.params.meetingId as string;

  try {
    // Fetch community data
    await communityStore.fetchCommunity(communityId);
    community.value = communityStore.currentCommunity;
    syncCardTransparency();

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

  // The flyer container only exists past the loading state.
  await nextTick();
  window.addEventListener('beforeprint', onBeforePrint);
  window.addEventListener('afterprint', onAfterPrint);
  if (flyerRef.value) {
    resizeObserver = new ResizeObserver(updateCustomScale);
    resizeObserver.observe(flyerRef.value);
    const el = customCanvasRef.value?.$el;
    if (el) resizeObserver.observe(el);
    updateCustomScale();
  }
});

// Ctrl/Cmd+P skips handlePrint; the listeners keep the custom canvas unscaled then too.
const onBeforePrint = () => {
  isPrinting.value = true;
};
const onAfterPrint = () => {
  isPrinting.value = false;
};

// Switching styles mounts/unmounts the custom canvas: re-measure, and watch the
// new element (observing an already-observed target is a no-op).
watch(flyerStyle, async () => {
  await nextTick();
  updateCustomScale();
  const el = customCanvasRef.value?.$el;
  if (el && resizeObserver) resizeObserver.observe(el);
});

onUnmounted(() => {
  window.removeEventListener('beforeprint', onBeforePrint);
  window.removeEventListener('afterprint', onAfterPrint);
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
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

  /* The 'custom' style keeps its 850px design width and shrinks to fit one page.
     The attribute is only set by the published canvas (printable), never by the
     editor's preview, and this rule outranks the generic 210mm sizing above. */
  #printable-area[data-custom-canvas] {
    width: 850px !important;
    max-width: 850px !important;
    transform: scale(var(--flyer-print-scale, 0.9)) !important;
    transform-origin: top left !important;
  }

  /* The generic 210mm cap on absolutely-positioned children would clip the
     custom canvas's full-bleed veil (850px design over a 793px cap). */
  #printable-area[data-custom-canvas] .absolute {
    max-width: none;
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
