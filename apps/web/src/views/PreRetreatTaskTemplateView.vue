<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  Button,
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
  Label,
  useToast,
} from '@repo/ui';
import { ClipboardList, MoreVertical, Plus } from 'lucide-vue-next';
import { formatDueOffset } from '@repo/types';
import {
  preRetreatTaskTemplateApi,
  apiErrorMessage,
  type PreRetreatTaskTemplateDTO,
  type PreRetreatTaskTemplateSetDTO,
} from '@/services/api';
import { useAuthPermissions } from '@/composables/useAuthPermissions';
import { useRekaDialogFix } from '@/composables/useRekaDialogFix';
import PreRetreatTaskTemplateEditModal from '@/components/PreRetreatTaskTemplateEditModal.vue';

const { canManage } = useAuthPermissions();
const { toast } = useToast();
const { deferOpen } = useRekaDialogFix();

const sets = ref<PreRetreatTaskTemplateSetDTO[]>([]);
const selectedSetId = ref('');
const items = ref<PreRetreatTaskTemplateDTO[]>([]);
const search = ref('');

const editOpen = ref(false);
const editingItem = ref<PreRetreatTaskTemplateDTO | null>(null);
const presetParentId = ref<string | null>(null);

const deleteOpen = ref(false);
const deletingItem = ref<PreRetreatTaskTemplateDTO | null>(null);

const setDialogOpen = ref(false);
const newSetName = ref('');

const selectedSet = computed(() => sets.value.find((s) => s.id === selectedSetId.value));
const roots = computed(() =>
  items.value.filter((i) => !i.parentId).sort((a, b) => a.defaultOrder - b.defaultOrder),
);
const childrenOf = (id: string) =>
  items.value.filter((i) => i.parentId === id).sort((a, b) => a.defaultOrder - b.defaultOrder);

interface Bucket {
  label: string;
  offsetDays: number | null;
  roots: PreRetreatTaskTemplateDTO[];
}

const buckets = computed<Bucket[]>(() => {
  const q = search.value.trim().toLowerCase();
  const matches = (t: PreRetreatTaskTemplateDTO) =>
    !q ||
    t.name.toLowerCase().includes(q) ||
    (t.description ?? '').toLowerCase().includes(q) ||
    childrenOf(t.id).some(
      (c) => c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q),
    );
  const byKey = new Map<string, Bucket>();
  for (const r of roots.value.filter(matches)) {
    const key = r.dueOffsetDays != null ? `o:${r.dueOffsetDays}` : 'none';
    const label = r.dueOffsetDays != null ? `${formatDueOffset(r.dueOffsetDays)} antes` : 'Sin tiempo definido';
    const b = byKey.get(key) ?? { label, offsetDays: r.dueOffsetDays ?? null, roots: [] };
    b.roots.push(r);
    byKey.set(key, b);
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.offsetDays == null) return 1;
    if (b.offsetDays == null) return -1;
    return b.offsetDays - a.offsetDays;
  });
});

async function loadSets() {
  sets.value = await preRetreatTaskTemplateApi.listSets();
  if (!selectedSetId.value) {
    selectedSetId.value = sets.value.find((s) => s.isDefault)?.id ?? sets.value[0]?.id ?? '';
  }
}

async function load() {
  if (!selectedSetId.value) {
    items.value = [];
    return;
  }
  items.value = await preRetreatTaskTemplateApi.list(selectedSetId.value);
}

function openCreate(parentId: string | null = null) {
  editingItem.value = null;
  presetParentId.value = parentId;
  editOpen.value = true;
}
function openEdit(item: PreRetreatTaskTemplateDTO) {
  editingItem.value = item;
  presetParentId.value = null;
  editOpen.value = true;
}
function openDelete(item: PreRetreatTaskTemplateDTO) {
  deletingItem.value = item;
  deleteOpen.value = true;
}

async function confirmDelete() {
  const item = deletingItem.value;
  // Regla 3 reka-ui: cerrar el dialog antes del await.
  deleteOpen.value = false;
  deletingItem.value = null;
  if (!item) return;
  try {
    await preRetreatTaskTemplateApi.remove(item.id);
    toast({ title: 'Tarea eliminada del template' });
    await load();
  } catch (err) {
    toast({ title: 'No se pudo eliminar', description: apiErrorMessage(err), variant: 'destructive' });
  }
}

async function createSet() {
  const name = newSetName.value.trim();
  setDialogOpen.value = false;
  if (!name) return;
  try {
    const s = await preRetreatTaskTemplateApi.createSet({ name, isActive: true, isDefault: false });
    newSetName.value = '';
    await loadSets();
    selectedSetId.value = s.id;
    await load();
  } catch (err) {
    toast({ title: 'No se pudo crear el template', description: apiErrorMessage(err), variant: 'destructive' });
  }
}

async function markDefault() {
  if (!selectedSet.value) return;
  try {
    for (const s of sets.value.filter((x) => x.isDefault && x.id !== selectedSet.value!.id)) {
      await preRetreatTaskTemplateApi.updateSet(s.id, { isDefault: false });
    }
    await preRetreatTaskTemplateApi.updateSet(selectedSet.value.id, { isDefault: true });
    toast({ title: `«${selectedSet.value.name}» es ahora el template predeterminado` });
    await loadSets();
  } catch (err) {
    toast({ title: 'No se pudo marcar como predeterminado', description: apiErrorMessage(err), variant: 'destructive' });
  }
}

const deleteSetOpen = ref(false);
async function confirmDeleteSet() {
  const set = selectedSet.value;
  deleteSetOpen.value = false;
  if (!set) return;
  try {
    await preRetreatTaskTemplateApi.removeSet(set.id);
    toast({ title: `Template «${set.name}» eliminado` });
    selectedSetId.value = '';
    await loadSets();
    await load();
  } catch (err) {
    toast({ title: 'No se pudo eliminar el template', description: apiErrorMessage(err), variant: 'destructive' });
  }
}

async function onSaved() {
  await load();
}

onMounted(async () => {
  try {
    await loadSets();
    await load();
  } catch (err) {
    toast({ title: 'No se pudo cargar el template', description: apiErrorMessage(err), variant: 'destructive' });
  }
});
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-4">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
      <div class="flex-1">
        <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardList class="w-7 h-7 text-purple-600" />
          Template Tareas Pre-Retiro
        </h1>
        <p class="text-gray-500 mt-1 text-sm sm:text-base">
          Checklist maestro de "qué hacer y cuándo". Cada retiro lo importa y lo adapta.
        </p>
      </div>
      <Button
        v-if="canManage.preRetreatTaskTemplate.value"
        size="sm"
        class="flex items-center gap-1 shrink-0 self-start"
        :disabled="!selectedSetId"
        @click="openCreate(null)"
        data-testid="new-template-task"
      >
        <Plus class="w-4 h-4" /> Nueva tarea
      </Button>
    </div>

    <!-- Selector de set -->
    <div class="bg-white border border-gray-200 rounded-xl px-5 py-4 flex flex-wrap items-center gap-3 shadow-sm">
      <span class="text-sm font-medium text-gray-700">Template:</span>
      <select
        v-model="selectedSetId"
        class="appearance-none bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg px-3 py-2 cursor-pointer min-w-[220px]"
        @change="load"
      >
        <option v-for="s in sets" :key="s.id" :value="s.id">
          {{ s.name }}{{ s.isDefault ? ' ★' : '' }}
        </option>
      </select>
      <template v-if="canManage.preRetreatTaskTemplate.value">
        <Button size="sm" variant="outline" @click="setDialogOpen = true">Nuevo template</Button>
        <Button v-if="selectedSet && !selectedSet.isDefault" size="sm" variant="outline" @click="markDefault">
          ★ Marcar predeterminado
        </Button>
        <Button
          v-if="selectedSet && !selectedSet.isDefault"
          size="sm"
          variant="outline"
          class="text-red-600"
          @click="deleteSetOpen = true"
        >
          Eliminar template
        </Button>
      </template>
    </div>

    <!-- Búsqueda -->
    <div v-if="items.length" class="sticky top-0 z-10 bg-gray-50/95 backdrop-blur py-2">
      <Input v-model="search" placeholder="Buscar tarea…" />
    </div>

    <!-- Vacío -->
    <div
      v-if="!buckets.length"
      class="text-center py-16 bg-white border border-dashed border-gray-300 rounded-xl text-gray-500"
    >
      No hay tareas en este template.
    </div>

    <!-- Buckets -->
    <div v-for="bucket in buckets" :key="bucket.label" class="space-y-2">
      <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mt-4">
        {{ bucket.label }}
      </h2>
      <div
        v-for="item in bucket.roots"
        :key="item.id"
        class="bg-white border border-gray-200 rounded-xl shadow-sm"
        :data-testid="`tpl-${item.id}`"
      >
        <div class="flex items-start gap-3 p-3 sm:p-4">
          <div class="flex-1 min-w-0">
            <div class="font-medium text-gray-900">{{ item.name }}</div>
            <div class="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
              <span v-if="item.dueOffsetDays != null">⏱ {{ formatDueOffset(item.dueOffsetDays) }} antes</span>
              <span v-if="item.supportNotes">🤝 {{ item.supportNotes }}</span>
            </div>
            <p v-if="item.description" class="text-xs text-gray-500 mt-1">{{ item.description }}</p>
          </div>
          <DropdownMenu v-if="canManage.preRetreatTaskTemplate.value">
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="sm" class="h-8 w-8 p-0" :data-testid="`tpl-menu-${item.id}`">
                <MoreVertical class="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem @select="deferOpen(() => openEdit(item))">✏️ Editar</DropdownMenuItem>
              <DropdownMenuItem @select="deferOpen(() => openCreate(item.id))">➕ Agregar sub-tarea</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem class="text-red-600" @select="deferOpen(() => openDelete(item))">
                🗑 Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div v-if="childrenOf(item.id).length" class="border-t border-gray-100 divide-y divide-gray-50">
          <div
            v-for="child in childrenOf(item.id)"
            :key="child.id"
            class="flex items-start gap-3 pl-10 pr-3 py-2.5"
          >
            <div class="flex-1 min-w-0">
              <span class="text-sm text-gray-800">{{ child.name }}</span>
              <div class="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <span v-if="child.dueOffsetDays != null">⏱ {{ formatDueOffset(child.dueOffsetDays) }} antes</span>
                <span v-else class="text-gray-400">hereda tiempo del padre</span>
                <span v-if="child.description">{{ child.description }}</span>
              </div>
            </div>
            <DropdownMenu v-if="canManage.preRetreatTaskTemplate.value">
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="sm" class="h-7 w-7 p-0">
                  <MoreVertical class="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @select="deferOpen(() => openEdit(child))">✏️ Editar</DropdownMenuItem>
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

    <!-- Modal crear/editar item -->
    <PreRetreatTaskTemplateEditModal
      v-model:open="editOpen"
      :template-set-id="selectedSetId"
      :item="editingItem"
      :root-options="roots"
      :preset-parent-id="presetParentId"
      @saved="onSaved"
    />

    <!-- Dialog nuevo set -->
    <Dialog v-model:open="setDialogOpen">
      <DialogContent class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nuevo template de tareas</DialogTitle>
        </DialogHeader>
        <div>
          <Label for="new-set-name">Nombre</Label>
          <Input id="new-set-name" v-model="newSetName" placeholder="Ej. Pre-retiro — Mujeres" />
        </div>
        <DialogFooter>
          <Button variant="outline" @click="setDialogOpen = false">Cancelar</Button>
          <Button :disabled="!newSetName.trim()" @click="createSet">Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Dialog eliminar item -->
    <Dialog v-model:open="deleteOpen">
      <DialogContent class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Eliminar tarea del template?</DialogTitle>
        </DialogHeader>
        <p class="text-sm text-gray-600">
          Se eliminará «{{ deletingItem?.name }}»<span
            v-if="deletingItem && !deletingItem.parentId && childrenOf(deletingItem.id).length"
          >
            y sus {{ childrenOf(deletingItem.id).length }} sub-tarea(s)</span
          >. Los retiros que ya la materializaron no se ven afectados.
        </p>
        <DialogFooter>
          <Button variant="outline" @click="deleteOpen = false">Cancelar</Button>
          <Button variant="destructive" @click="confirmDelete">Eliminar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Dialog eliminar set -->
    <Dialog v-model:open="deleteSetOpen">
      <DialogContent class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Eliminar el template completo?</DialogTitle>
        </DialogHeader>
        <p class="text-sm text-gray-600">
          Se eliminará «{{ selectedSet?.name }}» con todas sus tareas. Los retiros que ya lo
          importaron conservan sus tareas.
        </p>
        <DialogFooter>
          <Button variant="outline" @click="deleteSetOpen = false">Cancelar</Button>
          <Button variant="destructive" @click="confirmDeleteSet">Eliminar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
