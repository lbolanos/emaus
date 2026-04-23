<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { Switch, Button } from '@repo/ui';
import { Settings, X, RotateCcw, GripVertical, ArrowDownToLine } from 'lucide-vue-next';
import { useDashboardSettingsStore, type SectionKey } from '@/stores/dashboardSettingsStore';

const props = defineProps<{ isOpen: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const store = useDashboardSettingsStore();

const LABELS: Record<SectionKey, string> = {
  registrationLinks: 'Links de registro',
  primaryStats: 'Participantes',
  responsibilities: 'Responsabilidades',
  tableAssignments: 'Mesas',
  assignmentStats: 'Habitaciones',
  reception: 'Recepción',
  palancas: 'Palancas',
  bagsReport: 'Reporte de bolsas',
  additionalInfo: 'Información adicional',
  inventoryAlerts: 'Alertas de inventario',
};

// Drag-to-reorder state
const dragFromIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

function onDragStart(index: number) {
  dragFromIndex.value = index;
}

function onDragOver(index: number) {
  dragOverIndex.value = index;
}

function onDrop(toIndex: number) {
  if (dragFromIndex.value !== null && dragFromIndex.value !== toIndex) {
    store.moveSection(dragFromIndex.value, toIndex);
  }
  dragFromIndex.value = null;
  dragOverIndex.value = null;
}

function onDragEnd() {
  dragFromIndex.value = null;
  dragOverIndex.value = null;
}

// Scroll to section
function scrollToSection(key: SectionKey) {
  emit('close');
  nextTick(() => {
    document.getElementById(`ds-section-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-40 bg-black/40"
        @click="$emit('close')"
      />
    </Transition>

    <Transition name="slide-right">
      <div
        v-if="isOpen"
        class="fixed inset-y-0 right-0 z-50 w-80 bg-background border-l shadow-xl flex flex-col"
      >
        <div class="flex items-center justify-between px-5 py-4 border-b">
          <div class="flex items-center gap-2">
            <Settings class="w-4 h-4 text-muted-foreground" />
            <h2 class="font-semibold text-sm">Personalizar dashboard</h2>
          </div>
          <Button variant="ghost" size="icon" @click="$emit('close')">
            <X class="w-4 h-4" />
          </Button>
        </div>

        <div class="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <p class="text-xs text-muted-foreground px-2 pb-2">
            Arrastra para reordenar · activa/desactiva secciones.
          </p>

          <div
            v-for="(key, index) in store.sectionOrder"
            :key="key"
            draggable="true"
            class="flex items-center gap-2 px-2 py-2 rounded-md transition-colors select-none"
            :class="dragOverIndex === index ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/50'"
            @dragstart="onDragStart(index)"
            @dragover.prevent="onDragOver(index)"
            @dragleave="dragOverIndex = null"
            @drop.prevent="onDrop(index)"
            @dragend="onDragEnd"
          >
            <!-- Drag handle -->
            <GripVertical class="w-4 h-4 text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing" />

            <!-- Label -->
            <span class="flex-1 text-sm leading-none">{{ LABELS[key] }}</span>

            <!-- Scroll to section -->
            <button
              class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              title="Ir a esta sección"
              @click.stop="scrollToSection(key)"
            >
              <ArrowDownToLine class="w-3.5 h-3.5" />
            </button>

            <!-- Visibility toggle -->
            <Switch
              :id="`ds-${key}`"
              :model-value="store.visible[key]"
              @update:model-value="store.toggleVisible(key)"
            />
          </div>
        </div>

        <div class="px-5 py-4 border-t">
          <Button variant="outline" size="sm" class="w-full" @click="store.resetToDefaults">
            <RotateCcw class="w-3.5 h-3.5 mr-1.5" />
            Restablecer todo
          </Button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.25s ease;
}
.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}
</style>
