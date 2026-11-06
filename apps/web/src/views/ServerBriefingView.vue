<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold">En qué vamos</h1>
      <p class="text-gray-600 text-sm">
        El cruce entre el Minuto a Minuto y las funciones: elige la actividad en curso y mira
        dónde debe estar cada servidor y qué le toca. Abre cualquier servidor para ver su día
        completo, sus responsabilidades y sus documentos.
      </p>
      <div class="text-xs mt-1">
        <span v-if="scheduleStore.connected" class="text-green-600">● conectado (WS)</span>
        <span v-else class="text-gray-400">● sin conexión realtime</span>
      </div>
    </div>

    <Card class="sticky top-0 z-10">
      <CardContent class="py-3 flex flex-wrap items-center gap-2 sm:gap-3">
        <label for="briefing-activity" class="text-sm text-gray-600 shrink-0">Estamos en:</label>
        <select
          id="briefing-activity"
          v-model="selectedItemId"
          class="border rounded px-2 py-1.5 text-sm min-w-0 flex-1 max-w-xl bg-white dark:bg-transparent"
        >
          <option :value="null">⏵ Automático (seguir la actividad en curso)</option>
          <option v-for="opt in itemPickerOptions" :key="opt.id" :value="opt.id">
            {{ opt.label }}
          </option>
        </select>
        <Badge v-if="isManual" variant="outline">manual</Badge>
        <Button
          v-if="isManual"
          variant="ghost"
          size="sm"
          @click="selectedItemId = null"
        >
          volver a automático
        </Button>
        <div class="flex-1 min-w-4" />
        <Input
          v-model="searchQuery"
          type="search"
          placeholder="Buscar servidor…"
          class="w-full sm:w-56"
        />
      </CardContent>
    </Card>

    <Card v-if="loading">
      <CardContent class="pt-6 text-gray-500 text-sm">Cargando…</CardContent>
    </Card>

    <Card v-else-if="scheduleStore.items.length === 0">
      <CardContent class="pt-6 text-sm text-gray-600">
        El Minuto a Minuto de este retiro está vacío. Materializa el horario desde
        <strong>Minuto a Minuto</strong> para ver el briefing.
      </CardContent>
    </Card>

    <template v-else-if="chosenItem">
      <section class="space-y-3">
        <div>
          <h2 class="text-lg font-semibold">En escena</h2>
          <p class="text-sm text-gray-600">
            Día {{ chosenItem.day }} · {{ fmtTime(chosenItem.startTime) }} — {{ chosenItem.name }}
            <span v-if="chosenItem.location" class="text-gray-500">· 📍 {{ chosenItem.location }}</span>
          </p>
        </div>

        <div
          v-if="documentsFailed"
          class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2"
        >
          ⚠️ No se pudieron cargar los documentos por servidor — el resto del briefing funciona.
        </div>

        <div v-if="!visibleOnStage.length" class="text-gray-500 text-sm">
          Nadie asignado a esta actividad.
          <RouterLink
            v-if="canManage.schedule"
            :to="`/app/retreats/${retreatId}/asignar-responsables`"
            class="text-blue-700 hover:underline"
          >
            Asignar responsables
          </RouterLink>
        </div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Card
            v-for="b in visibleOnStage"
            :key="b.participantId"
            data-testid="briefing-card"
            class="cursor-pointer hover:border-blue-400 transition-colors"
            @click="openDetail(b)"
          >
            <CardContent class="pt-4 space-y-1">
              <div class="font-medium">{{ b.label }}</div>
              <div class="flex flex-wrap gap-1.5 text-xs">
                <Badge
                  v-for="role in b.rolesHere"
                  :key="role"
                  variant="default"
                >
                  🎤 {{ role }}
                </Badge>
                <Badge v-if="mesaOf(b)" variant="secondary">🪑 {{ mesaOf(b) }}</Badge>
              </div>
              <div v-if="chosenItem?.location" class="text-xs text-gray-500">📍 {{ chosenItem.location }}</div>
              <div v-if="docCount(b)" class="text-xs text-emerald-700">📎 {{ docCount(b) }} documento(s)</div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-lg font-semibold">Los demás servidores</h2>
        <div v-if="!visibleOthers.length" class="text-gray-500 text-sm">
          Sin servidores para mostrar.
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="b in visibleOthers"
            :key="b.participantId"
            data-testid="briefing-row"
            class="border rounded p-3 flex flex-wrap items-center gap-x-4 gap-y-1 cursor-pointer hover:border-blue-400 transition-colors"
            @click="openDetail(b)"
          >
            <div class="font-medium min-w-40">{{ b.label }}</div>
            <div v-if="b.nextMoment" class="text-sm text-gray-700">
              próximo: {{ fmtTime(b.nextMoment.item.startTime) }} · {{ b.nextMoment.item.name }}
            </div>
            <div v-else class="text-sm text-gray-400">sin momentos asignados</div>
            <div v-if="mesaOf(b)" class="text-xs text-gray-500">🪑 {{ mesaOf(b) }}</div>
            <div v-if="docCount(b)" class="text-xs text-emerald-700">📎 {{ docCount(b) }}</div>
          </div>
        </div>
      </section>
    </template>

    <Card v-else>
      <CardContent class="pt-6 text-sm text-gray-600">
        No hay actividad en curso. Inicia la actividad actual desde el
        <strong>Minuto a Minuto</strong>
        <template v-if="canManage.schedule">
          o elige otra con el selector de arriba.
        </template>
        <template v-else> — o pide al coordinador que la inicie.</template>
      </CardContent>
    </Card>

    <Dialog :open="detailOpen" @update:open="onDetailOpenChange">
      <DialogContent class="max-w-2xl max-h-[85vh] overflow-y-auto">
        <template v-if="detailBriefing">
          <DialogHeader>
            <DialogTitle>{{ detailBriefing.label }}</DialogTitle>
            <DialogDescription>
              <span v-if="mesaOf(detailBriefing)">🪑 {{ mesaOf(detailBriefing) }} · </span>
              <span v-if="detailBriefing.onStage">en escena ahora</span>
              <span v-else>no asignado a la actividad elegida</span>
            </DialogDescription>
          </DialogHeader>

          <div
            v-if="detailBriefing.onStage && chosenItem"
            class="rounded border border-green-300 bg-green-50 p-3 text-sm space-y-1"
          >
            <div class="font-medium">Ahora — {{ chosenItem.name }}</div>
            <div class="text-gray-700">
              {{ fmtTime(chosenItem.startTime) }}
              <span v-if="chosenItem.location" class="text-gray-500">· 📍 {{ chosenItem.location }}</span>
            </div>
            <div v-if="detailBriefing.rolesHere.length" class="text-blue-800">
              🎤 {{ detailBriefing.rolesHere.join(', ') }}
            </div>
          </div>

          <Tabs default-value="day" class="mt-2">
            <TabsList>
              <TabsTrigger value="day">Su día</TabsTrigger>
              <TabsTrigger value="assignments">Asignaciones</TabsTrigger>
              <TabsTrigger value="documents">Documentos</TabsTrigger>
            </TabsList>

            <TabsContent value="day" class="space-y-2 pt-2">
              <div v-if="!detailBriefing.dayItems.length" class="text-gray-500 text-sm">
                Sin momentos asignados este día.
              </div>
              <div
                v-for="entry in detailBriefing.dayItems"
                :key="entry.item.id"
                class="flex items-start gap-3 border rounded p-2 text-sm"
                :class="entry.item.id === chosenItem?.id ? 'border-green-300 bg-green-50' : ''"
              >
                <div class="w-24 shrink-0 font-mono text-xs pt-0.5">
                  {{ fmtTime(entry.item.startTime) }}
                </div>
                <div class="flex-1">
                  <div class="font-medium">{{ entry.item.name }}</div>
                  <div class="flex flex-wrap gap-2 text-xs mt-0.5">
                    <Badge variant="secondary">{{ entry.item.status }}</Badge>
                    <span
                      v-for="role in entry.roles"
                      :key="role"
                      class="text-blue-700"
                    >🎤 {{ role }}</span>
                    <span v-if="entry.item.location" class="text-gray-500">📍 {{ entry.item.location }}</span>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="assignments" class="space-y-3 pt-2 text-sm">
              <div>
                <div class="font-medium mb-1">Responsabilidades</div>
                <div v-if="!detailBriefing.assignments.responsibilities.length" class="text-gray-500">
                  Sin responsabilidades fijas.
                </div>
                <ul v-else class="list-disc pl-5 space-y-0.5">
                  <li v-for="r in detailBriefing.assignments.responsibilities" :key="r.name">
                    {{ r.name }}
                    <span class="text-gray-500">({{ r.typeLabel }})</span>
                  </li>
                </ul>
              </div>
              <div>
                <div class="font-medium mb-1">Equipos de servicio</div>
                <div v-if="!detailBriefing.assignments.teams.length" class="text-gray-500">
                  Sin equipos asignados.
                </div>
                <div v-else class="space-y-2">
                  <div
                    v-for="t in detailBriefing.assignments.teams"
                    :key="t.name"
                    class="border rounded p-2"
                  >
                    <div class="font-medium">{{ t.name }} — {{ t.role }}</div>
                    <div v-if="t.memberNames.length" class="text-xs text-gray-600 mt-0.5">
                      Equipo: {{ t.memberNames.join(', ') }}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="documents" class="space-y-3 pt-2 text-sm">
              <div v-if="documentsFailed" class="text-amber-800">
                ⚠️ Los documentos no se pudieron cargar.
              </div>
              <template v-else-if="detailBriefing.documents">
                <div v-if="detailBriefing.documents.table" class="text-gray-700">
                  🪑 {{ detailBriefing.documents.table.name }} — {{ detailBriefing.documents.table.role }}
                </div>
                <div
                  v-for="moment in detailBriefing.documents.moments"
                  :key="moment.dayLabel + moment.time + moment.name"
                >
                  <div class="font-medium">{{ moment.dayLabel }} {{ moment.time }} — {{ moment.name }}</div>
                  <div v-if="moment.documents.length" class="flex flex-wrap gap-1 mt-1">
                    <a
                      v-for="doc in moment.documents"
                      :key="doc.url"
                      :href="doc.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-emerald-200 text-emerald-800 bg-emerald-50 hover:bg-emerald-100"
                    >
                      📄 {{ doc.label }}
                    </a>
                  </div>
                </div>
                <div
                  v-if="!detailBriefing.documents.moments.some((m) => m.documents.length) && !detailBriefing.documents.responsibilityDocuments.length"
                  class="text-gray-500"
                >
                  Sin documentos por ahora.
                </div>
                <div
                  v-for="rd in detailBriefing.documents.responsibilityDocuments"
                  :key="rd.name"
                >
                  <div class="font-medium">{{ rd.name }}</div>
                  <div class="flex flex-wrap gap-1 mt-1">
                    <a
                      v-for="doc in rd.documents"
                      :key="doc.url"
                      :href="doc.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-emerald-200 text-emerald-800 bg-emerald-50 hover:bg-emerald-100"
                    >
                      📄 {{ doc.label }}
                    </a>
                  </div>
                </div>
              </template>
            </TabsContent>
          </Tabs>
        </template>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui';
import { useScheduleStore } from '@/stores/scheduleStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import { useResponsabilityStore } from '@/stores/responsabilityStore';
import { useServiceTeamStore } from '@/stores/serviceTeamStore';
import { useAuthPermissions } from '@/composables/useAuthPermissions';
import { retreatScheduleApi } from '@/services/api';
import { participantMatchesTokens, searchTokens } from '@/utils/participantSearch';
import { buildBriefings, pickAutoItem } from '@/views/serverBriefing';
import type { ServerBriefing } from '@/views/serverBriefing';

const props = defineProps<{ id?: string }>();

const route = useRoute();
const scheduleStore = useScheduleStore();
const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();
const responsabilityStore = useResponsabilityStore();
const serviceTeamStore = useServiceTeamStore();
const { canManage } = useAuthPermissions();

const loading = ref(false);
const documents = ref<Record<string, any> | null>(null);
const documentsFailed = ref(false);
const selectedItemId = ref<string | null>(null); // null = automático
const searchQuery = ref('');
const detailParticipantId = ref<string | null>(null);
let unsubscribe: (() => void) | null = null;

const retreatId = computed(() => (props.id as string) || retreatStore.selectedRetreatId || '');

const autoItem = computed(() => pickAutoItem(scheduleStore.items));

const chosenItem = computed(() => {
  if (selectedItemId.value) {
    return scheduleStore.items.find((i) => i.id === selectedItemId.value) ?? autoItem.value;
  }
  return autoItem.value;
});

const isManual = computed(() => selectedItemId.value !== null);

const servers = computed(() =>
  (participantStore.participants || []).filter(
    (p) => !p.isCancelled && (p.type === 'server' || p.type === 'partial_server'),
  ),
);

const groups = computed(() =>
  buildBriefings({
    items: scheduleStore.items,
    chosenItem: chosenItem.value,
    servers: servers.value,
    responsibilities: responsabilityStore.responsibilities,
    teams: serviceTeamStore.teams,
    documents: documents.value,
  }),
);

const searchTokensList = computed(() => searchTokens(searchQuery.value));
const matchesSearch = (b: ServerBriefing) =>
  searchTokensList.value.length === 0 ||
  participantMatchesTokens(
    {
      firstName: b.label.split(' ')[0] ?? '',
      lastName: b.label.split(' ').slice(1).join(' '),
      nickname: '',
    },
    searchTokensList.value,
  );

const visibleOnStage = computed(() => groups.value.onStage.filter(matchesSearch));
const visibleOthers = computed(() => groups.value.others.filter(matchesSearch));

const itemPickerOptions = computed(() =>
  [...scheduleStore.items]
    .sort((a, b) => (a.day !== b.day ? a.day - b.day : a.startTime.localeCompare(b.startTime)))
    .map((i) => ({
      id: i.id,
      label: `Día ${i.day} · ${fmtTime(i.startTime)} · ${i.name} (${i.status})`,
    })),
);

const detailOpen = computed({
  get: () => detailParticipantId.value !== null,
  set: (v: boolean) => {
    if (!v) detailParticipantId.value = null;
  },
});

const detailBriefing = computed(
  () =>
    [...groups.value.onStage, ...groups.value.others].find(
      (b) => b.participantId === detailParticipantId.value,
    ) ?? null,
);

function openDetail(b: ServerBriefing) {
  detailParticipantId.value = b.participantId;
}

function onDetailOpenChange(v: boolean) {
  if (!v) detailParticipantId.value = null;
}

/** La mesa del briefing de documentos ("Mesa 3 — Colíder"), si la tiene. */
function mesaOf(b: ServerBriefing): string | null {
  if (!b.documents?.table) return null;
  return `${b.documents.table.name} (${b.documents.table.role})`;
}

function docCount(b: ServerBriefing): number {
  if (!b.documents) return 0;
  return (
    b.documents.moments.reduce((acc, m) => acc + m.documents.length, 0) +
    b.documents.responsibilityDocuments.reduce((acc, rd) => acc + rd.documents.length, 0)
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function loadDocuments(id: string) {
  documentsFailed.value = false;
  try {
    documents.value = await retreatScheduleApi.assignmentDocuments(id);
  } catch {
    // Degradado: la vista funciona sin documentos (no bloquea el briefing).
    documents.value = null;
    documentsFailed.value = true;
  }
}

async function setup(id: string) {
  if (!id) return;
  loading.value = true;
  selectedItemId.value = null;
  detailParticipantId.value = null;
  try {
    // Los filters del participantStore son estado compartido entre vistas: se
    // limpian antes de setear el retiro, o viajan claves de otra vista.
    Object.keys(participantStore.filters).forEach((key) => {
      delete participantStore.filters[key];
    });
    participantStore.filters.retreatId = id;
    await Promise.all([
      scheduleStore.loadForRetreat(id),
      participantStore.fetchParticipants(),
      responsabilityStore.fetchResponsibilities(id, { silent: true }),
      serviceTeamStore.fetchTeams(),
    ]);
  } finally {
    loading.value = false;
  }

  // Aparte: los documentos no bloquean el briefing si fallan.
  void loadDocuments(id);

  if (unsubscribe) unsubscribe();
  unsubscribe = scheduleStore.subscribeRealtime(id, {
    onAttachmentChanged: () => {
      void loadDocuments(id);
    },
  });
}

onMounted(() => setup(retreatId.value));
onUnmounted(() => {
  unsubscribe?.();
});
watch(retreatId, (id) => setup(id));

// El guard de requiresRetreat sincroniza route.params.id con selectedRetreatId;
// si la vista se abre sin :id (por el selector del sidebar) lo tomamos del store.
watch(
  () => route.params.id,
  (v) => {
    if (v && v !== retreatId.value) setup(String(v));
  },
);
</script>
