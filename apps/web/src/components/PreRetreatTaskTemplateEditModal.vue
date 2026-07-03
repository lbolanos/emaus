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
import { offsetDaysToParts, partsToOffsetDays, type DueOffsetUnit } from '@repo/types';
import {
  preRetreatTaskTemplateApi,
  apiErrorMessage,
  type PreRetreatTaskTemplateDTO,
} from '@/services/api';

const props = defineProps<{
  templateSetId: string;
  /** null = crear nueva */
  item?: PreRetreatTaskTemplateDTO | null;
  /** raíces disponibles para elegir padre (crear sub-tarea) */
  rootOptions: PreRetreatTaskTemplateDTO[];
  /** preselección del padre al crear sub-tarea desde el menú de una raíz */
  presetParentId?: string | null;
}>();

const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ saved: [] }>();
const { toast } = useToast();

const form = ref({
  name: '',
  description: '',
  parentId: '' as string,
  hasOffset: true,
  offsetValue: 4 as number | null,
  offsetUnit: 'weeks' as DueOffsetUnit,
  defaultOrder: 0,
  supportNotes: '',
});
const saving = ref(false);

const isEdit = computed(() => !!props.item);
const isChild = computed(() => !!form.value.parentId);
const title = computed(() => (isEdit.value ? 'Editar tarea del template' : 'Nueva tarea del template'));

watch(
  () => [open.value, props.item, props.presetParentId] as const,
  ([isOpen]) => {
    if (!isOpen) return;
    const t = props.item;
    if (t) {
      const parts = t.dueOffsetDays != null ? offsetDaysToParts(t.dueOffsetDays) : null;
      form.value = {
        name: t.name,
        description: t.description ?? '',
        parentId: t.parentId ?? '',
        hasOffset: t.dueOffsetDays != null,
        offsetValue: parts?.value ?? null,
        offsetUnit: parts?.unit ?? 'weeks',
        defaultOrder: t.defaultOrder ?? 0,
        supportNotes: t.supportNotes ?? '',
      };
    } else {
      form.value = {
        name: '',
        description: '',
        parentId: props.presetParentId ?? '',
        hasOffset: !props.presetParentId,
        offsetValue: props.presetParentId ? null : 4,
        offsetUnit: 'weeks',
        defaultOrder: 0,
        supportNotes: '',
      };
    }
  },
  { immediate: true },
);

const offsetDays = computed(() => {
  if (!form.value.hasOffset || form.value.offsetValue == null) return null;
  return partsToOffsetDays(Number(form.value.offsetValue), form.value.offsetUnit);
});

async function save() {
  if (!form.value.name.trim()) {
    toast({ title: 'El nombre es requerido', variant: 'destructive' });
    return;
  }
  if (!form.value.parentId && offsetDays.value == null) {
    toast({
      title: 'Las tareas principales necesitan "tiempo antes del retiro"',
      description: 'Solo las sub-tareas pueden heredar el tiempo del padre.',
      variant: 'destructive',
    });
    return;
  }
  saving.value = true;
  // Payload explícito — nunca spread del DTO de lectura.
  const payload: Partial<PreRetreatTaskTemplateDTO> = {
    templateSetId: props.templateSetId,
    parentId: form.value.parentId || null,
    name: form.value.name.trim(),
    description: form.value.description.trim() || null,
    dueOffsetDays: offsetDays.value,
    defaultOrder: Number(form.value.defaultOrder) || 0,
    supportNotes: form.value.supportNotes.trim() || null,
    isActive: true,
  };
  try {
    if (props.item) {
      await preRetreatTaskTemplateApi.update(props.item.id, payload);
    } else {
      await preRetreatTaskTemplateApi.create(payload);
    }
    open.value = false;
    emit('saved');
  } catch (err) {
    toast({
      title: 'No se pudo guardar',
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
          <Label for="prtt-name">Tarea *</Label>
          <Input id="prtt-name" v-model="form.name" placeholder="Ej. Confirmar menús" />
        </div>

        <div>
          <Label>Tarea padre</Label>
          <select
            v-model="form.parentId"
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            :disabled="isEdit && !!props.item?.parentId === false && rootOptions.length === 0"
          >
            <option value="">— Ninguna (tarea principal) —</option>
            <option v-for="r in rootOptions" :key="r.id" :value="r.id" :disabled="r.id === props.item?.id">
              {{ r.name }}
            </option>
          </select>
        </div>

        <div>
          <Label for="prtt-desc">Detalle</Label>
          <Textarea id="prtt-desc" v-model="form.description" rows="2" />
        </div>

        <div>
          <Label>Tiempo antes del retiro</Label>
          <label v-if="isChild" class="flex items-center gap-2 text-sm text-gray-600 mb-1">
            <input
              type="checkbox"
              :checked="!form.hasOffset"
              @change="form.hasOffset = !($event.target as HTMLInputElement).checked"
            />
            Heredar de la tarea padre
          </label>
          <div v-if="form.hasOffset || !isChild" class="flex gap-2">
            <Input type="number" min="0" class="w-20" v-model.number="form.offsetValue" />
            <select
              v-model="form.offsetUnit"
              class="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="months">meses</option>
              <option value="weeks">semanas</option>
              <option value="days">días</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <Label for="prtt-order">Orden</Label>
            <Input id="prtt-order" type="number" v-model.number="form.defaultOrder" />
          </div>
          <div>
            <Label for="prtt-support">Apoyado con</Label>
            <Input id="prtt-support" v-model="form.supportNotes" />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="open = false">Cancelar</Button>
        <Button :disabled="saving" @click="save">{{ saving ? 'Guardando…' : 'Guardar' }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
