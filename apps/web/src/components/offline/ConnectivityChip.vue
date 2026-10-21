<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { connectivity, probe } from '@/offline/connectivity';
import { conflictOps, outbox, pendingOps } from '@/offline/outbox';

const PendingSyncPanel = defineAsyncComponent(() => import('./PendingSyncPanel.vue'));

/**
 * Always-visible connection state in the sidebar (specs/offline-mode, D11):
 * online / offline, how many changes wait to be sent, how many the server
 * rejected. A tap opens the list of pending changes; offline, it also checks the
 * connection again right away.
 *
 * A status dot instead of a lucide icon on purpose: several Sidebar tests mock
 * lucide-vue-next with a fixed list, and the chip lives inside the Sidebar.
 */
const props = withDefaults(defineProps<{ collapsed?: boolean }>(), { collapsed: false });

const { t } = useI18n();
const panelOpen = ref(false);

const online = computed(() => connectivity.online);
const pending = computed(() => pendingOps().length);
const conflicts = computed(() => conflictOps().length);

const state = computed(() => {
	if (conflicts.value > 0) return 'conflict';
	if (!online.value) return 'offline';
	if (pending.value > 0) return 'pending';
	return 'online';
});

const label = computed(() => {
	if (outbox.needsLogin && pending.value > 0) return t('offline.chip.needsLogin');
	if (conflicts.value > 0) return t('offline.chip.conflicts', conflicts.value);
	if (outbox.syncing) return t('offline.chip.syncing');
	const base = online.value ? t('offline.chip.online') : t('offline.chip.offline');
	return pending.value > 0 ? `${base} · ${t('offline.chip.pending', pending.value)}` : base;
});

const title = computed(() =>
	online.value ? t('offline.chip.onlineTitle') : t('offline.chip.offlineTitle'),
);

const dotClass = computed(
	() =>
		({
			online: 'bg-green-400',
			pending: 'bg-sky-400 animate-pulse',
			offline: 'bg-amber-400 animate-pulse',
			conflict: 'bg-red-500',
		})[state.value],
);

function onClick() {
	if (!online.value) void probe();
	if (pending.value > 0 || conflicts.value > 0) panelOpen.value = true;
}
</script>

<template>
  <button
    type="button"
    data-testid="connectivity-chip"
    :data-state="online ? 'online' : 'offline'"
    :data-pending="pending"
    :data-conflicts="conflicts"
    class="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors"
    :class="[
      state === 'online' ? 'text-gray-400 hover:bg-gray-700' : '',
      state === 'pending' ? 'bg-sky-500/20 text-sky-200 hover:bg-sky-500/30' : '',
      state === 'offline' ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30' : '',
      state === 'conflict' ? 'bg-red-500/20 text-red-200 hover:bg-red-500/30' : '',
      { 'justify-center': props.collapsed },
    ]"
    :title="title"
    :aria-label="label"
    @click="onClick"
  >
    <span class="h-2 w-2 shrink-0 rounded-full" :class="dotClass" aria-hidden="true" />
    <span v-if="!props.collapsed" class="truncate">{{ label }}</span>
  </button>
  <PendingSyncPanel v-if="panelOpen" :open="panelOpen" @update:open="panelOpen = $event" />
</template>
