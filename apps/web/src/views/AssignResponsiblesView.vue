<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold">Apoyos / sobreescribir responsables</h1>
        <p class="text-sm text-gray-600 max-w-3xl">
          Esta vista es para <strong>casos especiales</strong>: items custom o cambios manuales.
          Lo normal es que los items vengan ya vinculados desde el template — asigna participantes
          a las Responsabilidades en <em>Asignaciones → Responsabilidades</em> y se propagan solas.
        </p>
      </div>
      <div v-if="canManage.schedule.value" class="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" @click="loadSuggestions" :disabled="loading">
          🪄 Aplicar sugerencias
        </Button>
        <Button size="sm" @click="saveAll" :disabled="loading || !hasUnsaved">
          💾 Guardar todo ({{ unsavedCount }})
        </Button>
      </div>
      <div v-else class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
        Solo lectura — necesitas el permiso <code>schedule:manage</code> para editar.
      </div>
    </div>

    <!-- Resumen + filtros -->
    <Card>
      <CardContent class="pt-4">
        <div class="flex flex-wrap items-center gap-4 text-sm">
          <span><strong>{{ totalItems }}</strong> items totales</span>
          <span class="text-green-700">✅ <strong>{{ assignedCount }}</strong> con responsable</span>
          <span class="text-amber-700">⚠️ <strong>{{ missingCount }}</strong> sin asignar</span>
          <span class="text-blue-700">💡 <strong>{{ suggestedCount }}</strong> sugeridos</span>
          <label class="ml-auto flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="showOnlyMissing" />
            <span>Mostrar solo sin asignar</span>
          </label>
        </div>
      </CardContent>
    </Card>

    <!-- Tabla -->
    <Card>
      <CardContent class="p-0">
        <div v-if="loading" class="p-6 text-center text-gray-500">Cargando…</div>
        <div v-else-if="!filteredItems.length" class="p-6 text-center text-gray-500">
          No hay items para mostrar.
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm min-w-[700px]">
            <thead class="bg-gray-50 border-b">
              <tr class="text-left text-xs uppercase text-gray-500">
                <th class="px-3 py-2">Item</th>
                <th class="px-3 py-2">Responsable principal</th>
                <th class="px-3 py-2">Apoyos</th>
                <th class="px-3 py-2 w-24 text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in filteredItems"
                :key="row.item.id"
                class="border-b hover:bg-gray-50"
                :class="rowState(row) === 'unsaved' ? 'bg-blue-50/30' : ''"
              >
                <td class="px-3 py-2 align-top">
                  <div class="font-medium">{{ row.item.name }}</div>
                  <div class="text-xs text-gray-500 mt-0.5">
                    Día {{ row.item.day }} · {{ fmtTime(row.item.startTime) }}
                    <span v-if="row.item.type"> · {{ row.item.type }}</span>
                  </div>
                </td>
                <td class="px-3 py-2 align-top">
                  <select
                    v-model="row.responsabilityId"
                    :disabled="!canManage.schedule.value"
                    class="w-full border rounded px-2 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    :class="row.suggested && !row.userTouched ? 'italic text-gray-500' : ''"
                    @change="onChangeResp(row)"
                  >
                    <option :value="null">— Ninguno —</option>
                    <option
                      v-for="r in responsabilities"
                      :key="r.id"
                      :value="r.id"
                    >
                      {{ r.name }}{{ !r.participantId ? ' (sin participante)' : '' }}
                    </option>
                  </select>
                  <div v-if="row.suggested && !row.userTouched" class="text-xs text-gray-400 mt-0.5">
                    💡 {{ row.suggestedReason }}
                  </div>
                </td>
                <td class="px-3 py-2 align-top">
                  <div class="flex flex-wrap gap-1 mb-1">
                    <span
                      v-for="pid in row.responsableParticipantIds"
                      :key="pid"
                      class="inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-xs"
                    >
                      {{ participantName(pid) }}
                      <button
                        v-if="canManage.schedule.value"
                        @click="removeApoyo(row, pid)"
                        class="text-gray-500 hover:text-red-600"
                      >×</button>
                    </span>
                  </div>
                  <select
                    v-if="canManage.schedule.value"
                    class="w-full border rounded px-2 py-1.5 text-xs"
                    @change="onApoyoSelect($event, row)"
                  >
                    <option value="">+ Agregar apoyo…</option>
                    <option
                      v-for="p in availableApoyos(row)"
                      :key="p.id"
                      :value="p.id"
                    >
                      {{ p.firstName }} {{ p.lastName }}
                    </option>
                  </select>
                </td>
                <td class="px-3 py-2 align-top text-center">
                  <Badge v-if="rowState(row) === 'saved'" variant="secondary">✅ Guardado</Badge>
                  <Badge v-else-if="rowState(row) === 'unsaved'" class="bg-blue-600">💡 Sin guardar</Badge>
                  <Badge v-else variant="outline">⚠️ Sin asignar</Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Badge, Button, Card, CardContent, useToast } from '@repo/ui';
import {
  retreatScheduleApi,
  api,
  type ResponsableSuggestion,
  type BulkAssignment,
} from '@/services/api';
import { useAuthPermissions } from '@/composables/useAuthPermissions';

const { canManage } = useAuthPermissions();
import type { RetreatScheduleItem } from '@repo/types';

type RetreatScheduleItemDTO = RetreatScheduleItem & {
  responsabilityId?: string | null;
  responsables?: Array<{ participantId: string }>;
};

interface RowState {
  item: RetreatScheduleItemDTO;
  responsabilityId: string | null;
  responsableParticipantIds: string[];
  suggested: boolean;
  suggestedReason: string;
  userTouched: boolean;
  savedSnapshot: { responsabilityId: string | null; apoyos: string[] };
}

interface Resp {
  id: string;
  name: string;
  participantId: string | null;
}
interface Participant {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
}

const route = useRoute();
const router = useRouter();
const { toast } = useToast();

const retreatId = computed(() => route.params.id as string);

const rows = ref<RowState[]>([]);
const responsabilities = ref<Resp[]>([]);
const participants = ref<Participant[]>([]);
const loading = ref(false);
const showOnlyMissing = ref(false);

// ─── Computed stats ──────────────────────────────────────────────────────────
const totalItems = computed(() => rows.value.length);
const assignedCount = computed(
  () => rows.value.filter((r) => r.savedSnapshot.responsabilityId).length,
);
const missingCount = computed(() => totalItems.value - assignedCount.value);
const suggestedCount = computed(
  () => rows.value.filter((r) => r.suggested && !r.userTouched).length,
);
const unsavedCount = computed(() => rows.value.filter(isRowUnsaved).length);
const hasUnsaved = computed(() => unsavedCount.value > 0);

const filteredItems = computed(() =>
  showOnlyMissing.value
    ? rows.value.filter((r) => !r.responsabilityId)
    : rows.value,
);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isRowUnsaved(r: RowState): boolean {
  if (r.responsabilityId !== r.savedSnapshot.responsabilityId) return true;
  if (r.responsableParticipantIds.length !== r.savedSnapshot.apoyos.length) return true;
  for (const id of r.responsableParticipantIds) {
    if (!r.savedSnapshot.apoyos.includes(id)) return true;
  }
  return false;
}

function rowState(r: RowState): 'saved' | 'unsaved' | 'unassigned' {
  if (isRowUnsaved(r)) return 'unsaved';
  if (r.responsabilityId || r.responsableParticipantIds.length) return 'saved';
  return 'unassigned';
}

function participantName(id: string): string {
  const p = participants.value.find((x) => x.id === id);
  if (!p) return '—';
  return p.nickname || `${p.firstName} ${p.lastName}`;
}

function availableApoyos(row: RowState): Participant[] {
  const used = new Set(row.responsableParticipantIds);
  return participants.value.filter((p) => !used.has(p.id));
}

function fmtTime(value: string | Date): string {
  try {
    const d = value instanceof Date ? value : new Date(value);
    return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(value);
  }
}

function onChangeResp(row: RowState) {
  row.userTouched = true;
}

function addApoyo(row: RowState, participantId: string) {
  if (!participantId) return;
  if (row.responsableParticipantIds.includes(participantId)) return;
  row.responsableParticipantIds = [...row.responsableParticipantIds, participantId];
  row.userTouched = true;
}

function onApoyoSelect(event: Event, row: RowState) {
  const select = event.target as HTMLSelectElement;
  if (select.value) {
    addApoyo(row, select.value);
    select.value = '';
  }
}

function removeApoyo(row: RowState, participantId: string) {
  row.responsableParticipantIds = row.responsableParticipantIds.filter(
    (id) => id !== participantId,
  );
  row.userTouched = true;
}

// ─── Loading ─────────────────────────────────────────────────────────────────
async function loadAll() {
  loading.value = true;
  try {
    const id = retreatId.value;
    const [items, respsResp, partsResp] = await Promise.all([
      retreatScheduleApi.list(id),
      api.get('/responsibilities', { params: { retreatId: id } }),
      api.get('/participants', { params: { retreatId: id } }),
    ]);
    responsabilities.value = (respsResp.data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      participantId: r.participantId ?? null,
    }));
    participants.value = (partsResp.data ?? []).map((p: any) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      nickname: p.nickname,
    }));
    rows.value = items.map((it: any) => {
      const apoyos = (it.responsables ?? []).map((r: any) => r.participantId as string);
      const respId: string | null = it.responsabilityId ?? null;
      return {
        item: it as RetreatScheduleItemDTO,
        responsabilityId: respId,
        responsableParticipantIds: apoyos,
        suggested: false,
        suggestedReason: '',
        userTouched: false,
        savedSnapshot: {
          responsabilityId: respId,
          apoyos: [...apoyos],
        },
      } satisfies RowState;
    });
  } catch (err) {
    console.error(err);
    toast({
      title: 'Error al cargar',
      description: 'No se pudieron obtener los items / responsabilidades.',
      variant: 'destructive',
    });
  } finally {
    loading.value = false;
  }
}

async function loadSuggestions() {
  loading.value = true;
  try {
    const suggestions: ResponsableSuggestion[] = await retreatScheduleApi.suggestResponsables(
      retreatId.value,
    );
    const byItem = new Map(suggestions.map((s) => [s.itemId, s]));
    let applied = 0;
    for (const row of rows.value) {
      const sug = byItem.get(row.item.id);
      if (!sug || !sug.responsabilityId) continue;
      // No sobrescribir si ya hay valor guardado o el usuario lo tocó
      if (row.savedSnapshot.responsabilityId || row.userTouched) continue;
      row.responsabilityId = sug.responsabilityId;
      row.suggested = true;
      row.suggestedReason = sug.reason;
      applied++;
    }
    toast({
      title: '🪄 Sugerencias aplicadas',
      description: `${applied} items recibieron sugerencias. Revisa y guarda.`,
    });
  } catch (err) {
    console.error(err);
    toast({ title: 'Error', description: 'No se pudieron cargar sugerencias.', variant: 'destructive' });
  } finally {
    loading.value = false;
  }
}

async function saveAll() {
  const dirty = rows.value.filter(isRowUnsaved);
  if (!dirty.length) return;

  loading.value = true;
  try {
    const assignments: BulkAssignment[] = dirty.map((r) => ({
      itemId: r.item.id,
      responsabilityId: r.responsabilityId,
      responsableParticipantIds: r.responsableParticipantIds,
    }));
    const result = await retreatScheduleApi.bulkAssignResponsables(retreatId.value, assignments);

    // Actualizar snapshots de las filas guardadas
    for (const r of dirty) {
      r.savedSnapshot = {
        responsabilityId: r.responsabilityId,
        apoyos: [...r.responsableParticipantIds],
      };
      r.suggested = false;
      r.userTouched = false;
    }

    toast({
      title: '💾 Guardado',
      description: `${result.updated} items actualizados${result.skipped > 0 ? `, ${result.skipped} omitidos` : ''}.`,
    });
  } catch (err) {
    console.error(err);
    toast({
      title: 'Error al guardar',
      description: 'No se pudieron guardar todos los cambios.',
      variant: 'destructive',
    });
  } finally {
    loading.value = false;
  }
}

watch(retreatId, () => loadAll(), { immediate: true });
onMounted(() => loadAll());
</script>
