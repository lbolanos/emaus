<template>
  <section id="videos" class="py-24 px-6 bg-white">
    <div class="max-w-7xl mx-auto">
      <div class="text-center max-w-2xl mx-auto mb-14">
        <span class="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-stone-400">
          <Youtube :size="16" />
          {{ $t('landing.videos.badge') }}
        </span>
        <h2 class="text-4xl font-light text-stone-900 mt-4">{{ $t('landing.videos.title') }}</h2>
        <p class="text-stone-600 mt-4 font-light leading-relaxed">{{ $t('landing.videos.subtitle') }}</p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <button
          v-for="video in FEATURED_VIDEOS"
          :key="video.id"
          type="button"
          class="group text-left rounded-2xl overflow-hidden bg-stone-50 hover:shadow-xl transition-all hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-stone-400"
          @click="openVideo(video)"
        >
          <div class="relative aspect-video overflow-hidden bg-stone-200">
            <img
              :src="`/videos/${video.id}.webp`"
              :alt="$t(video.titleKey)"
              width="640"
              height="360"
              loading="lazy"
              decoding="async"
              class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <span class="absolute inset-0 flex items-center justify-center">
              <span class="w-14 h-14 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center group-hover:bg-red-600 transition-colors">
                <Play :size="22" class="text-white translate-x-[1px]" fill="currentColor" />
              </span>
            </span>
            <span class="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/75 text-white text-[11px] font-medium tabular-nums">
              {{ formatDuration(video.seconds) }}
            </span>
          </div>
          <div class="p-5">
            <h3 class="text-base font-medium text-stone-900 leading-snug">{{ $t(video.titleKey) }}</h3>
            <span class="inline-flex items-center gap-1 text-sm text-stone-500 mt-2 group-hover:text-stone-900 transition-colors">
              {{ $t('landing.videos.watch') }}
              <ChevronRight :size="14" />
            </span>
          </div>
        </button>
      </div>

      <div class="text-center mt-14">
        <a
          :href="YOUTUBE_CHANNEL_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-stone-900 text-white font-medium hover:bg-stone-700 transition-colors"
        >
          <Youtube :size="20" />
          {{ $t('landing.videos.channelCta') }}
        </a>
        <p class="text-sm text-stone-400 mt-4">{{ $t('landing.videos.channelHint') }}</p>
      </div>
    </div>

    <!-- Player modal: the iframe is only mounted while a video is open -->
    <Teleport to="body">
      <Transition name="player">
        <div
          v-if="activeVideo"
          class="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          :aria-label="$t(activeVideo.titleKey)"
          @click.self="closeVideo"
        >
          <div ref="contentEl" class="w-full max-w-4xl focus:outline-none" tabindex="-1" @keydown="onTrapKey">
            <div class="flex items-start justify-between gap-4 mb-3">
              <h3 class="text-white font-light text-lg leading-snug">{{ $t(activeVideo.titleKey) }}</h3>
              <button
                type="button"
                class="p-2 -m-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                :aria-label="$t('common.close')"
                @click="closeVideo"
              >
                <X :size="22" />
              </button>
            </div>
            <div class="relative aspect-video w-full rounded-xl overflow-hidden bg-black shadow-2xl">
              <iframe
                :src="embedUrl"
                :title="$t(activeVideo.titleKey)"
                class="absolute inset-0 w-full h-full"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen
              ></iframe>
            </div>
            <a
              :href="`https://www.youtube.com/watch?v=${activeVideo.id}`"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white transition-colors mt-3"
            >
              {{ $t('landing.videos.openInYoutube') }}
              <ExternalLink :size="14" />
            </a>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronRight, ExternalLink, Play, X, Youtube } from 'lucide-vue-next';
import { YOUTUBE_CHANNEL_URL } from '@/config/socialLinks';

type FeaturedVideo = {
  /** YouTube video id */
  id: string;
  /** i18n key for the human-facing title */
  titleKey: string;
  /** Real length reported by YouTube, used for the duration badge */
  seconds: number;
};

// Thumbnails live in public/videos/<id>.webp (downloaded from YouTube and
// re-encoded) so the landing does not depend on i.ytimg.com at render time.
const FEATURED_VIDEOS: FeaturedVideo[] = [
  { id: 'AHhyWbUv_Is', titleKey: 'landing.videos.items.tour', seconds: 254 },
  { id: 'jQb3q-mUG-8', titleKey: 'landing.videos.items.registration', seconds: 59 },
  { id: 'Jh0LWC9wKvE', titleKey: 'landing.videos.items.access', seconds: 75 },
  { id: 'h9KR02vu6mE', titleKey: 'landing.videos.items.houses', seconds: 62 },
  { id: 'fEzKgqUJpGI', titleKey: 'landing.videos.items.tables', seconds: 126 },
  { id: 'xIVmHyhkDHA', titleKey: 'landing.videos.items.communities', seconds: 241 },
];

const { t: $t } = useI18n();

const activeVideo = ref<FeaturedVideo | null>(null);
const contentEl = ref<HTMLElement | null>(null);
let previousActiveElement: HTMLElement | null = null;

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
};

const embedUrl = computed(() =>
  activeVideo.value
    ? `https://www.youtube-nocookie.com/embed/${activeVideo.value.id}?autoplay=1&rel=0&modestbranding=1`
    : '',
);

const openVideo = (video: FeaturedVideo) => {
  activeVideo.value = video;
};

const closeVideo = () => {
  activeVideo.value = null;
};

const onKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && activeVideo.value) closeVideo();
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], iframe, [tabindex]:not([tabindex="-1"])';

const onTrapKey = (e: KeyboardEvent) => {
  if (e.key !== 'Tab' || !contentEl.value) return;
  const focusables = Array.from(
    contentEl.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
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

watch(activeVideo, async (video) => {
  if (video) {
    previousActiveElement = (document.activeElement as HTMLElement) ?? null;
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    await nextTick();
    contentEl.value?.focus();
  } else {
    document.removeEventListener('keydown', onKeyDown);
    document.body.style.overflow = '';
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
</script>

<style scoped>
.player-enter-active,
.player-leave-active {
  transition: opacity 0.2s ease;
}

.player-enter-from,
.player-leave-to {
  opacity: 0;
}
</style>
