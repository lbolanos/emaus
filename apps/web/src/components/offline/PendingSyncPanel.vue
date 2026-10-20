<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@repo/ui';
import { formatCurrency } from '@repo/utils';
import { connectivity, probe } from '@/offline/connectivity';
import { discardOp, outbox, retryOp, userOps } from '@/offline/outbox';
import { kindDef, type OutboxOp } from '@/offline/outboxKinds';
import { clearSavedResponses } from '@/offline/readCache';
import { flushOutbox } from '@/offline/syncService';

/**
 * What was done without signal and has not reached the server yet
 * (specs/offline-mode, D11/FR-14): each change in order, its state, the server's
 * message when it was rejected, and the only two ways a change leaves the queue
 * other than being sent — retry or an explicit discard.
 */
defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [boolean] }>();

const { t } = useI18n();
const ops = computed(() => userOps());
const sending = ref(false);

function label(op: OutboxOp): string {
	const { key, params } = kindDef(op.kind).label(op);
	const formatted =
		typeof params.amount === 'number' ? { ...params, amount: formatCurrency(params.amount) } : params;
	return t(key, formatted);
}

const time = (iso: string) =>
	new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });

const statusText = (op: OutboxOp) =>
	op.status === 'conflict'
		? t('offline.panel.conflict')
		: op.status === 'syncing'
			? t('offline.panel.syncing')
			: t('offline.panel.pending');

async function syncNow() {
	sending.value = true;
	try {
		// The state may still say "offline" when the signal is already back.
		if (!connectivity.online) await probe();
		await flushOutbox();
	} finally {
		sending.value = false;
	}
}

async function retry(op: OutboxOp) {
	await retryOp(op);
	await syncNow();
}

async function discard(op: OutboxOp) {
	if (!window.confirm(t('offline.panel.discardConfirm'))) return;
	await discardOp(op);
}

async function clearData() {
	if (!window.confirm(t('offline.panel.clearDataConfirm'))) return;
	await clearSavedResponses();
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[520px]" data-testid="pending-sync-panel">
      <DialogHeader>
        <DialogTitle>{{ t('offline.panel.title') }}</DialogTitle>
        <DialogDescription>{{ t('offline.panel.description') }}</DialogDescription>
      </DialogHeader>

      <p
        v-if="outbox.needsLogin"
        class="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900"
        data-testid="pending-needs-login"
      >
        {{ t('offline.panel.needsLogin') }}
      </p>

      <p v-if="ops.length === 0" class="py-6 text-center text-sm text-muted-foreground">
        {{ t('offline.panel.empty') }}
      </p>
      <ul v-else class="max-h-[50vh] divide-y overflow-y-auto">
        <li
          v-for="op in ops"
          :key="op.id"
          class="flex items-start justify-between gap-3 py-2"
          :data-status="op.status"
          data-testid="pending-op"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium">{{ label(op) }}</p>
            <p class="text-xs text-muted-foreground">
              {{ time(op.occurredAt) }} · {{ statusText(op) }}
            </p>
            <p v-if="op.status === 'conflict' && op.lastError" class="mt-0.5 text-xs text-red-700">
              {{ op.lastError }}
            </p>
          </div>
          <div v-if="op.status === 'conflict'" class="flex shrink-0 gap-1">
            <button
              type="button"
              class="rounded-md border px-2 py-1 text-xs hover:bg-muted"
              @click="retry(op)"
            >
              {{ t('offline.panel.retry') }}
            </button>
            <button
              type="button"
              class="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
              @click="discard(op)"
            >
              {{ t('offline.panel.discard') }}
            </button>
          </div>
        </li>
      </ul>

      <div class="flex flex-wrap items-center justify-between gap-2 pt-2">
        <button
          type="button"
          class="text-xs text-muted-foreground underline hover:text-foreground"
          @click="clearData"
        >
          {{ t('offline.panel.clearData') }}
        </button>
        <div class="flex items-center gap-2">
          <span v-if="outbox.lastSyncAt" class="text-xs text-muted-foreground">
            {{ t('offline.panel.lastSync', { time: time(new Date(outbox.lastSyncAt).toISOString()) }) }}
          </span>
          <button
            type="button"
            class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            :disabled="sending || outbox.syncing || !ops.some((o) => o.status !== 'conflict')"
            data-testid="pending-sync-now"
            @click="syncNow"
          >
            {{ t('offline.panel.syncNow') }}
          </button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
