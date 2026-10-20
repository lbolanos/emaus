<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { CloudOff } from 'lucide-vue-next';
import { connectivity } from '@/offline/connectivity';

/**
 * Banner under the header while there is no signal (specs/offline-mode, D11):
 * how old the data on screen is, and whether some screen had nothing saved.
 * One banner for every view instead of a badge per view.
 */
const { t } = useI18n();
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
	timer = setInterval(() => (now.value = Date.now()), 30_000);
});
onUnmounted(() => {
	if (timer) clearInterval(timer);
});

const age = computed(() => {
	const since = connectivity.oldestServedFromCacheAt;
	if (since === null) return null;
	const minutes = Math.max(0, Math.floor((now.value - since) / 60_000));
	if (minutes < 60) return t('offline.age.minutes', minutes);
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return t('offline.age.hours', hours);
	return t('offline.age.days', Math.floor(hours / 24));
});
</script>

<template>
  <div
    v-if="!connectivity.online"
    data-testid="offline-banner"
    class="flex flex-shrink-0 items-start gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900 shadow-sm"
    role="status"
  >
    <CloudOff class="mt-0.5 h-4 w-4 flex-shrink-0" />
    <div>
      <p>{{ age ? t('offline.banner.stale', { age }) : t('offline.banner.noCache') }}</p>
      <p v-if="connectivity.missedWhileOffline" class="text-xs text-amber-800">
        {{ t('offline.banner.missing') }}
      </p>
    </div>
  </div>
</template>
