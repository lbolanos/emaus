<template>
  <div class="space-y-6 max-w-xl mx-auto">
    <div>
      <h1 class="text-3xl font-bold">Ahora me toca</h1>
      <p class="text-gray-600 text-sm">
        Tus actividades del retiro, grandes y claras: déjala abierta en tu teléfono durante el retiro.
      </p>
      <div class="text-xs mt-1">
        <span v-if="store.connected" class="text-green-600">● En vivo</span>
        <span v-else class="text-gray-400">● Sin conexión</span>
      </div>
    </div>

    <Card v-if="!myParticipantId">
      <CardContent class="pt-6 text-sm text-gray-600">
        Tu cuenta no tiene un participante vinculado en este retiro. Pide al coordinador que te
        vincule para poder ver tus asignaciones.
      </CardContent>
    </Card>

    <template v-else>
      <!-- ── AHORA / Próxima: el bloque grande ── -->
      <Card v-if="nowEntry">
        <CardContent class="pt-5 pb-5 space-y-3">
          <div class="text-xs uppercase tracking-widest font-semibold" :class="isActive ? 'text-green-700' : 'text-gray-500'">
            {{ isActive ? '● Ahora' : countdownLabel }}
          </div>
          <div class="text-3xl font-bold leading-tight">{{ nowEntry.item.name }}</div>
          <div class="text-lg text-gray-700">
            <span v-if="nowEntry.item.location">📍 {{ nowEntry.item.location }}</span>
            <span v-else class="text-gray-400">ubicación sin definir</span>
          </div>
          <div class="text-base text-gray-600">{{ fmtTime(nowEntry.item.startTime) }}<span class="text-gray-400"> · {{ nowEntry.item.durationMinutes }} min</span></div>
          <div class="flex flex-wrap gap-2">
            <Badge v-for="role in nowEntry.roles" :key="role" variant="default" class="text-sm">🎤 {{ role }}</Badge>
          </div>
          <div v-if="isActive && heroProgress" class="h-2.5 rounded bg-gray-200 overflow-hidden">
            <div
              class="h-full rounded bg-green-500 transition-all"
              :style="{ width: Math.min(100, heroProgress.pct) + '%' }"
            />
          </div>
          <div v-if="isActive && heroProgress" class="text-sm text-gray-600">
            {{ heroProgress.minutesElapsed }} de {{ heroProgress.duration }} min
          </div>
          <div v-if="nowEntry.item.notes" class="text-sm text-gray-600 border-t pt-2">{{ nowEntry.item.notes }}</div>
          <div v-if="nowDocuments.length" class="flex flex-wrap gap-1.5">
            <a
              v-for="doc in nowDocuments"
              :key="doc.id"
              :href="doc.storageUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 px-2.5 py-1 text-sm rounded border border-emerald-200 text-emerald-800 bg-emerald-50 hover:bg-emerald-100"
              :title="doc.description ?? doc.fileName"
            >
              📄 {{ doc.kind === 'markdown' ? '📝' : '' }} {{ doc.fileName }}
            </a>
          </div>
        </CardContent>
      </Card>

      <Card v-else>
        <CardContent class="pt-6 text-sm text-gray-600">
          No tienes actividades asignadas todavía. Pide al coordinador que te asigne desde el
          Minuto a Minuto.
        </CardContent>
      </Card>

      <!-- ── Después ── -->
      <section v-if="after.length" class="space-y-2">
        <h2 class="text-lg font-semibold text-gray-700">Después</h2>
        <div
          v-for="entry in after"
          :key="entry.item.id"
          class="border rounded p-3 flex items-start gap-3"
        >
          <div class="w-20 shrink-0 font-mono text-lg pt-0.5">{{ fmtTime(entry.item.startTime) }}</div>
          <div class="flex-1">
            <div class="font-semibold text-lg leading-snug">{{ entry.item.name }}</div>
            <div class="flex flex-wrap gap-2 text-sm mt-1">
              <span v-if="entry.item.location" class="text-gray-600">📍 {{ entry.item.location }}</span>
              <span v-for="role in entry.roles" :key="role" class="text-blue-700">🎤 {{ role }}</span>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Card, CardContent, Badge, useToast } from '@repo/ui';
import { useScheduleStore } from '@/stores/scheduleStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useMyParticipantId } from '@/composables/useMyParticipantId';
import { useResponsabilityStore } from '@/stores/responsabilityStore';
import type { RetreatScheduleItemDTO } from '@/services/api';

const store = useScheduleStore();
const retreatStore = useRetreatStore();
const responsabilityStore = useResponsabilityStore();
const { toast } = useToast();

const now = ref(Date.now());
let nowTimer: any = null;
let unsubscribe: (() => void) | null = null;

const retreatId = computed(() => retreatStore.selectedRetreatId || '');
const myParticipantId = useMyParticipantId();

type Entry = { item: RetreatScheduleItemDTO; roles: string[] };

// Mismo cruce que Mi agenda: titular de la responsabilidad principal + responsables.
const myEntries = computed<Entry[]>(() => {
  const me = myParticipantId.value;
  if (!me) return [];
  return store.items
    .map((item) => {
      const roles: string[] = [];
      const main = responsabilityStore.responsibilities.find((r) => r.id === item.responsabilityId);
      if (main && (main as any).participantId === me) roles.push(`${main.name} (titular)`);
      for (const r of item.responsables ?? []) {
        if (r.participantId === me) roles.push(r.role || 'Apoyo');
      }
      return roles.length ? { item, roles } : null;
    })
    .filter((x): x is Entry => x !== null)
    .sort((a, b) => a.item.startTime.localeCompare(b.item.startTime));
});

const nowEntry = computed<Entry | null>(() => {
  const active = myEntries.value.find((e) => e.item.status === 'active');
  if (active) return active;
  return (
    myEntries.value.find(
      (e) =>
        e.item.status !== 'completed' &&
        new Date(e.item.startTime).getTime() > now.value - 5 * 60_000,
    ) ?? null
  );
});

const isActive = computed(() => nowEntry.value?.item.status === 'active');

const countdownLabel = computed(() => {
  const it = nowEntry.value?.item;
  if (!it) return 'Próxima';
  const mins = Math.round((new Date(it.startTime).getTime() - now.value) / 60_000);
  if (mins > 0) return `En ${mins} min`;
  return 'Ya debería estar pasando';
});

const heroProgress = computed(() => {
  const it = nowEntry.value?.item;
  if (!it || it.status !== 'active') return null;
  const start = new Date(it.actualStartTime || it.startTime).getTime();
  const end = start + (it.durationMinutes || 0) * 60_000;
  if (Number.isNaN(start) || end <= start) return null;
  const pct = ((now.value - start) / (end - start)) * 100;
  return {
    pct: Math.round(Number.isNaN(pct) ? 0 : pct),
    minutesElapsed: Math.max(0, Math.round((now.value - start) / 60_000)),
    duration: it.durationMinutes,
  };
});

// Documentos del momento actual: el server los pega por nombre canónico al item.
const nowDocuments = computed(() => nowEntry.value?.item.attachments ?? []);

const after = computed<Entry[]>(() => {
  const cur = nowEntry.value;
  if (!cur) return myEntries.value;
  return myEntries.value.filter((e) => e.item.id !== cur.item.id);
});

function fmtTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function setup(id: string) {
  if (!id) return;
  await Promise.all([
    store.loadForRetreat(id),
    responsabilityStore.fetchResponsibilities(id, { silent: true }),
  ]);

  if (unsubscribe) unsubscribe();
  unsubscribe = store.subscribeRealtime(id, {
    onUpcoming: (e) => {
      const me = myParticipantId.value;
      if (!me) return;
      if (e.targetParticipantIds.includes(me)) {
        toast({ title: `🎯 Te toca en ${e.minutesUntil} min`, description: e.name, duration: 15000 });
      }
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
