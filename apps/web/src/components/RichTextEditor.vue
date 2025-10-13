<template>
  <div class="rich-text-editor">
    <editor-content
      :editor="editor"
      class="editor-content"
      :class="{
        'disabled': disabled,
        'with-char-count': showCharCount
      }"
    />

    <!-- Toolbar -->
    <div class="toolbar" v-if="!disabled">
      <div class="toolbar-group">
        <button
          type="button"
          @click="editor?.chain().focus().toggleBold().run()"
          :class="{ 'is-active': editor?.isActive('bold') }"
          title="Negrita"
          class="toolbar-button"
        >
          <span class="icon">B</span>
        </button>
        <button
          type="button"
          @click="editor?.chain().focus().toggleItalic().run()"
          :class="{ 'is-active': editor?.isActive('italic') }"
          title="Cursiva"
          class="toolbar-button"
        >
          <span class="icon">I</span>
        </button>
        <button
          type="button"
          @click="editor?.chain().focus().toggleUnderline().run()"
          :class="{ 'is-active': editor?.isActive('underline') }"
          title="Subrayado"
          class="toolbar-button"
        >
          <span class="icon">U</span>
        </button>
        <button
          type="button"
          @click="editor?.chain().focus().toggleStrike().run()"
          :class="{ 'is-active': editor?.isActive('strike') }"
          title="Tachado"
          class="toolbar-button"
        >
          <span class="icon">S</span>
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-group">
        <button
          type="button"
          @click="editor?.chain().focus().setTextAlign('left').run()"
          :class="{ 'is-active': editor?.isActive({ textAlign: 'left' }) }"
          title="Alinear a la izquierda"
          class="toolbar-button"
        >
          <span class="icon">◀</span>
        </button>
        <button
          type="button"
          @click="editor?.chain().focus().setTextAlign('center').run()"
          :class="{ 'is-active': editor?.isActive({ textAlign: 'center' }) }"
          title="Centrar"
          class="toolbar-button"
        >
          <span class="icon">◆</span>
        </button>
        <button
          type="button"
          @click="editor?.chain().focus().setTextAlign('right').run()"
          :class="{ 'is-active': editor?.isActive({ textAlign: 'right' }) }"
          title="Alinear a la derecha"
          class="toolbar-button"
        >
          <span class="icon">▶</span>
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-group">
        <button
          type="button"
          @click="editor?.chain().focus().toggleBulletList().run()"
          :class="{ 'is-active': editor?.isActive('bulletList') }"
          title="Lista con viñetas"
          class="toolbar-button"
        >
          <span class="icon">•</span>
        </button>
        <button
          type="button"
          @click="editor?.chain().focus().toggleOrderedList().run()"
          :class="{ 'is-active': editor?.isActive('orderedList') }"
          title="Lista numerada"
          class="toolbar-button"
        >
          <span class="icon">1.</span>
        </button>
        <button
          type="button"
          @click="editor?.chain().focus().toggleBlockquote().run()"
          :class="{ 'is-active': editor?.isActive('blockquote') }"
          title="Cita"
          class="toolbar-button"
        >
          <span class="icon">"</span>
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-group">
        <button
          type="button"
          @click="editor?.chain().focus().undo().run()"
          :disabled="!editor?.can().undo()"
          title="Deshacer"
          class="toolbar-button"
        >
          <span class="icon">↶</span>
        </button>
        <button
          type="button"
          @click="editor?.chain().focus().redo().run()"
          :disabled="!editor?.can().redo()"
          title="Rehacer"
          class="toolbar-button"
        >
          <span class="icon">↷</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
interface Props {
  modelValue?: string;
  placeholder?: string;
  disabled?: boolean;
  showCharCount?: boolean;
  maxHeight?: string;
  minHeight?: string;
  t?: (key: string) => string;
}

interface Emits {
  (e: 'update:modelValue', value: string): void;
  (e: 'selectionChange', selection: Selection | null): void;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: 'Escribe tu mensaje aquí...',
  disabled: false,
  showCharCount: true,
  maxHeight: '400px',
  minHeight: '120px'
});

const emit = defineEmits<Emits>();



const editor = useEditor({
  content: props.modelValue,
  extensions: [
    StarterKit.configure({
      link: false,
      underline: false
    }),
    Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['left', 'center', 'right'],
      defaultAlignment: 'left'
    }),
    Placeholder.configure({
      placeholder: props.placeholder
    }),

    Link.configure({
      openOnClick: false,
      linkOnPaste: true
    }),
    Image.configure({
      HTMLAttributes: {
        class: 'rounded-lg max-w-full h-auto'
      }
    })
  ],
  editable: !props.disabled,
  autofocus: false,
  onUpdate: ({ editor }) => {
    const html = editor.getHTML();
    emit('update:modelValue', html);
  }
});

// Watch for external model value changes
watch(() => props.modelValue, (newValue) => {
  if (!editor.value) return;

  // Only update if the content is different
  if (editor.value.getHTML() !== newValue) {
    editor.value.commands.setContent(newValue || '');
  }
}, { immediate: true });

// Watch for disabled changes
watch(() => props.disabled, (newValue) => {
  if (editor.value) {
    editor.value.setEditable(!newValue);
  }
});

// Expose methods
defineExpose({
  insertVariable: (variable: string) => {
    if (editor.value) {
      editor.value.commands.insertContent(variable);
    }
  },
  focus: () => editor.value?.commands.focus(),
  getContent: () => editor.value?.getHTML() || '',
  setContent: (html: string) => {
    if (editor.value) {
      editor.value.commands.setContent(html);
    }
  }
});
</script>

<style scoped>
.rich-text-editor {
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.toolbar {
  background-color: hsl(var(--muted) / 0.5);
  border-bottom: 1px solid hsl(var(--border));
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.toolbar-group {
  display: flex;
  gap: 2px;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background-color: hsl(var(--border));
  margin: 0 4px;
}

.toolbar-button {
  background: transparent;
  border: 1px solid transparent;
  color: hsl(var(--foreground));
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: bold;
  min-width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.toolbar-button:hover {
  background-color: hsl(var(--accent));
  border-color: hsl(var(--border));
}

.toolbar-button.is-active {
  background-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border-color: hsl(var(--primary));
}

.toolbar-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbar-button .icon {
  font-family: monospace;
  font-size: 14px;
}

.editor-content {
  min-height: v-bind('minHeight');
  max-height: v-bind('maxHeight');
  overflow-y: auto;
  padding: 12px;
  font-size: 11px;
  line-height: 1.6;
  outline: none;
}

.editor-content:focus {
  outline: 2px solid hsl(var(--ring));
  outline-offset: -2px;
}

.rich-text-editor.disabled .editor-content {
  background-color: hsl(var(--muted) / 0.3);
  cursor: not-allowed;
}

.rich-text-editor.disabled .toolbar {
  opacity: 0.5;
  pointer-events: none;
}

/* Placeholder */
.editor-content :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: hsl(var(--muted-foreground));
  pointer-events: none;
  height: 0;
}

/* Custom scrollbar */
.editor-content::-webkit-scrollbar {
  width: 6px;
}

.editor-content::-webkit-scrollbar-track {
  background: hsl(var(--muted) / 0.3);
  border-radius: 3px;
}

.editor-content::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.5);
  border-radius: 3px;
}

.editor-content::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.7);
}

/* Basic styling for editor content */
.editor-content :deep(.ProseMirror) {
  outline: none;
}

.editor-content :deep(.ProseMirror p) {
  margin: 0 0 8px 0;
}

.editor-content :deep(.ProseMirror h1) {
  font-size: 1.5em;
  font-weight: bold;
  margin: 16px 0 8px 0;
}

.editor-content :deep(.ProseMirror h2) {
  font-size: 1.3em;
  font-weight: bold;
  margin: 14px 0 6px 0;
}

.editor-content :deep(.ProseMirror h3) {
  font-size: 1.1em;
  font-weight: bold;
  margin: 12px 0 4px 0;
}

.editor-content :deep(.ProseMirror ul) {
  padding-left: 20px;
  margin: 8px 0;
  list-style-type: disc;
}

.editor-content :deep(.ProseMirror ol) {
  padding-left: 20px;
  margin: 8px 0;
  list-style-type: decimal;
}

.editor-content :deep(.ProseMirror li) {
  margin: 4px 0;
}

.editor-content :deep(.ProseMirror blockquote) {
  border-left: 3px solid hsl(var(--border));
  padding-left: 12px;
  margin: 8px 0;
  color: hsl(var(--muted-foreground));
}

.editor-content :deep(.ProseMirror code) {
  background-color: hsl(var(--muted) / 0.5);
  padding: 2px 4px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 0.9em;
}

.editor-content :deep(.ProseMirror pre) {
  background-color: hsl(var(--muted) / 0.3);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 8px 0;
}

.editor-content :deep(.ProseMirror a) {
  color: hsl(var(--primary));
  text-decoration: underline;
}

.editor-content :deep(.ProseMirror a:hover) {
  text-decoration: none;
}

.editor-content :deep(.ProseMirror img) {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
  margin: 8px 0;
}

.editor-content :deep(.ProseMirror table) {
  border-collapse: collapse;
  margin: 8px 0;
  width: 100%;
}

.editor-content :deep(.ProseMirror table td),
.editor-content :deep(.ProseMirror table th) {
  border: 1px solid hsl(var(--border));
  padding: 4px 8px;
}

.editor-content :deep(.ProseMirror table th) {
  background-color: hsl(var(--muted) / 0.5);
  font-weight: bold;
}

/* Text alignment */
.editor-content :deep(.ProseMirror .text-center) {
  text-align: center;
}

.editor-content :deep(.ProseMirror .text-right) {
  text-align: right;
}

.editor-content :deep(.ProseMirror .text-left) {
  text-align: left;
}
</style>
