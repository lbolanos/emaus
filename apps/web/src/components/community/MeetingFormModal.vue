<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="sm:max-w-[800px] max-h-[95vh] sm:max-h-[90vh] w-[100vw] sm:w-auto rounded-none sm:rounded-lg overflow-hidden flex flex-col p-4 sm:p-6">
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
        <Tabs default-value="general" class="flex-1 flex flex-col min-h-0">
          <TabsList class="grid w-full grid-cols-4 text-xs sm:text-sm">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="datetime" class="px-1 sm:px-3">
              <span class="hidden sm:inline">Fecha y Hora</span>
              <span class="sm:hidden">Fecha</span>
            </TabsTrigger>
            <TabsTrigger value="recurrence" :disabled="form.isAnnouncement" class="px-1 sm:px-3">
              <span class="hidden sm:inline">Repetición</span>
              <span class="sm:hidden">Repite</span>
            </TabsTrigger>
            <TabsTrigger value="flyer">Flyer</TabsTrigger>
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

            <!-- Tipo de reunión (los anuncios no pasan lista, así que no lo tienen) -->
            <div v-if="!form.isAnnouncement" class="space-y-2">
              <Label for="meetingType">{{ $t('community.meeting.meetingType') }}</Label>
              <Select v-model="form.meetingType">
                <SelectTrigger id="meetingType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="type in MEETING_TYPES" :key="type" :value="type">
                    {{ $t(`community.meetingTypes.${type}`) }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p class="text-xs text-muted-foreground">
                {{ $t('community.meeting.meetingTypeHint') }}
              </p>
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

            <!-- Foto de la reunión -->
            <div class="space-y-2">
              <Label>Foto de la reunión</Label>
              <div v-if="photoPreview" class="relative w-full max-w-sm">
                <img
                  :src="photoPreview"
                  alt="Foto de la reunión"
                  class="w-full h-48 object-cover rounded-lg border cursor-zoom-in transition hover:opacity-90"
                  role="button"
                  tabindex="0"
                  aria-label="Ampliar foto"
                  @click="openPhotoLightbox"
                  @keydown.enter="openPhotoLightbox"
                />
                <button
                  type="button"
                  class="absolute bottom-2 right-2 w-7 h-7 bg-black/60 text-white rounded-full flex items-center justify-center shadow-sm hover:bg-black/80 transition-colors"
                  @click="openPhotoLightbox"
                  aria-label="Ampliar foto"
                >
                  <Maximize2 class="w-4 h-4" />
                </button>
                <button
                  type="button"
                  class="absolute top-2 right-2 w-7 h-7 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-sm hover:bg-destructive/90 transition-colors"
                  @click="handleRemovePhoto"
                  aria-label="Quitar foto"
                >
                  <X class="w-4 h-4" />
                </button>
              </div>
              <button
                v-else
                type="button"
                :disabled="isProcessingPhoto"
                @click="triggerPhotoInput"
                class="flex flex-col items-center justify-center w-full max-w-sm h-32 border-2 border-dashed rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                <Loader2 v-if="isProcessingPhoto" class="w-6 h-6 mb-1 animate-spin" />
                <ImagePlus v-else class="w-6 h-6 mb-1" />
                <span class="text-sm">{{ isProcessingPhoto ? 'Procesando foto...' : 'Agregar foto' }}</span>
              </button>
              <p class="text-xs text-muted-foreground">Imagen opcional. PNG, JPG, GIF o WebP; las fotos grandes se reducen solas.</p>
            </div>

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
          </TabsContent>

          <TabsContent value="datetime" class="flex-1 overflow-y-auto mt-4">
            <MeetingDateTimeForm
              :date="form.date"
              :time="form.time"
              :duration-minutes="form.durationMinutes"
              :is-announcement="form.isAnnouncement"
              :errors="errors"
              @update:date="form.date = $event"
              @update:time="form.time = $event"
              @update:duration-minutes="form.durationMinutes = $event"
            />
          </TabsContent>

          <TabsContent value="recurrence" class="flex-1 overflow-y-auto mt-4">
            <div v-if="form.isAnnouncement" class="p-4 text-center text-muted-foreground">
              <p>Los anuncios no pueden ser recurrentes</p>
            </div>
            <MeetingRecurrenceForm
              v-else
              :is-recurring="form.isRecurring"
              :recurrence="form.recurrence"
              :start-date="form.date"
              @update:is-recurring="form.isRecurring = $event"
              @update:frequency="form.recurrence.frequency = $event"
              @update:interval="form.recurrence.interval = $event"
              @update:day-of-week="form.recurrence.dayOfWeek = $event"
              @update:day-of-month="form.recurrence.dayOfMonth = $event"
              @update:end-date="form.recurrence.endDate = $event"
            />
          </TabsContent>

          <TabsContent value="flyer" class="flex-1 overflow-y-auto mt-4 space-y-6">
            <!-- Template Editor with Variable Buttons -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <Label for="flyerTemplate">Plantilla del Mensaje</Label>
                <span class="text-xs text-muted-foreground">Haz clic en las variables para agregar</span>
              </div>

              <!-- Variable Buttons -->
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="variable in templateVariables"
                  :key="variable.key"
                  type="button"
                  @click="insertVariable(variable.key)"
                  class="px-3 py-1 text-xs bg-secondary hover:bg-secondary/80 rounded-full transition-colors">
                  {{ variable.label }}
                </button>
              </div>

              <!-- Template Textarea -->
              <Textarea
                id="flyerTemplate"
                v-model="form.flyerTemplate"
                rows="6"
                placeholder="Escribe tu plantilla aquí..."
                class="font-mono text-sm"
              />
            </div>

            <!-- Live Preview -->
            <div class="space-y-3">
              <Label>Vista Previa del Mensaje</Label>
              <div class="p-4 bg-muted rounded-lg min-h-[150px] border">
                <div class="whitespace-pre-wrap text-sm">{{ previewMessage }}</div>
              </div>
            </div>
          </TabsContent>
        </Tabs>


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
            <Button type="submit" :disabled="!isFormValid || isSaving || isProcessingPhoto" class="min-w-[100px]">
              <Loader2 v-if="isSaving" class="w-4 h-4 mr-2 animate-spin" />
              {{ isSaving ? 'Guardando...' : editingMeeting ? 'Guardar cambios' : 'Crear reunión' }}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  <!-- Lightbox: foto ampliada. Overlay propio (no Dialog anidado) para evitar
       los conflictos de pointer-events/focus-trap de radix con dialogs anidados. -->
  <Teleport to="body">
    <div
      v-if="showPhotoLightbox && photoPreview"
      class="fixed inset-0 z-[3000] flex items-center justify-center bg-black/80 p-4"
      @click="showPhotoLightbox = false"
    >
      <img
        :src="photoPreview"
        alt="Foto de la reunión"
        class="max-w-full max-h-full object-contain rounded-lg shadow-xl"
        @click.stop
      />
      <button
        type="button"
        class="absolute top-4 right-4 w-9 h-9 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
        @click="showPhotoLightbox = false"
        aria-label="Cerrar"
      >
        <X class="w-5 h-5" />
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useCommunityStore } from '@/stores/communityStore';
import { Info, Loader2, Trash2, X, ImagePlus, Maximize2 } from 'lucide-vue-next';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, Label, Input, Textarea, Switch, Badge, Tabs, TabsList, TabsTrigger, TabsContent,
  RadioGroup, RadioGroupItem,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from '@repo/ui';
import { useToast } from '@repo/ui';
import { pickFile } from '@/utils/filePicker';
import { MAX_PHOTO_SOURCE_BYTES, PHOTO_MAX_SIDE, resizeImageToDataUrl } from '@/utils/imageResize';
import { isFaceRecognitionEnabled, prepareAnalysisImage } from '@/composables/useMeetingPhotoUpload';
import type { MeetingType, RecurrenceFrequency } from '@repo/types';
import { MEETING_TYPES } from '@/constants/meetingTypes';
import MeetingDateTimeForm from './forms/MeetingDateTimeForm.vue';
import MeetingRecurrenceForm from './forms/MeetingRecurrenceForm.vue';
import {
  replaceFlyerVariables,
  formatDuration,
  formatMeetingDateOnly,
  formatCommunityAddress,
  type MeetingFlyerData
} from '@/utils/meetingFlyer';

const props = defineProps<{
  open: boolean;
  communityId: string;
  meetingToEdit?: any;
}>();

// `photo-saved`: a new cover was uploaded and face recognition is on; carries the 3200 px version
// for the analysis. The parent decides where the review opens (it needs the attendance view).
const emit = defineEmits(['update:open', 'created', 'updated', 'deleted', 'photo-saved']);

const communityStore = useCommunityStore();
const { toast } = useToast();

const isSaving = ref(false);
const isDeleting = ref(false);
const updateScope = ref<'this' | 'all' | 'all_future'>('this');

// Community data for preview
const community = ref<any>(null);

// Fetch community when modal opens
watch(() => props.open, async (isOpen) => {
  if (isOpen && props.communityId) {
    try {
      await communityStore.fetchCommunity(props.communityId);
      community.value = communityStore.currentCommunity;
    } catch (error) {
      console.error('Failed to load community for preview:', error);
    }
  }
});

const form = ref({
  title: '',
  description: '',
  flyerTemplate: '',
  date: '',
  time: '',
  durationMinutes: 60,
  isAnnouncement: false,
  meetingType: 'general' as MeetingType,
  isRecurring: false,
  recurrence: {
    frequency: 'weekly' as RecurrenceFrequency,
    interval: 1,
    dayOfWeek: '',
    dayOfMonth: null as number | null,
    endDate: null as string | null,
  }
});

const editingMeeting = ref<any>(null);
const errors = ref<Record<string, string>>({});

// Foto de la reunión.
//  - photoPreview: lo que se muestra (foto existente o data-URI recién elegido).
//  - pendingPhotoData: data-URI nuevo a subir tras guardar la reunión (null si no cambió).
//  - pendingPhotoRemove: marcar para borrar la foto existente al guardar.
const photoPreview = ref<string>('');
const pendingPhotoData = ref<string | null>(null);
// The original file behind `pendingPhotoData`, kept to make the 3200 px analysis version on save.
let pendingPhotoFile: File | null = null;
const pendingPhotoRemove = ref(false);
// True while the chosen photo is being shrunk: saving then would drop it silently.
const isProcessingPhoto = ref(false);

const triggerPhotoInput = async () => {
  // Input creado al vuelo: inmune a Safari con display:none y a que el
  // hot-reload deje la referencia apuntando a un nodo desconectado.
  const file = await pickFile({ accept: 'image/png,image/jpeg,image/jpg,image/gif,image/webp' });
  await applyPhotoFile(file);
};

const applyPhotoFile = async (file: File | null) => {
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    toast({ title: 'Error', description: 'El archivo debe ser una imagen', variant: 'destructive' });
    return;
  }
  if (file.size > MAX_PHOTO_SOURCE_BYTES) {
    toast({ title: 'Error', description: 'La imagen no puede exceder 30MB', variant: 'destructive' });
    return;
  }

  isProcessingPhoto.value = true;
  try {
    // Shrunk in the browser: the server takes at most 2MB and a phone photo weighs 3-8MB.
    const dataUrl = await resizeImageToDataUrl(file, { maxSide: PHOTO_MAX_SIDE });
    photoPreview.value = dataUrl;
    pendingPhotoData.value = dataUrl;
    pendingPhotoFile = file;
    pendingPhotoRemove.value = false;
  } catch (error: any) {
    toast({ title: 'Error', description: error?.message || 'No se pudo leer la imagen', variant: 'destructive' });
  } finally {
    isProcessingPhoto.value = false;
  }
};

const handleRemovePhoto = () => {
  photoPreview.value = '';
  pendingPhotoData.value = null;
  pendingPhotoFile = null;
  // Solo hay que borrar en el server si la reunión ya tenía foto guardada.
  pendingPhotoRemove.value = !!editingMeeting.value?.photoUrl;
};

// Lightbox para ver la foto en grande dentro del modal.
const showPhotoLightbox = ref(false);
const openPhotoLightbox = () => {
  if (photoPreview.value) showPhotoLightbox.value = true;
};
// Cerrar con Escape sin que el Dialog padre también se cierre (capture + stop).
const onLightboxKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    showPhotoLightbox.value = false;
  }
};
watch(showPhotoLightbox, (openState) => {
  if (openState) {
    window.addEventListener('keydown', onLightboxKeydown, true);
  } else {
    window.removeEventListener('keydown', onLightboxKeydown, true);
  }
});
onUnmounted(() => window.removeEventListener('keydown', onLightboxKeydown, true));

// Template variables with labels
const templateVariables = [
  { key: '{{fecha}}', label: 'Fecha' },
  { key: '{{hora}}', label: 'Hora' },
  { key: '{{nombre}}', label: 'Nombre' },
  { key: '{{descripcion}}', label: 'Descripción' },
  { key: '{{duracion}}', label: 'Duración' },
  { key: '{{ubicacion}}', label: 'Ubicación' },
  { key: '{{comunidad}}', label: 'Comunidad' },
];

// Insert variable at cursor position
const insertVariable = (variable: string) => {
  const textarea = document.querySelector('#flyerTemplate') as HTMLTextAreaElement;
  if (textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = form.value.flyerTemplate || '';
    form.value.flyerTemplate = text.substring(0, start) + variable + text.substring(end);
    textarea.focus();
    setTimeout(() => {
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  }
};

// Live preview computed
const previewMessage = computed(() => {
  if (!form.value.date || !form.value.time) {
    return 'Completa la fecha y hora para ver la vista previa...';
  }
  const data: MeetingFlyerData = {
    fecha: formatMeetingDateOnly(new Date(form.value.date + 'T' + form.value.time)),
    hora: form.value.time,
    nombre: form.value.title || 'Nombre de la reunión',
    descripcion: form.value.description || '',
    duracion: form.value.isAnnouncement ? 'N/A' : formatDuration(form.value.durationMinutes),
    ubicacion: community.value ? formatCommunityAddress(community.value) : 'Dirección de la comunidad',
    comunidad: community.value?.name || 'Nombre de la comunidad',
  };
  return replaceFlyerVariables(form.value.flyerTemplate, data);
});

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

const validateForm = () => {
  const newErrors: Record<string, string> = {};

  if (!form.value.title.trim()) {
    newErrors.title = 'El título es requerido';
  }

  if (!form.value.date) {
    newErrors.date = 'La fecha es requerida';
  } else if (!editingMeeting.value) {
    // Solo validar "no antes de hoy" al CREAR. Al editar (especialmente una pasada),
    // permitimos cualquier fecha — el usuario ya confirmó explícitamente la edición.
    const selectedDate = new Date(form.value.date + 'T00:00:00');
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

// Sincroniza la foto tras guardar la reunión. La foto vive en un endpoint
// aparte (necesita el id de la reunión, que al crear no existe hasta guardar).
// Un fallo aquí no revierte la reunión ya guardada: se avisa sin romper el flujo.
const syncMeetingPhoto = async (
  meetingId?: string,
): Promise<{ meetingId: string; analysisImage: string } | null> => {
  if (!meetingId) return null;
  try {
    if (pendingPhotoData.value) {
      const file = pendingPhotoFile;
      await communityStore.setMeetingPhoto(meetingId, pendingPhotoData.value);
      // A new cover with face recognition on is followed by the review of the faces (D1).
      if (file && isFaceRecognitionEnabled(communityStore.currentCommunity)) {
        const analysisImage = await prepareAnalysisImage(file);
        if (analysisImage) return { meetingId, analysisImage };
        toast({
          title: 'No se pudo analizar la foto',
          description: 'La foto se guardó; marca la asistencia a mano.',
          variant: 'destructive',
        });
      }
    } else if (pendingPhotoRemove.value) {
      await communityStore.deleteMeetingPhoto(meetingId);
    }
  } catch (error: any) {
    console.error('Failed to sync meeting photo:', error);
    toast({
      title: 'Reunión guardada, pero la foto no',
      description: error.message || 'No se pudo guardar la foto de la reunión.',
      variant: 'destructive',
    });
  }
  return null;
};

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
      flyerTemplate: form.value.flyerTemplate.trim() || undefined,
      startDate,
      durationMinutes: form.value.isAnnouncement ? undefined : form.value.durationMinutes,
      isAnnouncement: form.value.isAnnouncement,
      // Un anuncio no pasa lista, así que su tipo no significaría nada en el
      // reporte de asistencia: se manda siempre 'general'.
      meetingType: form.value.isAnnouncement ? 'general' : form.value.meetingType,
    };

    // Add recurrence data only if meeting is recurring and not an announcement
    if (form.value.isRecurring && !form.value.isAnnouncement) {
      data.recurrenceFrequency = form.value.recurrence.frequency;
      data.recurrenceInterval = form.value.recurrence.frequency === 'weekly'
        ? form.value.recurrence.interval
        : 1;
      data.recurrenceDayOfWeek = form.value.recurrence.frequency === 'weekly'
        ? form.value.recurrence.dayOfWeek
        : undefined;
      data.recurrenceDayOfMonth = form.value.recurrence.frequency === 'monthly'
        ? form.value.recurrence.dayOfMonth
        : undefined;
      // Fecha tope opcional. Empty string ('' del date input vacío) → null.
      data.recurrenceEndDate = form.value.recurrence.endDate
        ? form.value.recurrence.endDate
        : null;
    }
    // Don't include recurrence fields if not recurring (they'll be undefined)

    if (editingMeeting.value) {
      const scope = editingMeeting.value.isRecurrenceTemplate ? updateScope.value : 'this';
      await communityStore.updateMeeting(
        editingMeeting.value.id,
        data,
        scope
      );
      const photoReview = await syncMeetingPhoto(editingMeeting.value.id);
      toast({
        title: 'Reunión actualizada',
        description: 'La reunión ha sido actualizada exitosamente.',
      });
      emit('updated', editingMeeting.value.id);
      if (photoReview) emit('photo-saved', photoReview);
    } else {
      const created = await communityStore.createMeeting(props.communityId, data);
      const photoReview = await syncMeetingPhoto(created?.id);
      toast({
        title: 'Reunión creada',
        description: 'La reunión ha sido creada exitosamente.',
      });
      emit('created');
      if (photoReview) emit('photo-saved', photoReview);
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
    flyerTemplate: '',
    date: '',
    time: '',
    durationMinutes: 60,
    isAnnouncement: false,
    meetingType: 'general',
    isRecurring: false,
    recurrence: {
      frequency: 'weekly',
      interval: 1,
      dayOfWeek: '',
      dayOfMonth: null,
      endDate: null,
    }
  };
  errors.value = {};
  updateScope.value = 'this';
  photoPreview.value = '';
  pendingPhotoData.value = null;
  pendingPhotoFile = null;
  pendingPhotoRemove.value = false;
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
    photoPreview.value = meeting.photoUrl || '';
    pendingPhotoData.value = null;
    pendingPhotoFile = null;
    pendingPhotoRemove.value = false;
    const startDate = new Date(meeting.startDate);
    const isRecurring = meeting.isRecurrenceTemplate === true;
    const pad = (n: number) => String(n).padStart(2, '0');
    form.value = {
      title: meeting.title,
      description: meeting.description || '',
      flyerTemplate: meeting.flyerTemplate || '',
      date: `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`,
      time: `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`,
      durationMinutes: meeting.durationMinutes || 60,
      isAnnouncement: meeting.isAnnouncement === true,
      meetingType: (meeting.meetingType || 'general') as MeetingType,
      isRecurring: isRecurring,
      recurrence: {
        frequency: meeting.recurrenceFrequency || 'weekly',
        interval: meeting.recurrenceInterval || 1,
        dayOfWeek: meeting.recurrenceDayOfWeek || '',
        dayOfMonth: meeting.recurrenceDayOfMonth || null,
        endDate: meeting.recurrenceEndDate
          ? new Date(meeting.recurrenceEndDate).toISOString().slice(0, 10)
          : null,
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
    showPhotoLightbox.value = false;
  }
});
</script>
