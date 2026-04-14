<template>
  <Transition name="banner">
    <div
      v-if="versionStore.updateAvailable && !versionStore.dismissed"
      class="flex items-center justify-between gap-3 px-4 py-2 bg-amber-500 text-white text-sm font-medium shadow-sm z-50 flex-shrink-0"
    >
      <div class="flex items-center gap-2">
        <RefreshCw class="w-4 h-4 flex-shrink-0" />
        <span>{{ $t('versionBanner.message') }}</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="reload"
          class="px-3 py-1 rounded bg-white text-amber-600 font-semibold text-xs hover:bg-amber-50 transition-colors"
        >
          {{ $t('versionBanner.update') }}
        </button>
        <button
          @click="versionStore.dismiss()"
          class="p-1 rounded hover:bg-amber-600 transition-colors"
          :aria-label="$t('common.close')"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { RefreshCw, X } from 'lucide-vue-next';
import { useVersionStore } from '@/stores/versionStore';

const versionStore = useVersionStore();

function reload() {
  versionStore.reloadForUpdate();
}
</script>

<style scoped>
.banner-enter-active,
.banner-leave-active {
  transition: max-height 0.2s ease, opacity 0.2s ease;
  max-height: 60px;
  overflow: hidden;
}
.banner-enter-from,
.banner-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
