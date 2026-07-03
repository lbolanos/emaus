<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
  Textarea,
  useToast,
} from '@repo/ui';
import {
  computeDueDate,
  offsetDaysToParts,
  partsToOffsetDays,
  type DueOffsetUnit,
} from '@repo/types';
import { apiErrorMessage, type RetreatPreRetreatTaskDTO } from '@/services/api';
import { usePreRetreatTaskStore } from '@/stores/preRetreatTaskStore';
import ParticipantSelect from '@/components/ParticipantSelect.vue';

interface ParticipantLike {
  id: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
}

const props = defineProps<{
  retreatId: string;
  /** null = crear nueva */
  task?: RetreatPreRetreatTaskDTO | null;
  /** al crear una sub-tarea, id de la tarea padre */
  parentId?: string | null;
  participants: ParticipantLike[];
  /** startDate del retiro (YYYY-MM-DD o ISO) para derivar la fecha desde el offset */
  retreatStartDate?: string | null;
}>();

const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ saved: [] }>();

const store = usePreRetreatTaskStore();
const { toast } = useToast();

const STATUS_OPTIONS: Array<{ value: RetreatPreRetreatTaskDTO['status']; label: string }> = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'done', label: 'Listo' },
  { value: 'not_applicable', label: 'No aplica' },
];

const form = ref({
  name: '',
  description: '',
  offsetValue: null as number | null,
  offsetUnit: 'weeks' as DueOffsetUnit,
  dueDate: '' as string,
  status: 'pending' as RetreatPreRetreatTaskDTO['status'],
  responsibleParticipantId: '',
  responsibleText: '',
  notes: '',
  supportNotes: '',
});
const saving = ref(false);

const isEdit = computed(() => !!props.task);
const title = computed(() => {
  if (isEdit.value) return 'Editar tarea';
  return props.parentId ? 'Nueva sub-tarea' : 'Nueva tarea';
});

/** dueDate calculada del offset (preview y payload cuando el usuario usa offset). */
const offsetDays = computed(() => {
  if (form.value.offsetValue == null || form.value.offsetValue === ('' as unknown)) return null;
  return partsToOffsetDays(Number(form.value.offsetValue), form.value.offsetUnit);
});
const computedFromOffset = computed(() => {
  if (offsetDays.value == null || !props.retreatStartDate) return null;
  return computeDueDate(props.retreatStartDate, offsetDays.value);
});

watch(
  () => [open.value, props.task, props.parentId] as const,
  ([isOpen]) => {
    if (!isOpen) return;
    const t = props.task;
    if (t) {
      const parts = t.dueOffsetDays != null ? offsetDaysToParts(t.dueOffsetDays) : null;
      form.value = {
        name: t.name,
        description: t.description ?? '',
        offsetValue: parts?.value ?? null,
        offsetUnit: parts?.unit ?? 'weeks',
        dueDate: t.dueDate ?? '',
        status: t.status,
        responsibleParticipantId: t.responsibleParticipantId ?? '',
        responsibleText: t.responsibleText ?? '',
        notes: t.notes ?? '',
        supportNotes: t.supportNotes ?? '',
      };
    } else {
      form.value = {
        name: '',
        description: '',
        offsetValue: null,
        offsetUnit: 'weeks',
        dueDate: '',
        status: 'pending',
        responsibleParticipantId: '',
        responsibleText: '',
        notes: '',
        supportNotes: '',
      };
    }
  },
  { immediate: true },
);

/** Editar el offset re-deriva la fecha; editarla a mano manda la fecha tal cual. */
function onOffsetChanged() {
  if (computedFromOffset.value) form.value.dueDate = computedFromOffset.value;
}
function onDateEdited() {
  form.value.offsetValue = null;
}

async function save() {
  if (!form.value.name.trim()) {
    toast({ title: 'El nombre es requerido', variant: 'destructive' });
    return;
  }
  saving.value = true;
  // Payload explícito campo a campo — nunca spread del DTO de lectura.
  const payload: Partial<RetreatPreRetreatTaskDTO> = {
    name: form.value.name.trim(),
    description: form.value.description.trim() || null,
    dueOffsetDays: offsetDays.value,
    dueDate: form.value.dueDate || null,
    status: form.value.status,
    responsibleParticipantId: form.value.responsibleParticipantId || null,
    responsibleText: form.value.responsibleText.trim() || null,
    notes: form.value.notes.trim() || null,
    supportNotes: form.value.supportNotes.trim() || null,
  };
  try {
    if (props.task) {
      await store.updateTask(props.retreatId, props.task.id, payload);
    } else {
      await store.createTask(props.retreatId, {
        ...payload,
        parentId: props.parentId ?? null,
      });
    }
    open.value = false;
    emit('saved');
  } catch (err) {
    toast({
      title: 'No se pudo guardar la tarea',
      description: apiErrorMessage(err),
      variant: 'destructive',
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
      </DialogHeader>

      <div class="space-y-4">
        <div>
          <Label for="prt-name">Tarea *</Label>
          <Input id="prt-name" v-model="form.name" placeholder="Ej. Confirmar menús con la casa" />
        </div>

        <div>
          <Label for="prt-desc">Detalle</Label>
          <Textarea id="prt-desc" v-model="form.description" rows="2" />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Tiempo antes del retiro</Label>
            <div class="flex gap-2">
              <Input
                type="number"
                min="0"
                class="w-20"
                v-model.number="form.offsetValue"
                @change="onOffsetChanged"
              />
              <select
                v-model="form.offsetUnit"
                class="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                @change="onOffsetChanged"
              >
                <option value="months">meses</option>
                <option value="weeks">semanas</option>
                <option value="days">días</option>
              </select>
            </div>
          </div>
          <div>
            <Label for="prt-due">Fecha límite</Label>
            <Input id="prt-due" type="date" v-model="form.dueDate" @input="onDateEdited" />
            <p v-if="computedFromOffset" class="text-xs text-gray-500 mt-1">
              Según el retiro: {{ computedFromOffset }}
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Responsable (servidor)</Label>
            <ParticipantSelect
              v-model="form.responsibleParticipantId"
              :participants="participants"
              placeholder="Buscar servidor..."
            />
          </div>
          <div>
            <Label for="prt-resp-text">Responsable (texto libre)</Label>
            <Input id="prt-resp-text" v-model="form.responsibleText" placeholder="Ej. JAAM, Leo…" />
          </div>
        </div>

        <div v-if="isEdit">
          <Label>Estado</Label>
          <select
            v-model="form.status"
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option v-for="s in STATUS_OPTIONS" :key="s.value" :value="s.value">
              {{ s.label }}
            </option>
          </select>
        </div>

        <div>
          <Label for="prt-notes">Notas</Label>
          <Textarea id="prt-notes" v-model="form.notes" rows="2" />
        </div>

        <div>
          <Label for="prt-support">Apoyado con</Label>
          <Input id="prt-support" v-model="form.supportNotes" />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="open = false">Cancelar</Button>
        <Button :disabled="saving" @click="save">
          {{ saving ? 'Guardando…' : 'Guardar' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
