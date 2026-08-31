<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[420px]">
      <DialogHeader>
        <DialogTitle>Foto de {{ memberName || 'el miembro' }}</DialogTitle>
        <DialogDescription>
          Sirve para reconocer a la gente en las reuniones. Pide su permiso antes
          de subirla.
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col items-center gap-4 py-2">
        <MemberAvatar :photo-url="preview" :full-name="memberName" size="lg" />

        <div class="flex flex-wrap justify-center gap-2">
          <!-- `<label>` NATIVO, sin pasar por el Button de @repo/ui.
               El clic en una etiqueta que contiene un input de archivo abre el
               selector por HTML, sin una línea de JavaScript. Dos intentos
               previos fallaron por meter capas encima: `input.click()` desde un
               botón (no funciona en Safari con el input en display:none) y
               `<Button as-child>` (reka-ui clona el hijo con su Slot, y ahí se
               pierde el comportamiento nativo de la etiqueta).
               Las clases replican el aspecto de `Button variant="outline"`. -->
          <label
            class="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-input bg-background px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
            :class="isBusy && 'pointer-events-none opacity-50'"
          >
            <ImagePlus class="w-4 h-4 mr-2" />
            {{ preview ? 'Cambiar foto' : 'Elegir foto' }}
            <input
              type="file"
              accept="image/*"
              class="sr-only"
              @change="onFileSelected"
            />
          </label>

          <Button type="button" variant="outline" :disabled="isBusy" @click="pasteFromClipboard">
            <ClipboardPaste class="w-4 h-4 mr-2" />
            Pegar
          </Button>

          <Button
            v-if="preview"
            type="button"
            variant="outline"
            class="text-destructive"
            :disabled="isBusy"
            @click="removePhoto"
          >
            <Trash2 class="w-4 h-4 mr-2" />
            Quitar
          </Button>
        </div>

        <p class="text-xs text-muted-foreground text-center">
          Puedes elegir un archivo, pegar una imagen copiada
          (<kbd class="rounded border px-1">⌘V</kbd>) o arrastrarla aquí. Se recorta
          a 512 px antes de subirla, así que no importa que la foto del teléfono
          sea grande.
        </p>

        <p v-if="isBusy" class="text-sm text-muted-foreground">Guardando…</p>
        <p v-if="errorMessage" class="text-sm text-red-600 text-center">
          {{ errorMessage }}
        </p>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" :disabled="isBusy" @click="emit('update:open', false)">
          Cerrar
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
/**
 * Subir o quitar la foto de rostro de un miembro. Es un diálogo aparte del de
 * "Editar datos" a propósito: ese es owner-only (un co-admin podría rerutear
 * notificaciones cambiando el correo), mientras que la foto la puede poner
 * cualquier admin de la comunidad.
 *
 * Tres formas de dar la imagen, porque la fuente cambia según de dónde venga la
 * foto: archivo, portapapeles (⌘V o el botón) y arrastrar-soltar.
 *
 * Los cambios se guardan al instante, no al cerrar: cada acción es una llamada
 * completa, así que no hay estado a medias que confirmar.
 */
import { onBeforeUnmount, ref, watch } from 'vue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  useToast,
} from '@repo/ui';
import { ImagePlus, Trash2, ClipboardPaste } from 'lucide-vue-next';
import MemberAvatar from './MemberAvatar.vue';
import { resizeImageToDataUrl } from '@/utils/imageResize';
import { setCommunityMemberPhoto, deleteCommunityMemberPhoto } from '@/services/api';

interface Props {
  open: boolean;
  communityId: string;
  memberId: string | null;
  memberName?: string | null;
  currentPhotoUrl?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  memberName: '',
  currentPhotoUrl: null,
});

const emit = defineEmits<{
  'update:open': [value: boolean];
  /** El miembro actualizado, para que el padre refresque su fila. */
  saved: [member: any];
}>();

const { toast } = useToast();

const preview = ref<string | null>(null);
const isBusy = ref(false);
const errorMessage = ref<string | null>(null);

watch(
  () => [props.open, props.memberId],
  () => {
    if (!props.open) return;
    preview.value = props.currentPhotoUrl ?? null;
    errorMessage.value = null;
  },
  { immediate: true },
);

/** Camino único de subida: archivo, portapapeles y drop terminan aquí. */
const uploadImage = async (source: File | Blob) => {
  if (!props.memberId) return;
  if (!source.type.startsWith('image/')) {
    errorMessage.value = 'Eso no es una imagen.';
    return;
  }

  isBusy.value = true;
  errorMessage.value = null;
  try {
    // Redimensionar en el navegador: el servidor rechaza más de 2 MB y una foto
    // de móvil pesa bastante más.
    const dataUrl = await resizeImageToDataUrl(source);
    const updated = await setCommunityMemberPhoto(props.communityId, props.memberId, dataUrl);
    preview.value = (updated as any)?.photoUrl ?? dataUrl;
    emit('saved', updated);
    toast({ title: 'Foto guardada' });
  } catch (err: any) {
    errorMessage.value =
      err?.response?.data?.message || err?.message || 'No se pudo guardar la foto';
  } finally {
    isBusy.value = false;
  }
};

const onFileSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // Limpiar el input siempre, para que elegir el mismo archivo dos veces
  // seguidas vuelva a disparar el change.
  input.value = '';
  if (file) await uploadImage(file);
};

/**
 * Botón "Pegar". Requiere la Clipboard API asíncrona, que pide permiso y solo
 * existe en contexto seguro (https o localhost). Si no está, se explica en vez
 * de fallar en silencio: siempre queda ⌘V, que va por otro camino.
 */
const pasteFromClipboard = async () => {
  errorMessage.value = null;
  if (!navigator.clipboard?.read) {
    errorMessage.value = 'Tu navegador no deja leer el portapapeles desde un botón. Usa ⌘V.';
    return;
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith('image/'));
      if (imageType) {
        await uploadImage(await item.getType(imageType));
        return;
      }
    }
    errorMessage.value = 'No hay ninguna imagen copiada en el portapapeles.';
  } catch {
    // Permiso denegado o portapapeles inaccesible.
    errorMessage.value = 'No se pudo leer el portapapeles. Prueba con ⌘V o eligiendo el archivo.';
  }
};

/** ⌘V / Ctrl+V en cualquier parte del diálogo. */
const onPaste = async (event: ClipboardEvent) => {
  if (!props.open) return;
  const items = event.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        event.preventDefault();
        await uploadImage(file);
        return;
      }
    }
  }
};

const onDrop = async (event: DragEvent) => {
  if (!props.open) return;
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    event.preventDefault();
    await uploadImage(file);
  }
};

const preventDefault = (event: Event) => {
  if (props.open) event.preventDefault();
};

// Los listeners van en `document` y no en el DialogContent: el evento `paste`
// solo llega al elemento con foco, y dentro del diálogo el foco puede estar en
// cualquier botón.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      document.addEventListener('paste', onPaste);
      document.addEventListener('drop', onDrop);
      document.addEventListener('dragover', preventDefault);
    } else {
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('drop', onDrop);
      document.removeEventListener('dragover', preventDefault);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  document.removeEventListener('paste', onPaste);
  document.removeEventListener('drop', onDrop);
  document.removeEventListener('dragover', preventDefault);
});

const removePhoto = async () => {
  if (!props.memberId) return;
  isBusy.value = true;
  errorMessage.value = null;
  try {
    const updated = await deleteCommunityMemberPhoto(props.communityId, props.memberId);
    preview.value = null;
    emit('saved', updated);
    toast({ title: 'Foto eliminada' });
  } catch (err: any) {
    errorMessage.value =
      err?.response?.data?.message || err?.message || 'No se pudo eliminar la foto';
  } finally {
    isBusy.value = false;
  }
};
</script>
