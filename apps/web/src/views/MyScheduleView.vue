<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold">Mi agenda</h1>
      <p class="text-gray-600 text-sm">
        Lo que te toca en este retiro. Recibirás una notificación 10 / 5 / 0 minutos antes de
        cada actividad asignada.
      </p>
      <div class="text-xs mt-1">
        <span v-if="store.connected" class="text-green-600">● conectado (WS)</span>
        <span v-else class="text-gray-400">● sin conexión realtime</span>
      </div>
    </div>

    <Card v-if="!myParticipantId">
      <CardContent class="pt-6 text-sm text-gray-600">
        Tu cuenta no tiene un participante vinculado en este retiro. Pide al coordinador que te
        vincule para poder ver tus asignaciones.
      </CardContent>
    </Card>

    <template v-else>
      <Card>
        <CardContent class="pt-6">
          <h2 class="text-lg font-semibold mb-3">Próximas</h2>
          <div v-if="loading" class="text-gray-500 text-sm">Cargando…</div>
          <div v-else-if="!upcoming.length" class="text-gray-500 text-sm">
            No tienes actividades próximas asignadas.
          </div>
          <div v-else class="space-y-2">
            <ItemRow v-for="entry in upcoming" :key="entry.item.id" :entry="entry" />
          </div>
        </CardContent>
      </Card>

      <Card v-if="past.length">
        <CardContent class="pt-6">
          <h2 class="text-lg font-semibold mb-3">Pasadas</h2>
          <div class="space-y-2 opacity-70">
            <ItemRow v-for="entry in past" :key="entry.item.id" :entry="entry" />
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue';
import { Card, CardContent, useToast, Badge } from '@repo/ui';
import { useScheduleStore } from '@/stores/scheduleStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useAuthStore } from '@/stores/authStore';
import { useResponsabilityStore } from '@/stores/responsabilityStore';
import type { RetreatScheduleItemDTO } from '@/services/api';

const store = useScheduleStore();
const retreatStore = useRetreatStore();
const authStore = useAuthStore();
const responsabilityStore = useResponsabilityStore();
const { toast } = useToast();

const loading = ref(false);
let unsubscribe: (() => void) | null = null;

const retreatId = computed(() => retreatStore.selectedRetreatId || '');

const myParticipantId = computed<string | null>(() => {
  const p = authStore.userProfile as any;
  return p?.participantId ?? p?.participant?.id ?? null;
});

type Entry = {
  item: RetreatScheduleItemDTO;
  myRoles: string[];
};

const myItems = computed<Entry[]>(() => {
  const me = myParticipantId.value;
  if (!me) return [];
  return store.items
    .map((item) => {
      const roles: string[] = [];
      const main = responsabilityStore.responsibilities.find(
        (r) => r.id === item.responsabilityId,
      );
      if (main && (main as any).participantId === me) roles.push(main.name);
      for (const r of item.responsables ?? []) {
        if (r.participantId === me) roles.push(r.role || 'Apoyo');
      }
      return roles.length ? { item, myRoles: roles } : null;
    })
    .filter((x): x is Entry => x !== null);
});

const now = ref(Date.now());
let nowTimer: any = null;

const upcoming = computed(() =>
  myItems.value
    .filter(
      (e) =>
        e.item.status !== 'completed' &&
        new Date(e.item.endTime).getTime() >= now.value - 5 * 60_000,
    )
    .sort((a, b) => a.item.startTime.localeCompare(b.item.startTime)),
);

const past = computed(() =>
  myItems.value
    .filter(
      (e) =>
        e.item.status === 'completed' ||
        new Date(e.item.endTime).getTime() < now.value - 5 * 60_000,
    )
    .sort((a, b) => b.item.startTime.localeCompare(a.item.startTime)),
);

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusVariant(s: string): any {
  if (s === 'active') return 'default';
  if (s === 'completed') return 'secondary';
  if (s === 'delayed') return 'destructive';
  return 'outline';
}

// Inline row component
const ItemRow = (props: { entry: Entry }) => {
  const { item, myRoles } = props.entry;
  const attachments = item.attachments ?? [];
  return h(
    'div',
    {
      class: [
        'border rounded p-3 flex items-start gap-3',
        item.status === 'active' && 'bg-green-50 border-green-300',
        item.status === 'completed' && 'opacity-60',
        item.status === 'delayed' && 'bg-amber-50 border-amber-300',
      ],
    },
    [
      h('div', { class: 'w-20 sm:w-32 text-sm font-mono shrink-0' }, fmtDateTime(item.startTime)),
      h('div', { class: 'flex-1' }, [
        h('div', { class: 'font-medium' }, item.name),
        h('div', { class: 'flex flex-wrap gap-2 mt-1 text-xs' }, [
          h(Badge as any, { variant: 'secondary' }, () => item.type),
          h(Badge as any, { variant: statusVariant(item.status) }, () => item.status),
          h('span', { class: 'text-blue-700' }, '🎤 ' + myRoles.join(', ')),
          item.location && h('span', { class: 'text-gray-500' }, '📍 ' + item.location),
          item.palanquitaNotes &&
            h('span', { class: 'text-gray-500' }, '🎵 ' + item.palanquitaNotes),
        ]),
        item.notes && h('div', { class: 'text-xs text-gray-500 mt-1' }, item.notes),
        attachments.length > 0 &&
          h(
            'div',
            { class: 'flex flex-wrap gap-1 mt-1.5' },
            attachments.map((att) =>
              h(
                'a',
                {
                  key: att.id,
                  href: att.storageUrl,
                  download: att.fileName,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  class:
                    'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-emerald-200 text-emerald-800 bg-emerald-50 hover:bg-emerald-100',
                  title: att.description ?? att.fileName,
                },
                [
                  att.kind === 'markdown' ? '📝' : '📄',
                  ' ',
                  att.fileName,
                ],
              ),
            ),
          ),
      ]),
      h('div', { class: 'text-xs text-gray-500 shrink-0' }, item.durationMinutes + 'm'),
    ],
  );
};

async function setup(id: string) {
  if (!id) return;
  loading.value = true;
  try {
    await Promise.all([
      store.loadForRetreat(id),
      responsabilityStore.fetchResponsibilities(id, { silent: true }),
    ]);
  } finally {
    loading.value = false;
  }

  if (unsubscribe) unsubscribe();
  unsubscribe = store.subscribeRealtime(id, {
    onUpcoming: (e) => {
      const me = myParticipantId.value;
      if (!me) return;
      if (e.targetParticipantIds.includes(me)) {
        toast({
          title: `🎯 Te toca en ${e.minutesUntil} min`,
          description: e.name,
          duration: 15000,
        });
      }
    },
    onStarted: (e) => {
      const found = myItems.value.find((x) => x.item.id === e.itemId);
      if (found) toast({ title: `▶ Inició: ${found.item.name}` });
    },
    onBell: () => {
      toast({ title: '🔔 Campana' });
    },
  });
}

onMounted(() => {
  setup(retreatId.value);
  nowTimer = setInterval(() => {
    now.value = Date.now();
  }, 30_000);
});
onUnmounted(() => {
  unsubscribe?.();
  if (nowTimer) clearInterval(nowTimer);
});
watch(retreatId, (id) => setup(id));
</script>
