<template>
  <!-- Lista de envío con marca de "ya enviado" (specs/ux-mam-responsabilidades,
       D1/D3/D7): "Por servidor" en Responsabilidades y el diálogo de líderes en Mesas.
       El MessageDialog se abre encima de la vista; al cerrarlo esta lista sigue
       aquí con la marca puesta. -->
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <p class="text-sm text-muted-foreground">
        {{ $t('briefingList.summary', { sent: sentCount, total: rows.length }) }}
      </p>
      <div class="ml-auto flex items-center gap-1" role="group">
        <Button
          v-for="f in filters"
          :key="f.value"
          :variant="filter === f.value ? 'default' : 'ghost'"
          size="sm"
          class="h-7 text-xs"
          :aria-pressed="filter === f.value"
          @click="filter = f.value"
        >
          {{ f.label }}
          <span class="ml-1 text-[10px] opacity-70">({{ f.count }})</span>
        </Button>
      </div>
    </div>

    <p v-for="notice in notices" :key="notice" class="text-xs text-amber-700">{{ notice }}</p>
    <p v-if="sentFailed" class="text-xs text-amber-700">{{ $t('briefingList.sentError') }}</p>

    <ul v-if="visible.length" class="divide-y rounded-lg border bg-background">
      <li
        v-for="row in visible"
        :key="row.key"
        class="flex items-center gap-3 px-3 py-2"
        data-testid="briefing-row"
      >
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium break-words">{{ participantLabel(row.participant) }}</p>
          <p
            v-for="(line, i) in row.lines"
            :key="i"
            class="text-xs text-muted-foreground line-clamp-2"
            :title="line"
          >{{ line }}</p>
          <p class="text-xs" :class="sentOf(row) ? 'text-green-700' : 'text-amber-700'" data-testid="sent-status">
            <template v-if="sentOf(row)">✓ {{ sentLabel(sentOf(row)!) }}</template>
            <template v-else>{{ $t('briefingList.notSent') }}</template>
          </p>
        </div>
        <Button
          size="sm"
          :variant="sentOf(row) ? 'outline' : 'default'"
          class="shrink-0"
          @click="emit('send', row)"
        >
          <Send class="h-4 w-4 mr-1" />
          {{ sentOf(row) ? $t('briefingList.resend') : $t('briefingList.send') }}
        </Button>
      </li>
    </ul>
    <p v-else class="py-6 text-center text-sm text-muted-foreground">
      {{ filter === 'pending' && rows.length ? $t('briefingList.emptyPending') : emptyText }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@repo/ui';
import { Send } from 'lucide-vue-next';
import type { Participant } from '@repo/types';
import type { LatestSendByParticipant } from '@/services/api';
import { participantLabel } from '@/utils/participant';

export interface BriefingSendRow {
  /** Unique per row: a person can lead two tables. */
  key: string;
  participant: Participant;
  /** Muted detail lines under the name (what they do, counts). */
  lines: string[];
}

const props = withDefaults(
  defineProps<{
    rows: BriefingSendRow[];
    sent: LatestSendByParticipant;
    emptyText: string;
    notices?: string[];
    sentFailed?: boolean;
  }>(),
  { notices: () => [] },
);

const emit = defineEmits<{ (e: 'send', row: BriefingSendRow): void }>();

const { t } = useI18n();

// v-model opcional: en Mesas la lista vive en un diálogo que se cierra en cada
// envío, y "Sin enviar" tiene que seguir puesto al volver.
const filter = defineModel<'all' | 'pending'>('filter', { default: 'all' });

// The mark is per person: the history records who got the template, not for which row.
const sentOf = (row: BriefingSendRow) => props.sent[row.participant.id] ?? null;
const sentCount = computed(() => props.rows.filter((r) => sentOf(r)).length);
const pending = computed(() => props.rows.filter((r) => !sentOf(r)));

const filters = computed(() => [
  { value: 'all' as const, label: t('briefingList.filterAll'), count: props.rows.length },
  { value: 'pending' as const, label: t('briefingList.filterPending'), count: pending.value.length },
]);

const visible = computed(() => (filter.value === 'pending' ? pending.value : props.rows));

const sentLabel = (s: { sentAt: string; messageType: 'whatsapp' | 'email' }) =>
  t('briefingList.sentOn', {
    date: new Date(s.sentAt).toLocaleString('es-MX', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
    channel: t(`briefingList.channels.${s.messageType}`),
  });
</script>
