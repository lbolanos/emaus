<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
      <div class="flex-1">
        <h1 class="text-2xl sm:text-3xl font-bold text-gray-900">Templates Minuto a Minuto</h1>
        <p class="text-gray-500 mt-1 text-sm sm:text-base">
          Plantillas maestras. Cada retiro elige una al importar su agenda.
        </p>
      </div>
      <Button
        v-if="canManage.scheduleTemplate.value"
        @click="openCreate"
        :disabled="!selectedSetId"
        class="shrink-0 flex items-center gap-2 self-start"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Nueva actividad
      </Button>
    </div>

    <!-- Template selector toolbar -->
    <div class="bg-white border border-gray-200 rounded-xl px-5 py-4 flex flex-wrap items-center gap-3 shadow-sm">
      <span class="text-sm font-medium text-gray-700">Template:</span>

      <div class="relative">
        <select
          v-model="selectedSetId"
          class="appearance-none bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg pl-3 pr-8 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 cursor-pointer min-w-[200px]"
          @change="load"
        >
          <option v-for="s in sets" :key="s.id" :value="s.id">
            {{ s.name }}{{ s.isDefault ? ' ★' : '' }}
          </option>
        </select>
        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-gray-500">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      <Button v-if="canManage.scheduleTemplate.value" size="sm" variant="outline" @click="openCreateSet" class="flex items-center gap-1">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Nuevo template
      </Button>

      <Button
        v-if="canManage.scheduleTemplate.value && selectedSet && !selectedSet.isDefault"
        size="sm"
        variant="outline"
        @click="markDefault"
        class="flex items-center gap-1 text-amber-600 border-amber-300 hover:bg-amber-50"
      >
        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        Marcar predeterminado
      </Button>

      <Button
        v-if="canManage.scheduleTemplate.value && selectedSet"
        size="sm"
        variant="ghost"
        @click="removeSet"
        class="text-red-500 hover:text-red-700 hover:bg-red-50 flex items-center gap-1"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Eliminar
      </Button>

      <p v-if="selectedSet?.description" class="text-xs text-gray-400 w-full border-t border-gray-100 pt-2 mt-1">
        {{ selectedSet.description }}
      </p>
    </div>

    <!-- Search bar + column toggle -->
    <div v-if="items.length" class="sticky top-0 z-20 bg-white border border-gray-200 rounded-xl px-5 py-3 flex flex-wrap items-center gap-2 shadow-sm">
      <div class="relative flex-1 min-w-[200px]">
        <Input
          v-model="searchQuery"
          placeholder="🔍 Buscar por hora, nombre, responsabilidad, palanquita..."
          class="pr-8"
          @keydown.enter.prevent="onSearchNext"
          @keydown.esc="clearSearch"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-lg leading-none"
          @click="clearSearch"
          aria-label="Limpiar búsqueda"
        >×</button>
      </div>
      <Button
        v-if="searchMatches.length > 0"
        variant="outline"
        size="sm"
        @click="onSearchNext"
        :title="`Siguiente coincidencia (${searchIndex + 1}/${searchMatches.length})`"
      >
        ↓ {{ searchIndex + 1 }}/{{ searchMatches.length }}
      </Button>
      <span v-else-if="searchQuery" class="text-xs text-gray-500 px-2">
        Sin resultados
      </span>

      <!-- Group by toggle -->
      <div class="inline-flex rounded-md border border-gray-200 overflow-hidden text-xs">
        <button
          type="button"
          class="px-3 py-1.5"
          :class="groupBy === 'day' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'"
          @click="groupBy = 'day'"
          title="Agrupar por día"
        >📅 Día</button>
        <button
          type="button"
          class="px-3 py-1.5 border-l border-gray-200"
          :class="groupBy === 'responsibility' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'"
          @click="groupBy = 'responsibility'"
          title="Agrupar por responsabilidad"
        >🎤 Responsabilidad</button>
      </div>

      <!-- Column visibility toggle -->
      <div class="relative">
        <Button
          variant="outline"
          size="sm"
          @click.stop="columnsMenuOpen = !columnsMenuOpen"
          title="Mostrar / ocultar columnas"
        >
          ⚙ Columnas
        </Button>
        <div
          v-if="columnsMenuOpen"
          class="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[180px]"
          @click.stop
        >
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Mostrar columnas</div>
          <label v-for="col in columnDefs" :key="col.key" class="flex items-center gap-2 py-1 cursor-pointer text-sm">
            <input
              type="checkbox"
              :checked="visibleColumns[col.key]"
              @change="toggleColumn(col.key)"
              class="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <span>{{ col.label }}</span>
          </label>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="space-y-4">
      <div v-for="i in 2" :key="i" class="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
        <div class="h-5 bg-gray-200 rounded w-24 mb-4"></div>
        <div class="space-y-3">
          <div v-for="j in 4" :key="j" class="h-10 bg-gray-100 rounded"></div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="!items.length && selectedSetId" class="bg-white border border-dashed border-gray-300 rounded-xl py-16 text-center">
      <div class="text-gray-400 mb-2">
        <svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <p class="text-gray-500 font-medium">Este template no tiene actividades</p>
      <p class="text-gray-400 text-sm mt-1">Agrega la primera actividad con el botón de arriba</p>
    </div>

    <!-- Days -->
    <div v-else class="space-y-6">
      <div v-for="[groupLabel, groupItems] in groupedItems" :key="groupLabel">
        <!-- Group header -->
        <div class="flex items-center gap-3 mb-3">
          <div class="flex items-center gap-2 bg-purple-600 text-white text-sm font-semibold px-4 py-1.5 rounded-full shadow-sm">
            <span v-if="groupBy === 'day'">📅</span>
            <span v-else>🎤</span>
            {{ groupLabel }}
          </div>
          <div class="flex-1 h-px bg-gray-200"></div>
          <span class="text-xs text-gray-400">{{ groupItems.length }} actividades</span>
        </div>

        <!-- Activity table -->
        <div class="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
          <table class="w-full min-w-[600px] text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th v-if="visibleColumns.hora" class="py-3 px-4 text-left w-24">Hora</th>
                <th v-if="visibleColumns.duracion" class="py-3 px-4 text-left w-24">Duración</th>
                <th class="py-3 px-4 text-left">Actividad</th>
                <th v-if="visibleColumns.tipo" class="py-3 px-4 text-left w-32">Tipo</th>
                <th v-if="visibleColumns.santisimo" class="py-3 px-4 text-center w-28">Santísimo</th>
                <th v-if="visibleColumns.docs" class="py-3 px-4 text-center w-24">Documentos</th>
                <th v-if="visibleColumns.acciones && canManage.scheduleTemplate.value" class="py-3 px-4 text-right w-24">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr
                v-for="t in groupItems"
                :key="t.id"
                :id="`template-item-${t.id}`"
                class="hover:bg-gray-50 transition-colors group"
                :class="highlightedItemId === t.id ? 'bg-blue-50 ring-2 ring-blue-500 ring-inset' : ''"
              >
                <td v-if="visibleColumns.hora" class="py-3 px-4 font-mono text-gray-700 font-medium">
                  {{ t.defaultStartTime || '—' }}
                </td>
                <td v-if="visibleColumns.duracion" class="py-3 px-4 text-gray-500">
                  {{ t.defaultDurationMinutes }} min
                </td>
                <td class="py-3 px-4">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span
                      v-if="groupBy === 'responsibility'"
                      class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700"
                      :title="`Día ${t.defaultDay}`"
                    >Día {{ t.defaultDay }}</span>
                    <span class="font-medium text-gray-900">{{ t.name }}</span>
                  </div>
                  <div v-if="t.responsabilityName && groupBy === 'day'" class="text-xs text-blue-600 mt-0.5">
                    🎤 {{ t.responsabilityName }}
                  </div>
                  <div v-if="t.palanquitaNotes" class="text-xs text-purple-500 mt-0.5 flex items-center gap-1">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    {{ t.palanquitaNotes }}
                  </div>
                  <div v-if="t.description" class="text-xs text-gray-500 mt-0.5">{{ t.description }}</div>
                </td>
                <td v-if="visibleColumns.tipo" class="py-3 px-4">
                  <span
                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                    :class="typeBadgeClass(t.type)"
                  >
                    {{ t.type }}
                  </span>
                </td>
                <td v-if="visibleColumns.santisimo" class="py-3 px-4 text-center">
                  <span v-if="t.blocksSantisimoAttendance" class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-600" title="Bloquea Santísimo">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span v-else class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-300">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
                    </svg>
                  </span>
                </td>
                <td v-if="visibleColumns.docs" class="py-3 px-4 text-center">
                  <button
                    v-if="t.responsabilityName"
                    type="button"
                    @click="openAttachments(t)"
                    class="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors"
                    :class="(t.attachments?.length ?? 0) > 0
                      ? 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                      : 'border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50'"
                    :title="(t.attachments?.length ?? 0) > 0
                      ? `${t.attachments?.length} documento(s) — abrir`
                      : 'Adjuntar documento o texto a la responsabilidad'"
                  >
                    📎 {{ t.attachments?.length ?? 0 }}
                  </button>
                  <span
                    v-else
                    class="text-xs text-gray-300"
                    title="Asigna una responsabilidad al item para poder adjuntar"
                  >—</span>
                </td>
                <td v-if="visibleColumns.acciones && canManage.scheduleTemplate.value" class="py-3 px-4">
                  <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      @click="openEdit(t)"
                      class="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Editar"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      @click="remove(t)"
                      class="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Eliminar"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Create / Edit Dialog -->
    <Dialog :open="dialogOpen" @update:open="dialogOpen = $event">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-purple-100 text-purple-600">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </span>
            {{ editing?.id ? 'Editar actividad' : 'Nueva actividad' }}
          </DialogTitle>
        </DialogHeader>

        <div class="space-y-4 py-1">
          <div>
            <Label class="text-sm font-medium text-gray-700">Nombre <span class="text-red-500">*</span></Label>
            <Input v-model="form.name" placeholder="Ej: Charla de apertura" class="mt-1" />
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div>
              <Label class="text-sm font-medium text-gray-700">Día</Label>
              <Input type="number" min="1" max="7" v-model.number="form.defaultDay" class="mt-1" />
            </div>
            <div>
              <Label class="text-sm font-medium text-gray-700">Hora</Label>
              <Input v-model="form.defaultStartTime" placeholder="08:30" class="mt-1 font-mono" />
            </div>
            <div>
              <Label class="text-sm font-medium text-gray-700">Duración (min)</Label>
              <Input type="number" min="1" v-model.number="form.defaultDurationMinutes" class="mt-1" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <Label class="text-sm font-medium text-gray-700">Tipo</Label>
              <div class="relative mt-1">
                <select
                  v-model="form.type"
                  class="w-full appearance-none bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg pl-3 pr-8 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
                </select>
                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-gray-500">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
            <div>
              <Label class="text-sm font-medium text-gray-700">Orden</Label>
              <Input type="number" v-model.number="form.defaultOrder" class="mt-1" />
            </div>
          </div>

          <div>
            <Label class="text-sm font-medium text-gray-700">Responsabilidad asignada</Label>
            <select
              v-model="form.responsabilityName"
              class="w-full mt-1 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option :value="null">— Sin responsabilidad —</option>
              <optgroup label="Roles fijos">
                <option v-for="n in canonicalResp.fixed" :key="n" :value="n">{{ n }}</option>
              </optgroup>
              <optgroup label="Charlas / Textos">
                <option v-for="c in canonicalResp.charlas" :key="c" :value="c">{{ c }}</option>
              </optgroup>
            </select>
            <p class="text-xs text-gray-500 mt-1">
              Cuando se importe este template a un retiro, este item quedará vinculado al
              participante asignado a esta responsabilidad.
            </p>
          </div>

          <div>
            <Label class="text-sm font-medium text-gray-700">Descripción breve</Label>
            <Textarea v-model="form.description" placeholder="Detalle corto de qué se hace en esta tarea…" class="mt-1" rows="2" />
          </div>

          <div>
            <Label class="text-sm font-medium text-gray-700">Música / palanquita</Label>
            <Input v-model="form.palanquitaNotes" placeholder="Canción o indicación musical" class="mt-1" />
          </div>

          <div>
            <Label class="text-sm font-medium text-gray-700">Plan B</Label>
            <Textarea v-model="form.planBNotes" placeholder="Alternativa en caso de imprevisto…" class="mt-1" rows="2" />
          </div>

          <div class="flex flex-col gap-2 pt-1">
            <label class="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                v-model="form.blocksSantisimoAttendance"
                class="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span class="text-sm text-gray-700">Bloquea Santísimo <span class="text-gray-400">(comida / dinámica en mesa)</span></span>
            </label>
            <label class="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                v-model="form.requiresResponsable"
                class="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span class="text-sm text-gray-700">Requiere responsable</span>
            </label>
          </div>
        </div>

        <DialogFooter class="gap-2">
          <Button variant="outline" @click="dialogOpen = false">Cancelar</Button>
          <Button @click="save" :disabled="!form.name">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Create Set Dialog -->
    <Dialog :open="createSetDialogOpen" @update:open="createSetDialogOpen = $event">
      <DialogContent class="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nuevo template</DialogTitle>
        </DialogHeader>
        <div class="space-y-3 py-1">
          <div>
            <Label class="text-sm font-medium text-gray-700">Nombre <span class="text-red-500">*</span></Label>
            <Input v-model="newSetForm.name" placeholder="Ej: Emaús Colombia 2024" class="mt-1" />
          </div>
          <div>
            <Label class="text-sm font-medium text-gray-700">Descripción</Label>
            <Input v-model="newSetForm.description" placeholder="Descripción opcional" class="mt-1" />
          </div>
        </div>
        <DialogFooter class="gap-2">
          <Button variant="outline" @click="createSetDialogOpen = false">Cancelar</Button>
          <Button @click="confirmCreateSet" :disabled="!newSetForm.name">Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Attachments dialog -->
    <ResponsabilityAttachmentsDialog
      v-if="attachmentsTarget"
      :open="attachmentsDialogOpen"
      :responsability-name="attachmentsTarget.responsabilityName"
      :context-label="attachmentsTarget.contextLabel"
      :can-manage="canManage.scheduleTemplate.value"
      @update:open="(v: boolean) => onAttachmentsDialog(v)"
      @changed="load"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
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
} from '@repo/ui';
import {
  scheduleTemplateApi,
  retreatScheduleApi,
  type ScheduleTemplateDTO,
  type ScheduleTemplateSetDTO,
} from '@/services/api';
import { useAuthPermissions } from '@/composables/useAuthPermissions';
import ResponsabilityAttachmentsDialog from '@/components/ResponsabilityAttachmentsDialog.vue';

const { canManage } = useAuthPermissions();

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

const TYPE_COLORS: Record<string, string> = {
  charla:     'bg-blue-100 text-blue-700',
  testimonio: 'bg-violet-100 text-violet-700',
  dinamica:   'bg-orange-100 text-orange-700',
  misa:       'bg-yellow-100 text-yellow-700',
  comida:     'bg-green-100 text-green-700',
  refrigerio: 'bg-teal-100 text-teal-700',
  traslado:   'bg-slate-100 text-slate-600',
  campana:    'bg-amber-100 text-amber-700',
  logistica:  'bg-gray-100 text-gray-600',
  santisimo:  'bg-indigo-100 text-indigo-700',
  descanso:   'bg-rose-100 text-rose-600',
  oracion:    'bg-pink-100 text-pink-700',
  otro:       'bg-gray-100 text-gray-500',
};

function typeBadgeClass(type: string): string {
  return TYPE_COLORS[type] ?? TYPE_COLORS['otro'];
}

const items = ref<ScheduleTemplateDTO[]>([]);
const sets = ref<ScheduleTemplateSetDTO[]>([]);
const selectedSetId = ref<string>('');
const loading = ref(false);
const dialogOpen = ref(false);
const createSetDialogOpen = ref(false);
const editing = ref<ScheduleTemplateDTO | null>(null);
const newSetForm = ref({ name: '', description: '' });

const selectedSet = computed(
  () => sets.value.find((s) => s.id === selectedSetId.value) ?? null,
);

const emptyForm = (): Partial<ScheduleTemplateDTO> => ({
  name: '',
  type: 'otro',
  defaultDay: 1,
  defaultOrder: 0,
  defaultStartTime: '',
  defaultDurationMinutes: 15,
  requiresResponsable: false,
  blocksSantisimoAttendance: false,
  description: '',
  palanquitaNotes: '',
  planBNotes: '',
  responsabilityName: null,
  isActive: true,
});

const form = ref<Partial<ScheduleTemplateDTO>>(emptyForm());
const canonicalResp = ref<{ fixed: string[]; charlas: string[] }>({ fixed: [], charlas: [] });

// Column visibility (persisted in localStorage)
type ColumnKey = 'hora' | 'duracion' | 'tipo' | 'santisimo' | 'docs' | 'acciones';
const columnDefs: Array<{ key: ColumnKey; label: string }> = [
  { key: 'hora', label: 'Hora' },
  { key: 'duracion', label: 'Duración' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'santisimo', label: 'Santísimo' },
  { key: 'docs', label: 'Documentos' },
  { key: 'acciones', label: 'Acciones' },
];
const COLUMN_STORAGE_KEY = 'scheduleTemplate.visibleColumns';
function loadVisibleColumns(): Record<ColumnKey, boolean> {
  const defaults: Record<ColumnKey, boolean> = {
    hora: true, duracion: true, tipo: true, santisimo: true, docs: true, acciones: true,
  };
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}
const visibleColumns = ref<Record<ColumnKey, boolean>>(loadVisibleColumns());
const columnsMenuOpen = ref(false);

function toggleColumn(key: ColumnKey) {
  visibleColumns.value = { ...visibleColumns.value, [key]: !visibleColumns.value[key] };
  try { localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleColumns.value)); } catch { /* ignore */ }
}

// Cerrar menú al hacer click afuera
function closeColumnsMenu() { columnsMenuOpen.value = false; }
onMounted(() => window.addEventListener('click', closeColumnsMenu));
onUnmounted(() => window.removeEventListener('click', closeColumnsMenu));

// Search state
const searchQuery = ref('');
const searchIndex = ref(0);
const highlightedItemId = ref<string | null>(null);

const searchMatches = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return [];
  return items.value.filter((t) => {
    if ((t.name ?? '').toLowerCase().includes(q)) return true;
    if ((t.responsabilityName ?? '').toLowerCase().includes(q)) return true;
    if ((t.defaultStartTime ?? '').toLowerCase().includes(q)) return true;
    if ((t.palanquitaNotes ?? '').toLowerCase().includes(q)) return true;
    if ((t.description ?? '').toLowerCase().includes(q)) return true;
    if ((t.planBNotes ?? '').toLowerCase().includes(q)) return true;
    return false;
  });
});

let searchDebounce: ReturnType<typeof setTimeout> | null = null;
watch(searchQuery, (q) => {
  searchIndex.value = 0;
  if (searchDebounce) clearTimeout(searchDebounce);
  if (!q.trim()) {
    highlightedItemId.value = null;
    return;
  }
  searchDebounce = setTimeout(() => {
    const matches = searchMatches.value;
    if (matches.length > 0) scrollToTemplateItem(matches[0].id);
  }, 200);
});

function scrollToTemplateItem(id: string) {
  highlightedItemId.value = id;
  nextTick(() => {
    const el = document.getElementById(`template-item-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function onSearchNext() {
  const matches = searchMatches.value;
  if (matches.length === 0) return;
  const currentIdx = matches.findIndex((m) => m.id === highlightedItemId.value);
  searchIndex.value = currentIdx >= 0 ? (currentIdx + 1) % matches.length : 0;
  scrollToTemplateItem(matches[searchIndex.value].id);
}

function clearSearch() {
  searchQuery.value = '';
  searchIndex.value = 0;
  highlightedItemId.value = null;
}

const GROUP_STORAGE_KEY = 'scheduleTemplate.groupBy';
const groupBy = ref<'day' | 'responsibility'>(
  (typeof localStorage !== 'undefined' && (localStorage.getItem(GROUP_STORAGE_KEY) as 'day' | 'responsibility')) || 'day',
);
watch(groupBy, (v) => {
  try { localStorage.setItem(GROUP_STORAGE_KEY, v); } catch { /* ignore */ }
});

const groupedItems = computed<Array<[string, ScheduleTemplateDTO[]]>>(() => {
  if (groupBy.value === 'day') {
    const map = new Map<number, ScheduleTemplateDTO[]>();
    for (const t of items.value) {
      const arr = map.get(t.defaultDay) ?? [];
      arr.push(t);
      map.set(t.defaultDay, arr);
    }
    for (const arr of map.values())
      arr.sort((a, b) =>
        (a.defaultStartTime || '').localeCompare(b.defaultStartTime || '') ||
        a.defaultOrder - b.defaultOrder,
      );
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([day, arr]) => [`Día ${day}`, arr]);
  }
  // Group by responsibility name
  const map = new Map<string, ScheduleTemplateDTO[]>();
  for (const t of items.value) {
    const name = t.responsabilityName?.trim() || 'Sin asignar';
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(t);
  }
  // Sort items within each group by day, then time, then order
  for (const arr of map.values()) {
    arr.sort((a, b) => {
      if (a.defaultDay !== b.defaultDay) return a.defaultDay - b.defaultDay;
      return (
        (a.defaultStartTime || '').localeCompare(b.defaultStartTime || '') ||
        a.defaultOrder - b.defaultOrder
      );
    });
  }
  // "Sin asignar" last, others alphabetically
  return [...map.entries()].sort(([a], [b]) => {
    if (a === 'Sin asignar') return 1;
    if (b === 'Sin asignar') return -1;
    return a.localeCompare(b, 'es');
  });
});

async function loadSets() {
  sets.value = await scheduleTemplateApi.listSets();
  if (!selectedSetId.value && sets.value.length) {
    const def = sets.value.find((s) => s.isDefault) ?? sets.value[0];
    selectedSetId.value = def.id;
  }
}

async function load() {
  if (!selectedSetId.value) return;
  loading.value = true;
  try {
    items.value = await scheduleTemplateApi.list(selectedSetId.value);
  } finally {
    loading.value = false;
  }
}

function openCreateSet() {
  newSetForm.value = { name: '', description: '' };
  createSetDialogOpen.value = true;
}

async function confirmCreateSet() {
  if (!newSetForm.value.name) return;
  const created = await scheduleTemplateApi.createSet({
    name: newSetForm.value.name,
    description: newSetForm.value.description || null,
    isActive: true,
    isDefault: false,
  });
  createSetDialogOpen.value = false;
  await loadSets();
  selectedSetId.value = created.id;
  await load();
}

async function markDefault() {
  if (!selectedSet.value) return;
  for (const s of sets.value) {
    if (s.isDefault && s.id !== selectedSet.value.id) {
      await scheduleTemplateApi.updateSet(s.id, { isDefault: false });
    }
  }
  await scheduleTemplateApi.updateSet(selectedSet.value.id, { isDefault: true });
  await loadSets();
}

async function removeSet() {
  if (!selectedSet.value) return;
  if (!confirm(`¿Eliminar "${selectedSet.value.name}" y todas sus ${items.value.length} actividades?`))
    return;
  await scheduleTemplateApi.removeSet(selectedSet.value.id);
  selectedSetId.value = '';
  items.value = [];
  await loadSets();
  if (sets.value[0]) {
    selectedSetId.value = sets.value[0].id;
    await load();
  }
}

function openCreate() {
  editing.value = null;
  form.value = emptyForm();
  dialogOpen.value = true;
}

function openEdit(t: ScheduleTemplateDTO) {
  editing.value = t;
  form.value = { ...t };
  dialogOpen.value = true;
}

async function save() {
  if (!form.value.name || !selectedSetId.value) return;
  const payload: Partial<ScheduleTemplateDTO> = {
    ...form.value,
    templateSetId: selectedSetId.value,
  };
  if (!payload.defaultStartTime) payload.defaultStartTime = null;
  if (editing.value?.id) {
    await scheduleTemplateApi.update(editing.value.id, payload);
  } else {
    await scheduleTemplateApi.create(payload);
  }
  dialogOpen.value = false;
  await load();
}

async function remove(t: ScheduleTemplateDTO) {
  if (!confirm(`¿Eliminar "${t.name}" del template?`)) return;
  await scheduleTemplateApi.remove(t.id);
  await load();
}

// --- Attachments dialog (vinculados por nombre canónico de Responsabilidad) ---
const attachmentsDialogOpen = ref(false);
const attachmentsTarget = ref<{ responsabilityName: string; contextLabel: string } | null>(null);

function openAttachments(t: ScheduleTemplateDTO) {
  if (!t.responsabilityName) return;
  attachmentsTarget.value = {
    responsabilityName: t.responsabilityName,
    contextLabel: t.name,
  };
  attachmentsDialogOpen.value = true;
}

function onAttachmentsDialog(v: boolean) {
  attachmentsDialogOpen.value = v;
  if (!v) attachmentsTarget.value = null;
}

onMounted(async () => {
  await loadSets();
  await load();
  try {
    canonicalResp.value = await retreatScheduleApi.canonicalResponsabilities();
  } catch (err) {
    console.error('No se pudieron cargar responsabilidades canónicas', err);
  }
});
</script>
