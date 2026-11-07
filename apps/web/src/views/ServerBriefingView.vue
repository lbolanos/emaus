<template>
  <div class="space-y-6">
    <div class="screen-only">
      <h1 class="text-3xl font-bold">En qué vamos</h1>
      <p class="text-gray-600 text-sm">
        El cruce entre el Minuto a Minuto y las funciones: elige la actividad en curso y mira dónde debe estar cada servidor y qué le toca. Abre cualquier servidor para ver su día completo, sus responsabilidades y sus documentos.
      </p>
      <div class="text-xs mt-1">
        <span v-if="scheduleStore.connected" class="text-green-600">● En vivo</span>
        <span v-else class="text-gray-400">● Sin conexión</span>
      </div>
    </div>

    <!-- Skeleton de carga -->
    <div v-if="loading" class="space-y-4 screen-only" data-testid="briefing-skeleton">
      <div class="h-28 rounded-lg bg-gray-200 animate-pulse" />
      <div class="h-10 rounded bg-gray-100 animate-pulse w-2/3" />
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div v-for="i in 3" :key="i" class="h-28 rounded-lg bg-gray-100 animate-pulse" />
      </div>
    </div>

    <template v-else-if="scheduleStore.items.length > 0 && chosenItem">
      <!-- ── Hero AHORA: la actividad elegida, con progreso y controles ── -->
      <Card class="screen-only">
        <CardContent class="pt-4 pb-4 space-y-2">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-xs uppercase tracking-wide text-gray-500">
                <span v-if="chosenItem.status === 'active'" class="text-green-700 font-semibold">● En curso</span>
                <span v-else-if="chosenItem.status === 'completed'" class="text-gray-500">Completada</span>
                <span v-else>Próxima / elegida</span>
              </div>
              <div class="text-xl font-bold mt-0.5">{{ chosenItem.name }}</div>
              <div class="text-sm text-gray-600">
                Día {{ chosenItem.day }} · {{ fmtTime(chosenItem.startTime) }}
                <span v-if="chosenItem.location" class="text-gray-500">· 📍 {{ chosenItem.location }}</span>
              </div>
            </div>
            <div class="text-right shrink-0">
              <div v-if="heroProgress" class="text-2xl font-bold tabular-nums">{{ heroProgress.minutesElapsed }}<span class="text-sm text-gray-500 font-normal"> min</span></div>
              <div v-else-if="minutesUntilChosen !== null && minutesUntilChosen > 0" class="text-2xl font-bold tabular-nums">
                en {{ minutesUntilChosen }}<span class="text-sm text-gray-500 font-normal"> min</span>
              </div>
              <div class="text-xs text-gray-500">{{ chosenItem.durationMinutes }} min de actividad</div>
            </div>
          </div>

          <div v-if="heroProgress" class="h-2 rounded bg-gray-200 overflow-hidden">
            <div
              class="h-full rounded transition-all"
              :class="heroProgress.pct > 100 ? 'bg-amber-400' : 'bg-green-500'"
              :style="{ width: Math.min(100, heroProgress.pct) + '%' }"
            />
          </div>

          <div v-if="canManage.schedule" class="flex flex-wrap gap-2 pt-1">
            <Button
              v-if="chosenItem.status === 'pending'"
              size="sm"
              @click="doStart"
            >
              ▶ Iniciar
            </Button>
            <template v-if="chosenItem.status === 'active'">
              <Button size="sm" variant="default" @click="doComplete">✓ Completar</Button>
              <Button size="sm" variant="outline" @click="doShift(-5)">−5 min</Button>
              <Button size="sm" variant="outline" @click="doShift(5)">+5 min</Button>
            </template>
          </div>
        </CardContent>
      </Card>

      <!-- ── Barra sticky: selector + búsqueda ── -->
      <Card class="sticky top-0 z-10 screen-only">
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
          <Button v-if="isManual" variant="ghost" size="sm" @click="selectedItemId = null">
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

      <!-- ── En escena ── -->
      <section class="screen-only space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-semibold">En escena</h2>
          <Button v-if="chosenItem" variant="outline" size="sm" @click="printBriefing">🖨 Imprimir</Button>
        </div>
        <p class="text-sm text-gray-600 -mt-2">
          Día {{ chosenItem.day }} · {{ fmtTime(chosenItem.startTime) }} — {{ chosenItem.name }}
          <span v-if="chosenItem.location" class="text-gray-500">· 📍 {{ chosenItem.location }}</span>
        </p>

        <div
          v-if="documentsFailed"
          class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2"
        >
          ⚠️ No se pudieron cargar los documentos por servidor — el resto del briefing funciona.
        </div>

        <div v-if="!groups.onStage.length" class="text-gray-500 text-sm">
          Nadie asignado a esta actividad.
          <RouterLink
            v-if="canManage.schedule"
            :to="`/app/retreats/${retreatId}/asignar-responsables`"
            class="text-blue-700 hover:underline"
          >
            Asignar responsables
          </RouterLink>
        </div>
        <div v-else-if="!visibleOnStage.length" class="text-gray-400 text-sm">
          Sin resultados para la búsqueda.
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Card
            v-for="b in visibleOnStage"
            :key="b.participantId"
            data-testid="briefing-card"
            class="cursor-pointer hover:border-blue-400 transition-colors"
            @click="openDetail(b)"
          >
            <CardContent class="pt-4">
              <button
                type="button"
                class="w-full text-left space-y-1 focus:outline-none focus:ring-2 focus:ring-blue-400 rounded"
                @click.stop="openDetail(b)"
                @keydown.enter.prevent="openDetail(b)"
              >
                <span class="block font-medium">{{ b.label }}</span>
                <span class="flex flex-wrap gap-1.5 text-xs">
                  <Badge v-for="role in b.rolesHere" :key="role" variant="default">🎤 {{ role }}</Badge>
                  <Badge v-if="mesaOf(b)" variant="secondary">🪑 {{ mesaOf(b) }}</Badge>
                </span>
                <span v-if="chosenItem?.location" class="block text-xs text-gray-500">📍 {{ chosenItem.location }}</span>
                <span v-if="docCount(b)" class="block text-xs text-emerald-700">📎 {{ docCount(b) }} documento(s)</span>
              </button>
            </CardContent>
          </Card>
        </div>

        <!-- Picker inline de responsables (solo gestión): el PATCH es add-only -->
        <div v-if="canManage.schedule" class="flex flex-wrap items-center gap-2 border-t pt-3">
          <span class="text-sm text-gray-600">Agregar responsable:</span>
          <select
            v-model="pickerPid"
            class="border rounded px-2 py-1.5 text-sm bg-white dark:bg-transparent min-w-0 max-w-56"
          >
            <option value="">Elegir servidor…</option>
            <option v-for="s in pickerCandidates" :key="s.participantId" :value="s.participantId">
              {{ s.label }}
            </option>
          </select>
          <Button size="sm" :disabled="!pickerPid || addingResponsable" @click="addResponsable">
            {{ addingResponsable ? 'Agregando…' : 'Agregar' }}
          </Button>
          <span class="text-xs text-gray-400">quitar desde Asignar responsables</span>
        </div>
      </section>

      <!-- ── Los demás servidores ── -->
      <section class="screen-only space-y-3">
        <h2 class="text-lg font-semibold">Los demás servidores</h2>

        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-xs text-gray-500 mr-1">Mesa:</span>
          <button
            type="button"
            class="px-2.5 py-1 rounded-full text-xs border transition-colors"
            :class="!mesaFilter ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:border-gray-500'"
            @click="mesaFilter = ''"
          >
            Todas
          </button>
          <button
            v-for="m in mesasAvailable"
            :key="m"
            type="button"
            class="px-2.5 py-1 rounded-full text-xs border transition-colors"
            :class="mesaFilter === m ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:border-gray-500'"
            @click="mesaFilter = mesaFilter === m ? '' : m"
          >
            {{ m }}
          </button>
          <span class="text-xs text-gray-500 mx-1">·</span>
          <button
            type="button"
            class="px-2.5 py-1 rounded-full text-xs border transition-colors"
            :class="!docFilter ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:border-gray-500'"
            @click="docFilter = ''"
          >
            Todos
          </button>
          <button
            type="button"
            class="px-2.5 py-1 rounded-full text-xs border transition-colors"
            :class="docFilter === 'docs' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:border-gray-500'"
            @click="docFilter = docFilter === 'docs' ? '' : 'docs'"
          >
            📎 con documentos
          </button>
          <button
            type="button"
            class="px-2.5 py-1 rounded-full text-xs border transition-colors"
            :class="docFilter === 'sin-momentos' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:border-gray-500'"
            @click="docFilter = docFilter === 'sin-momentos' ? '' : 'sin-momentos'"
          >
            sin momentos
          </button>
        </div>

        <div v-if="!visibleOthers.length" class="text-gray-500 text-sm">
          Sin servidores para este filtro.
        </div>
        <div v-else class="space-y-2">
          <button
            v-for="b in visibleOthers"
            :key="b.participantId"
            type="button"
            data-testid="briefing-row"
            class="w-full text-left border rounded p-3 flex flex-wrap items-center gap-x-4 gap-y-1 cursor-pointer hover:border-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
            @click="openDetail(b)"
          >
            <span class="font-medium min-w-40">{{ b.label }}</span>
            <span v-if="b.nextMoment" class="text-sm text-gray-700">
              próximo: {{ fmtTime(b.nextMoment.item.startTime) }} · {{ b.nextMoment.item.name }}
            </span>
            <span v-else class="text-sm text-gray-400">sin momentos asignados</span>
            <span v-if="mesaOf(b)" class="text-xs text-gray-500">🪑 {{ mesaOf(b) }}</span>
            <span v-if="docCount(b)" class="text-xs text-emerald-700">📎 {{ docCount(b) }}</span>
          </button>
        </div>
      </section>

      <!-- ── Versión de impresión (A4): solo visible en papel ── -->
      <div class="print-only">
        <h1 class="text-lg font-bold">En escena — {{ chosenItem.name }}</h1>
        <p class="text-sm">
          Día {{ chosenItem.day }} · {{ fmtTime(chosenItem.startTime) }}
          <span v-if="chosenItem.location"> · Lugar: {{ chosenItem.location }}</span>
        </p>
        <table class="w-full mt-3 text-sm border-collapse">
          <thead>
            <tr>
              <th class="border px-2 py-1 text-left">Servidor</th>
              <th class="border px-2 py-1 text-left">Rol</th>
              <th class="border px-2 py-1 text-left">Mesa</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in groups.onStage" :key="b.participantId">
              <td class="border px-2 py-1">{{ b.label }}</td>
              <td class="border px-2 py-1">{{ b.rolesHere.join(', ') }}</td>
              <td class="border px-2 py-1">{{ mesaOf(b) ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <Card v-else-if="scheduleStore.items.length > 0">
      <CardContent class="pt-6 text-sm text-gray-600">
        No hay actividad en curso. Inicia la actividad actual desde el
        <strong>Minuto a Minuto</strong>
        <template v-if="canManage.schedule"> o elige otra con el selector de arriba.</template>
        <template v-else> — o pide al coordinador que la inicie.</template>
      </CardContent>
    </Card>

    <Card v-else>
      <CardContent class="pt-6 text-sm text-gray-600">
        El Minuto a Minuto de este retiro está vacío. Materializa el horario desde
        <strong>Minuto a Minuto</strong> para ver el briefing.
      </CardContent>
    </Card>

    <!-- ── Briefing del servidor ── -->
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
  useToast,
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
const { toast } = useToast();

const loading = ref(false);
const documents = ref<Record<string, any> | null>(null);
const documentsFailed = ref(false);
const selectedItemId = ref<string | null>(null); // null = automático
const searchQuery = ref('');
const detailParticipantId = ref<string | null>(null);
const pickerPid = ref('');
const addingResponsable = ref(false);
const mesaFilter = ref('');
const docFilter = ref<'' | 'docs' | 'sin-momentos'>('');
const now = ref(Date.now());
let nowTimer: any = null;
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

const visibleOthers = computed(() =>
  groups.value.others.filter((b) => {
    if (!matchesSearch(b)) return false;
    if (mesaFilter.value) {
      const mesa = mesaOf(b);
      if (!mesa || !mesa.toLowerCase().includes(mesaFilter.value.toLowerCase())) return false;
    }
    if (docFilter.value === 'docs' && docCount(b) === 0) return false;
    if (docFilter.value === 'sin-momentos' && b.nextMoment) return false;
    return true;
  }),
);

const mesasAvailable = computed(() => {
  const names = new Set<string>();
  for (const b of [...groups.value.onStage, ...groups.value.others]) {
    const m = mesaOf(b);
    if (m) names.add(m.split(' (')[0]);
  }
  return [...names].sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || a.localeCompare(b));
});

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

// ── Hero: progreso y countdown ──
const heroProgress = computed(() => {
  const it = chosenItem.value;
  if (!it) return null;
  if (it.status !== 'active') return null;
  const start = new Date(it.actualStartTime || it.startTime).getTime();
  const end = start + (it.durationMinutes || 0) * 60_000;
  if (Number.isNaN(start)) return null;
  const pct = ((now.value - start) / (end - start)) * 100;
  return {
    pct: Math.round(Number.isNaN(pct) ? 0 : pct),
    minutesElapsed: Math.max(0, Math.round((now.value - start) / 60_000)),
    duration: it.durationMinutes,
  };
});

const minutesUntilChosen = computed(() => {
  const it = chosenItem.value;
  if (!it || it.status !== 'pending') return null;
  return Math.round((new Date(it.startTime).getTime() - now.value) / 60_000);
});

// ── Controles de actividad (gestión) ──
async function doStart() {
  const it = chosenItem.value;
  if (!it) return;
  try {
    await scheduleStore.start(it.id);
    toast({ title: `▶ Inició: ${it.name}` });
  } catch {
    toast({ title: 'No se pudo iniciar', variant: 'destructive' as any });
  }
}

async function doComplete() {
  const it = chosenItem.value;
  if (!it) return;
  try {
    await scheduleStore.complete(it.id);
    toast({ title: `✓ Completó: ${it.name}` });
  } catch {
    toast({ title: 'No se pudo completar', variant: 'destructive' as any });
  }
}

async function doShift(minutes: number) {
  const it = chosenItem.value;
  if (!it) return;
  try {
    await scheduleStore.shift(it.id, minutes);
  } catch {
    toast({ title: `No se pudo mover ${minutes > 0 ? '+' : ''}${minutes} min`, variant: 'destructive' as any });
  }
}

// ── Picker inline de responsables (add-only: el backend hace merge) ──
const pickerCandidates = computed(() => {
  const assigned = new Set((chosenItem.value?.responsables ?? []).map((r) => r.participantId));
  return groups.value.others.filter((b) => !assigned.has(b.participantId));
});

async function addResponsable() {
  const it = chosenItem.value;
  const pid = pickerPid.value;
  if (!it || !pid) return;
  addingResponsable.value = true;
  try {
    const current = (it.responsables ?? []).map((r) => r.participantId);
    await scheduleStore.updateItem(it.id, { responsableParticipantIds: [...current, pid] });
    // El item parchado puede venir sin la relación responsables: recargar la
    // lista garantiza que el card nuevo aparezca con su rol.
    await scheduleStore.loadForRetreat(retreatId.value);
    pickerPid.value = '';
    toast({ title: 'Responsable agregado' });
  } catch {
    toast({ title: 'No se pudo agregar', variant: 'destructive' as any });
  } finally {
    addingResponsable.value = false;
  }
}

// ── helpers de presentación ──
function openDetail(b: ServerBriefing) {
  detailParticipantId.value = b.participantId;
}

function onDetailOpenChange(v: boolean) {
  if (!v) detailParticipantId.value = null;
}

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

function printBriefing() {
  // El @media print de este componente oculta el chrome de la app y deja
  // solo la tabla .print-only (mismo patrón que el Minuto a Minuto).
  setTimeout(() => window.print(), 50);
}

async function loadDocuments(id: string) {
  documentsFailed.value = false;
  try {
    documents.value = await retreatScheduleApi.assignmentDocuments(id);
  } catch {
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

  void loadDocuments(id);

  if (unsubscribe) unsubscribe();
  unsubscribe = scheduleStore.subscribeRealtime(id, {
    onAttachmentChanged: () => {
      void loadDocuments(id);
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
watch(
  () => route.params.id,
  (v) => {
    if (v && v !== retreatId.value) setup(String(v));
  },
);
</script>

<style scoped>
.print-only {
  display: none;
}

@media print {
  /* Oculta el chrome de la app (mismos selectores que el Minuto a Minuto) */
  body > div > .flex.h-dvh > div:first-child,
  body > div > .flex.h-dvh > button,
  body > div > .flex.h-dvh > .fixed,
  .screen-only {
    display: none !important;
  }

  .print-only {
    display: block !important;
  }

  body,
  html {
    background: white !important;
    color: black !important;
    font-size: 10pt;
  }
}
</style>
