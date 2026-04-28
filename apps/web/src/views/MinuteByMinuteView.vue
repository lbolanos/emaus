<template>
  <div class="space-y-6">
    <div class="space-y-3">
      <div class="min-w-0">
        <h1 class="text-2xl sm:text-3xl font-bold whitespace-nowrap">Minuto a Minuto</h1>
        <p class="text-gray-600 text-sm sm:text-base">
          Agenda del retiro en tiempo real. Las notificaciones se envían automáticamente a los
          responsables.
        </p>
        <div class="text-xs mt-1">
          <span v-if="store.connected" class="text-green-600">● conectado (WS)</span>
          <span v-else class="text-gray-400">● sin conexión realtime</span>
        </div>
      </div>
      <div v-if="canManage.schedule.value" class="flex flex-wrap gap-2 items-center">
        <Button variant="outline" size="sm" @click="onAddItem">+ Nueva actividad</Button>
        <Button variant="outline" size="sm" @click="onRingBell">🔔 Campana</Button>
        <Button
          variant="outline"
          size="sm"
          v-if="!store.items.length"
          @click="onMaterialize"
        >Importar desde template</Button>
        <div class="relative" @click.stop>
          <Button
            variant="outline"
            size="sm"
            @click="moreActionsOpen = !moreActionsOpen"
            :aria-expanded="moreActionsOpen"
            aria-haspopup="menu"
          >⋮ Más acciones</Button>
          <div
            v-if="moreActionsOpen"
            role="menu"
            class="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1 text-sm"
          >
            <button
              type="button"
              role="menuitem"
              class="w-full text-left px-3 py-2 hover:bg-gray-50"
              @click="closeMore(); onRelinkResponsibilities()"
            >🔗 Re-vincular responsabilidades</button>
            <button
              type="button"
              role="menuitem"
              class="w-full text-left px-3 py-2 hover:bg-gray-50"
              @click="closeMore(); goAssignResponsables()"
            >👥 Apoyos / sobreescribir</button>
            <button
              type="button"
              role="menuitem"
              class="w-full text-left px-3 py-2 hover:bg-gray-50"
              @click="closeMore(); onResolveSantisimo()"
            >✨ Auto-asignar angelitos</button>
            <div class="border-t border-gray-100 my-1"></div>
            <button
              type="button"
              role="menuitem"
              class="w-full text-left px-3 py-2 hover:bg-gray-50 text-amber-700"
              @click="closeMore(); onMaterialize()"
            >📥 Importar desde template (sobrescribe)</button>
          </div>
        </div>
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
          <!-- Toggle agrupar por día / responsabilidad -->
          <div class="inline-flex rounded-md border border-gray-200 overflow-hidden text-xs">
            <button
              type="button"
              class="px-3 py-1.5"
              :class="groupBy === 'day' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'"
              @click="groupBy = 'day'"
              title="Agrupar por día"
            >📅 Día</button>
            <button
              type="button"
              class="px-3 py-1.5 border-l border-gray-200"
              :class="groupBy === 'responsibility' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'"
              @click="groupBy = 'responsibility'"
              title="Agrupar por responsabilidad"
            >🎤 Responsabilidad</button>
          </div>
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
            <div class="flex items-baseline gap-3 mb-2 pb-1 border-b border-gray-200">
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
                  class="group flex items-center gap-2 px-3 py-2 border-t first:border-t-0 transition-colors"
                  :class="[
                    rowCompactClass(item),
                    canManage.schedule.value ? 'cursor-pointer' : '',
                    highlightedItemId === item.id ? 'ring-2 ring-blue-500 ring-inset bg-blue-50' : '',
                  ]"
                  @click="canManage.schedule.value && onEditItem(item)"
                >
                  <!-- Hora + duración -->
                  <div class="flex flex-col items-start w-20 sm:w-24 shrink-0">
                    <div class="text-sm font-mono font-semibold leading-tight">{{ fmtTime(item.startTime) }}</div>
                    <div class="text-[10px] text-gray-400 leading-tight">{{ item.durationMinutes }}m · {{ relativeTime(item) }}</div>
                  </div>

                  <!-- Status icon (solo si no es pending) -->
                  <div class="w-5 shrink-0 text-center">
                    <span v-if="item.status === 'active'" class="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" title="En curso"></span>
                    <span v-else-if="item.status === 'completed'" class="text-green-500 text-sm" title="Completado">✓</span>
                    <span v-else-if="item.status === 'delayed'" class="text-amber-500 text-sm" title="Retrasado">⚠</span>
                    <span v-else-if="item.status === 'skipped'" class="text-gray-400 text-sm" title="Saltado">⊘</span>
                  </div>

                  <!-- Nombre + meta inline -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap text-sm">
                      <span
                        v-if="groupBy === 'responsibility'"
                        class="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 leading-tight"
                      >D{{ item.day }}</span>
                      <span class="font-medium truncate" :class="item.status === 'completed' ? 'text-gray-400 line-through' : ''">{{ item.name }}</span>
                      <span
                        class="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium leading-tight"
                        :class="typeBadgeClass(item.type)"
                      >{{ item.type }}</span>
                      <span v-if="item.blocksSantisimoAttendance" class="text-amber-600 text-xs" title="Bloquea Santísimo">🚫</span>
                    </div>
                    <div class="flex items-center gap-3 text-xs mt-0.5 text-gray-600 flex-wrap">
                      <span v-if="responsabilityName(item.responsabilityId)" class="text-blue-700 truncate">
                        🎤 {{ responsabilityName(item.responsabilityId) }}<span
                          v-if="responsableParticipantName(item.responsabilityId)"
                          class="font-semibold"
                        > · {{ responsableParticipantName(item.responsabilityId) }}</span>
                        <span v-else class="text-amber-600 italic"> · sin asignar</span>
                      </span>
                      <span v-if="item.responsables?.length" class="text-gray-500 truncate">
                        👤
                        <span v-for="(r, i) in item.responsables" :key="r.id || i">{{ r.participant?.nickname || r.participant?.firstName || '—' }}<template v-if="i < (item.responsables?.length ?? 0) - 1">, </template></span>
                      </span>
                      <span v-if="item.palanquitaNotes" class="text-gray-400 truncate">🎵 {{ item.palanquitaNotes }}</span>
                      <button
                        v-if="item.attachments?.length"
                        type="button"
                        class="text-emerald-700 hover:underline shrink-0"
                        :title="`${item.attachments.length} documento(s) del template`"
                        @click.stop="onShowAttachments(item)"
                      >📎 {{ item.attachments.length }}</button>
                    </div>
                  </div>

                  <!-- Acciones: visibles solo en hover para items pending; siempre para active -->
                  <div
                    v-if="canManage.schedule.value"
                    class="flex items-center gap-0.5 shrink-0 transition-opacity"
                    :class="item.status === 'active' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'"
                    @click.stop
                  >
                    <button
                      v-if="item.status === 'pending' || item.status === 'delayed'"
                      type="button"
                      class="p-1.5 rounded-full hover:bg-green-100 text-green-600"
                      title="Iniciar (Enter)"
                      @click="onStart(item.id)"
                    >▶</button>
                    <button
                      v-if="item.status === 'active'"
                      type="button"
                      class="p-1.5 rounded-full hover:bg-blue-100 text-blue-600 font-semibold text-xs"
                      title="Completar"
                      @click="onComplete(item.id)"
                    >✓</button>
                    <button
                      type="button"
                      class="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-xs"
                      title="Adelantar 5 minutos"
                      @click="onShift(item.id, -5)"
                    >−5</button>
                    <button
                      type="button"
                      class="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-xs"
                      title="Atrasar 5 minutos"
                      @click="onShift(item.id, 5)"
                    >+5</button>
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
import { useAuthStore } from '@/stores/authStore';
import { useAuthPermissions } from '@/composables/useAuthPermissions';
import { useResponsabilityStore } from '@/stores/responsabilityStore';
import ScheduleItemEditModal, { type SubmitPayload as ItemSubmitPayload } from '@/components/ScheduleItemEditModal.vue';
import ResponsabilityAttachmentsDialog from '@/components/ResponsabilityAttachmentsDialog.vue';
import { api, retreatScheduleApi, type RetreatScheduleItemDTO } from '@/services/api';
import type { Participant, Responsability } from '@repo/types';

const route = useRoute();
const router = useRouter();
const store = useScheduleStore();
const retreatStore = useRetreatStore();
const authStore = useAuthStore();
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

function scrollToItem(id: string) {
  highlightedItemId.value = id;
  nextTick(() => {
    const el = document.getElementById(`schedule-item-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
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
    if (itemModalMode.value === 'add') {
      await store.createItem(retreatId.value, payload);
      toast({ title: 'Actividad creada' });
    } else if (editingItem.value) {
      await store.updateItem(editingItem.value.id, payload);
      toast({ title: 'Actividad actualizada' });
    }
    itemModalOpen.value = false;
    await store.loadForRetreat(retreatId.value);
  } catch (err: any) {
    toast({
      title: 'Error',
      description: err?.response?.data?.message || err?.message || 'No se pudo guardar',
      variant: 'destructive',
    });
  }
}

async function onDeleteItem(id: string) {
  try {
    await store.removeItem(id);
    itemModalOpen.value = false;
    toast({ title: 'Actividad eliminada' });
  } catch (err: any) {
    toast({
      title: 'Error al eliminar',
      description: err?.response?.data?.message || err?.message,
      variant: 'destructive',
    });
  }
}

const selectedSet = computed(() =>
  store.templateSets.find((s) => s.id === selectedSetId.value) ?? null,
);

let unsubscribe: (() => void) | null = null;

const myParticipantId = computed(() =>
  (authStore.userProfile as any)?.participantId ?? (authStore.userProfile as any)?.participant?.id ?? null,
);

// Reloj reactivo para indicador "ahora" y tiempo relativo. Refresca cada 60s.
const now = ref<number>(Date.now());
let nowTicker: ReturnType<typeof setInterval> | null = null;

// Menú "Más acciones" del header.
const moreActionsOpen = ref(false);
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
  if (now.value > end) return absMin < 60 ? `hace ${absMin}m` : `hace ${Math.round(absMin / 60)}h`;
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

async function onStart(id: string) {
  await store.start(id);
}
async function onComplete(id: string) {
  await store.complete(id);
}
async function onShift(id: string, delta: number) {
  await store.shift(id, delta);
}
async function onRingBell() {
  if (!retreatId.value) return;
  await store.ringBell(retreatId.value, 'Campana del coordinador');
  toast({ title: 'Campana enviada a todos los servidores' });
}
async function onResolveSantisimo() {
  if (!retreatId.value) return;
  const r = await store.resolveSantisimo(retreatId.value);
  toast({
    title: `Santísimo revisado`,
    description: `${r.mealSlots} slots en comidas · ${r.angelitosAssigned} angelitos asignados · ${r.unresolvedSlots.length} sin cubrir`,
  });
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
