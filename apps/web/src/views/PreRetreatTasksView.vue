<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  useToast,
} from '@repo/ui';
import { ChevronDown, ChevronRight, ClipboardList, Download, MoreVertical, Plus } from 'lucide-vue-next';
import { formatDueOffset } from '@repo/types';
import { api, apiErrorMessage, type RetreatPreRetreatTaskDTO } from '@/services/api';
import {
  usePreRetreatTaskStore,
  todayISO,
  tasksToCsv,
  participantLabel,
} from '@/stores/preRetreatTaskStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useAuthPermissions } from '@/composables/useAuthPermissions';
import { useRekaDialogFix } from '@/composables/useRekaDialogFix';
import PreRetreatTaskEditModal from '@/components/PreRetreatTaskEditModal.vue';
import PreRetreatTaskAssignInline from '@/components/PreRetreatTaskAssignInline.vue';
import HelpVideoButton from '@/components/HelpVideoButton.vue';

const route = useRoute();
const store = usePreRetreatTaskStore();
const retreatStore = useRetreatStore();
const { canManage } = useAuthPermissions();
const { toast } = useToast();
const { deferOpen } = useRekaDialogFix();

const retreatId = computed(
  () => (route.params.id as string) || retreatStore.selectedRetreatId || '',
);
const retreatStartDate = computed<string | null>(() => {
  const s = (retreatStore.selectedRetreat as any)?.startDate;
  return s ? String(s) : null;
});

const search = ref('');
const groupByBucket = ref(true);
const expanded = ref<string[]>([]);
type StatusFilter = 'all' | 'pending' | 'overdue' | 'done';
const statusFilter = ref<StatusFilter>('all');

// Modal de crear/editar
const editOpen = ref(false);
const editingTask = ref<RetreatPreRetreatTaskDTO | null>(null);
const newTaskParentId = ref<string | null>(null);

// Dialog de importar template
const importOpen = ref(false);
const importSetId = ref('');
const importMode = ref<'replace' | 'add-missing'>('add-missing');
const importing = ref(false);

// Dialog de confirmar eliminación
const deleteOpen = ref(false);
const deletingTask = ref<RetreatPreRetreatTaskDTO | null>(null);

const participants = ref<
  Array<{ id: string; firstName?: string; lastName?: string; nickname?: string }>
>([]);

const SEMAPHORE_STYLES: Record<string, string> = {
  done: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  soon: 'bg-amber-100 text-amber-800',
  ok: 'bg-gray-100 text-gray-600',
  none: 'bg-gray-100 text-gray-400',
};
const SEMAPHORE_LABELS: Record<string, string> = {
  done: 'Lista',
  overdue: 'Vencida',
  soon: 'Próxima',
  ok: 'A tiempo',
  none: '—',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  done: 'Lista',
  not_applicable: 'No aplica',
};

const matchesSearch = (t: RetreatPreRetreatTaskDTO, q: string): boolean => {
  const hay = [t.name, t.description, t.responsibleText, t.notes, t.supportNotes]
    .concat(t.responsible ? [t.responsible.firstName, t.responsible.lastName, t.responsible.nickname] : [])
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
};

function matchesStatus(t: RetreatPreRetreatTaskDTO): boolean {
  switch (statusFilter.value) {
    case 'pending':
      return t.status === 'pending' || t.status === 'in_progress';
    case 'overdue':
      return store.semaphoreFor(t) === 'overdue';
    case 'done':
      return t.status === 'done';
    default:
      return true;
  }
}

function taskMatches(t: RetreatPreRetreatTaskDTO, q: string): boolean {
  return (!q || matchesSearch(t, q)) && matchesStatus(t);
}

const filteredBuckets = computed(() => {
  const q = search.value.trim().toLowerCase();
  const buckets = groupByBucket.value
    ? store.buckets
    : [{ key: 'all', label: '', offsetDays: 0, tasks: store.tasks }];
  if (!q && statusFilter.value === 'all') return buckets;
  return buckets
    .map((b) => {
      const tasks: RetreatPreRetreatTaskDTO[] = [];
      for (const t of b.tasks) {
        const kids = (t.children ?? []).filter((c) => taskMatches(c, q));
        if (taskMatches(t, q) || kids.length) {
          // Clona solo si filtramos hijos, para no mutar el árbol del store.
          tasks.push(kids.length !== (t.children?.length ?? 0) ? { ...t, children: kids } : t);
        }
      }
      return { ...b, tasks };
    })
    .filter((b) => b.tasks.length > 0);
});

function exportCsv() {
  // BOM para que Excel interprete UTF-8 (acentos).
  const csv = '﻿' + tasksToCsv(store.tasks);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `tareas-pre-retiro-${retreatId.value}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Fecha de referencia "hoy" formateada (para la marca de tiempo).
const todayLabel = computed(() =>
  new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long' }),
);

const bucketEarliestDue = (b: { tasks: RetreatPreRetreatTaskDTO[] }): string | null =>
  b.tasks
    .map((t) => t.dueDate)
    .filter((d): d is string => !!d)
    .sort()[0] ?? null;

// Filas a renderizar: los buckets + una marca "Hoy · dónde vamos" insertada
// entre las tareas vencidas (pasado) y las próximas (futuro), estilo AHORA del
// Minuto a Minuto. Solo en agrupación por tiempo.
const renderRows = computed<
  Array<{ type: 'marker' } | { type: 'bucket'; bucket: (typeof filteredBuckets.value)[number] }>
>(() => {
  const buckets = filteredBuckets.value;
  if (!groupByBucket.value) return buckets.map((bucket) => ({ type: 'bucket', bucket }));

  const today = todayISO();
  const rows: Array<{ type: 'marker' } | { type: 'bucket'; bucket: (typeof buckets)[number] }> = [];
  let inserted = false;
  let lastDatedIdx = -1;
  buckets.forEach((b, i) => {
    if (bucketEarliestDue(b)) lastDatedIdx = i;
  });

  buckets.forEach((b, i) => {
    const due = bucketEarliestDue(b);
    // La marca va antes del primer bucket cuyo vencimiento es hoy o futuro.
    if (!inserted && due && due >= today) {
      rows.push({ type: 'marker' });
      inserted = true;
    }
    rows.push({ type: 'bucket', bucket: b });
    // Si todo está vencido, la marca va al final del último bucket con fecha.
    if (!inserted && i === lastDatedIdx) {
      rows.push({ type: 'marker' });
      inserted = true;
    }
  });
  return rows;
});

function isExpanded(id: string) {
  return expanded.value.includes(id);
}
function toggleExpanded(id: string) {
  expanded.value = isExpanded(id)
    ? expanded.value.filter((x) => x !== id)
    : [...expanded.value, id];
}

function responsibleLabel(t: RetreatPreRetreatTaskDTO): string {
  return [participantLabel(t.responsible), t.responsibleText].filter(Boolean).join(' · ');
}

function dueLabel(t: RetreatPreRetreatTaskDTO): string {
  if (!t.dueDate) return '';
  const [y, m, d] = t.dueDate.split('-').map(Number);
  const date = new Date(y, m - 1, d).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
  });
  return t.dueOffsetDays != null ? `${date} · ${formatDueOffset(t.dueOffsetDays)} antes` : date;
}

async function load() {
  if (!retreatId.value) return;
  try {
    await store.fetchForRetreat(retreatId.value);
  } catch (err) {
    toast({
      title: 'No se pudieron cargar las tareas',
      description: apiErrorMessage(err),
      variant: 'destructive',
    });
  }
}

async function loadParticipants() {
  if (!retreatId.value) return;
  try {
    const r = await api.get('/participants', { params: { retreatId: retreatId.value } });
    participants.value = (r.data || [])
      .filter((p: any) => p.type === 'server' || p.type === 'partial_server')
      .map((p: any) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        nickname: p.nickname,
      }));
  } catch {
    participants.value = [];
  }
}

async function onToggleDone(t: RetreatPreRetreatTaskDTO) {
  try {
    await store.toggleDone(t.id);
  } catch (err) {
    toast({
      title: 'No se pudo actualizar el estado',
      description: apiErrorMessage(err),
      variant: 'destructive',
    });
  }
}

async function onMarkNotApplicable(t: RetreatPreRetreatTaskDTO) {
  const next = t.status === 'not_applicable' ? 'pending' : 'not_applicable';
  try {
    await store.setStatus(t.id, next);
    await store.fetchForRetreat(retreatId.value);
  } catch (err) {
    toast({
      title: 'No se pudo actualizar el estado',
      description: apiErrorMessage(err),
      variant: 'destructive',
    });
  }
}

async function assignResponsible(t: RetreatPreRetreatTaskDTO, participantId: string | null) {
  try {
    await store.updateTask(retreatId.value, t.id, { responsibleParticipantId: participantId });
  } catch (err) {
    toast({
      title: 'No se pudo asignar el responsable',
      description: apiErrorMessage(err),
      variant: 'destructive',
    });
  }
}

function openCreate(parentId: string | null = null) {
  editingTask.value = null;
  newTaskParentId.value = parentId;
  editOpen.value = true;
}

function openEdit(t: RetreatPreRetreatTaskDTO) {
  editingTask.value = t;
  newTaskParentId.value = null;
  editOpen.value = true;
}

function openDelete(t: RetreatPreRetreatTaskDTO) {
  deletingTask.value = t;
  deleteOpen.value = true;
}

async function confirmDelete() {
  const t = deletingTask.value;
  // Regla 3 reka-ui: cerrar el dialog ANTES del await pesado.
  deleteOpen.value = false;
  deletingTask.value = null;
  if (!t) return;
  try {
    await store.removeTask(retreatId.value, t.id);
    toast({ title: 'Tarea eliminada' });
  } catch (err) {
    toast({
      title: 'No se pudo eliminar la tarea',
      description: apiErrorMessage(err),
      variant: 'destructive',
    });
  }
}

async function openImport() {
  try {
    if (!store.templateSets.length) await store.fetchTemplateSets();
    importSetId.value =
      store.templateSets.find((s) => s.isDefault)?.id ?? store.templateSets[0]?.id ?? '';
    importMode.value = store.tasks.length ? 'add-missing' : 'replace';
    importOpen.value = true;
  } catch (err) {
    toast({
      title: 'No se pudieron cargar los templates',
      description: apiErrorMessage(err),
      variant: 'destructive',
    });
  }
}

async function confirmImport() {
  const setId = importSetId.value || undefined;
  const mode = importMode.value;
  // Regla 3 reka-ui: cerrar el dialog antes del await.
  importOpen.value = false;
  importing.value = true;
  try {
    if (mode === 'replace') {
      await store.materialize(retreatId.value, { templateSetId: setId, clearExisting: true });
      toast({ title: 'Tareas importadas desde el template' });
    } else {
      const r = await store.addMissing(retreatId.value, setId);
      toast({
        title: r.added
          ? `${r.added} tarea(s) nueva(s) agregadas`
          : 'No había tareas nuevas por agregar',
      });
    }
  } catch (err) {
    toast({
      title: 'No se pudo importar el template',
      description: apiErrorMessage(err),
      variant: 'destructive',
    });
  } finally {
    importing.value = false;
  }
}

onMounted(() => {
  load();
  loadParticipants();
});
watch(retreatId, () => {
  load();
  loadParticipants();
});
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-4">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
      <div class="flex-1">
        <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardList class="w-7 h-7 text-purple-600" />
          Tareas Pre-Retiro
        </h1>
        <p class="text-gray-500 mt-1 text-sm sm:text-base flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>Qué hacer y cuándo antes del retiro.</span>
          <span v-if="store.counts.total" class="font-medium text-gray-700">
            {{ store.counts.done }}/{{ store.counts.total }} listas
          </span>
          <span
            v-if="store.counts.overdue"
            class="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium"
          >
            {{ store.counts.overdue }} vencida{{ store.counts.overdue === 1 ? '' : 's' }}
          </span>
          <span
            v-if="store.counts.soon"
            class="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium"
          >
            {{ store.counts.soon }} esta semana
          </span>
          <span
            v-if="store.counts.unassigned"
            class="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium"
          >
            {{ store.counts.unassigned }} sin asignar
          </span>
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:shrink-0 sm:self-start">
        <HelpVideoButton feature="pre-retreat-tasks" />
        <Button
          v-if="store.tasks.length"
          variant="outline"
          size="sm"
          class="flex items-center gap-1"
          @click="exportCsv"
          data-testid="export-csv"
        >
          <Download class="w-4 h-4" /> Exportar
        </Button>
        <template v-if="canManage.preRetreatTask.value">
          <Button variant="outline" size="sm" @click="openImport" data-testid="import-template">
            <span class="sm:hidden">Importar</span>
            <span class="hidden sm:inline">Importar desde template</span>
          </Button>
          <Button size="sm" class="flex items-center gap-1" @click="openCreate(null)" data-testid="new-task">
            <Plus class="w-4 h-4" /> Nueva tarea
          </Button>
        </template>
      </div>
    </div>

    <!-- Búsqueda + filtro + agrupación -->
    <div
      v-if="store.tasks.length"
      class="sticky top-0 z-10 bg-gray-50/95 backdrop-blur py-2 space-y-2"
    >
      <div class="flex items-center gap-2">
        <Input v-model="search" placeholder="Buscar tarea, responsable o nota…" class="flex-1" />
        <Button
          variant="outline"
          size="sm"
          :title="groupByBucket ? 'Agrupado por tiempo antes del retiro' : 'Lista corrida'"
          @click="groupByBucket = !groupByBucket"
        >
          {{ groupByBucket ? '📅 Por tiempo' : '☰ Lista' }}
        </Button>
      </div>
      <div class="flex items-center gap-1.5 flex-wrap">
        <button
          v-for="f in [
            { key: 'all', label: 'Todas' },
            { key: 'pending', label: 'Pendientes' },
            { key: 'overdue', label: 'Vencidas' },
            { key: 'done', label: 'Listas' },
          ]"
          :key="f.key"
          type="button"
          class="text-xs px-2.5 py-1 rounded-full border transition-colors"
          :class="statusFilter === f.key
            ? 'bg-purple-600 border-purple-600 text-white'
            : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'"
          :data-testid="`filter-${f.key}`"
          @click="statusFilter = f.key as StatusFilter"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <!-- Vacío -->
    <div
      v-if="!store.loading && !store.tasks.length"
      class="text-center py-16 bg-white border border-dashed border-gray-300 rounded-xl"
    >
      <ClipboardList class="w-10 h-10 mx-auto text-gray-300" />
      <p class="mt-3 text-gray-600 font-medium">Aún no hay tareas para este retiro</p>
      <p class="text-sm text-gray-500 mt-1">
        Importa el checklist "Qué Hacer y Cuándo" desde el template para empezar.
      </p>
      <Button
        v-if="canManage.preRetreatTask.value"
        class="mt-4"
        @click="openImport"
        data-testid="import-empty"
      >
        Importar desde template
      </Button>
    </div>

    <!-- Grupos + marca "Hoy · dónde vamos" (estilo AHORA del Minuto a Minuto) -->
    <template
      v-for="(row, idx) in renderRows"
      :key="row.type === 'bucket' ? row.bucket.key : `marker-${idx}`"
    >
      <div
        v-if="row.type === 'marker'"
        class="flex items-center gap-3 my-1"
        data-testid="today-marker"
      >
        <div class="h-px flex-1 bg-rose-300"></div>
        <span
          class="text-[11px] font-semibold uppercase tracking-wide text-rose-600 whitespace-nowrap"
        >
          ● Hoy · {{ todayLabel }}
        </span>
        <div class="h-px flex-1 bg-rose-300"></div>
      </div>

      <div v-else class="space-y-2">
        <h2
          v-if="groupByBucket && row.bucket.label"
          class="text-sm font-semibold text-gray-500 uppercase tracking-wide mt-4"
        >
          {{ row.bucket.label }}
        </h2>

        <div
          v-for="task in row.bucket.tasks"
          :key="task.id"
          class="bg-white border border-gray-200 rounded-xl shadow-sm"
          :data-testid="`task-${task.id}`"
        >
        <!-- Fila de la tarea principal -->
        <div class="flex items-start gap-3 p-3 sm:p-4">
          <Checkbox
            v-if="canManage.preRetreatTask.value"
            class="mt-1"
            :model-value="task.status === 'done'"
            :disabled="task.status === 'not_applicable'"
            @update:model-value="onToggleDone(task)"
          />
          <div class="flex-1 min-w-0">
            <button
              type="button"
              class="text-left w-full"
              @click="task.children?.length ? toggleExpanded(task.id) : undefined"
            >
              <div class="flex items-center gap-2 flex-wrap">
                <span
                  class="font-medium text-gray-900"
                  :class="{ 'line-through text-gray-400': task.status === 'done', 'text-gray-400': task.status === 'not_applicable' }"
                >
                  {{ task.name }}
                </span>
                <span
                  class="text-[11px] px-2 py-0.5 rounded-full font-medium"
                  :class="SEMAPHORE_STYLES[store.semaphoreFor(task)]"
                >
                  {{ SEMAPHORE_LABELS[store.semaphoreFor(task)] }}
                </span>
                <span
                  v-if="task.progress && task.progress.total > 0"
                  class="text-[11px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium"
                >
                  {{ task.progress.done }}/{{ task.progress.total }}
                </span>
              </div>
              <p v-if="task.description" class="text-xs text-gray-500 mt-1 line-clamp-2">
                {{ task.description }}
              </p>
            </button>
            <div class="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
              <span v-if="dueLabel(task)">📆 {{ dueLabel(task) }}</span>
              <PreRetreatTaskAssignInline
                :label="responsibleLabel(task)"
                :participants="participants"
                :can-manage="canManage.preRetreatTask.value"
                :has-responsible="!!(task.responsibleParticipantId || task.responsibleText)"
                @assign="assignResponsible(task, $event)"
              />
              <span v-if="task.status === 'not_applicable'">No aplica</span>
            </div>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <DropdownMenu v-if="canManage.preRetreatTask.value">
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="sm" class="h-8 w-8 p-0" :data-testid="`menu-${task.id}`">
                  <MoreVertical class="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @select="deferOpen(() => openEdit(task))">✏️ Editar</DropdownMenuItem>
                <DropdownMenuItem
                  v-if="!task.parentId"
                  @select="deferOpen(() => openCreate(task.id))"
                >
                  ➕ Agregar sub-tarea
                </DropdownMenuItem>
                <DropdownMenuItem @select="onMarkNotApplicable(task)">
                  {{ task.status === 'not_applicable' ? '↩️ Reactivar' : '🚫 Marcar no aplica' }}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  class="text-red-600"
                  @select="deferOpen(() => openDelete(task))"
                >
                  🗑 Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              v-if="task.children?.length"
              type="button"
              class="h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-600"
              :aria-label="isExpanded(task.id) ? 'Colapsar' : 'Expandir'"
              @click="toggleExpanded(task.id)"
            >
              <component :is="isExpanded(task.id) ? ChevronDown : ChevronRight" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Sub-tareas -->
        <div
          v-if="task.children?.length && isExpanded(task.id)"
          class="border-t border-gray-100 divide-y divide-gray-50"
        >
          <div
            v-for="child in task.children"
            :key="child.id"
            class="flex items-start gap-3 pl-10 pr-3 py-2.5"
            :data-testid="`task-${child.id}`"
          >
            <Checkbox
              v-if="canManage.preRetreatTask.value"
              class="mt-0.5"
              :model-value="child.status === 'done'"
              :disabled="child.status === 'not_applicable'"
              @update:model-value="onToggleDone(child)"
            />
            <div class="flex-1 min-w-0">
              <span
                class="text-sm text-gray-800"
                :class="{ 'line-through text-gray-400': child.status === 'done', 'text-gray-400': child.status === 'not_applicable' }"
              >
                {{ child.name }}
              </span>
              <div class="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <span v-if="child.status !== 'done' && child.status !== 'pending'">
                  {{ STATUS_LABELS[child.status] }}
                </span>
                <span v-if="dueLabel(child)">📆 {{ dueLabel(child) }}</span>
                <PreRetreatTaskAssignInline
                  :label="responsibleLabel(child)"
                  :participants="participants"
                  :can-manage="canManage.preRetreatTask.value"
                  :has-responsible="!!(child.responsibleParticipantId || child.responsibleText)"
                  @assign="assignResponsible(child, $event)"
                />
                <span v-if="child.notes">📝 {{ child.notes }}</span>
              </div>
            </div>
            <DropdownMenu v-if="canManage.preRetreatTask.value">
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="sm" class="h-7 w-7 p-0" :data-testid="`menu-${child.id}`">
                  <MoreVertical class="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @select="deferOpen(() => openEdit(child))">✏️ Editar</DropdownMenuItem>
                <DropdownMenuItem @select="onMarkNotApplicable(child)">
                  {{ child.status === 'not_applicable' ? '↩️ Reactivar' : '🚫 Marcar no aplica' }}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem class="text-red-600" @select="deferOpen(() => openDelete(child))">
                  🗑 Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      </div>
    </template>

    <!-- Modal crear/editar -->
    <PreRetreatTaskEditModal
      v-model:open="editOpen"
      :retreat-id="retreatId"
      :task="editingTask"
      :parent-id="newTaskParentId"
      :participants="participants"
      :retreat-start-date="retreatStartDate"
    />

    <!-- Dialog importar template -->
    <Dialog v-model:open="importOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importar tareas desde template</DialogTitle>
        </DialogHeader>
        <div class="space-y-4">
          <div>
            <label class="text-sm font-medium text-gray-700">Template</label>
            <select
              v-model="importSetId"
              class="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option v-for="s in store.templateSets" :key="s.id" :value="s.id">
                {{ s.name }}{{ s.isDefault ? ' ★' : '' }}
              </option>
            </select>
          </div>
          <div class="space-y-2">
            <label class="flex items-start gap-2 text-sm">
              <input type="radio" value="add-missing" v-model="importMode" class="mt-0.5" />
              <span>
                <span class="font-medium">Solo agregar faltantes</span>
                <span class="block text-gray-500 text-xs">
                  Mantiene lo que ya capturaste y agrega las tareas nuevas del template.
                </span>
              </span>
            </label>
            <label class="flex items-start gap-2 text-sm">
              <input type="radio" value="replace" v-model="importMode" class="mt-0.5" />
              <span>
                <span class="font-medium text-red-700">Reemplazar todo</span>
                <span class="block text-gray-500 text-xs">
                  Borra las tareas actuales del retiro y las vuelve a crear desde el template.
                </span>
              </span>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="importOpen = false">Cancelar</Button>
          <Button :disabled="importing || !importSetId" @click="confirmImport">Importar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Dialog confirmar eliminación -->
    <Dialog v-model:open="deleteOpen">
      <DialogContent class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Eliminar tarea?</DialogTitle>
        </DialogHeader>
        <p class="text-sm text-gray-600">
          Se eliminará «{{ deletingTask?.name }}»<span
            v-if="deletingTask && !deletingTask.parentId && deletingTask.children?.length"
          >
            y sus {{ deletingTask.children!.length }} sub-tarea(s)</span
          >.
        </p>
        <DialogFooter>
          <Button variant="outline" @click="deleteOpen = false">Cancelar</Button>
          <Button variant="destructive" @click="confirmDelete">Eliminar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
