<template>
  <!-- max-w-5xl centra el contenido en pantallas grandes. Antes era 4xl (896px)
       pero al añadir la descripción del template (texto largo bajo el nombre)
       se necesita un poco más de ancho para que el contenido respire. -->
  <div class="space-y-6 print-mam max-w-5xl mx-auto">
    <div class="space-y-3">
      <div class="min-w-0">
        <h1 class="text-xl sm:text-3xl font-bold whitespace-nowrap">Minuto a Minuto</h1>
        <p class="hidden sm:block text-gray-600 text-sm sm:text-base">
          Agenda del retiro en tiempo real. Las notificaciones se envían automáticamente a los
          responsables.
        </p>
        <div class="text-xs mt-1">
          <span v-if="store.connected" class="text-green-600">● conectado (WS)</span>
          <span v-else class="text-gray-400">● sin conexión realtime</span>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 items-center print-hide">
        <!-- Con lista vacía no hay barra de búsqueda; ofrecemos crear/importar aquí.
             Cuando hay items, el "+" vive junto al buscador (icono, ver abajo). -->
        <Button
          v-if="canManage.schedule.value && !store.items.length"
          variant="outline"
          size="sm"
          @click="onAddItem"
        >+ Nueva actividad</Button>
        <Button
          v-if="canManage.schedule.value && !store.items.length"
          variant="outline"
          size="sm"
          @click="onMaterialize"
        >Importar desde template</Button>
        <!-- "Más acciones" se movió junto al buscador (icono ⋮). Con la lista
             vacía (sin barra de búsqueda) se muestra aquí como respaldo. -->
        <MamMoreActions
          v-if="!store.items.length"
          :can-manage="canManage.schedule.value"
          :public-mam-url="publicMamUrl"
          v-model:group-by="groupBy"
          :open="moreActionsOpen"
          @update:open="moreActionsOpen = $event"
          @ring-bell="onRingBell"
          @print="onPrint"
          @download-bundle="onDownloadBundle"
          @copy-public-link="onCopyPublicLink"
          @help="helpOpen = true"
          @relink="onRelinkResponsibilities"
          @assign-responsables="goAssignResponsables"
          @resolve-santisimo="onResolveSantisimo"
          @materialize="onMaterialize"
        />
      </div>
    </div>

    <Card v-if="store.items.length" class="border-blue-100 sticky top-0 z-20 bg-white shadow-sm">
      <CardContent class="pt-4 pb-4">
        <div class="flex flex-wrap items-center gap-2">
          <div class="relative flex-1 min-w-[200px]">
            <Input
              v-model="searchQuery"
              placeholder="🔍 Buscar por hora, nombre, responsabilidad, participante..."
              class="pr-8"
              @keydown.enter.prevent="onSearchNext"
              @keydown.esc="clearSearch"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-lg leading-none"
              @click="clearSearch"
              aria-label="Limpiar búsqueda"
            >×</button>
          </div>
          <Button
            v-if="searchMatches.length > 0"
            variant="outline"
            size="sm"
            @click="onSearchNext"
            :title="`Mostrar siguiente coincidencia (${searchIndex + 1}/${searchMatches.length})`"
          >
            ↓ {{ searchIndex + 1 }}/{{ searchMatches.length }}
          </Button>
          <span v-else-if="searchQuery" class="text-xs text-gray-500 px-2">
            Sin resultados
          </span>
          <!-- Acciones rápidas junto al buscador: crear y "ir a ahora" (solo ícono + tooltip).
               El toggle de agrupación vive ahora en "⋮ Más acciones → Vista". -->
          <Button
            v-if="canManage.schedule.value"
            variant="outline"
            size="sm"
            title="Nueva actividad"
            aria-label="Nueva actividad"
            @click="onAddItem"
          >+</Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="!nextTodayItemId"
            title="Ir a la próxima actividad pendiente de hoy"
            aria-label="Ir a la próxima actividad pendiente de hoy"
            @click="goToNow"
          >⏱</Button>
          <MamMoreActions
            icon-only
            :can-manage="canManage.schedule.value"
            :public-mam-url="publicMamUrl"
            v-model:group-by="groupBy"
            v-model:open="moreActionsOpen"
            @ring-bell="onRingBell"
            @print="onPrint"
            @download-bundle="onDownloadBundle"
            @copy-public-link="onCopyPublicLink"
            @help="helpOpen = true"
            @relink="onRelinkResponsibilities"
            @assign-responsables="goAssignResponsables"
            @resolve-santisimo="onResolveSantisimo"
            @materialize="onMaterialize"
          />
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardContent class="pt-6">
        <div v-if="store.loading">Cargando…</div>
        <div v-else-if="!store.items.length" class="text-gray-500">
          Aún no hay actividades para este retiro. Pulsa «Importar desde template» para generar
          la agenda inicial.
        </div>
        <div v-else>
          <div v-for="[groupKey, items] in groupedItems" :key="groupKey" class="mb-8">
            <!-- Day / Responsibility header con resumen -->
            <div class="flex flex-wrap items-baseline gap-2 sm:gap-3 mb-2 pb-1 border-b border-gray-200">
              <h2 class="text-lg font-semibold">
                <span v-if="groupBy === 'day'">
                  Día {{ groupKey }}
                  <span class="text-sm text-gray-500 font-normal ml-2">{{ dayDateLabel(Number(groupKey)) }}</span>
                </span>
                <span v-else>🎤 {{ groupKey }}</span>
              </h2>
              <span class="text-xs text-gray-500">
                {{ groupSummary(items) }}
              </span>
              <!-- Resumen de desajustes del día (solo agrupación por día) -->
              <span
                v-if="groupBy === 'day' && dayGapSummary(items).total > 0"
                class="text-xs font-medium"
                :class="dayGapSummary(items).overlaps > 0 ? 'text-amber-700' : 'text-gray-500'"
              >
                <template v-if="dayGapSummary(items).overlaps > 0">⚠ {{ dayGapSummary(items).overlaps }} solape{{ dayGapSummary(items).overlaps > 1 ? 's' : '' }}</template>
                <template v-if="dayGapSummary(items).overlaps > 0 && dayGapSummary(items).gaps > 0"> · </template>
                <template v-if="dayGapSummary(items).gaps > 0">{{ dayGapSummary(items).gaps }} hueco{{ dayGapSummary(items).gaps > 1 ? 's' : '' }}</template>
              </span>
              <div v-if="groupBy === 'day' && canManage.schedule.value" class="ml-auto flex items-center gap-3">
                <button
                  v-if="dayGapSummary(items).total > 0"
                  type="button"
                  class="text-xs text-blue-600 hover:underline"
                  title="Cerrar todos los huecos y solapes del día: cada actividad empieza cuando termina la anterior"
                  @click="onCompactDay(items)"
                >
                  🧹 Compactar día
                </button>
                <button
                  type="button"
                  class="text-xs text-blue-600 hover:underline"
                  :title="'Mover todos los items del Día ' + groupKey + ' por ±N minutos'"
                  @click="onShiftDay(Number(groupKey))"
                >
                  ⏱ Mover día
                </button>
              </div>
            </div>
            <!-- Compact rows -->
            <div class="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <template v-for="(item, idx) in items" :key="item.id">
                <!-- "Ahora" line: solo en grouping by day, entre items pasado/futuro del día actual -->
                <div
                  v-if="shouldShowNowLine(items, idx)"
                  class="relative flex items-center px-3 py-1 bg-rose-50 border-y border-rose-200"
                >
                  <div class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-full bg-rose-500"></div>
                  <span class="text-xs font-semibold text-rose-700 uppercase tracking-wide">
                    ⏵ ahora · {{ fmtNow() }}
                  </span>
                </div>

                <div
                  :id="`schedule-item-${item.id}`"
                  class="group flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 border-t first:border-t-0 transition-colors"
                  :class="[
                    rowCompactClass(item),
                    canManage.schedule.value ? 'cursor-pointer' : '',
                    highlightedItemId === item.id ? 'ring-2 ring-blue-500 ring-inset bg-blue-50' : '',
                    dragOverItemId === item.id ? 'ring-2 ring-purple-500 ring-inset bg-purple-50' : '',
                    draggingItemId === item.id ? 'opacity-50' : '',
                  ]"
                  :draggable="canManage.schedule.value && groupBy === 'day'"
                  @dragstart="onDragStart($event, item, Number(groupKey))"
                  @dragover.prevent="onDragOver($event, item, Number(groupKey))"
                  @dragleave="onDragLeave(item)"
                  @drop="onDrop($event, item, items, Number(groupKey))"
                  @dragend="onDragEnd()"
                  @click="canManage.schedule.value && onEditItem(item)"
                >
                  <!-- HORA: fila completa pequeña en móvil (horizontal); columna a la
                       izquierda en desktop. relative-time oculto en print. -->
                  <div class="flex items-center gap-2 text-gray-400 sm:flex-col sm:items-start sm:gap-0 sm:w-[72px] sm:shrink-0 sm:order-1 leading-tight">
                    <span class="text-sm font-mono font-semibold whitespace-nowrap text-gray-900">{{ clockParts(item.startTime).hm }}<span class="text-[9px] font-normal text-gray-500 ml-0.5">{{ clockParts(item.startTime).mer }}</span></span>
                    <span class="text-[11px] sm:text-[10px] whitespace-nowrap">{{ item.durationMinutes }}m · {{ clockParts(item.endTime).hm }}</span>
                    <span class="text-[11px] sm:text-[9px] print:hidden relative-time">{{ relativeTime(item) }}</span>
                  </div>

                  <!-- Acciones: en móvil van a la derecha de la hora (misma fila);
                       en desktop a la derecha del todo. Siempre visibles en móvil. -->
                  <div
                    v-if="canManage.schedule.value"
                    class="flex items-center gap-0.5 shrink-0 ml-auto sm:order-3 transition-opacity"
                    :class="item.status === 'active'
                      ? 'opacity-100'
                      : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100'"
                    @click.stop
                  >
                    <button
                      v-if="item.status === 'pending' || item.status === 'delayed'"
                      type="button"
                      class="inline-flex items-center justify-center h-8 w-8 sm:h-auto sm:w-auto sm:p-1.5 rounded-full hover:bg-green-100 text-green-600"
                      title="Iniciar (Enter)"
                      @click="onStart(item.id)"
                    >▶</button>
                    <button
                      v-if="item.status === 'active'"
                      type="button"
                      class="inline-flex items-center justify-center h-8 w-8 sm:h-auto sm:w-auto sm:p-1.5 rounded-full hover:bg-blue-100 text-blue-600 font-semibold text-xs"
                      title="Completar"
                      @click="onComplete(item.id)"
                    >✓</button>
                    <!-- Shift: tap-targets de 32px en móvil (WCAG 2.5.5) sin abrir el modal. -->
                    <button
                      type="button"
                      class="inline-flex items-center justify-center h-8 w-8 sm:h-auto sm:w-auto sm:p-1 rounded text-gray-500 hover:text-gray-700 active:bg-gray-200 hover:bg-gray-100 text-xs font-mono"
                      title="Adelantar 5 minutos"
                      @click="onShift(item.id, -5)"
                    >−5</button>
                    <button
                      type="button"
                      class="inline-flex items-center justify-center h-8 w-8 sm:h-auto sm:w-auto sm:p-1 rounded text-gray-500 hover:text-gray-700 active:bg-gray-200 hover:bg-gray-100 text-xs font-mono"
                      title="Atrasar 5 minutos"
                      @click="onShift(item.id, 5)"
                    >+5</button>
                  </div>

                  <!-- ACTIVIDAD: fila completa en móvil (basis-full); centro flexible en desktop. -->
                  <div class="basis-full sm:basis-0 sm:flex-1 min-w-0 sm:order-2">
                    <div class="flex items-center gap-2 flex-wrap text-sm">
                      <!-- Status inline (solo si no es pending) -->
                      <span
                        v-if="item.status !== 'pending'"
                        class="shrink-0 inline-flex items-center"
                        :title="item.status === 'active' ? 'En curso' : item.status === 'completed' ? 'Completado' : item.status === 'delayed' ? 'Retrasado' : 'Saltado'"
                      >
                        <span v-if="item.status === 'active'" class="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span v-else-if="item.status === 'completed'" class="text-green-500 text-sm">✓</span>
                        <span v-else-if="item.status === 'delayed'" class="text-amber-500 text-sm">⚠</span>
                        <span v-else-if="item.status === 'skipped'" class="text-gray-400 text-sm">⊘</span>
                      </span>
                      <span
                        v-if="groupBy === 'responsibility'"
                        class="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 leading-tight"
                      >D{{ item.day }}</span>
                      <span class="font-medium min-w-0 line-clamp-2 sm:line-clamp-1" :class="item.status === 'completed' ? 'text-gray-400 line-through' : ''">{{ item.name }}</span>
                      <!-- Type badge: oculta en mobile (ya transmitido por el color de la fila) -->
                      <span
                        class="hidden sm:inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium leading-tight"
                        :class="typeBadgeClass(item.type)"
                      >{{ item.type }}</span>
                      <span v-if="item.blocksSantisimoAttendance" class="text-amber-600 text-xs" title="Bloquea Santísimo">🚫</span>
                    </div>
                    <div class="flex items-center gap-2 sm:gap-3 text-xs mt-0.5 text-gray-600 flex-wrap">
                      <!-- Responsable principal: visible siempre — info crítica -->
                      <span v-if="responsabilityName(item.responsabilityId)" class="text-blue-700 truncate min-w-0">
                        🎤 {{ responsabilityName(item.responsabilityId) }}<span
                          v-if="responsableParticipantName(item.responsabilityId)"
                          class="font-semibold"
                        > · {{ responsableParticipantName(item.responsabilityId) }}</span>
                        <span v-else class="text-amber-600 italic"> · sin asignar</span>
                      </span>
                      <!-- Apoyos: solo desktop -->
                      <span v-if="item.responsables?.length" class="hidden sm:inline text-gray-500 truncate">
                        👤
                        <span v-for="(r, i) in item.responsables" :key="r.id || i">{{ r.participant?.nickname || r.participant?.firstName || '—' }}<template v-if="i < (item.responsables?.length ?? 0) - 1">, </template></span>
                      </span>
                      <!-- Palanquita: solo desktop -->
                      <span v-if="item.palanquitaNotes" class="hidden sm:inline text-gray-400 truncate">🎵 {{ item.palanquitaNotes }}</span>
                      <button
                        v-if="item.attachments?.length"
                        type="button"
                        class="text-emerald-700 hover:underline shrink-0"
                        :title="`${item.attachments.length} documento(s) del template`"
                        @click.stop="onShowAttachments(item)"
                      >📎 {{ item.attachments.length }}</button>
                    </div>
                    <!-- Descripción del template: contexto del "qué/por qué"
                         de la actividad. Colapsable por click en el chevron;
                         siempre visible en print. -->
                    <div
                      v-if="item.templateDescription"
                      class="text-xs text-gray-600 mt-1 leading-snug template-description"
                      :class="expandedDescriptions.has(item.id) ? '' : 'line-clamp-1'"
                      @click.stop="toggleDescription(item.id)"
                      :title="expandedDescriptions.has(item.id) ? 'Click para colapsar' : 'Click para ver descripción completa'"
                    >
                      <span class="text-gray-400 mr-1">📝</span>{{ item.templateDescription }}
                    </div>
                  </div>

                </div>

                <!-- Indicador de desajuste: hueco (gris) o solape (ámbar) con la
                     siguiente actividad, + acciones para corregirlo. -->
                <div
                  v-if="gapBetween(items, idx) !== null"
                  class="flex flex-wrap items-center gap-2 px-3 py-1 text-xs border-t"
                  :class="(gapBetween(items, idx) ?? 0) < 0
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-gray-50 text-gray-500'"
                >
                  <span class="font-medium">
                    <template v-if="(gapBetween(items, idx) ?? 0) < 0">
                      ⚠ Se encima {{ Math.abs(gapBetween(items, idx) ?? 0) }} min con la siguiente
                    </template>
                    <template v-else>
                      Hueco de {{ gapBetween(items, idx) }} min hasta la siguiente
                    </template>
                  </span>
                  <div
                    v-if="canManage.schedule.value"
                    class="flex items-center gap-2 ml-auto"
                  >
                    <button
                      v-if="canFixByDuration(items, idx)"
                      type="button"
                      class="text-blue-600 hover:underline"
                      title="Ajustar la duración de esta actividad para que termine cuando empieza la siguiente"
                      @click="onFixByDuration(items, idx)"
                    >Ajustar duración</button>
                    <button
                      type="button"
                      class="text-blue-600 hover:underline"
                      title="Mover la siguiente actividad (y posteriores) para que empiece cuando esta termina"
                      @click="onFixByMovingNext(items, idx)"
                    >Mover el siguiente</button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <ScheduleItemEditModal
      :open="itemModalOpen"
      :mode="itemModalMode"
      :item="editingItem"
      :retreat-id="retreatId"
      :participants="participantsForRetreat"
      :responsibilities="responsibilities"
      @update:open="itemModalOpen = $event"
      @submit="onSubmitItem"
      @delete="onDeleteItem"
    />

    <ResponsabilityAttachmentsDialog
      v-if="attachmentsTarget"
      :open="attachmentsDialogOpen"
      :responsability-name="attachmentsTarget.responsabilityName"
      :context-label="attachmentsTarget.contextLabel"
      :can-manage="false"
      @update:open="(v: boolean) => onAttachmentsDialog(v)"
    />

    <MamHelpDialog :open="helpOpen" @update:open="(v: boolean) => helpOpen = v" />

    <Dialog :open="materializeOpen" @update:open="materializeOpen = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar agenda desde template</DialogTitle>
        </DialogHeader>
        <div class="space-y-3">
          <div>
            <Label>Template</Label>
            <select v-model="selectedSetId" class="w-full border rounded px-2 py-2">
              <option v-for="s in store.templateSets" :key="s.id" :value="s.id">
                {{ s.name }}{{ s.isDefault ? ' (predeterminado)' : '' }}
              </option>
            </select>
            <p v-if="selectedSet?.description" class="text-xs text-gray-500 mt-1">
              {{ selectedSet.description }}
            </p>
          </div>
          <div>
            <Label>Fecha base (día 1)</Label>
            <Input v-model="baseDate" type="date" />
          </div>
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="clearExisting" />
            Reemplazar agenda actual
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="materializeOpen = false">Cancelar</Button>
          <Button @click="confirmMaterialize">Importar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
  Badge,
  useToast,
} from '@repo/ui';
import { useScheduleStore } from '@/stores/scheduleStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useMyParticipantId } from '@/composables/useMyParticipantId';
import { useAuthPermissions } from '@/composables/useAuthPermissions';
import { useResponsabilityStore } from '@/stores/responsabilityStore';
import ScheduleItemEditModal, { type SubmitPayload as ItemSubmitPayload } from '@/components/ScheduleItemEditModal.vue';
import ResponsabilityAttachmentsDialog from '@/components/ResponsabilityAttachmentsDialog.vue';
import MamHelpDialog from '@/components/MamHelpDialog.vue';
import MamMoreActions from '@/components/MamMoreActions.vue';
import { api, retreatScheduleApi, apiErrorMessage, type RetreatScheduleItemDTO } from '@/services/api';
import type { Participant, Responsability } from '@repo/types';
import { durationToFill, retreatGapAfter, computeCompactPlan } from '@/views/mamTime';

const route = useRoute();
const router = useRouter();
const store = useScheduleStore();
const retreatStore = useRetreatStore();
const { canManage } = useAuthPermissions();
const responsabilityStore = useResponsabilityStore();
const { toast } = useToast();

const retreatId = computed(
  () => (route.params.id as string) || retreatStore.selectedRetreatId || '',
);

const materializeOpen = ref(false);
const clearExisting = ref(false);
const baseDate = ref('');
const selectedSetId = ref<string>('');

// Group view ('day' = por día cronológico, 'responsibility' = por equipo asignado)
const GROUP_STORAGE_KEY = 'minuteByMinute.groupBy';
const groupBy = ref<'day' | 'responsibility'>(
  (typeof localStorage !== 'undefined' && (localStorage.getItem(GROUP_STORAGE_KEY) as 'day' | 'responsibility')) || 'day',
);
watch(groupBy, (v) => {
  try { localStorage.setItem(GROUP_STORAGE_KEY, v); } catch { /* ignore localStorage errors */ }
});

const groupedItems = computed<Array<[string | number, any[]]>>(() => {
  if (groupBy.value === 'day') {
    return Array.from(store.itemsByDay.entries()).map(([day, items]) => [day, items]);
  }
  // Group by responsibility name; items without responsibility go to "Sin asignar"
  const map = new Map<string, any[]>();
  for (const item of store.items) {
    const name = responsabilityName(item.responsabilityId) ?? 'Sin asignar';
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(item);
  }
  // Sort items within each group by day, then by startTime
  for (const arr of map.values()) {
    arr.sort((a, b) => {
      if ((a.day ?? 0) !== (b.day ?? 0)) return (a.day ?? 0) - (b.day ?? 0);
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });
  }
  // Sort groups: "Sin asignar" last, rest alphabetically
  return Array.from(map.entries()).sort(([a], [b]) => {
    if (a === 'Sin asignar') return 1;
    if (b === 'Sin asignar') return -1;
    return a.localeCompare(b, 'es');
  });
});

// Search state
const searchQuery = ref('');
const searchIndex = ref(0);
const highlightedItemId = ref<string | null>(null);

const searchMatches = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return [];
  return store.items.filter((i: any) => {
    if ((i.name ?? '').toLowerCase().includes(q)) return true;
    if ((i.description ?? '').toLowerCase().includes(q)) return true;
    if ((i.palanquitaNotes ?? '').toLowerCase().includes(q)) return true;
    if (i.startTime && fmtTime(i.startTime).toLowerCase().includes(q)) return true;
    const respName = responsabilityName(i.responsabilityId);
    if (respName && respName.toLowerCase().includes(q)) return true;
    const partName = responsableParticipantName(i.responsabilityId);
    if (partName && partName.toLowerCase().includes(q)) return true;
    return false;
  });
});

let searchDebounce: ReturnType<typeof setTimeout> | null = null;
watch(searchQuery, (q) => {
  searchIndex.value = 0;
  if (searchDebounce) clearTimeout(searchDebounce);
  if (!q.trim()) {
    highlightedItemId.value = null;
    return;
  }
  searchDebounce = setTimeout(() => {
    const matches = searchMatches.value;
    if (matches.length > 0) scrollToItem(matches[0].id);
  }, 200);
});

let highlightClearTimer: ReturnType<typeof setTimeout> | null = null;
function scrollToItem(id: string, autoClear = false) {
  highlightedItemId.value = id;
  const doScroll = () => {
    const el = document.getElementById(`schedule-item-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  // Doble pasada: nextTick para el primer render y otra tras ~250ms para ganarle
  // a la restauración de foco de reka-ui (al cerrar el modal vuelve el foco al
  // disparador, lo que puede provocar un scroll que pelea con el nuestro).
  nextTick(doScroll);
  setTimeout(doScroll, 250);
  // Auto-limpiar el resaltado tras unos segundos (para crear/editar/arreglar;
  // la búsqueda no lo pide para no perder el seguimiento de coincidencias).
  if (highlightClearTimer) clearTimeout(highlightClearTimer);
  if (autoClear) {
    highlightClearTimer = setTimeout(() => {
      if (highlightedItemId.value === id) highlightedItemId.value = null;
    }, 4000);
  }
}

function onSearchNext() {
  const matches = searchMatches.value;
  if (matches.length === 0) return;
  // Si hay highlight activo en una match, avanzar; si no, ir al primero
  const currentIdx = matches.findIndex((m: any) => m.id === highlightedItemId.value);
  searchIndex.value = currentIdx >= 0 ? (currentIdx + 1) % matches.length : 0;
  scrollToItem(matches[searchIndex.value].id);
}

function clearSearch() {
  searchQuery.value = '';
  searchIndex.value = 0;
  highlightedItemId.value = null;
}

// Item edit modal state
const itemModalOpen = ref(false);
const itemModalMode = ref<'add' | 'edit'>('add');
const editingItem = ref<RetreatScheduleItemDTO | null>(null);

// Attachments dialog state (read-only desde el retiro: viven en la Responsabilidad)
const attachmentsDialogOpen = ref(false);
const attachmentsTarget = ref<{ responsabilityName: string; contextLabel: string } | null>(null);

function onShowAttachments(item: RetreatScheduleItemDTO) {
  const name = responsabilityName(item.responsabilityId);
  if (!name) return;
  attachmentsTarget.value = { responsabilityName: name, contextLabel: item.name };
  attachmentsDialogOpen.value = true;
}

function onAttachmentsDialog(v: boolean) {
  attachmentsDialogOpen.value = v;
  if (!v) attachmentsTarget.value = null;
}
const participantsForRetreat = ref<Array<Pick<Participant, 'id' | 'firstName' | 'lastName' | 'nickname'>>>([]);

const responsibilities = computed<Responsability[]>(
  () => (responsabilityStore.responsibilities ?? []) as Responsability[],
);

function responsabilityName(id?: string | null): string | null {
  if (!id) return null;
  const r = responsibilities.value.find((x) => x.id === id);
  return r?.name ?? null;
}

function responsableParticipantName(id?: string | null): string | null {
  if (!id) return null;
  const r = responsibilities.value.find((x) => x.id === id);
  const p = r?.participant;
  if (!p) return null;
  return p.nickname || `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || null;
}

async function loadParticipantsForRetreat(id: string) {
  if (!id) return;
  try {
    const r = await api.get('/participants', { params: { retreatId: id } });
    participantsForRetreat.value = (r.data || []).map((p: any) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      nickname: p.nickname,
    }));
  } catch {
    participantsForRetreat.value = [];
  }
}

function onAddItem() {
  itemModalMode.value = 'add';
  editingItem.value = null;
  itemModalOpen.value = true;
}

function goAssignResponsables() {
  router.push({ name: 'asignar-responsables', params: { id: retreatId.value } });
}

async function onRelinkResponsibilities() {
  const force = window.confirm(
    '¿Sobrescribir vinculaciones actuales?\n\n' +
      '• Aceptar: re-asigna TODOS los items según el template (recomendado tras cambios al template)\n' +
      '• Cancelar: solo vincula items que aún no tienen responsable',
  );
  try {
    const r = await retreatScheduleApi.relinkResponsibilities(retreatId.value, force);
    toast({
      title: '🔗 Re-vinculación completa',
      description: `${r.linked} ${force ? 'reasignados' : 'vinculados'}, ${r.alreadyLinked} ya estaban, ${r.noMatch} sin match.`,
    });
    await store.loadForRetreat(retreatId.value);
  } catch (err) {
    console.error(err);
    toast({
      title: 'Error',
      description: 'No se pudo re-vincular.',
      variant: 'destructive',
    });
  }
}

function onEditItem(item: RetreatScheduleItemDTO) {
  itemModalMode.value = 'edit';
  editingItem.value = item;
  itemModalOpen.value = true;
}

async function onSubmitItem(payload: ItemSubmitPayload) {
  if (!retreatId.value) return;
  try {
    let targetId: string | null = null;
    if (itemModalMode.value === 'add') {
      const created = await store.createItem(retreatId.value, payload);
      targetId = created?.id ?? null;
      toast({ title: 'Actividad creada' });
    } else if (editingItem.value) {
      await store.updateItem(editingItem.value.id, payload);
      targetId = editingItem.value.id;
      toast({ title: 'Actividad actualizada' });
    }
    itemModalOpen.value = false;
    await store.loadForRetreat(retreatId.value);
    // Llevar el scroll a la actividad creada/editada y resaltarla.
    if (targetId) scrollToItem(targetId, true);
  } catch (err: any) {
    toast({
      title: 'Error',
      description: apiErrorMessage(err, 'No se pudo guardar'),
      variant: 'destructive',
    });
  }
}

// ── Drag-to-reorder ───────────────────────────────────────────────────────────
//
// HTML5 native drag-and-drop. Active only when grouping by day and the user
// has `schedule:manage`. Dropping rotates the time slots within the day —
// see backend `reorderDay` for semantics: time windows stay fixed, only the
// item-to-slot mapping changes.
type AnyItem = { id: string; day: number; status?: string };
const draggingItemId = ref<string | null>(null);
const dragOverItemId = ref<string | null>(null);
let draggingFromDay: number | null = null;

// Descriptions are truncated by default; click toggles per-item expansion.
// Reactive Set: a plain Set inside ref isn't deeply reactive in Vue (Set.has
// changes don't trigger re-render), so we keep an array of ids and expose a
// computed Set wrapper. Reading via `.has` works because the computed
// recomputes when the array reactivity fires.
const expandedDescriptionIds = ref<string[]>([]);
const expandedDescriptions = computed(() => new Set(expandedDescriptionIds.value));
function toggleDescription(itemId: string) {
  const idx = expandedDescriptionIds.value.indexOf(itemId);
  if (idx === -1) expandedDescriptionIds.value.push(itemId);
  else expandedDescriptionIds.value.splice(idx, 1);
}

function onDragStart(e: DragEvent, item: AnyItem, day: number) {
  if (!canManage.schedule.value || groupBy.value !== 'day') {
    e.preventDefault();
    return;
  }
  draggingItemId.value = item.id;
  draggingFromDay = day;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    // Setting any payload helps Firefox actually fire `drop` events.
    e.dataTransfer.setData('text/plain', item.id);
  }
}

function onDragOver(e: DragEvent, item: AnyItem, day: number) {
  if (!draggingItemId.value || day !== draggingFromDay) return;
  if (item.id === draggingItemId.value) return;
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  dragOverItemId.value = item.id;
}

function onDragLeave(item: AnyItem) {
  if (dragOverItemId.value === item.id) dragOverItemId.value = null;
}

function onDragEnd() {
  draggingItemId.value = null;
  dragOverItemId.value = null;
  draggingFromDay = null;
}

async function onDrop(e: DragEvent, target: AnyItem, items: AnyItem[], day: number) {
  e.preventDefault();
  const sourceId = draggingItemId.value;
  draggingItemId.value = null;
  dragOverItemId.value = null;
  const fromDay = draggingFromDay;
  draggingFromDay = null;

  if (!sourceId || sourceId === target.id) return;
  if (fromDay !== day) {
    toast({ title: 'Mover entre días no soportado', variant: 'destructive' });
    return;
  }
  if (!retreatId.value) return;

  // Build the new order: remove source, insert it at the target's position.
  const ids = items.map((x) => x.id);
  const fromIdx = ids.indexOf(sourceId);
  const toIdx = ids.indexOf(target.id);
  if (fromIdx === -1 || toIdx === -1) return;
  const newOrder = [...ids];
  newOrder.splice(fromIdx, 1);
  newOrder.splice(toIdx, 0, sourceId);
  if (newOrder.every((id, i) => id === ids[i])) return;

  try {
    await store.reorderDay(retreatId.value, day, newOrder);
    toast({ title: 'Orden actualizado' });
  } catch (err: any) {
    toast({
      title: 'No se pudo reordenar',
      description: apiErrorMessage(err),
      variant: 'destructive',
    });
  }
}

async function onShiftDay(day: number) {
  if (!retreatId.value) return;
  const raw = window.prompt(
    `Mover todos los items del Día ${day} por N minutos (positivo = más tarde, negativo = más temprano):`,
    '15',
  );
  if (raw === null) return;
  const minutesDelta = parseInt(raw, 10);
  if (!Number.isFinite(minutesDelta) || minutesDelta === 0) {
    toast({ title: 'Cantidad inválida', variant: 'destructive' });
    return;
  }
  if (Math.abs(minutesDelta) > 720) {
    if (!confirm(`Vas a mover todo el Día ${day} por ${minutesDelta} minutos (${(minutesDelta / 60).toFixed(1)}h). ¿Confirmás?`)) {
      return;
    }
  }
  try {
    await store.shiftDay(retreatId.value, day, minutesDelta);
    toast({
      title: `Día ${day} desplazado`,
      description: `${minutesDelta > 0 ? '+' : ''}${minutesDelta} min aplicado a todos los items.`,
    });
  } catch (err: any) {
    toast({
      title: 'Error al mover día',
      description: apiErrorMessage(err),
      variant: 'destructive',
    });
  }
}

/**
 * Public big-screen URL for projecting the MaM in the salon. Resolves to
 * `/mam/<slug>` when the retreat has both isPublic + slug. The route is
 * auth-less; the API only exposes data for retreats where isPublic=true.
 */
const publicMamUrl = computed<string | null>(() => {
  const r = retreatStore.selectedRetreat;
  if (!r || !r.slug || !r.isPublic) return null;
  if (typeof window === 'undefined') return null;
  return `${window.location.origin}/mam/${r.slug}`;
});

async function onCopyPublicLink() {
  const url = publicMamUrl.value;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    toast({
      title: 'Link copiado',
      description: 'Pégalo en el navegador del proyector / smart TV.',
    });
  } catch {
    // Fallback: open in new tab so they can copy from the URL bar
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Trigger a browser download of /retreats/:id/bundle.zip. Server streams,
 * client just opens the URL in a hidden anchor — credentials carry via the
 * existing session cookie (same-origin).
 */
function onDownloadBundle() {
  if (!retreatId.value) return;
  const url = `/api/schedule/retreats/${retreatId.value}/bundle.zip`;
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function onPrint() {
  // Cierra cualquier menú abierto y dispara el diálogo nativo de impresión.
  // El stylesheet `@media print` (al final de este componente) oculta sidebar,
  // header de app, y acciones de fila; expande todos los días en formato A4.
  closeMore();
  // Pequeño delay para que el menú se cierre antes de imprimir
  // (algunos browsers capturan el menú abierto como overlay).
  setTimeout(() => window.print(), 50);
}

async function onDeleteItem(id: string) {
  try {
    await store.removeItem(id);
    itemModalOpen.value = false;
    toast({ title: 'Actividad eliminada' });
  } catch (err: any) {
    toast({
      title: 'Error al eliminar',
      description: apiErrorMessage(err),
      variant: 'destructive',
    });
  }
}

const selectedSet = computed(() =>
  store.templateSets.find((s) => s.id === selectedSetId.value) ?? null,
);

let unsubscribe: (() => void) | null = null;

const myParticipantId = useMyParticipantId();

// Reloj reactivo para indicador "ahora" y tiempo relativo. Refresca cada 60s.
const now = ref<number>(Date.now());
let nowTicker: ReturnType<typeof setInterval> | null = null;

// Menú "Más acciones" del header.
const moreActionsOpen = ref(false);
const helpOpen = ref(false);
function closeMore() { moreActionsOpen.value = false; }

// Cierra el menú al hacer click fuera.
function onDocClick(e: MouseEvent) {
  if (!moreActionsOpen.value) return;
  const target = e.target as HTMLElement;
  if (!target.closest('[role=menu]') && !target.closest('button')) {
    moreActionsOpen.value = false;
  }
}

// retreatStartDate (ISO) leído del retiro actual; necesario para etiquetar Día 1/2/3 con fechas reales.
const retreatStartDate = computed<Date | null>(() => {
  const r = (retreatStore as any).selectedRetreat;
  const iso = r?.startDate ?? r?.startDateISO ?? null;
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
});

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Hora separada en "HH:MM" + meridiano, para renderizar el am/pm pequeño y
// evitar que en móvil la hora se parta en dos líneas de forma accidental.
function clockParts(iso: string): { hm: string; mer: string } {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const mer = h < 12 ? 'a.m.' : 'p.m.';
  h = h % 12;
  if (h === 0) h = 12;
  return { hm: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, mer };
}

function fmtNow() {
  return new Date(now.value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function rowClass(item: any) {
  if (item.status === 'active') return 'bg-green-50 border-green-300';
  if (item.status === 'completed') return 'bg-gray-50 opacity-60';
  if (item.status === 'delayed') return 'bg-amber-50 border-amber-300';
  return '';
}

// Compact row variant: solo backgrounds sutiles, sin borders propios.
function rowCompactClass(item: any) {
  if (item.status === 'active') return 'bg-green-50 hover:bg-green-100';
  if (item.status === 'completed') return 'bg-white hover:bg-gray-50 text-gray-500';
  if (item.status === 'delayed') return 'bg-amber-50 hover:bg-amber-100';
  if (item.status === 'skipped') return 'bg-gray-50 hover:bg-gray-100 text-gray-400';
  return 'bg-white hover:bg-gray-50';
}

const TYPE_BADGE_COLORS: Record<string, string> = {
  charla:     'bg-blue-100 text-blue-700',
  testimonio: 'bg-violet-100 text-violet-700',
  dinamica:   'bg-orange-100 text-orange-700',
  misa:       'bg-yellow-100 text-yellow-700',
  comida:     'bg-green-100 text-green-700',
  refrigerio: 'bg-teal-100 text-teal-700',
  traslado:   'bg-slate-100 text-slate-600',
  campana:    'bg-amber-100 text-amber-700',
  logistica:  'bg-gray-100 text-gray-600',
  santisimo:  'bg-indigo-100 text-indigo-700',
  descanso:   'bg-rose-100 text-rose-600',
  oracion:    'bg-pink-100 text-pink-700',
  otro:       'bg-gray-100 text-gray-500',
};
function typeBadgeClass(t: string): string {
  return TYPE_BADGE_COLORS[t] ?? TYPE_BADGE_COLORS['otro'];
}

// Tiempo relativo a "ahora": "ahora", "en 2h", "en 35m", "hace 1h".
//
// Reglas:
//   - status==='completed' → 'completado'
//   - status==='active'    → 'en curso'  (único disparador del label "en curso")
//   - resto se calcula contra now: items con horario actual (pero status pending)
//     muestran 'ahora' o tiempo relativo, NO 'en curso'. Solo el item que el
//     coordinador marcó con ▶ está realmente activo.
function relativeTime(item: any): string {
  const start = new Date(item.startTime).getTime();
  const end = new Date(item.endTime).getTime();
  const diff = start - now.value;
  const absMin = Math.round(Math.abs(diff) / 60000);
  if (item.status === 'completed') return 'completado';
  if (item.status === 'active') return 'en curso';
  if (now.value > end) {
    // Past: <1h → minutes, <1d → hours, ≥1d → days. Without the day branch
    // an item from a retreat that ended 12 days ago showed "hace 288h"
    // instead of "hace 12d" (Bug I).
    if (absMin < 60) return `hace ${absMin}m`;
    if (absMin < 60 * 24) return `hace ${Math.round(absMin / 60)}h`;
    return `hace ${Math.round(absMin / (60 * 24))}d`;
  }
  if (absMin === 0) return 'ahora';
  if (now.value >= start && now.value <= end) return 'ahora'; // dentro del slot pero no marcado activo
  if (absMin < 60) return `en ${absMin}m`;
  if (absMin < 60 * 24) {
    const h = Math.floor(absMin / 60);
    const m = absMin % 60;
    return m ? `en ${h}h ${m}m` : `en ${h}h`;
  }
  return `en ${Math.round(absMin / (60 * 24))}d`;
}

function statusVariant(s: string): any {
  if (s === 'active') return 'default';
  if (s === 'completed') return 'secondary';
  if (s === 'delayed') return 'destructive';
  return 'outline';
}

// Indicador "ahora": muestra una línea entre items pasado/futuro del día actual.
// Solo aplica cuando agrupamos por día, y solo en el día calendario que matchee hoy.
function shouldShowNowLine(items: any[], idx: number): boolean {
  if (groupBy.value !== 'day') return false;
  const item = items[idx];
  if (!item) return false;
  const itemStart = new Date(item.startTime);
  const today = new Date(now.value);
  if (
    itemStart.getFullYear() !== today.getFullYear() ||
    itemStart.getMonth() !== today.getMonth() ||
    itemStart.getDate() !== today.getDate()
  ) return false;
  // Mostrar si este item es el primero futuro y el anterior es pasado.
  const itemTime = itemStart.getTime();
  if (itemTime < now.value) return false;
  const prev = items[idx - 1];
  if (!prev) return now.value < itemTime; // primer item del día y "ahora" antes
  const prevTime = new Date(prev.startTime).getTime();
  return prevTime < now.value && itemTime >= now.value;
}

// Actividades en paralelo arrancan a la MISMA hora (revisiones, pruebas de audio)
// y NO se consideran solape entre sí. Las agrupamos por startTime idéntico en
// "bloques"; items[idx] es el último de su bloque (los items van ordenados por
// startTime, así que el bloque es contiguo).
function sameStartBlock(items: any[], idx: number): any[] {
  const start = items[idx]?.startTime;
  const block: any[] = [];
  for (let j = idx; j >= 0 && items[j].startTime === start; j--) block.push(items[j]);
  return block;
}

// Desajuste entre el bloque que termina en items[idx] y el siguiente bloque.
// Positivo = hueco, negativo = solape. null si no aplica mostrar indicador.
// La lógica block-aware vive en `retreatGapAfter` (pura, testeada); aquí solo
// agregamos el gate de "vista por día".
function gapBetween(items: any[], idx: number): number | null {
  if (groupBy.value !== 'day') return null;
  return retreatGapAfter(items, idx);
}

// ¿"Ajustar duración" produce una duración válida (≥ 1)?
function canFixByDuration(items: any[], idx: number): boolean {
  const cur = items[idx];
  const next = items[idx + 1];
  if (!cur || !next) return false;
  return durationToFill(cur.startTime, next.startTime) >= 1;
}

// Próxima actividad pendiente de HOY — destino del botón "⏱ Ahora".
const nextTodayItemId = computed<string | null>(() => {
  const today = new Date(now.value);
  const candidates = store.items
    .filter((it: any) => {
      if (it.status === 'completed') return false;
      const d = new Date(it.startTime);
      if (
        d.getFullYear() !== today.getFullYear() ||
        d.getMonth() !== today.getMonth() ||
        d.getDate() !== today.getDate()
      )
        return false;
      return d.getTime() >= now.value;
    })
    .sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));
  return candidates[0]?.id ?? null;
});

function goToNow() {
  if (nextTodayItemId.value) {
    scrollToItem(nextTodayItemId.value);
  } else {
    toast({ title: 'No hay próxima actividad pendiente hoy' });
  }
}

// Resumen del grupo: completados / total · próximo en X
function groupSummary(items: any[]): string {
  const total = items.length;
  const completed = items.filter((i) => i.status === 'completed').length;
  const active = items.find((i) => i.status === 'active');
  if (active) return `${completed}/${total} · ▶ ${active.name}`;
  return `${completed}/${total} completados`;
}

// Nombre del día con su fecha calculada desde retreat.startDate.
// Usa la fecha local del retreat sin shift por timezone (la API guarda
// "2026-04-17T00:00:00.000Z" pero conceptualmente es la fecha calendario).
function dayDateLabel(day: number): string {
  const start = retreatStartDate.value;
  if (!start) return '';
  // Reconstruir como fecha local usando UTC components para evitar el shift.
  const localStart = new Date(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  localStart.setDate(localStart.getDate() + (day - 1));
  return localStart.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Wrapper para mutaciones simples: ejecuta y muestra toast de error si falla.
async function withErrorToast(fn: () => Promise<unknown>, fallback: string) {
  try {
    await fn();
  } catch (err) {
    toast({ title: 'Error', description: apiErrorMessage(err, fallback), variant: 'destructive' });
  }
}

async function onStart(id: string) {
  await withErrorToast(() => store.start(id), 'No se pudo iniciar la actividad');
}
async function onComplete(id: string) {
  await withErrorToast(() => store.complete(id), 'No se pudo completar la actividad');
}
async function onShift(id: string, delta: number) {
  await withErrorToast(() => store.shift(id, delta), 'No se pudo mover la actividad');
}

// ── Desajustes de tiempo (hueco / solape) entre actividades consecutivas ───────
//
// El día se ordena por startTime; entre dos items seguidos comparamos el fin de
// uno (item.endTime) con el inicio del siguiente. El coordinador puede arreglarlo
// de dos formas (ver template):
//   1) Ajustar la duración del item actual para que termine al iniciar el siguiente.
//   2) Mover el siguiente (y posteriores) para que empiece cuando este termina.

// Ajusta la duración del bloque (items que comparten startTime con items[idx])
// para que termine cuando empieza el siguiente bloque.
async function onFixByDuration(items: any[], idx: number) {
  const next = items[idx + 1];
  if (!next) return;
  const block = sameStartBlock(items, idx);
  const dur = durationToFill(block[0].startTime, next.startTime);
  if (dur < 1) return;
  const targetId = items[idx].id;
  try {
    for (const b of block) {
      if (b.durationMinutes !== dur) {
        await store.updateItem(b.id, { durationMinutes: dur });
      }
    }
    toast({ title: 'Duración ajustada' });
    // Recarga para reflejar el recálculo de ventanas del Santísimo (server-side).
    await store.loadForRetreat(retreatId.value);
    scrollToItem(targetId, true);
  } catch (err: any) {
    toast({
      title: 'Error',
      description: apiErrorMessage(err, 'No se pudo ajustar'),
      variant: 'destructive',
    });
  }
}

// Mueve el siguiente bloque (y posteriores del día) para que empiece cuando este termina.
async function onFixByMovingNext(items: any[], idx: number) {
  const gap = gapBetween(items, idx);
  if (gap === null || gap === 0) return;
  const next = items[idx + 1];
  try {
    await store.shift(next.id, -gap, true);
    toast({ title: 'Actividad reubicada' });
    scrollToItem(next.id, true);
  } catch (err: any) {
    toast({
      title: 'Error',
      description: apiErrorMessage(err, 'No se pudo reubicar'),
      variant: 'destructive',
    });
  }
}

// Cuenta de desajustes del día (para el badge del header).
function dayGapSummary(items: any[]): { overlaps: number; gaps: number; total: number } {
  let overlaps = 0;
  let gaps = 0;
  for (let i = 0; i < items.length - 1; i++) {
    const g = gapBetween(items, i);
    if (g == null) continue;
    if (g < 0) overlaps++;
    else if (g > 0) gaps++;
  }
  return { overlaps, gaps, total: overlaps + gaps };
}

// Compacta el día: cada bloque empieza cuando termina el anterior (cierra huecos
// y solapes). El primer bloque queda donde está; los demás se reubican en cascada.
async function onCompactDay(items: any[]) {
  if (items.length < 2) return;
  if (
    !confirm(
      '¿Compactar el día? Cada actividad empezará cuando termine la anterior (se cierran huecos y solapes).',
    )
  )
    return;
  const plan = computeCompactPlan(
    items.map((it) => ({
      id: it.id,
      start: new Date(it.startTime).getTime(),
      end: new Date(it.endTime).getTime(),
    })),
  );
  if (!plan.length) {
    toast({ title: 'El día ya está compacto' });
    return;
  }
  try {
    for (const p of plan) {
      await store.updateItem(p.id, { startTime: new Date(p.start).toISOString() } as any);
    }
    toast({ title: `Día compactado · ${plan.length} actividad(es) reubicada(s)` });
    await store.loadForRetreat(retreatId.value);
  } catch (err: any) {
    toast({
      title: 'Error',
      description: apiErrorMessage(err, 'No se pudo compactar el día'),
      variant: 'destructive',
    });
  }
}
async function onRingBell() {
  if (!retreatId.value) return;
  try {
    await store.ringBell(retreatId.value, 'Campana del coordinador');
    toast({ title: 'Campana enviada a todos los servidores' });
  } catch (err) {
    toast({ title: 'Error', description: apiErrorMessage(err, 'No se pudo tocar la campana'), variant: 'destructive' });
  }
}
async function onResolveSantisimo() {
  if (!retreatId.value) return;
  try {
    const r = await store.resolveSantisimo(retreatId.value);
    toast({
      title: `Santísimo revisado`,
      description: `${r.mealSlots} slots en comidas · ${r.angelitosAssigned} angelitos asignados · ${r.unresolvedSlots.length} sin cubrir`,
    });
  } catch (err) {
    toast({ title: 'Error', description: apiErrorMessage(err, 'No se pudo resolver el Santísimo'), variant: 'destructive' });
  }
}

async function onMaterialize() {
  if (!baseDate.value) {
    const start = retreatStore.selectedRetreat?.startDate;
    if (start) baseDate.value = new Date(start).toISOString().slice(0, 10);
  }
  await store.loadTemplateSets();
  if (!selectedSetId.value) {
    const def = store.templateSets.find((s) => s.isDefault) ?? store.templateSets[0];
    if (def) selectedSetId.value = def.id;
  }
  materializeOpen.value = true;
}

async function confirmMaterialize() {
  if (!retreatId.value || !baseDate.value || !selectedSetId.value) return;
  await store.materialize(
    retreatId.value,
    baseDate.value,
    selectedSetId.value,
    clearExisting.value,
  );
  materializeOpen.value = false;
  toast({ title: 'Agenda importada' });
}

async function setup(id: string) {
  if (!id) return;
  await Promise.all([
    store.loadForRetreat(id),
    responsabilityStore.fetchResponsibilities(id, { silent: true }),
    loadParticipantsForRetreat(id),
  ]);
  if (unsubscribe) unsubscribe();
  unsubscribe = store.subscribeRealtime(id, {
    onStarted: (e) => {
      const name = store.items.find((x) => x.id === e.itemId)?.name ?? 'Actividad';
      toast({ title: `▶ Inició: ${name}` });
    },
    onCompleted: (e) => {
      const name = store.items.find((x) => x.id === e.itemId)?.name ?? 'Actividad';
      toast({ title: `✓ Completada: ${name}` });
    },
    onBell: () => {
      toast({ title: '🔔 Campana', description: 'Avisa a los caminantes' });
    },
    onDelay: (e) => {
      toast({
        title: `⏱ Retraso ${e.minutesDelta > 0 ? '+' : ''}${e.minutesDelta}m`,
        variant: e.minutesDelta > 0 ? 'destructive' : 'default',
      });
    },
    onUpcoming: (e) => {
      const mine = myParticipantId.value && e.targetParticipantIds.includes(myParticipantId.value);
      if (mine) {
        toast({
          title: `🎯 Te toca en ${e.minutesUntil} min`,
          description: e.name,
          duration: 15000,
        });
      } else {
        // coordinador: aviso suave
        toast({
          title: `⏰ Próximo en ${e.minutesUntil} min`,
          description: e.name,
          duration: 4000,
        });
      }
    },
  });
}

onMounted(() => {
  setup(retreatId.value);
  nowTicker = setInterval(() => { now.value = Date.now(); }, 60_000);
  if (typeof window !== 'undefined') {
    document.addEventListener('click', onDocClick);
  }
});
onUnmounted(() => {
  unsubscribe?.();
  if (nowTicker) clearInterval(nowTicker);
  if (typeof window !== 'undefined') {
    document.removeEventListener('click', onDocClick);
  }
});
watch(retreatId, (id) => setup(id));
</script>

<style>
/* Print stylesheet — activado solo cuando el usuario hace Ctrl/Cmd+P o
   click en "🖨 Imprimir". Convierte la vista MaM en un layout limpio
   formateado para A4 / carta:
   - Oculta sidebar, header de app, navegación, acciones de fila
   - Expande TODOS los items del día (sin scroll)
   - Tipografía legible en papel, tablas con líneas finas
   - Fuerza saltos de página entre días para que cada uno empiece arriba */
@media print {
  /* Oculta lo que no aporta en papel */
  body > div > .flex.h-dvh > div:first-child, /* sidebar desktop */
  body > div > .flex.h-dvh > button,           /* hamburger mobile */
  body > div > .flex.h-dvh > .fixed,           /* mobile title bar */
  .print-mam .sticky,                           /* search bar y card sticky */
  .print-mam button[aria-haspopup="menu"],     /* "⋮ Más acciones" */
  .print-mam .group .opacity-0,                 /* acciones hover-only */
  .print-mam button[title*="minutos"],          /* −5 / +5 buttons */
  .print-mam button[title*="Iniciar"],
  .print-mam button[title*="Completar"],
  .print-mam .print-hide,                       /* header buttons row (explicit class — earlier .flex.flex-wrap.gap-2.items-center selector accidentally matched item name wrapper too because Tailwind class order is irrelevant in CSS) */
  .print-mam .relative-time {                   /* "en 5h 30m" / "hace 11d" — irrelevant on paper, the absolute time is already shown */
    display: none !important;
  }

  /* Layout limpio sin chrome */
  body, html {
    background: white !important;
    color: black !important;
    font-size: 10pt;
  }

  .print-mam {
    padding: 0 !important;
    margin: 0 !important;
  }

  /* Cabecera del día = título prominente que rompe página */
  .print-mam h2 {
    page-break-before: always;
    page-break-after: avoid;
    font-size: 14pt !important;
    font-weight: 700;
    border-bottom: 2px solid #333 !important;
    padding-bottom: 4pt;
    margin-top: 0 !important;
    margin-bottom: 8pt !important;
  }
  .print-mam .mb-8:first-of-type h2 {
    page-break-before: auto;  /* primer día no rompe página */
  }

  /* Items: tabla compacta */
  .print-mam .group {
    border: none !important;
    border-bottom: 1px solid #ddd !important;
    padding: 4pt 0 !important;
    page-break-inside: avoid;
  }
  /* Quita backgrounds de status que no se ven bien en papel */
  .print-mam .bg-green-50,
  .print-mam .bg-amber-50,
  .print-mam .bg-gray-50 {
    background: white !important;
  }
  /* Las líneas "AHORA" no aplican en papel — son contexto en vivo */
  .print-mam .bg-rose-50 {
    display: none !important;
  }

  /* Hora en negrita */
  .print-mam .font-mono {
    font-weight: 600;
    font-size: 10pt !important;
  }

  /* Mostrar TODA la metadata en papel — los detalles importan */
  .print-mam .hidden {
    display: inline-flex !important;
  }

  /* Forzar que el responsable y los apoyos no se trunquen */
  .print-mam .truncate {
    overflow: visible !important;
    white-space: normal !important;
    text-overflow: clip !important;
  }

  /* Cards sin shadow */
  .print-mam [class*="shadow"],
  .print-mam [class*="border"] {
    box-shadow: none !important;
  }

  /* No imprimir el indicador de WS connected */
  .print-mam .text-green-600,
  .print-mam .text-gray-400 {
    /* dejar visible — útil, no es ruido */
  }

  /* No imprimir AiChatWidget ni UpdateBanner */
  body :global(.ai-chat-widget),
  body :global(.update-banner) {
    display: none !important;
  }

  @page {
    margin: 12mm;
    size: auto;
  }
}
</style>
