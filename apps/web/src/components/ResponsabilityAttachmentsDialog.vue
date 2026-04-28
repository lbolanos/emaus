<template>
  <Dialog :open="open" @update:open="(v: boolean) => $emit('update:open', v)">
    <DialogContent class="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>📎 Documentos · {{ responsabilityName }}</DialogTitle>
        <p v-if="contextLabel" class="text-sm text-gray-500">{{ contextLabel }}</p>
        <p class="text-xs text-gray-400">
          Estos documentos viven en la Responsabilidad y se ven en todos los retiros
          y templates donde aparezca este rol.
        </p>
      </DialogHeader>

      <div class="space-y-4">
        <!-- Toolbar de creación (solo gestores) -->
        <div v-if="canManage && !mdEditor.open" class="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            @click="fileInput?.click()"
            :disabled="items.length >= 5 || uploading"
          >
            ⬆ Subir archivo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            @click="openMdEditorNew"
            :disabled="items.length >= 5"
          >
            ✏ Crear texto (Markdown)
          </Button>
          <span class="text-xs text-gray-500 self-center">
            {{ items.length }}/5 documentos · max 10MB · PDF/DOC/imagen o texto MD
          </span>
        </div>

        <input
          ref="fileInput"
          type="file"
          accept=".pdf,.doc,.docx,image/png,image/jpeg,image/webp"
          class="hidden"
          @change="onFileSelected"
        />

        <!-- Drag&drop solo cuando podemos gestionar y no estamos editando MD -->
        <div
          v-if="canManage && !mdEditor.open && items.length < 5"
          class="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors"
          :class="dragOver ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-gray-400'"
          @click="fileInput?.click()"
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="onDrop"
        >
          <p class="text-xs text-gray-600">Arrastra un archivo aquí o haz clic para seleccionar</p>
        </div>

        <div v-if="uploadError" class="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">
          {{ uploadError }}
        </div>
        <div v-if="uploading" class="text-sm text-gray-500 italic">Subiendo…</div>

        <!-- Editor markdown -->
        <div v-if="mdEditor.open" class="border rounded-lg p-3 space-y-3 bg-gray-50">
          <div class="font-semibold text-sm">
            {{ mdEditor.attachmentId ? '✏ Editar texto' : '✏ Nuevo texto' }}
          </div>
          <Input
            v-model="mdEditor.title"
            placeholder="Título (ej. Guion de la charla, Reflexión, Notas)"
          />
          <Input
            v-model="mdEditor.description"
            placeholder="Descripción opcional"
            class="text-xs"
          />
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <textarea
              v-model="mdEditor.content"
              rows="14"
              placeholder="Escribe en Markdown… (# Título, **negrita**, listas con -, etc.)"
              class="w-full font-mono text-sm border rounded p-2 resize-y"
            ></textarea>
            <div class="border rounded p-3 bg-white overflow-auto text-sm prose prose-sm max-w-none">
              <div v-html="mdPreviewHtml"></div>
              <p v-if="!mdEditor.content" class="text-gray-400 italic">Vista previa…</p>
            </div>
          </div>
          <div class="flex justify-end gap-2">
            <Button variant="outline" size="sm" @click="closeMdEditor">Cancelar</Button>
            <Button
              size="sm"
              @click="saveMd"
              :disabled="!mdEditor.title || !mdEditor.content || mdEditor.saving"
            >
              {{ mdEditor.saving ? 'Guardando…' : 'Guardar' }}
            </Button>
          </div>
        </div>

        <!-- Lista de documentos -->
        <div v-if="loading && !items.length" class="text-gray-500 text-sm">Cargando…</div>
        <div v-else-if="!items.length" class="text-gray-500 text-sm py-4 text-center">
          Aún no hay documentos.
        </div>
        <ul v-else class="divide-y border rounded-lg">
          <li v-for="att in items" :key="att.id" class="flex items-start gap-3 p-3">
            <div class="text-2xl pt-0.5">{{ iconFor(att) }}</div>
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm truncate" :title="att.fileName">
                {{ att.fileName }}
              </div>
              <div class="text-xs text-gray-500 mb-1">
                <span class="inline-block px-1.5 py-0.5 rounded text-[10px] mr-1"
                  :class="att.kind === 'markdown' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'">
                  {{ att.kind === 'markdown' ? 'TEXTO MD' : 'ARCHIVO' }}
                </span>
                {{ humanSize(att.sizeBytes) }}
              </div>
              <Input
                v-if="canManage && !isEditingThisMd(att)"
                :model-value="draftDescriptions[att.id] ?? ''"
                @update:model-value="(v: string | number) => onDescriptionInput(att.id, String(v))"
                @blur="commitDescription(att.id)"
                placeholder="Descripción opcional"
                class="text-xs h-8"
              />
              <div v-else-if="att.description" class="text-xs text-gray-600 italic">
                {{ att.description }}
              </div>
            </div>
            <div class="flex flex-col items-end gap-1 shrink-0">
              <div class="flex items-center gap-1">
                <a
                  v-if="att.kind === 'file'"
                  :href="att.storageUrl"
                  :download="att.fileName"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-blue-600 hover:text-blue-800 px-2 py-1 text-xs border border-blue-200 rounded hover:bg-blue-50"
                  title="Descargar"
                >
                  ⬇ {{ shortMime(att.mimeType) }}
                </a>
                <template v-else>
                  <button
                    type="button"
                    @click="downloadMd(att)"
                    class="text-gray-700 hover:text-gray-900 px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50"
                    title="Descargar como .md"
                  >
                    ⬇ MD
                  </button>
                  <button
                    type="button"
                    @click="downloadPdf(att)"
                    class="text-rose-600 hover:text-rose-800 px-2 py-1 text-xs border border-rose-200 rounded hover:bg-rose-50"
                    title="Descargar como PDF"
                  >
                    ⬇ PDF
                  </button>
                </template>
              </div>
              <div class="flex items-center gap-1">
                <button
                  v-if="canManage && att.kind === 'markdown'"
                  type="button"
                  @click="openMdEditorEdit(att)"
                  class="text-gray-500 hover:text-gray-800 px-2 py-1 text-xs"
                  title="Editar texto"
                >
                  ✏
                </button>
                <button
                  v-if="canManage"
                  type="button"
                  @click="onDelete(att.id)"
                  class="text-red-500 hover:text-red-700 px-2 py-1 text-xs"
                  title="Borrar"
                >
                  🗑
                </button>
              </div>
            </div>
          </li>
        </ul>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="$emit('update:open', false)">Cerrar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  useToast,
} from '@repo/ui';
import { marked } from 'marked';
import jsPDF from 'jspdf';
import {
  responsabilityAttachmentApi,
  type ResponsabilityAttachmentDTO,
} from '@/services/api';

interface Props {
  open: boolean;
  /** Nombre canónico de la Responsabilidad (ej. 'Charla: De la Rosa', 'Comedor'). */
  responsabilityName: string;
  /** Etiqueta secundaria opcional (nombre del item, retiro, etc.) para contexto visual. */
  contextLabel?: string;
  canManage: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'changed'): void;
}>();

const { toast } = useToast();

const items = ref<ResponsabilityAttachmentDTO[]>([]);
const loading = ref(false);
const uploading = ref(false);
const uploadError = ref<string | null>(null);
const dragOver = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const draftDescriptions = ref<Record<string, string>>({});

const mdEditor = reactive({
  open: false,
  saving: false,
  attachmentId: '' as string | null,
  title: '',
  description: '',
  content: '',
});

const mdPreviewHtml = computed<string>(() => {
  try {
    return marked.parse(mdEditor.content || '', { async: false }) as string;
  } catch {
    return '';
  }
});

async function load() {
  if (!props.responsabilityName) return;
  loading.value = true;
  try {
    items.value = await responsabilityAttachmentApi.list(props.responsabilityName);
    draftDescriptions.value = Object.fromEntries(
      items.value.map((a) => [a.id, a.description ?? '']),
    );
  } catch (err: any) {
    toast({ title: 'Error', description: err?.message ?? 'No se pudieron cargar', variant: 'destructive' });
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.open, props.responsabilityName] as const,
  ([open]) => {
    if (open) {
      closeMdEditor();
      load();
    }
  },
  { immediate: true },
);

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function iconFor(att: ResponsabilityAttachmentDTO): string {
  if (att.kind === 'markdown') return '📝';
  if (att.mimeType === 'application/pdf') return '📄';
  if (att.mimeType.startsWith('image/')) return '🖼';
  if (att.mimeType.includes('word') || att.mimeType.includes('msword')) return '📝';
  return '📎';
}

function shortMime(mime: string): string {
  if (mime === 'application/pdf') return 'PDF';
  if (mime.includes('word')) return 'DOC';
  if (mime.startsWith('image/')) return mime.split('/')[1].toUpperCase();
  return 'archivo';
}

async function uploadFile(file: File) {
  uploadError.value = null;
  if (items.value.length >= 5) {
    uploadError.value = 'Máximo 5 archivos por item.';
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    uploadError.value = `${file.name} excede 10MB.`;
    return;
  }
  uploading.value = true;
  try {
    const att = await responsabilityAttachmentApi.upload(props.responsabilityName, file);
    items.value = [...items.value, att];
    draftDescriptions.value[att.id] = att.description ?? '';
    emit('changed');
    toast({ title: 'Subido', description: file.name });
  } catch (err: any) {
    uploadError.value = err?.response?.data?.message ?? err?.message ?? 'Error al subir';
  } finally {
    uploading.value = false;
  }
}

async function onFileSelected(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) await uploadFile(file);
  target.value = '';
}

async function onDrop(e: DragEvent) {
  dragOver.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) await uploadFile(file);
}

function onDescriptionInput(id: string, v: string) {
  draftDescriptions.value[id] = v;
}

async function commitDescription(id: string) {
  const draft = draftDescriptions.value[id] ?? '';
  const att = items.value.find((a) => a.id === id);
  if (!att) return;
  if ((att.description ?? '') === draft) return;
  try {
    const updated = await responsabilityAttachmentApi.update(id, {
      description: draft || null,
    });
    const idx = items.value.findIndex((a) => a.id === id);
    if (idx >= 0) items.value[idx] = updated;
  } catch (err: any) {
    toast({ title: 'Error', description: err?.message ?? 'No se pudo guardar', variant: 'destructive' });
  }
}

async function onDelete(id: string) {
  if (!confirm('¿Borrar este documento?')) return;
  try {
    await responsabilityAttachmentApi.remove(id);
    items.value = items.value.filter((a) => a.id !== id);
    emit('changed');
  } catch (err: any) {
    toast({ title: 'Error', description: err?.message ?? 'No se pudo borrar', variant: 'destructive' });
  }
}

// ─── Markdown editor ──────────────────────────────────────────────

function openMdEditorNew() {
  mdEditor.open = true;
  mdEditor.saving = false;
  mdEditor.attachmentId = null;
  mdEditor.title = '';
  mdEditor.description = '';
  mdEditor.content = '';
}

function openMdEditorEdit(att: ResponsabilityAttachmentDTO) {
  mdEditor.open = true;
  mdEditor.saving = false;
  mdEditor.attachmentId = att.id;
  mdEditor.title = (att.fileName || '').replace(/\.md$/i, '');
  mdEditor.description = att.description ?? '';
  mdEditor.content = att.content ?? '';
}

function closeMdEditor() {
  mdEditor.open = false;
  mdEditor.attachmentId = null;
  mdEditor.title = '';
  mdEditor.description = '';
  mdEditor.content = '';
}

function isEditingThisMd(att: ResponsabilityAttachmentDTO): boolean {
  return mdEditor.open && mdEditor.attachmentId === att.id;
}

async function saveMd() {
  if (!mdEditor.title || !mdEditor.content) return;
  mdEditor.saving = true;
  try {
    if (mdEditor.attachmentId) {
      const updated = await responsabilityAttachmentApi.updateMarkdown(mdEditor.attachmentId, {
        title: mdEditor.title,
        content: mdEditor.content,
        description: mdEditor.description || null,
      });
      const idx = items.value.findIndex((a) => a.id === updated.id);
      if (idx >= 0) items.value[idx] = updated;
      else items.value.push(updated);
    } else {
      const created = await responsabilityAttachmentApi.createMarkdown(props.responsabilityName, {
        title: mdEditor.title,
        content: mdEditor.content,
        description: mdEditor.description || null,
      });
      items.value = [...items.value, created];
      draftDescriptions.value[created.id] = created.description ?? '';
    }
    emit('changed');
    closeMdEditor();
    toast({ title: 'Guardado' });
  } catch (err: any) {
    toast({
      title: 'Error',
      description: err?.response?.data?.message ?? err?.message ?? 'No se pudo guardar',
      variant: 'destructive',
    });
  } finally {
    mdEditor.saving = false;
  }
}

// ─── Descargas ─────────────────────────────────────────────────────

function downloadMd(att: ResponsabilityAttachmentDTO) {
  const blob = new Blob([att.content ?? ''], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = att.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadPdf(att: ResponsabilityAttachmentDTO) {
  try {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const html = marked.parse(att.content ?? '', { async: false }) as string;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    wrapper.style.padding = '40px';
    wrapper.style.maxWidth = '520pt';
    wrapper.style.fontFamily = 'Helvetica, Arial, sans-serif';
    wrapper.style.fontSize = '11pt';
    wrapper.style.lineHeight = '1.5';
    wrapper.style.color = '#111';
    document.body.appendChild(wrapper);
    doc
      .html(wrapper, {
        margin: 40,
        autoPaging: 'text',
        width: 520,
        windowWidth: 700,
        callback: (pdf) => {
          const baseName = att.fileName.replace(/\.md$/i, '') || 'documento';
          pdf.save(`${baseName}.pdf`);
          wrapper.remove();
        },
      })
      .catch((err) => {
        console.warn('jsPDF html error', err);
        wrapper.remove();
        toast({
          title: 'Error generando PDF',
          description: 'Intenta con menos contenido o usa el botón ⬇ MD',
          variant: 'destructive',
        });
      });
  } catch (err: any) {
    toast({
      title: 'Error generando PDF',
      description: err?.message ?? 'Inténtalo de nuevo',
      variant: 'destructive',
    });
  }
}
</script>
