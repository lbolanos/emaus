<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useParticipantStore } from '@/stores/participantStore';
import { connectivity, onReconnect } from '@/offline/connectivity';

/**
 * Shown instead of the food and medicine reports when the participant list came
 * from the device: health data is never saved offline (specs/offline-mode,
 * decision 2026-10-19), so the list would look complete while missing exactly
 * what these screens are for.
 */
const { t } = useI18n();
const participantStore = useParticipantStore();
const retrying = ref(false);

async function retry() {
	if (retrying.value || !participantStore.filters.retreatId) return;
	retrying.value = true;
	try {
		await participantStore.fetchParticipants();
	} catch {
		// still without signal: the notice stays
	} finally {
		retrying.value = false;
	}
}

let stop: (() => void) | null = null;
onMounted(() => {
	stop = onReconnect(() => void retry());
	// The signal may have come back before this screen opened.
	if (connectivity.online) void retry();
});
onUnmounted(() => stop?.());
</script>

<template>
  <div
    class="flex flex-col items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-6 py-10 text-center"
    data-testid="health-needs-connection"
  >
    <p class="max-w-md text-sm text-amber-900">{{ t('offline.healthNeedsConnection') }}</p>
    <button
      type="button"
      class="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-amber-800 shadow-sm ring-1 ring-amber-200 hover:bg-amber-100 disabled:opacity-50"
      :disabled="retrying"
      @click="retry"
    >
      {{ t('offline.retry') }}
    </button>
  </div>
</template>
