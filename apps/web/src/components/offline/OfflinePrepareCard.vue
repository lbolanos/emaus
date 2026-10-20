<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { connectivity } from '@/offline/connectivity';
import { isOfflineModeEnabled } from '@/offline/flag';
import {
	canPrepare,
	getPrepared,
	prepareRetreat,
	type PreparedSummary,
} from '@/offline/prepareRetreat';
import type { RetreatLikeDates } from '@/utils/retreatLiveStatus';

/**
 * "Trabajar sin conexión" on the retreat dashboard (specs/offline-mode, D4/FR-8):
 * when this phone last downloaded the retreat, and a button to do it now — the
 * Thursday at home, before leaving for the retreat house. Shown from 7 days before
 * the start until the end; the data is deleted when the retreat ends.
 */
const props = defineProps<{ retreat: (RetreatLikeDates & { id?: string }) | null | undefined }>();

const { t } = useI18n();
const prepared = ref<PreparedSummary | null>(null);
const running = ref(false);
const progress = ref({ done: 0, total: 0 });
const lastResult = ref<PreparedSummary | null>(null);

const visible = computed(() => isOfflineModeEnabled() && canPrepare(props.retreat));
const online = computed(() => connectivity.online);

async function load() {
	prepared.value = props.retreat?.id ? await getPrepared(props.retreat.id) : null;
}

async function prepare() {
	if (!props.retreat?.id || running.value) return;
	running.value = true;
	lastResult.value = null;
	try {
		lastResult.value = await prepareRetreat(props.retreat.id, (done, total) => {
			progress.value = { done, total };
		});
		await load();
	} finally {
		running.value = false;
	}
}

const when = computed(() => {
	if (!prepared.value) return null;
	return new Date(prepared.value.at).toLocaleString(undefined, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
	});
});
const size = computed(() =>
	prepared.value ? `${Math.max(1, Math.round(prepared.value.bytes / 1024))} KB` : '',
);

onMounted(load);
watch(() => props.retreat?.id, load);
</script>

<template>
  <div
    v-if="visible"
    class="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
    data-testid="offline-prepare-card"
  >
    <div class="min-w-0">
      <h3 class="text-sm font-semibold">{{ t('offline.prepare.title') }}</h3>
      <p class="text-sm text-muted-foreground" data-testid="offline-prepare-status">
        <template v-if="prepared">{{ t('offline.prepare.done', { when, size }) }}</template>
        <template v-else>{{ t('offline.prepare.notYet') }}</template>
      </p>
      <p v-if="lastResult && lastResult.failed > 0" class="text-xs text-amber-700">
        {{ t('offline.prepare.partial', { failed: lastResult.failed }) }}
      </p>
      <p class="text-xs text-muted-foreground">{{ t('offline.prepare.note') }}</p>
    </div>
    <button
      type="button"
      class="shrink-0 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      :disabled="running || !online"
      :title="online ? '' : t('offline.needsConnection')"
      data-testid="offline-prepare-button"
      @click="prepare"
    >
      <template v-if="running">{{ t('offline.prepare.running', { done: progress.done, total: progress.total }) }}</template>
      <template v-else>{{ t('offline.prepare.button') }}</template>
    </button>
  </div>
</template>
