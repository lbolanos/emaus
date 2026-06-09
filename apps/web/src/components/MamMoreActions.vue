<template>
  <div class="relative" @click.stop>
    <Button
      variant="outline"
      size="sm"
      :title="iconOnly ? 'Más acciones' : undefined"
      :aria-label="iconOnly ? 'Más acciones' : undefined"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open = !open"
    >{{ iconOnly ? '⋮' : '⋮ Más acciones' }}</Button>
    <div
      v-if="open"
      role="menu"
      class="absolute right-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1 text-sm"
    >
      <!-- Acciones de uso frecuente durante el retiro -->
      <button
        v-if="canManage"
        type="button"
        role="menuitem"
        class="w-full text-left px-3 py-2 hover:bg-gray-50"
        @click="run('ring-bell')"
      >🔔 Tocar campana</button>
      <button
        type="button"
        role="menuitem"
        class="w-full text-left px-3 py-2 hover:bg-gray-50"
        @click="run('print')"
        title="Imprimir o guardar como PDF (Ctrl/Cmd+P)"
      >🖨 Imprimir</button>
      <button
        type="button"
        role="menuitem"
        class="w-full text-left px-3 py-2 hover:bg-gray-50"
        @click="run('download-bundle')"
        title="Descargar todos los guiones del retiro como .zip"
      >📦 Descargar guiones (zip)</button>
      <button
        v-if="publicMamUrl"
        type="button"
        role="menuitem"
        class="w-full text-left px-3 py-2 hover:bg-gray-50"
        @click="run('copy-public-link')"
        :title="'Vista big-screen pública (auth-less): ' + publicMamUrl"
      >📺 Copiar link de pantalla pública</button>
      <div class="border-t border-gray-100 my-1"></div>
      <button
        type="button"
        role="menuitem"
        class="w-full text-left px-3 py-2 hover:bg-gray-50"
        @click="run('help')"
        title="Cómo usar el Minuto a Minuto"
      >❓ Ayuda</button>
      <!-- Vista: agrupación (preferencia de lectura, visible para todos) -->
      <div class="border-t border-gray-100 my-1"></div>
      <div class="px-3 py-1 text-[11px] uppercase tracking-wide text-gray-400">Vista</div>
      <button
        type="button"
        role="menuitem"
        class="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between"
        @click="setGroup('day')"
      >
        <span>📅 Agrupar por día</span>
        <span v-if="groupBy === 'day'" class="text-blue-600">✓</span>
      </button>
      <button
        type="button"
        role="menuitem"
        class="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between"
        @click="setGroup('responsibility')"
      >
        <span>🎤 Agrupar por responsabilidad</span>
        <span v-if="groupBy === 'responsibility'" class="text-blue-600">✓</span>
      </button>
      <!-- Acciones de gestión (manage) -->
      <template v-if="canManage">
        <div class="border-t border-gray-100 my-1"></div>
        <button
          type="button"
          role="menuitem"
          class="w-full text-left px-3 py-2 hover:bg-gray-50"
          @click="run('relink')"
        >🔗 Re-vincular responsabilidades</button>
        <button
          type="button"
          role="menuitem"
          class="w-full text-left px-3 py-2 hover:bg-gray-50"
          @click="run('assign-responsables')"
        >👥 Apoyos / sobreescribir</button>
        <button
          type="button"
          role="menuitem"
          class="w-full text-left px-3 py-2 hover:bg-gray-50"
          @click="run('resolve-santisimo')"
        >✨ Auto-asignar angelitos</button>
        <div class="border-t border-gray-100 my-1"></div>
        <button
          type="button"
          role="menuitem"
          class="w-full text-left px-3 py-2 hover:bg-gray-50 text-amber-700"
          @click="run('materialize')"
        >📥 Importar desde template (sobrescribe)</button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@repo/ui';

defineProps<{
  canManage: boolean;
  publicMamUrl: string | null;
  iconOnly?: boolean;
}>();

// Menú visible a todos; acciones gateadas por `canManage` arriba.
// `open` y `groupBy` son v-model (el padre comparte el estado entre la instancia
// del header vacío y la de la barra de búsqueda).
const open = defineModel<boolean>('open', { default: false });
const groupBy = defineModel<'day' | 'responsibility'>('groupBy', { required: true });

type MoreAction =
  | 'ring-bell'
  | 'print'
  | 'download-bundle'
  | 'copy-public-link'
  | 'help'
  | 'relink'
  | 'assign-responsables'
  | 'resolve-santisimo'
  | 'materialize';

const emit = defineEmits<{ (e: MoreAction): void }>();

function run(action: MoreAction) {
  open.value = false;
  emit(action);
}

function setGroup(v: 'day' | 'responsibility') {
  open.value = false;
  groupBy.value = v;
}
</script>
