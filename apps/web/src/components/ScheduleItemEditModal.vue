<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          {{ mode === 'add' ? 'Nueva actividad' : 'Editar actividad' }}
        </DialogTitle>
      </DialogHeader>

      <div class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="md:col-span-2 space-y-1">
            <Label>Nombre</Label>
            <Input v-model="form.name" placeholder="Ej. Testimonio 1 — Conocerte a ti mismo" />
          </div>
          <div class="space-y-1">
            <Label>Tipo</Label>
            <select v-model="form.type" class="w-full border rounded px-2 py-2 text-sm">
              <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div class="space-y-1">
            <Label>Día</Label>
            <Input type="number" min="1" max="7" v-model.number="form.day" />
          </div>
          <div class="space-y-1">
            <Label>Hora de inicio</Label>
            <Input type="datetime-local" v-model="form.startTimeLocal" />
          </div>
          <div class="space-y-1">
            <Label>Duración (min)</Label>
            <Input type="number" min="1" v-model.number="form.durationMinutes" />
          </div>
          <div class="space-y-1">
            <Label>Lugar</Label>
            <Input v-model="form.location" placeholder="Comedor, Capilla…" />
          </div>
          <div class="space-y-1">
            <Label>Orden del día</Label>
            <Input type="number" v-model.number="form.orderInDay" />
          </div>
        </div>

        <div class="space-y-1">
          <Label>Música / palanquita</Label>
          <Input v-model="form.palanquitaNotes" />
        </div>
        <div class="space-y-1">
          <Label>URL de música</Label>
          <Input v-model="form.musicTrackUrl" placeholder="https://…" />
        </div>
        <div class="space-y-1">
          <Label>Plan B / notas</Label>
          <Textarea v-model="form.planBNotes" rows="2" />
        </div>
        <div class="space-y-1">
          <Label>Notas</Label>
          <Textarea v-model="form.notes" rows="2" />
        </div>

        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" v-model="form.blocksSantisimoAttendance" />
          Bloquea asistencia al Santísimo (comida/dinámica en mesa)
        </label>

        <!-- Responsable principal -->
        <div class="p-3 border rounded-lg space-y-2">
          <Label class="font-medium">Responsable principal</Label>
          <p class="text-xs text-muted-foreground">
            Vincula este item a una Responsabilidad del retiro (charlista, campanero, etc.). El participante asignado a esa responsabilidad recibirá la notificación.
          </p>
          <select
            v-model="form.responsabilityId"
            class="w-full border rounded px-2 py-2 text-sm"
          >
            <option :value="null">— Ninguna —</option>
            <option
              v-for="r in responsibilities"
              :key="r.id"
              :value="r.id"
            >
              {{ r.name }}<template v-if="r.participant"> — {{ r.participant.firstName }} {{ r.participant.lastName }}</template>
            </option>
          </select>
        </div>

        <!-- Apoyos (N participantes) -->
        <div class="p-3 border rounded-lg space-y-2">
          <Label class="font-medium">Apoyos</Label>
          <p class="text-xs text-muted-foreground">
            Participantes adicionales que también deben recibir aviso (lectores, acólitos, presentadores).
          </p>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="pid in form.responsableParticipantIds"
              :key="pid"
              class="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-full px-3 py-1 text-xs"
            >
              {{ participantName(pid) }}
              <button
                type="button"
                class="text-blue-600 hover:text-blue-800"
                @click="removeApoyo(pid)"
              >
                ✕
              </button>
            </span>
            <span
              v-if="!form.responsableParticipantIds.length"
              class="text-xs text-gray-400"
            >
              (ninguno)
            </span>
          </div>
          <select
            v-model="apoyoToAdd"
            class="w-full border rounded px-2 py-2 text-sm"
            @change="addApoyo"
          >
            <option value="">+ Añadir apoyo…</option>
            <option
              v-for="p in availableParticipants"
              :key="p.id"
              :value="p.id"
            >
              {{ p.firstName }} {{ p.lastName }}<template v-if="p.nickname"> ({{ p.nickname }})</template>
            </option>
          </select>
        </div>

        <!-- Documentos del template (read-only) -->
        <div
          v-if="item?.attachments?.length"
          class="p-3 border rounded-lg space-y-2 bg-emerald-50/40"
        >
          <Label class="font-medium">📎 Documentos del template</Label>
          <p class="text-xs text-muted-foreground">
            Los archivos viven en el template global; para añadir o cambiar uno ve a
            <strong>Configuración Global → Template Minuto a Minuto</strong>.
          </p>
          <ul class="space-y-1">
            <li
              v-for="att in item.attachments"
              :key="att.id"
              class="flex items-center gap-2 text-sm"
            >
              <span>{{ att.kind === 'markdown' ? '📝' : '📄' }}</span>
              <span class="flex-1 truncate" :title="att.fileName">{{ att.fileName }}</span>
              <a
                v-if="att.kind === 'file'"
                :href="att.storageUrl"
                :download="att.fileName"
                target="_blank"
                rel="noopener noreferrer"
                class="text-blue-600 hover:underline text-xs"
              >Descargar</a>
              <a
                v-else
                :href="att.storageUrl"
                :download="att.fileName"
                target="_blank"
                rel="noopener noreferrer"
                class="text-blue-600 hover:underline text-xs"
              >Descargar .md</a>
            </li>
          </ul>
        </div>
      </div>

      <DialogFooter class="gap-2">
        <Button
          v-if="mode === 'edit' && item"
          type="button"
          variant="ghost"
          class="text-red-600 mr-auto"
          @click="onDelete"
        >
          Eliminar
        </Button>
        <Button type="button" variant="outline" @click="$emit('update:open', false)">
          Cancelar
        </Button>
        <Button type="button" @click="onSubmit" :disabled="!form.name || !form.startTimeLocal">
          {{ mode === 'add' ? 'Crear' : 'Guardar' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@repo/ui';
import type { RetreatScheduleItemDTO } from '@/services/api';
import type { Responsability, Participant } from '@repo/types';

const TYPES = [
  'charla',
  'testimonio',
  'dinamica',
  'misa',
  'comida',
  'refrigerio',
  'traslado',
  'campana',
  'logistica',
  'santisimo',
  'descanso',
  'oracion',
  'otro',
];

interface Props {
  open: boolean;
  mode: 'add' | 'edit';
  item?: RetreatScheduleItemDTO | null;
  retreatId: string;
  participants: Array<Pick<Participant, 'id' | 'firstName' | 'lastName' | 'nickname'>>;
  responsibilities: Responsability[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'submit', payload: SubmitPayload): void;
  (e: 'delete', id: string): void;
}>();

export type SubmitPayload = {
  name: string;
  type: string;
  day: number;
  startTime: string;
  durationMinutes: number;
  orderInDay: number;
  location?: string | null;
  notes?: string | null;
  musicTrackUrl?: string | null;
  palanquitaNotes?: string | null;
  planBNotes?: string | null;
  blocksSantisimoAttendance: boolean;
  responsabilityId?: string | null;
  responsableParticipantIds: string[];
};

const apoyoToAdd = ref('');
const form = ref(emptyForm());

function emptyForm() {
  return {
    name: '',
    type: 'otro',
    day: 1,
    startTimeLocal: '',
    durationMinutes: 15,
    orderInDay: 0,
    location: '',
    notes: '',
    musicTrackUrl: '',
    palanquitaNotes: '',
    planBNotes: '',
    blocksSantisimoAttendance: false,
    responsabilityId: null as string | null,
    responsableParticipantIds: [] as string[],
  };
}

function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

watch(
  () => [props.open, props.item, props.mode],
  () => {
    if (!props.open) return;
    if (props.mode === 'edit' && props.item) {
      const it = props.item;
      form.value = {
        name: it.name,
        type: it.type,
        day: it.day,
        startTimeLocal: toLocalInput(it.startTime),
        durationMinutes: it.durationMinutes,
        orderInDay: it.orderInDay,
        location: it.location ?? '',
        notes: it.notes ?? '',
        musicTrackUrl: it.musicTrackUrl ?? '',
        palanquitaNotes: it.palanquitaNotes ?? '',
        planBNotes: it.planBNotes ?? '',
        blocksSantisimoAttendance: !!it.blocksSantisimoAttendance,
        responsabilityId: it.responsabilityId ?? null,
        responsableParticipantIds: (it.responsables ?? []).map((r) => r.participantId),
      };
    } else {
      form.value = emptyForm();
    }
    apoyoToAdd.value = '';
  },
  { immediate: true },
);

const availableParticipants = computed(() =>
  props.participants.filter(
    (p) => !form.value.responsableParticipantIds.includes(p.id),
  ),
);

function participantName(id: string): string {
  const p = props.participants.find((x) => x.id === id);
  if (!p) return id.slice(0, 8);
  return p.nickname || `${p.firstName} ${p.lastName}`.trim();
}

function addApoyo() {
  if (apoyoToAdd.value && !form.value.responsableParticipantIds.includes(apoyoToAdd.value)) {
    form.value.responsableParticipantIds.push(apoyoToAdd.value);
  }
  apoyoToAdd.value = '';
}

function removeApoyo(id: string) {
  form.value.responsableParticipantIds = form.value.responsableParticipantIds.filter(
    (x) => x !== id,
  );
}

function onSubmit() {
  emit('submit', {
    name: form.value.name,
    type: form.value.type,
    day: form.value.day,
    startTime: new Date(form.value.startTimeLocal).toISOString(),
    durationMinutes: form.value.durationMinutes,
    orderInDay: form.value.orderInDay,
    location: form.value.location || null,
    notes: form.value.notes || null,
    musicTrackUrl: form.value.musicTrackUrl || null,
    palanquitaNotes: form.value.palanquitaNotes || null,
    planBNotes: form.value.planBNotes || null,
    blocksSantisimoAttendance: form.value.blocksSantisimoAttendance,
    responsabilityId: form.value.responsabilityId,
    responsableParticipantIds: form.value.responsableParticipantIds,
  });
}

function onDelete() {
  if (!props.item) return;
  if (!confirm(`¿Eliminar "${props.item.name}" del minuto a minuto?`)) return;
  emit('delete', props.item.id);
}
</script>
