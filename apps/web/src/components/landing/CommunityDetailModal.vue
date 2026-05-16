<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        ref="overlayEl"
        class="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
        @click.self="close"
        role="dialog"
        aria-modal="true"
        :aria-label="community?.name || ''"
        aria-describedby="community-detail-desc"
      >
        <div
          ref="contentEl"
          class="modal-content bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] sm:max-h-[90vh] overflow-y-auto"
          tabindex="-1"
          @keydown="onTrapKey"
        >
          <div class="p-5 sm:p-6 border-b border-stone-100 flex items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <h3 class="text-lg sm:text-xl font-medium text-stone-900 break-words">{{ community?.name }}</h3>
              <p v-if="locationText" class="text-sm text-stone-500 flex items-center gap-1 mt-1">
                <MapPin :size="14" class="shrink-0" />
                <span class="truncate">{{ locationText }}</span>
              </p>
              <p v-if="distanceText" class="text-xs font-semibold mt-1" :style="{ color: '#8DAA91' }">
                {{ distanceText }}
              </p>
            </div>
            <button
              @click="close"
              class="p-2 -m-1 rounded-lg hover:bg-stone-100 transition-colors shrink-0"
              :aria-label="$t('common.close')"
            >
              <X :size="20" />
            </button>
          </div>

          <div id="community-detail-desc" class="p-5 sm:p-6 space-y-4">
            <p v-if="community?.description" class="text-sm text-stone-600 leading-relaxed">
              {{ community.description }}
            </p>

            <div v-if="community?.parish || community?.diocese" class="text-sm space-y-1">
              <p v-if="community?.parish" class="text-stone-700">
                <span class="font-medium">{{ $t('landing.detail.parish') }}:</span> {{ community.parish }}
              </p>
              <p v-if="community?.diocese" class="text-stone-700">
                <span class="font-medium">{{ $t('landing.detail.diocese') }}:</span> {{ community.diocese }}
              </p>
            </div>

            <div v-if="meetingScheduleText" class="rounded-xl p-4 border" :style="{ backgroundColor: 'rgba(141,170,145,0.08)', borderColor: 'rgba(141,170,145,0.25)' }">
              <p class="text-xs font-bold uppercase tracking-widest mb-1" :style="{ color: '#8DAA91' }">
                {{ $t('landing.detail.weeklyMeeting') }}
              </p>
              <p class="text-sm text-stone-700 flex items-center gap-2">
                <Clock :size="14" class="text-stone-400 shrink-0" />
                <span>{{ meetingScheduleText }}</span>
              </p>
              <p v-if="community?.defaultMeetingDescription" class="text-xs text-stone-500 mt-2">
                {{ community.defaultMeetingDescription }}
              </p>
            </div>

            <div v-if="fullAddress" class="text-sm text-stone-700">
              <p class="font-medium mb-1">{{ $t('landing.detail.address') }}</p>
              <p class="text-stone-600 break-words">{{ fullAddress }}</p>
              <a
                v-if="community?.googleMapsUrl || mapsSearchUrl"
                :href="community?.googleMapsUrl || mapsSearchUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 mt-2 text-xs font-medium hover:underline"
                :style="{ color: '#8DAA91' }"
              >
                <ExternalLink :size="12" />
                {{ $t('landing.viewInMaps') }}
              </a>
            </div>

            <div v-if="community?.website || community?.facebookUrl || community?.instagramUrl" class="flex gap-4 pt-2">
              <a v-if="community?.website" :href="community.website" target="_blank" rel="noopener noreferrer" class="text-stone-400 hover:text-stone-700 transition-colors p-1" :aria-label="$t('landing.detail.website')">
                <Globe :size="20" />
              </a>
              <a v-if="community?.facebookUrl" :href="community.facebookUrl" target="_blank" rel="noopener noreferrer" class="text-stone-400 hover:text-stone-700 transition-colors p-1" aria-label="Facebook">
                <Facebook :size="20" />
              </a>
              <a v-if="community?.instagramUrl" :href="community.instagramUrl" target="_blank" rel="noopener noreferrer" class="text-stone-400 hover:text-stone-700 transition-colors p-1" aria-label="Instagram">
                <Instagram :size="20" />
              </a>
            </div>
          </div>

          <div class="sticky bottom-0 bg-white p-5 sm:p-6 border-t border-stone-100 flex gap-3">
            <button
              @click="close"
              class="flex-1 px-4 py-3 rounded-xl border border-stone-200 text-stone-700 font-medium hover:bg-stone-50 transition-colors"
            >
              {{ $t('common.close') }}
            </button>
            <button
              @click="emitJoin"
              class="flex-1 px-4 py-3 rounded-xl bg-stone-800 text-white font-medium hover:bg-stone-700 transition-colors"
            >
              {{ $t('landing.join') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch, ref, nextTick, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { MapPin, Clock, X, ExternalLink, Globe, Facebook, Instagram } from 'lucide-vue-next';

const props = defineProps<{
  open: boolean;
  community: any | null;
  distance?: string | null;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  join: [communityId: string, communityName: string];
}>();

const { t: $t } = useI18n();

const overlayEl = ref<HTMLElement | null>(null);
const contentEl = ref<HTMLElement | null>(null);
// Elemento que tenía foco antes de abrir el modal — para restaurar al cerrar
let previousActiveElement: HTMLElement | null = null;

const close = () => emit('update:open', false);
const emitJoin = () => {
  if (props.community?.id) emit('join', props.community.id, props.community.name || '');
};

// Cerrar con Escape
const onKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.open) close();
};

// Focus trap: si Tab/Shift+Tab sale del modal, lo regresa al primer/último elemento focusable
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const onTrapKey = (e: KeyboardEvent) => {
  if (e.key !== 'Tab' || !contentEl.value) return;
  const focusables = Array.from(
    contentEl.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((el) => el.offsetParent !== null);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement as HTMLElement;
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
};

watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    previousActiveElement = (document.activeElement as HTMLElement) ?? null;
    document.addEventListener('keydown', onKeyDown);
    // Foco al contenido del modal después del render
    await nextTick();
    contentEl.value?.focus();
    // Bloquear scroll del body
    document.body.style.overflow = 'hidden';
  } else {
    document.removeEventListener('keydown', onKeyDown);
    document.body.style.overflow = '';
    // Restaurar foco al trigger anterior
    if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
      previousActiveElement.focus();
    }
    previousActiveElement = null;
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeyDown);
  document.body.style.overflow = '';
});

const locationText = computed(() => {
  if (!props.community) return '';
  return [props.community.city, props.community.state].filter(Boolean).join(', ');
});

const distanceText = computed(() => props.distance);

const fullAddress = computed(() => {
  if (!props.community) return '';
  return [
    props.community.address1,
    props.community.address2,
    [props.community.city, props.community.state].filter(Boolean).join(', '),
    props.community.zipCode,
    props.community.country,
  ].filter(Boolean).join(', ');
});

const mapsSearchUrl = computed(() => {
  if (!props.community?.latitude || !props.community?.longitude) return null;
  return `https://www.google.com/maps/search/?api=1&query=${props.community.latitude},${props.community.longitude}`;
});

const DAY_LABELS: Record<string, string> = {
  monday: 'landing.detail.days.monday',
  tuesday: 'landing.detail.days.tuesday',
  wednesday: 'landing.detail.days.wednesday',
  thursday: 'landing.detail.days.thursday',
  friday: 'landing.detail.days.friday',
  saturday: 'landing.detail.days.saturday',
  sunday: 'landing.detail.days.sunday',
};

const meetingScheduleText = computed(() => {
  const c = props.community;
  if (!c?.defaultMeetingDayOfWeek && !c?.defaultMeetingTime) return null;
  const day = c.defaultMeetingDayOfWeek ? $t(DAY_LABELS[c.defaultMeetingDayOfWeek] || c.defaultMeetingDayOfWeek) : '';
  const time = c.defaultMeetingTime || '';
  const duration = c.defaultMeetingDurationMinutes ? ` (${c.defaultMeetingDurationMinutes} min)` : '';
  return [day, time].filter(Boolean).join(' · ') + duration;
});
</script>

<style scoped>
.modal-enter-active, .modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-active .modal-content, .modal-leave-active .modal-content {
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s;
}
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal-content {
  transform: scale(0.96) translateY(8px);
  opacity: 0;
}
.modal-leave-to .modal-content {
  transform: scale(0.98);
  opacity: 0;
}
.modal-content:focus { outline: none; }
</style>
