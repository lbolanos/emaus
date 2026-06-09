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
      <!-- Con items, crear/ayuda viven junto al buscador (+ y ⋮). Aquí solo en
           estado vacío (sin barra de búsqueda). -->
      <div v-if="!items.length" class="flex items-center gap-2 shrink-0 self-start">
        <Button variant="outline" size="sm" @click="helpOpen = true" class="flex items-center gap-1" title="Cómo usar el editor de templates">
          <span>❓</span> Ayuda
        </Button>
        <Button
          v-if="canManage.scheduleTemplate.value"
          @click="openCreate"
          :disabled="!selectedSetId"
          class="flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Nueva actividad
        </Button>
      </div>
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

      <!-- Acciones rápidas: crear (icono) + Más acciones (icono) -->
      <Button
        v-if="canManage.scheduleTemplate.value"
        variant="outline"
        size="sm"
        :disabled="!selectedSetId"
        title="Nueva actividad"
        aria-label="Nueva actividad"
        @click="openCreate"
      >+</Button>
      <div class="relative" @click.stop>
        <Button
          variant="outline"
          size="sm"
          title="Más acciones"
          aria-label="Más acciones"
          :aria-expanded="moreOpen"
          aria-haspopup="menu"
          @click="moreOpen = !moreOpen"
        >⋮</Button>
        <div
          v-if="moreOpen"
          role="menu"
          class="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1 text-sm"
        >
          <button
            type="button"
            role="menuitem"
            class="w-full text-left px-3 py-2 hover:bg-gray-50"
            @click="closeMore(); helpOpen = true"
            title="Cómo usar el editor de templates"
          >❓ Ayuda</button>
          <!-- Vista -->
          <div class="border-t border-gray-100 my-1"></div>
          <div class="px-3 py-1 text-[11px] uppercase tracking-wide text-gray-400">Vista</div>
          <button
            type="button"
            role="menuitem"
            class="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between"
            @click="closeMore(); groupBy = 'day'"
          >
            <span>📅 Agrupar por día</span>
            <span v-if="groupBy === 'day'" class="text-purple-600">✓</span>
          </button>
          <button
            type="button"
            role="menuitem"
            class="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between"
            @click="closeMore(); groupBy = 'responsibility'"
          >
            <span>🎤 Agrupar por responsabilidad</span>
            <span v-if="groupBy === 'responsibility'" class="text-purple-600">✓</span>
          </button>
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
          <span
            v-if="groupBy === 'day' && dayGapSummaryTpl(groupItems).total > 0"
            class="text-xs font-medium whitespace-nowrap"
            :class="dayGapSummaryTpl(groupItems).overlaps > 0 ? 'text-amber-700' : 'text-gray-500'"
          >
            <template v-if="dayGapSummaryTpl(groupItems).overlaps > 0">⚠ {{ dayGapSummaryTpl(groupItems).overlaps }} solape{{ dayGapSummaryTpl(groupItems).overlaps > 1 ? 's' : '' }}</template>
            <template v-if="dayGapSummaryTpl(groupItems).overlaps > 0 && dayGapSummaryTpl(groupItems).gaps > 0"> · </template>
            <template v-if="dayGapSummaryTpl(groupItems).gaps > 0">{{ dayGapSummaryTpl(groupItems).gaps }} hueco{{ dayGapSummaryTpl(groupItems).gaps > 1 ? 's' : '' }}</template>
          </span>
          <button
            v-if="groupBy === 'day' && canManage.scheduleTemplate.value && dayGapSummaryTpl(groupItems).total > 0"
            type="button"
            class="text-xs text-blue-600 hover:underline whitespace-nowrap"
            title="Cerrar todos los huecos y solapes del día"
            @click="onCompactDayTpl(groupItems)"
          >🧹 Compactar</button>
          <span class="text-xs text-gray-400 whitespace-nowrap">{{ groupItems.length }} act.</span>
        </div>

        <!-- Lista de actividades (tarjetas apiladas, mobile-first) -->
        <div class="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <template v-for="(t, idx) in groupItems" :key="t.id">
            <div
              :id="`template-item-${t.id}`"
              class="group flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 border-t first:border-t-0 hover:bg-gray-50 transition-colors"
              :class="[
                highlightedItemId === t.id ? 'bg-blue-50 ring-2 ring-blue-500 ring-inset' : '',
                canManage.scheduleTemplate.value ? 'cursor-pointer' : '',
              ]"
              @click="canManage.scheduleTemplate.value && openEdit(t)"
            >
              <!-- HORA: fila pequeña en móvil, columna en desktop -->
              <div class="flex items-center gap-2 text-gray-400 sm:flex-col sm:items-start sm:gap-0 sm:w-[72px] sm:shrink-0 sm:order-1 leading-tight">
                <span class="text-sm font-mono font-semibold whitespace-nowrap text-gray-900">{{ t.defaultStartTime || '—' }}</span>
                <span class="text-[11px] sm:text-[10px] whitespace-nowrap">{{ t.defaultDurationMinutes }} min<template v-if="templateEnd(t)"> · {{ templateEnd(t) }}</template></span>
              </div>

              <!-- Acciones: editar / eliminar -->
              <div
                v-if="canManage.scheduleTemplate.value"
                class="flex items-center gap-0.5 shrink-0 ml-auto sm:order-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity"
                @click.stop
              >
                <button
                  @click="openEdit(t)"
                  class="inline-flex items-center justify-center h-8 w-8 sm:h-auto sm:w-auto sm:p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Editar"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  @click="remove(t)"
                  class="inline-flex items-center justify-center h-8 w-8 sm:h-auto sm:w-auto sm:p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Eliminar"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              <!-- ACTIVIDAD: fila completa en móvil -->
              <div class="basis-full sm:basis-0 sm:flex-1 min-w-0 sm:order-2">
                <div class="flex items-center gap-2 flex-wrap text-sm">
                  <span
                    v-if="groupBy === 'responsibility'"
                    class="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700 leading-tight"
                    :title="`Día ${t.defaultDay}`"
                  >Día {{ t.defaultDay }}</span>
                  <span class="font-medium text-gray-900 min-w-0 line-clamp-2 sm:line-clamp-1">{{ t.name }}</span>
                  <span
                    class="hidden sm:inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium leading-tight"
                    :class="typeBadgeClass(t.type)"
                  >{{ t.type }}</span>
                  <span v-if="t.blocksSantisimoAttendance" class="text-amber-600 text-xs" title="Bloquea Santísimo">🚫</span>
                </div>
                <div class="flex items-center gap-2 sm:gap-3 text-xs mt-0.5 flex-wrap">
                  <span v-if="t.responsabilityName && groupBy === 'day'" class="text-blue-600 truncate min-w-0">🎤 {{ t.responsabilityName }}</span>
                  <span v-if="t.palanquitaNotes" class="hidden sm:inline text-purple-500 truncate min-w-0">🎵 {{ t.palanquitaNotes }}</span>
                  <button
                    v-if="t.responsabilityName"
                    type="button"
                    class="shrink-0 hover:underline"
                    :class="(t.attachments?.length ?? 0) > 0 ? 'text-emerald-700' : 'text-gray-400'"
                    :title="(t.attachments?.length ?? 0) > 0 ? `${t.attachments?.length} documento(s) — abrir` : 'Adjuntar documento o texto a la responsabilidad'"
                    @click.stop="openAttachments(t)"
                  >📎 {{ t.attachments?.length ?? 0 }}</button>
                </div>
                <div v-if="t.description" class="text-xs text-gray-500 mt-1 leading-snug line-clamp-2 sm:line-clamp-1">{{ t.description }}</div>
              </div>
            </div>

            <!-- Indicador de desajuste: hueco (gris) o solape (ámbar) -->
            <div
              v-if="gapBetweenTpl(groupItems, idx) !== null"
              class="flex flex-wrap items-center gap-2 px-3 py-1 text-xs border-t"
              :class="(gapBetweenTpl(groupItems, idx) ?? 0) < 0 ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-500'"
            >
              <span class="font-medium">
                <template v-if="(gapBetweenTpl(groupItems, idx) ?? 0) < 0">
                  ⚠ Se encima {{ Math.abs(gapBetweenTpl(groupItems, idx) ?? 0) }} min con la siguiente
                </template>
                <template v-else>
                  Hueco de {{ gapBetweenTpl(groupItems, idx) }} min hasta la siguiente
                </template>
              </span>
              <div v-if="canManage.scheduleTemplate.value" class="flex items-center gap-3 ml-auto">
                <button
                  v-if="canFixByDurationTpl(groupItems, idx)"
                  type="button"
                  class="text-blue-600 hover:underline"
                  title="Ajustar la duración de esta actividad para que termine cuando empieza la siguiente"
                  @click="onFixByDurationTpl(groupItems, idx)"
                >Ajustar duración</button>
                <button
                  type="button"
                  class="text-blue-600 hover:underline"
                  title="Mover la siguiente actividad (y posteriores del día) para que empiece cuando esta termina"
                  @click="onFixByMovingNextTpl(groupItems, idx)"
                >Mover el siguiente</button>
              </div>
            </div>
          </template>
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
              <Input type="time" v-model="form.defaultStartTime" class="mt-1 font-mono" />
            </div>
            <div>
              <Label class="text-sm font-medium text-gray-700">Duración (min)</Label>
              <Input type="number" min="1" v-model.number="form.defaultDurationMinutes" class="mt-1" />
            </div>
          </div>

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

    <!-- Help dialog -->
    <ScheduleTemplateHelpDialog :open="helpOpen" @update:open="(v: boolean) => helpOpen = v" />
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
  useToast,
} from '@repo/ui';
import {
  scheduleTemplateApi,
  retreatScheduleApi,
  apiErrorMessage,
  type ScheduleTemplateDTO,
  type ScheduleTemplateSetDTO,
} from '@/services/api';
import { useAuthPermissions } from '@/composables/useAuthPermissions';
import ResponsabilityAttachmentsDialog from '@/components/ResponsabilityAttachmentsDialog.vue';
import ScheduleTemplateHelpDialog from '@/components/ScheduleTemplateHelpDialog.vue';
import { hhmmToDayMinutes, dayMinutesToHHMM, templateGapAfter, computeCompactPlan } from '@/views/mamTime';

const { canManage } = useAuthPermissions();
const { toast } = useToast();

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
const helpOpen = ref(false);
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

// Menú "⋮ Más acciones" (Vista, Ayuda, acciones de set). Antes había un toggle
// de columnas para la tabla; al pasar a tarjetas ya no aplica.
const moreOpen = ref(false);
function closeMore() { moreOpen.value = false; }
onMounted(() => window.addEventListener('click', closeMore));
onUnmounted(() => window.removeEventListener('click', closeMore));

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

let highlightClearTimer: ReturnType<typeof setTimeout> | null = null;
function scrollToTemplateItem(id: string, autoClear = false) {
  highlightedItemId.value = id;
  const doScroll = () => {
    const el = document.getElementById(`template-item-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  // Doble pasada (ver MinuteByMinuteView): la segunda gana a la restauración de
  // foco de reka-ui al cerrar el modal.
  nextTick(doScroll);
  setTimeout(doScroll, 250);
  if (highlightClearTimer) clearTimeout(highlightClearTimer);
  if (autoClear) {
    highlightClearTimer = setTimeout(() => {
      if (highlightedItemId.value === id) highlightedItemId.value = null;
    }, 4000);
  }
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
    // Orden cronológico real: usa minutos del día con offset after-midnight
    // (00:10 va al final de la noche, no al inicio), igual que el retiro
    // materializado. Items sin hora van al final. Empate → defaultOrder.
    for (const arr of map.values())
      arr.sort((a, b) => {
        const ma = hhmmToDayMinutes(a.defaultStartTime);
        const mb = hhmmToDayMinutes(b.defaultStartTime);
        if (ma == null && mb == null) return a.defaultOrder - b.defaultOrder;
        if (ma == null) return 1;
        if (mb == null) return -1;
        return ma - mb || a.defaultOrder - b.defaultOrder;
      });
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

// ── Desajustes de tiempo (hueco / solape) entre items del template ────────────
//
// Igual que el minuto a minuto por retiro, pero sobre defaultStartTime ("HH:MM")
// + defaultDurationMinutes. Solo en agrupación por día (orden cronológico).
// Actividades en paralelo arrancan a la misma hora y no se consideran solape.

function sameStartBlockTpl(items: ScheduleTemplateDTO[], idx: number): ScheduleTemplateDTO[] {
  const start = items[idx]?.defaultStartTime;
  const block: ScheduleTemplateDTO[] = [];
  for (let j = idx; j >= 0 && items[j].defaultStartTime === start; j--) block.push(items[j]);
  return block;
}

// Gap (min) entre el bloque que termina en items[idx] y el siguiente. Positivo =
// hueco, negativo = solape. La lógica block-aware + after-midnight vive en
// `templateGapAfter` (pura, testeada); aquí solo agregamos el gate de "vista por día".
function gapBetweenTpl(items: ScheduleTemplateDTO[], idx: number): number | null {
  if (groupBy.value !== 'day') return null;
  return templateGapAfter(items, idx);
}

// ¿"Ajustar duración" produce una duración válida (≥ 1)?
function canFixByDurationTpl(items: ScheduleTemplateDTO[], idx: number): boolean {
  const cur = items[idx];
  const next = items[idx + 1];
  if (!cur || !next) return false;
  const s = hhmmToDayMinutes(cur.defaultStartTime);
  const n = hhmmToDayMinutes(next.defaultStartTime);
  return s != null && n != null && n - s >= 1;
}

// Ajusta la duración del bloque para que termine cuando empieza el siguiente.
async function onFixByDurationTpl(items: ScheduleTemplateDTO[], idx: number) {
  const next = items[idx + 1];
  if (!next) return;
  const block = sameStartBlockTpl(items, idx);
  const nextStart = hhmmToDayMinutes(next.defaultStartTime);
  const blockStart = hhmmToDayMinutes(block[0].defaultStartTime);
  if (nextStart == null || blockStart == null) return;
  const dur = nextStart - blockStart;
  if (dur < 1) return;
  const targetId = items[idx].id;
  try {
    for (const b of block) {
      if (b.defaultDurationMinutes !== dur) {
        await scheduleTemplateApi.update(b.id, { defaultDurationMinutes: dur });
      }
    }
    await load();
    scrollToTemplateItem(targetId, true);
    toast({ title: 'Duración ajustada' });
  } catch (err) {
    toast({
      title: 'Error',
      description: apiErrorMessage(err, 'No se pudo ajustar la duración'),
      variant: 'destructive',
    });
  }
}

// Mueve el siguiente bloque y todos los items posteriores del día por -gap, para
// que el siguiente empiece cuando este termina.
async function onFixByMovingNextTpl(items: ScheduleTemplateDTO[], idx: number) {
  const gap = gapBetweenTpl(items, idx);
  if (gap === null || gap === 0) return;
  const delta = -gap;
  const targetId = items[idx + 1]?.id;
  try {
    for (let j = idx + 1; j < items.length; j++) {
      const cur = hhmmToDayMinutes(items[j].defaultStartTime);
      if (cur == null) continue;
      await scheduleTemplateApi.update(items[j].id, {
        defaultStartTime: dayMinutesToHHMM(cur + delta),
      });
    }
    await load();
    if (targetId) scrollToTemplateItem(targetId, true);
    toast({ title: 'Actividad reubicada' });
  } catch (err) {
    toast({
      title: 'Error',
      description: apiErrorMessage(err, 'No se pudo reubicar la actividad'),
      variant: 'destructive',
    });
  }
}

// Fin del item de template (HH:MM) = inicio + duración (after-midnight aware).
function templateEnd(t: ScheduleTemplateDTO): string {
  const s = hhmmToDayMinutes(t.defaultStartTime);
  if (s == null) return '';
  return dayMinutesToHHMM(s + (t.defaultDurationMinutes || 0));
}

// Cuenta de desajustes del día (badge del header).
function dayGapSummaryTpl(items: ScheduleTemplateDTO[]): {
  overlaps: number;
  gaps: number;
  total: number;
} {
  let overlaps = 0;
  let gaps = 0;
  for (let i = 0; i < items.length - 1; i++) {
    const g = gapBetweenTpl(items, i);
    if (g == null) continue;
    if (g < 0) overlaps++;
    else if (g > 0) gaps++;
  }
  return { overlaps, gaps, total: overlaps + gaps };
}

// Compacta el día: cada bloque empieza cuando termina el anterior.
async function onCompactDayTpl(items: ScheduleTemplateDTO[]) {
  if (items.length < 2) return;
  if (
    !confirm(
      '¿Compactar el día? Cada actividad empezará cuando termine la anterior (se cierran huecos y solapes).',
    )
  )
    return;
  // Solo items con hora válida participan; mantener el orden.
  const timed = items
    .map((it) => ({ it, start: hhmmToDayMinutes(it.defaultStartTime) }))
    .filter((x): x is { it: ScheduleTemplateDTO; start: number } => x.start != null);
  const plan = computeCompactPlan(
    timed.map(({ it, start }) => ({
      id: it.id,
      start,
      end: start + (it.defaultDurationMinutes || 0),
    })),
  );
  if (!plan.length) {
    toast({ title: 'El día ya está compacto' });
    return;
  }
  try {
    for (const p of plan) {
      await scheduleTemplateApi.update(p.id, { defaultStartTime: dayMinutesToHHMM(p.start) });
    }
    toast({ title: `Día compactado · ${plan.length} reubicada(s)` });
    await load();
  } catch (err) {
    toast({
      title: 'Error',
      description: apiErrorMessage(err, 'No se pudo compactar el día'),
      variant: 'destructive',
    });
  }
}

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
  try {
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
    toast({ title: 'Template creado' });
  } catch (err) {
    toast({
      title: 'Error',
      description: apiErrorMessage(err, 'No se pudo crear el template'),
      variant: 'destructive',
    });
  }
}

async function markDefault() {
  if (!selectedSet.value) return;
  try {
    for (const s of sets.value) {
      if (s.isDefault && s.id !== selectedSet.value.id) {
        await scheduleTemplateApi.updateSet(s.id, { isDefault: false });
      }
    }
    await scheduleTemplateApi.updateSet(selectedSet.value.id, { isDefault: true });
    await loadSets();
    toast({ title: 'Marcado como predeterminado' });
  } catch (err) {
    toast({
      title: 'Error',
      description: apiErrorMessage(err, 'No se pudo marcar como predeterminado'),
      variant: 'destructive',
    });
  }
}

async function removeSet() {
  if (!selectedSet.value) return;
  if (!confirm(`¿Eliminar "${selectedSet.value.name}" y todas sus ${items.value.length} actividades?`))
    return;
  try {
    await scheduleTemplateApi.removeSet(selectedSet.value.id);
    toast({ title: 'Template eliminado' });
  } catch (err) {
    toast({
      title: 'Error',
      description: apiErrorMessage(err, 'No se pudo eliminar el template'),
      variant: 'destructive',
    });
    return;
  }
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

// "8:30" → "08:30"; vacío/inválido → "" (compatible con <input type="time">).
function normalizeHhmm(v?: string | null): string {
  const m = hhmmToDayMinutes(v);
  return m == null ? '' : dayMinutesToHHMM(m);
}

function openEdit(t: ScheduleTemplateDTO) {
  editing.value = t;
  // `<input type="time">` solo refleja "HH:MM" zero-padded; normaliza "8:30" → "08:30"
  // para que no se pierda la hora de items viejos guardados sin cero a la izquierda.
  form.value = { ...t, defaultStartTime: normalizeHhmm(t.defaultStartTime) };
  dialogOpen.value = true;
}

async function save() {
  if (!form.value.name || !selectedSetId.value) return;
  // `attachments` es read-only/derivado (se gestiona aparte por nombre canónico):
  // no debe enviarse en el create/update del template — si va, el schema exige
  // `storageUrl` en cada uno y revienta con 400.
  const { attachments: _drop, ...rest } = form.value;
  const payload: Partial<ScheduleTemplateDTO> = {
    ...rest,
    templateSetId: selectedSetId.value,
  };
  if (!payload.defaultStartTime) payload.defaultStartTime = null;
  const isEdit = !!editing.value?.id;
  let targetId: string | null = null;
  try {
    if (editing.value?.id) {
      await scheduleTemplateApi.update(editing.value.id, payload);
      targetId = editing.value.id;
    } else {
      const created = await scheduleTemplateApi.create(payload);
      targetId = created?.id ?? null;
    }
  } catch (err) {
    toast({
      title: 'Error',
      description: apiErrorMessage(err, 'No se pudo guardar la actividad'),
      variant: 'destructive',
    });
    return;
  }
  dialogOpen.value = false;
  toast({ title: isEdit ? 'Actividad actualizada' : 'Actividad creada' });
  await load();
  // Llevar el scroll a la actividad creada/editada y resaltarla.
  if (targetId) scrollToTemplateItem(targetId, true);
}

async function remove(t: ScheduleTemplateDTO) {
  if (!confirm(`¿Eliminar "${t.name}" del template?`)) return;
  try {
    await scheduleTemplateApi.remove(t.id);
    toast({ title: 'Actividad eliminada' });
    await load();
  } catch (err) {
    toast({
      title: 'Error',
      description: apiErrorMessage(err, 'No se pudo eliminar'),
      variant: 'destructive',
    });
  }
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
