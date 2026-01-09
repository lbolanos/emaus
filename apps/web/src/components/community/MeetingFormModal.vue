<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <DialogTitle>
          {{ editingMeeting ? $t('community.meeting.editMeeting') : $t('community.meeting.addMeeting') }}
        </DialogTitle>
        <DialogDescription>
          {{ editingMeeting ? 'Edita los detalles de la reunión o anuncio.' : 'Crea una nueva reunión o anuncio para tu comunidad.' }}
        </DialogDescription>
      </DialogHeader>

      <form @submit.prevent="handleSubmit" class="flex-1 overflow-hidden flex flex-col">
        <!-- Type Toggle (always visible at top) -->
        <div class="flex items-center justify-between p-3 border rounded-lg bg-muted/50 mb-4">
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <Badge :variant="form.isAnnouncement ? 'secondary' : 'outline'">
                {{ form.isAnnouncement ? 'Anuncio' : 'Reunión' }}
              </Badge>
            </div>
            <p class="text-sm text-muted-foreground mt-1">
              {{ form.isAnnouncement
                ? 'Los anuncios no requieren duración ni asistencia'
                : 'Las reuniones requieren duración y permiten registrar asistencia'
              }}
            </p>
          </div>
          <div class="flex items-center gap-2 ml-4">
            <span class="text-sm">{{ form.isAnnouncement ? 'Anuncio' : 'Reunión' }}</span>
            <Switch v-model="form.isAnnouncement" />
          </div>
        </div>

        <!-- Tabs -->
        <Tabs default-value="general" class="flex-1 flex flex-col">
          <TabsList class="grid w-full grid-cols-3">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="datetime">Fecha y Hora</TabsTrigger>
            <TabsTrigger value="recurrence" :disabled="form.isAnnouncement">Repetición</TabsTrigger>
          </TabsList>

          <TabsContent value="general" class="flex-1 overflow-y-auto mt-4 space-y-4">
            <!-- Title -->
            <div class="space-y-2">
              <Label for="title">
                Título <span class="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                v-model="form.title"
                placeholder="Ej: Reunión semanal de seguimiento"
                :class="{ 'border-red-500': errors.title }"
              />
              <p v-if="errors.title" class="text-sm text-red-500">{{ errors.title }}</p>
            </div>

            <!-- Description -->
            <div class="space-y-2">
              <Label for="description">Descripción</Label>
              <Textarea
                id="description"
                v-model="form.description"
                placeholder="Detalles adicionales sobre la reunión o anuncio..."
                rows="4"
              />
              <p class="text-xs text-muted-foreground">Información adicional para los miembros (opcional)</p>
            </div>
          </TabsContent>

          <TabsContent value="datetime" class="flex-1 overflow-y-auto mt-4 space-y-4">
            <!-- Date and Time -->
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="date">
                  Fecha <span class="text-red-500">*</span>
                </Label>
                <Input
                  id="date"
                  type="date"
                  v-model="form.date"
                  :class="{ 'border-red-500': errors.date }"
                />
                <p v-if="errors.date" class="text-sm text-red-500">{{ errors.date }}</p>
              </div>

              <div class="space-y-2">
                <Label for="time">
                  Hora <span class="text-red-500">*</span>
                </Label>
                <Input
                  id="time"
                  type="time"
                  v-model="form.time"
                  :class="{ 'border-red-500': errors.time }"
                />
                <p v-if="errors.time" class="text-sm text-red-500">{{ errors.time }}</p>
              </div>
            </div>

            <!-- Duration (only for meetings) -->
            <div v-if="!form.isAnnouncement" class="space-y-3">
              <div class="flex items-center justify-between">
                <Label for="duration">
                  Duración (minutos) <span class="text-red-500">*</span>
                </Label>
                <div class="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    @click="form.durationMinutes = 30"
                  >30 min</Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    @click="form.durationMinutes = 60"
                  >60 min</Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    @click="form.durationMinutes = 90"
                  >90 min</Button>
                </div>
              </div>
              <Input
                id="duration"
                type="number"
                v-model="form.durationMinutes"
                min="5"
                max="480"
                placeholder="60"
                :class="{ 'border-red-500': errors.durationMinutes }"
              />
              <p v-if="errors.durationMinutes" class="text-sm text-red-500">{{ errors.durationMinutes }}</p>
              <p class="text-xs text-muted-foreground">Duración estimada de la reunión</p>
            </div>
          </TabsContent>

          <TabsContent value="recurrence" class="flex-1 overflow-y-auto mt-4 space-y-4">
            <div v-if="form.isAnnouncement" class="p-4 text-center text-muted-foreground">
              <p>Los anuncios no pueden ser recurrentes</p>
            </div>
            <div v-else class="space-y-4">
              <!-- Recurrence Toggle -->
              <div class="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                <div class="flex-1">
                  <Label class="font-medium">Repetir reunión</Label>
                  <p class="text-sm text-muted-foreground">Crear una reunión recurrente</p>
                </div>
                <div class="flex items-center gap-2 ml-4">
                  <span class="text-sm">{{ form.isRecurring ? 'Recurrente' : 'Única' }}</span>
                  <Switch v-model="form.isRecurring" />
                </div>
              </div>

              <!-- Recurrence Options -->
              <div v-if="form.isRecurring" class="space-y-4 p-4 border rounded-lg bg-muted/30">
                <!-- Frequency -->
                <div class="space-y-2">
                  <Label>Frecuencia</Label>
                  <Select v-model="form.recurrence.frequency">
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona frecuencia" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Diaria</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <!-- Weekly Options -->
                <div v-if="form.recurrence.frequency === 'weekly'" class="space-y-3">
                  <div class="flex items-center gap-2">
                    <Label>Cada</Label>
                    <Input
                      type="number"
                      v-model="form.recurrence.interval"
                      min="1"
                      max="52"
                      class="w-20"
                    />
                    <Label>semanas</Label>
                  </div>
                  <div>
                    <Label>Día de la semana</Label>
                    <div class="flex gap-1 mt-2">
                      <Button
                        v-for="day in weekDays"
                        :key="day.value"
                        type="button"
                        :variant="form.recurrence.dayOfWeek === day.value ? 'default' : 'outline'"
                        size="sm"
                        @click="form.recurrence.dayOfWeek = day.value"
                      >
                        {{ day.label }}
                      </Button>
                    </div>
                  </div>
                </div>

                <!-- Monthly Options -->
                <div v-if="form.recurrence.frequency === 'monthly'" class="space-y-2">
                  <Label>Día del mes</Label>
                  <Input
                    type="number"
                    v-model="form.recurrence.dayOfMonth"
                    min="1"
                    max="31"
                    placeholder="1-31"
                  />
                </div>

                <!-- Preview -->
                <div class="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <p class="text-sm text-blue-800 dark:text-blue-200">
                    {{ getRecurrenceDescription() }}
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <!-- Edit Scope (when editing recurring meeting) -->
        <div v-if="editingMeeting?.isRecurrenceTemplate && !form.isAnnouncement" class="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg mb-4">
          <Label class="font-medium mb-2 block text-amber-800 dark:text-amber-200">
            Actualizar repeticiones
          </Label>
          <RadioGroup v-model="updateScope">
            <div class="flex items-center gap-2 mb-2">
              <RadioGroupItem value="this" id="scope-this" />
              <Label for="scope-this" class="cursor-pointer">
                Solo esta reunión
              </Label>
            </div>
            <div class="flex items-center gap-2 mb-2">
              <RadioGroupItem value="all_future" id="scope-future" />
              <Label for="scope-future" class="cursor-pointer">
                Esta y todas las futuras
              </Label>
            </div>
            <div class="flex items-center gap-2">
              <RadioGroupItem value="all" id="scope-all" />
              <Label for="scope-all" class="cursor-pointer">
                Todas las repeticiones
              </Label>
            </div>
          </RadioGroup>
        </div>

        <!-- Meeting Info (when editing) -->
        <div v-if="editingMeeting" class="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg mb-4">
          <div class="flex items-start gap-2">
            <Info class="w-4 h-4 text-blue-600 mt-0.5" />
            <div class="text-sm text-blue-800 dark:text-blue-200">
              <p class="font-medium mb-1">Editando reunión existente</p>
              <p class="text-blue-600 dark:text-blue-400">Los cambios se aplicarán a la reunión "{{ editingMeeting.title }}"</p>
            </div>
          </div>
        </div>

        <!-- DialogFooter inside the form for submit functionality -->
        <DialogFooter class="flex-col sm:flex-row gap-3 border-t pt-4 mt-auto">
          <Button
            v-if="editingMeeting"
            type="button"
            variant="destructive"
            @click="handleDelete"
            :disabled="isDeleting"
            class="w-full sm:w-auto"
          >
            <Loader2 v-if="isDeleting" class="w-4 h-4 mr-2 animate-spin" />
            <Trash2 v-else class="w-4 h-4 mr-2" />
            Eliminar
          </Button>
          <div class="flex gap-2 w-full sm:w-auto sm:ml-auto">
            <Button type="button" variant="outline" @click="handleClose" :disabled="isSaving">
              Cancelar
            </Button>
            <Button type="submit" :disabled="!isFormValid || isSaving" class="min-w-[100px]">
              <Loader2 v-if="isSaving" class="w-4 h-4 mr-2 animate-spin" />
              {{ isSaving ? 'Guardando...' : editingMeeting ? 'Guardar cambios' : 'Crear reunión' }}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useCommunityStore } from '@/stores/communityStore';
import { Info, Loader2, Trash2 } from 'lucide-vue-next';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, Label, Input, Textarea, Switch, Badge, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  RadioGroup, RadioGroupItem, Tabs, TabsList, TabsTrigger, TabsContent
} from '@repo/ui';
import { useToast } from '@repo/ui';
import type { RecurrenceFrequency } from '@repo/types';

const props = defineProps<{
  open: boolean;
  communityId: string;
  meetingToEdit?: any;
}>();

const emit = defineEmits(['update:open', 'created', 'updated', 'deleted']);

const communityStore = useCommunityStore();
const { toast } = useToast();

const isSaving = ref(false);
const isDeleting = ref(false);
const updateScope = ref<'this' | 'all' | 'all_future'>('this');

const weekDays = [
  { value: 'monday', label: 'Lun' },
  { value: 'tuesday', label: 'Mar' },
  { value: 'wednesday', label: 'Mié' },
  { value: 'thursday', label: 'Jue' },
  { value: 'friday', label: 'Vie' },
  { value: 'saturday', label: 'Sáb' },
  { value: 'sunday', label: 'Dom' },
];

const form = ref({
  title: '',
  description: '',
  date: '',
  time: '',
  durationMinutes: 60,
  isAnnouncement: false,
  isRecurring: false,
  recurrence: {
    frequency: 'weekly' as RecurrenceFrequency,
    interval: 1,
    dayOfWeek: '',
    dayOfMonth: null as number | null,
  }
});

const editingMeeting = ref<any>(null);
const errors = ref<Record<string, string>>({});

// Reset errors when form changes
watch(() => [
  form.value.title,
  form.value.date,
  form.value.time,
  form.value.durationMinutes,
  form.value.isAnnouncement,
  form.value.isRecurring,
  form.value.recurrence.frequency,
  form.value.recurrence.dayOfWeek,
], () => {
  validateForm();
});

const isFormValid = computed(() => {
  const baseValid = form.value.title.trim() !== '' &&
    form.value.date !== '' &&
    form.value.time !== '' &&
    (form.value.isAnnouncement || (form.value.durationMinutes && form.value.durationMinutes >= 5));

  if (form.value.isRecurring && !form.value.isAnnouncement) {
    const freq = form.value.recurrence.frequency;
    if (freq === 'weekly') {
      return baseValid && form.value.recurrence.dayOfWeek !== '';
    }
    if (freq === 'monthly') {
      return baseValid && form.value.recurrence.dayOfMonth !== null;
    }
    // daily is valid with just baseValid
  }

  return baseValid;
});

const getRecurrenceDescription = () => {
  if (!form.value.isRecurring) return '';
  const { frequency, interval, dayOfWeek, dayOfMonth } = form.value.recurrence;

  switch (frequency) {
    case 'daily':
      return 'Esta reunión se repetirá diariamente';
    case 'weekly': {
      const dayLabel = weekDays.find((d) => d.value === dayOfWeek)?.label || '';
      return interval === 1
        ? `Esta reunión se repetirá cada semana el ${dayLabel}`
        : `Esta reunión se repetirá cada ${interval} semanas el ${dayLabel}`;
    }
    case 'monthly':
      return `Esta reunión se repetirá cada mes el día ${dayOfMonth}`;
    default:
      return '';
  }
};

const validateForm = () => {
  const newErrors: Record<string, string> = {};

  if (!form.value.title.trim()) {
    newErrors.title = 'El título es requerido';
  }

  if (!form.value.date) {
    newErrors.date = 'La fecha es requerida';
  } else {
    const selectedDate = new Date(form.value.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      newErrors.date = 'La fecha no puede ser anterior a hoy';
    }
  }

  if (!form.value.time) {
    newErrors.time = 'La hora es requerida';
  }

  if (!form.value.isAnnouncement) {
    if (!form.value.durationMinutes || form.value.durationMinutes < 5) {
      newErrors.durationMinutes = 'La duración debe ser al menos 5 minutos';
    } else if (form.value.durationMinutes > 480) {
      newErrors.durationMinutes = 'La duración no puede exceder 8 horas';
    }
  }

  if (form.value.isRecurring && !form.value.isAnnouncement) {
    if (form.value.recurrence.frequency === 'weekly' && !form.value.recurrence.dayOfWeek) {
      newErrors.recurrence = 'Selecciona un día de la semana';
    }
    if (form.value.recurrence.frequency === 'monthly' && !form.value.recurrence.dayOfMonth) {
      newErrors.recurrence = 'Selecciona un día del mes';
    }
  }

  errors.value = newErrors;
  return Object.keys(newErrors).length === 0;
};

// Watch for isAnnouncement changes to reset recurrence
watch(() => form.value.isAnnouncement, (newValue) => {
  if (newValue) {
    // Reset recurrence when switching to announcement
    form.value.isRecurring = false;
    form.value.durationMinutes = 60;
  } else {
    form.value.durationMinutes = 60;
  }
});

const handleSubmit = async () => {
  if (!validateForm() || !isFormValid.value) {
    return;
  }

  isSaving.value = true;
  try {
    // Combine date and time into a Date object
    const [year, month, day] = form.value.date.split('-').map(Number);
    const [hour, minute] = form.value.time.split(':').map(Number);
    const startDate = new Date(year, month - 1, day, hour, minute);

    const data: any = {
      title: form.value.title.trim(),
      description: form.value.description.trim() || undefined,
      startDate,
      durationMinutes: form.value.isAnnouncement ? undefined : form.value.durationMinutes,
      isAnnouncement: form.value.isAnnouncement
    };

    // Add or remove recurrence data
    if (form.value.isRecurring && !form.value.isAnnouncement) {
      // Add recurrence data
      data.recurrenceFrequency = form.value.recurrence.frequency;
      data.recurrenceInterval = form.value.recurrence.frequency === 'weekly'
        ? form.value.recurrence.interval
        : 1;
      data.recurrenceDayOfWeek = form.value.recurrence.frequency === 'weekly'
        ? form.value.recurrence.dayOfWeek
        : null;
      data.recurrenceDayOfMonth = form.value.recurrence.frequency === 'monthly'
        ? form.value.recurrence.dayOfMonth
        : null;
    } else {
      // Explicitly remove recurrence by setting to null
      data.recurrenceFrequency = null;
      data.recurrenceInterval = null;
      data.recurrenceDayOfWeek = null;
      data.recurrenceDayOfMonth = null;
    }

    if (editingMeeting.value) {
      const scope = editingMeeting.value.isRecurrenceTemplate ? updateScope.value : 'this';
      await communityStore.updateMeeting(
        editingMeeting.value.id,
        data,
        scope
      );
      toast({
        title: 'Reunión actualizada',
        description: 'La reunión ha sido actualizada exitosamente.',
      });
      emit('updated', editingMeeting.value.id);
    } else {
      await communityStore.createMeeting(props.communityId, data);
      toast({
        title: 'Reunión creada',
        description: 'La reunión ha sido creada exitosamente.',
      });
      emit('created');
    }
    isSaving.value = false;
    handleClose();
  } catch (error: any) {
    console.error('Failed to save meeting:', error);
    toast({
      title: 'Error',
      description: error.message || 'No se pudo guardar la reunión',
      variant: 'destructive'
    });
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async () => {
  if (!editingMeeting.value) return;

  isDeleting.value = true;
  try {
    const scope = editingMeeting.value.isRecurrenceTemplate ? updateScope.value : 'this';
    await communityStore.deleteMeeting(editingMeeting.value.id, scope);
    toast({
      title: 'Reunión eliminada',
      description: 'La reunión ha sido eliminada exitosamente.',
    });
    emit('deleted', editingMeeting.value.id);
    isDeleting.value = false;
    handleClose();
  } catch (error: any) {
    console.error('Failed to delete meeting:', error);
    toast({
      title: 'Error',
      description: error.message || 'No se pudo eliminar la reunión',
      variant: 'destructive'
    });
  } finally {
    isDeleting.value = false;
  }
};

const resetForm = () => {
  form.value = {
    title: '',
    description: '',
    date: '',
    time: '',
    durationMinutes: 60,
    isAnnouncement: false,
    isRecurring: false,
    recurrence: {
      frequency: 'weekly',
      interval: 1,
      dayOfWeek: '',
      dayOfMonth: null,
    }
  };
  errors.value = {};
  updateScope.value = 'this';
};

const handleClose = () => {
  if (!isSaving.value && !isDeleting.value) {
    emit('update:open', false);
    setTimeout(resetForm, 200); // Reset after modal closes
  }
};

// Load meeting data when editing
watch(() => props.meetingToEdit, (meeting) => {
  if (meeting) {
    editingMeeting.value = meeting;
    const startDate = new Date(meeting.startDate);
    const isRecurring = meeting.isRecurrenceTemplate === true;
    form.value = {
      title: meeting.title,
      description: meeting.description || '',
      date: startDate.toISOString().split('T')[0],
      time: startDate.toTimeString().slice(0, 5),
      durationMinutes: meeting.durationMinutes || 60,
      isAnnouncement: meeting.isAnnouncement === true,
      isRecurring: isRecurring,
      recurrence: {
        frequency: meeting.recurrenceFrequency || 'weekly',
        interval: meeting.recurrenceInterval || 1,
        dayOfWeek: meeting.recurrenceDayOfWeek || '',
        dayOfMonth: meeting.recurrenceDayOfMonth || null,
      }
    };
  } else {
    editingMeeting.value = null;
    resetForm();
  }
});

// Watch modal open state
watch(() => props.open, (isOpen) => {
  if (!isOpen) {
    editingMeeting.value = null;
  }
});
</script>
