<template>
  <TooltipProvider>
  <div class="space-y-4 pb-24">
    <!-- Header consolidado -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold">Gestión de Inventario</h1>
        <p class="text-sm text-gray-600">Administra los suministros para el retiro</p>
      </div>
      <div class="flex flex-wrap gap-2 items-center">
        <Button
          @click="openAddItemDialog"
          variant="outline"
          size="sm"
          class="gap-1"
          aria-label="Agregar item al retiro"
        >
          <Plus class="w-4 h-4" />
          Agregar item
        </Button>
        <Button
          @click="calculateQuantities"
          :disabled="loading"
          size="sm"
          class="gap-1"
          title="Recalcula la cantidad requerida según caminantes inscritos y reglas del catálogo"
          aria-label="Recalcular cantidades requeridas"
        >
          <Calculator class="w-4 h-4" />
          Recalcular
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm" class="gap-1" aria-label="Más acciones">
              <MoreHorizontal class="w-4 h-4" />
              Más acciones
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-56">
            <DropdownMenuItem @select="deferOpen(() => showCopyDialog = true)" class="gap-2">
              <Copy class="w-4 h-4" /> Copiar de retiro anterior
            </DropdownMenuItem>
            <DropdownMenuItem @click="openPackingList" class="gap-2">
              <Printer class="w-4 h-4" /> Imprimir lista de empaque
            </DropdownMenuItem>
            <DropdownMenuItem @click="openShoppingList" class="gap-2">
              <ShoppingCart class="w-4 h-4" /> Lista de compras (faltantes)
            </DropdownMenuItem>
            <DropdownMenuItem @click="syncShirtsClick" class="gap-2">
              <Shirt class="w-4 h-4" /> Sincronizar camisetas con tipos del retiro
            </DropdownMenuItem>
            <DropdownMenuItem @click="syncGlobalCatalog" class="gap-2">
              <RefreshCw class="w-4 h-4" /> Recargar desde catálogo global
            </DropdownMenuItem>
            <DropdownMenuItem @select="deferOpen(openHistoryDialog)" class="gap-2">
              <History class="w-4 h-4" /> Historial de cambios
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @select="deferOpen(() => showImportDialog = true)" class="gap-2">
              <Upload class="w-4 h-4" /> Importar Excel
            </DropdownMenuItem>
            <DropdownMenuItem @click="exportInventory" class="gap-2">
              <Download class="w-4 h-4" /> Exportar Excel
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="deferOpen(() => showHelpDialog = true)" class="gap-2">
              <HelpCircle class="w-4 h-4" /> Ayuda
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <!-- Banner alertas colapsable -->
    <div
      v-if="inventoryAlerts.length > 0"
      class="border border-red-200 bg-red-50 rounded-lg overflow-hidden"
    >
      <button
        @click="alertsExpanded = !alertsExpanded"
        class="w-full flex items-center justify-between p-3 text-left hover:bg-red-100 transition-colors"
        :aria-expanded="alertsExpanded"
        :aria-label="`${inventoryAlerts.length} items insuficientes`"
      >
        <span class="flex items-center gap-2 text-red-800 font-medium">
          <AlertTriangle class="w-4 h-4" />
          {{ inventoryAlerts.length }} items insuficientes
        </span>
        <div class="flex gap-2 items-center">
          <Button
            variant="outline"
            size="sm"
            @click.stop="applyInsufficientFilter"
            class="text-xs"
          >
            Filtrar solo insuficientes
          </Button>
          <ChevronDown
            class="w-4 h-4 text-red-700 transition-transform"
            :class="{ 'rotate-180': alertsExpanded }"
          />
        </div>
      </button>
      <div v-if="alertsExpanded" class="p-3 border-t border-red-200 bg-white">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
          <div
            v-for="alert in inventoryAlerts"
            :key="alert.id"
            class="text-xs bg-red-50 border border-red-100 rounded p-2"
          >
            <div class="font-medium text-red-800">{{ alert.itemName }}</div>
            <div class="text-gray-600">
              Faltan {{ alert.deficit }} {{ alert.unit }}
              <span class="text-gray-400">·</span>
              {{ alert.teamName }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Filtros compactos -->
    <Card>
      <CardContent class="pt-4 space-y-3">
        <!-- Search + selects -->
        <div class="flex flex-col md:flex-row gap-3 md:items-center">
          <div class="relative flex-1">
            <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              v-model="searchQuery"
              placeholder="Buscar por nombre, equipo, caja o nota…"
              class="pl-10 pr-10"
              aria-label="Buscar artículos"
            />
            <button
              v-if="searchQuery"
              @click="searchQuery = ''"
              class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Limpiar búsqueda"
            >
              <X class="w-4 h-4" />
            </button>
          </div>

          <div class="flex gap-3 items-center">
            <div class="flex items-center gap-2">
              <Label class="text-xs whitespace-nowrap text-gray-500">Agrupar</Label>
              <Select v-model="groupBy">
                <SelectTrigger class="w-32 h-9 text-sm" aria-label="Agrupar por">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="category">Categoría</SelectItem>
                  <SelectItem value="team">Equipo</SelectItem>
                  <SelectItem value="box">Caja</SelectItem>
                  <SelectItem value="status">Estado del ciclo</SelectItem>
                  <SelectItem value="sufficiency">Suficiencia</SelectItem>
                  <SelectItem value="none">Sin agrupar</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="flex items-center gap-2">
              <Label class="text-xs whitespace-nowrap text-gray-500">Equipo</Label>
              <Select v-model="teamFilter">
                <SelectTrigger class="w-36 h-9 text-sm" aria-label="Filtrar por equipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem v-for="team in availableTeams" :key="team" :value="team">{{
                    team
                  }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <!-- Pills de filtro -->
        <div class="flex flex-wrap gap-2 items-center">
          <span class="text-xs text-gray-500 mr-1">Mostrar:</span>
          <button
            v-for="pill in filterPills"
            :key="pill.id"
            @click="togglePill(pill.id)"
            :aria-pressed="pill.active"
            class="text-xs px-3 py-1 rounded-full border transition-colors"
            :class="
              pill.active
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            "
          >
            {{ pill.label }}
          </button>
          <button
            @click="showExcluded = !showExcluded"
            :aria-pressed="showExcluded"
            class="text-xs px-3 py-1 rounded-full border transition-colors"
            :class="showExcluded ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'"
          >
            {{ showExcluded ? 'Ocultar excluidos' : 'Ver excluidos' }}
          </button>
          <button
            v-if="hasActiveFilters"
            @click="clearFilters"
            class="text-xs px-3 py-1 rounded-full text-gray-500 hover:text-gray-700"
          >
            <X class="w-3 h-3 inline mr-1" />Limpiar
          </button>

          <div class="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <button
                  class="text-xs px-3 py-1 rounded-full border border-gray-300 bg-white hover:bg-gray-50 inline-flex items-center gap-1"
                  aria-label="Mostrar u ocultar columnas"
                >
                  <Columns class="w-3 h-3" /> Columnas
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-48">
                <DropdownMenuLabel>Mostrar columnas</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  v-for="col in columnToggles"
                  :key="col.id"
                  @select.prevent="setColumnVisible(col.id, !visibleColumns[col.id])"
                  class="gap-2"
                >
                  <Check
                    class="w-4 h-4"
                    :class="visibleColumns[col.id] ? 'opacity-100' : 'opacity-0'"
                  />
                  <span>{{ col.label }}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Tabla única -->
    <Card>
      <CardHeader class="py-3">
        <CardTitle class="text-base flex items-center justify-between">
          <span>
            Inventario
            <span class="text-sm font-normal text-gray-500">
              · {{ filteredCount }} de {{ totalCount }} items
            </span>
          </span>
          <span v-if="savingIndicator" class="text-xs text-gray-500 flex items-center gap-1">
            <span
              class="w-2 h-2 rounded-full"
              :class="savingIndicator === 'saving' ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'"
            ></span>
            {{ savingIndicator === 'saving' ? 'Guardando…' : 'Guardado' }}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent class="p-0">
        <div v-if="loading" class="text-center py-8">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
          <p class="text-sm text-gray-500">Cargando inventario…</p>
        </div>

        <div v-else-if="Object.keys(groupedItems).length === 0" class="text-center py-12">
          <Package class="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <h3 v-if="hasActiveFilters" class="font-medium text-gray-900 mb-1">
            No hay resultados con los filtros aplicados
          </h3>
          <h3 v-else class="font-medium text-gray-900 mb-1">No hay inventario configurado</h3>
          <p v-if="hasActiveFilters" class="text-sm text-gray-500 mb-3">
            Prueba a limpiar los filtros o usar otra búsqueda.
          </p>
          <Button v-if="hasActiveFilters" variant="outline" size="sm" @click="clearFilters">
            Limpiar filtros
          </Button>
          <Button v-else size="sm" @click="calculateQuantities">Calcular cantidades</Button>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-gray-50 border-b z-10">
              <tr>
                <th class="text-center px-2 py-2 w-8">
                  <input
                    type="checkbox"
                    :checked="allFilteredSelected"
                    :indeterminate.prop="someFilteredSelected"
                    @change="toggleAllFiltered"
                    class="rounded"
                    aria-label="Seleccionar todos los visibles"
                  />
                </th>
                <th class="text-left px-3 py-2 font-medium text-gray-700">Artículo</th>
                <th
                  v-if="visibleColumns.team"
                  class="text-left px-3 py-2 font-medium text-gray-700 hidden md:table-cell"
                >
                  Equipo
                </th>
                <th
                  v-if="visibleColumns.required"
                  class="text-center px-3 py-2 font-medium text-gray-700"
                >
                  Req.
                </th>
                <th
                  v-if="visibleColumns.actual"
                  class="text-center px-3 py-2 font-medium text-gray-700"
                >
                  Actual
                </th>
                <th
                  v-if="visibleColumns.tobuy"
                  class="text-center px-3 py-2 font-medium text-gray-700"
                >
                  Comprar
                </th>
                <th
                  v-if="visibleColumns.status"
                  class="text-center px-3 py-2 font-medium text-gray-700"
                >
                  Ciclo
                </th>
                <th
                  v-if="visibleColumns.box"
                  class="text-left px-3 py-2 font-medium text-gray-700"
                >
                  Caja
                </th>
                <th
                  v-if="visibleColumns.notes"
                  class="text-left px-3 py-2 font-medium text-gray-700 hidden lg:table-cell"
                >
                  Notas
                </th>
                <th class="text-center px-2 py-2 w-8" aria-label="Acciones"></th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(groupItems, groupName) in groupedItems" :key="groupName">
                <tr class="bg-gray-100 border-b sticky-group">
                  <td class="px-2 py-1">
                    <input
                      type="checkbox"
                      :checked="allInGroupSelected(groupItems)"
                      @change="toggleGroupSelection(groupItems)"
                      class="rounded"
                      :aria-label="`Seleccionar todos en ${groupName}`"
                    />
                  </td>
                  <td :colspan="visibleColumnCount + 1" class="px-3 py-1.5 font-semibold text-gray-800 text-xs uppercase tracking-wide">
                    {{ groupName }}
                    <span class="text-gray-500 font-normal normal-case">({{ groupItems.length }})</span>
                  </td>
                </tr>
                <tr
                  v-for="item in groupItems"
                  :key="item.id"
                  class="border-b hover:bg-gray-50 transition-colors"
                  :class="{ 'bg-blue-50': selectedItemIds.has(item.id) }"
                >
                  <td class="text-center px-2 py-2">
                    <input
                      type="checkbox"
                      :checked="selectedItemIds.has(item.id)"
                      @change="toggleSelection(item.id)"
                      class="rounded"
                      :aria-label="`Seleccionar ${item.inventoryItem?.name}`"
                    />
                  </td>
                  <td class="px-3 py-2">
                    <div class="flex items-center gap-2">
                      <span
                        v-if="shirtColorOf(item)"
                        class="inline-block w-3 h-3 rounded-full border border-gray-300 shrink-0"
                        :style="{ backgroundColor: shirtColorOf(item) || undefined }"
                        :aria-label="`Color ${shirtColorOf(item) || ''}`"
                      ></span>
                      <Tooltip v-if="item.inventoryItem?.description">
                        <TooltipTrigger as-child>
                          <span class="font-medium cursor-help underline decoration-dotted decoration-gray-300 underline-offset-2">
                            {{ displayName(item) }}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p class="max-w-xs text-xs">{{ item.inventoryItem.description }}</p>
                        </TooltipContent>
                      </Tooltip>
                      <span v-else class="font-medium">{{ displayName(item) }}</span>
                      <span
                        v-if="!item.inventoryItem && !item.retreatShirtTypeId"
                        class="text-[10px] uppercase font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded"
                        title="Item solo para este retiro (no está en el catálogo global)"
                      >Custom</span>
                      <span
                        v-if="item.ratioOverride != null"
                        class="text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded"
                        :title="`Ratio para este retiro: ${item.ratioOverride} (global: ${item.inventoryItem?.ratio ?? '—'})`"
                      >r={{ item.ratioOverride }}</span>
                      <span
                        v-if="item.requiredQtyOverride != null"
                        class="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded"
                        title="Cantidad fija para este retiro (no se sobreescribe al Recalcular)"
                      >🔒{{ item.requiredQtyOverride }}</span>
                      <span
                        v-if="item.isExcluded"
                        class="text-[10px] font-semibold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded"
                        title="Excluido de este retiro"
                      >Excluido</span>
                    </div>
                  </td>
                  <td
                    v-if="visibleColumns.team"
                    class="px-3 py-2 text-gray-600 hidden md:table-cell"
                  >
                    {{ displayTeam(item) }}
                  </td>
                  <td
                    v-if="visibleColumns.required"
                    class="text-center px-3 py-2 text-gray-700 whitespace-nowrap"
                  >
                    {{ Number(item.requiredQuantity || 0) }}
                    <span class="text-xs text-gray-400">{{ displayUnit(item) }}</span>
                  </td>
                  <td v-if="visibleColumns.actual" class="text-center px-3 py-2">
                    <div class="flex items-center justify-center gap-1">
                      <input
                        v-model.number="item.currentQuantity"
                        type="number"
                        step="0.01"
                        min="0"
                        class="w-16 px-2 py-1 border rounded text-center text-sm"
                        :aria-label="`Cantidad actual de ${displayName(item)}`"
                        @input="onCurrentQuantityInput(item)"
                        @blur="flushPending(item)"
                      />
                      <Tooltip v-if="!item.isSufficient">
                        <TooltipTrigger as-child>
                          <AlertTriangle class="w-4 h-4 text-red-500 shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p class="text-xs">
                            Insuficiente: faltan
                            {{
                              Math.max(
                                0,
                                Number(item.requiredQuantity || 0) - Number(item.currentQuantity || 0),
                              )
                            }}
                            {{ displayUnit(item) }}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </td>
                  <td v-if="visibleColumns.tobuy" class="text-center px-3 py-2 whitespace-nowrap">
                    <template v-if="Number(item.requiredQuantity || 0) > 0">
                      <span
                        v-if="Math.max(0, Number(item.requiredQuantity || 0) - Number(item.currentQuantity || 0)) > 0"
                        class="font-semibold text-red-600"
                      >
                        {{ Math.max(0, Number(item.requiredQuantity || 0) - Number(item.currentQuantity || 0)) }}
                        <span class="text-xs font-normal text-red-400">{{ displayUnit(item) }}</span>
                      </span>
                      <span v-else class="text-green-600 text-xs">✓</span>
                    </template>
                    <span v-else class="text-gray-300 text-xs">—</span>
                  </td>
                  <td v-if="visibleColumns.status" class="text-center px-3 py-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger as-child>
                        <button
                          class="text-xs px-2 py-1 rounded-full border whitespace-nowrap inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
                          :class="statusBadgeClass(item.status || 'pending')"
                          :aria-label="`Cambiar estado de ${displayName(item)}`"
                        >
                          <span>{{ statusEmoji(item.status || 'pending') }}</span>
                          <span class="hidden sm:inline">{{ statusLabel(item.status || 'pending') }}</span>
                          <ChevronDown class="w-3 h-3 opacity-50" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          v-for="s in STATUSES"
                          :key="s"
                          @click="onStatusChange(item, s)"
                        >
                          <span class="mr-2">{{ statusEmoji(s) }}</span> {{ statusLabel(s) }}
                          <span v-if="(item.status || 'pending') === s" class="ml-auto text-green-600">✓</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                  <td v-if="visibleColumns.box" class="px-3 py-2">
                    <input
                      v-model="item.boxLabel"
                      type="text"
                      class="w-24 px-2 py-1 border rounded text-sm"
                      placeholder="Caja…"
                      :aria-label="`Caja para ${displayName(item)}`"
                      @input="onBoxLabelInput(item)"
                      @blur="flushPending(item)"
                    />
                  </td>
                  <td
                    v-if="visibleColumns.notes"
                    class="px-3 py-2 hidden lg:table-cell"
                  >
                    <input
                      v-model="item.notes"
                      type="text"
                      class="w-full px-2 py-1 border rounded text-sm"
                      placeholder="Notas…"
                      :aria-label="`Notas de ${displayName(item)}`"
                      @input="onNotesInput(item)"
                      @blur="flushPending(item)"
                    />
                  </td>
                  <td class="text-center px-2 py-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger as-child>
                        <button
                          class="p-1 rounded hover:bg-gray-200"
                          :aria-label="`Acciones de ${displayName(item)}`"
                        >
                          <MoreHorizontal class="w-4 h-4 text-gray-500" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" class="w-48">
                        <DropdownMenuItem
                          @select="deferOpen(() => openEditItemDialog(item))"
                          class="gap-2"
                        >
                          <Pencil class="w-4 h-4" /> Editar item
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          @select="openOverrideDialog(item)"
                          class="gap-2"
                        >
                          <SlidersHorizontal class="w-4 h-4" /> Config. para este retiro
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          @select="deferOpen(() => askRemoveItem(item))"
                          class="gap-2 text-red-600 focus:bg-red-50 focus:text-red-700"
                        >
                          <Trash2 class="w-4 h-4" /> Quitar del retiro
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

    <!-- Bulk bar sticky bottom -->
    <Transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="translate-y-full opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition ease-in duration-150"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-full opacity-0"
    >
      <div
        v-if="selectedItemIds.size > 0"
        class="fixed bottom-4 left-4 right-4 md:left-1/2 md:right-auto md:transform md:-translate-x-1/2 bg-white shadow-2xl border-2 border-blue-500 rounded-xl px-4 py-3 z-50 max-w-2xl mx-auto"
        role="region"
        aria-label="Acciones para items seleccionados"
      >
        <div class="flex flex-wrap items-center gap-3">
          <span class="font-semibold text-blue-900">
            {{ selectedItemIds.size }} seleccionado{{ selectedItemIds.size !== 1 ? 's' : '' }}
          </span>
          <div class="flex-1"></div>
          <Button size="sm" variant="outline" @click="openBulkBoxDialog" class="gap-1">
            <Package class="w-4 h-4" /> Caja
          </Button>
          <Button size="sm" variant="outline" @click="openBulkStatusDialog" class="gap-1">
            <CheckSquare class="w-4 h-4" /> Estado
          </Button>
          <Button
            size="sm"
            variant="outline"
            @click="askBulkRemove"
            class="gap-1 text-red-600 border-red-200 hover:bg-red-50"
          >
            <Trash2 class="w-4 h-4" /> Quitar
          </Button>
          <Button size="sm" variant="ghost" @click="clearSelection" aria-label="Limpiar selección">
            <X class="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Transition>

    <!-- Import Dialog -->
    <Dialog v-model:open="showImportDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar Inventario</DialogTitle>
          <DialogDescription>Importa datos de inventario desde un archivo Excel o CSV</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <Upload class="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p class="text-gray-600 mb-4">Arrastra un archivo aquí o haz clic para seleccionar</p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              @change="handleFileUpload"
              class="hidden"
              ref="fileInput"
            />
            <Button @click="fileInput?.click()">Seleccionar archivo</Button>
          </div>
          <div v-if="importResults" class="space-y-2">
            <div class="text-green-600">✓ {{ importResults.success.length }} items importados</div>
            <div v-if="importResults.errors.length > 0" class="text-red-600">
              ✗ {{ importResults.errors.length }} errores encontrados
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showImportDialog = false">Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Copy Inventory Dialog -->
    <Dialog v-model:open="showCopyDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copiar inventario de otro retiro</DialogTitle>
          <DialogDescription>
            Copia las cantidades empacadas (Actual), notas y caja desde otro retiro a este.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div>
            <Label>Retiro origen</Label>
            <Select v-model="copySourceRetreatId">
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un retiro" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="r in copySourceRetreats" :key="r.id" :value="r.id">
                  {{ r.parish }} — {{ formatDate(r.startDate) }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label class="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" v-model="copyOverwrite" class="rounded" />
            <span>Sobrescribir items que ya tienen cantidad o caja en este retiro</span>
          </label>
          <div v-if="copyResults" class="text-sm space-y-1 bg-gray-50 p-3 rounded">
            <div class="text-green-700">✓ {{ copyResults.copied }} items actualizados</div>
            <div v-if="copyResults.created > 0" class="text-green-700">
              ✓ {{ copyResults.created }} items creados
            </div>
            <div v-if="copyResults.skipped > 0" class="text-yellow-700">
              ⚠ {{ copyResults.skipped }} items omitidos (ya tenían datos)
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showCopyDialog = false">Cerrar</Button>
          <Button :disabled="!copySourceRetreatId || copying" @click="confirmCopy">
            {{ copying ? 'Copiando…' : 'Copiar' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Bulk box dialog -->
    <Dialog v-model:open="showBulkBoxDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar caja a {{ selectedItemIds.size }} items</DialogTitle>
          <DialogDescription>
            Etiqueta los items con un nombre de caja (ej. "Caja 1", "Mochila Botiquín").
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <Label>Nombre de la caja</Label>
          <Input v-model="bulkBoxValue" placeholder="Ej. Caja 1, Mochila Botiquín" />
          <p class="text-xs text-gray-500">Dejar vacío para quitar la caja asignada.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showBulkBoxDialog = false">Cancelar</Button>
          <Button @click="confirmBulkBox">Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Bulk status dialog -->
    <Dialog v-model:open="showBulkStatusDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar estado de {{ selectedItemIds.size }} items</DialogTitle>
          <DialogDescription>Mueve los items seleccionados a otro estado del ciclo.</DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <Label>Estado</Label>
          <Select v-model="bulkStatusValue">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="s in STATUSES" :key="s" :value="s">
                {{ statusEmoji(s) }} {{ statusLabel(s) }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showBulkStatusDialog = false">Cancelar</Button>
          <Button @click="confirmBulkStatus">Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Override dialog -->
    <Dialog v-model:open="showOverrideDialog">
      <DialogContent class="max-w-sm">
        <DialogHeader>
          <DialogTitle>Config. para este retiro</DialogTitle>
          <DialogDescription>
            <span v-if="overrideItem">{{ displayName(overrideItem) }}</span> —
            sobreescribe los valores del catálogo global solo para este retiro.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-1">
          <div>
            <Label>Ratio para este retiro</Label>
            <Input
              v-model="overrideForm.ratioOverride"
              type="number"
              min="0"
              step="0.01"
              placeholder="Vacío = usar ratio global"
            />
            <p v-if="overrideItem?.inventoryItem?.ratio != null" class="text-xs text-gray-500 mt-1">
              Ratio global: {{ overrideItem.inventoryItem.ratio }}
            </p>
          </div>
          <div>
            <Label>Cantidad fija para este retiro</Label>
            <Input
              v-model="overrideForm.requiredQtyOverride"
              type="number"
              min="0"
              step="1"
              placeholder="Vacío = calcular por ratio"
            />
            <p class="text-xs text-gray-500 mt-1">
              No se sobreescribe al presionar "Recalcular".
            </p>
          </div>
          <label class="flex items-center gap-3 cursor-pointer rounded-lg border p-3 transition-colors"
            :class="overrideForm.isExcluded ? 'border-orange-400 bg-orange-50' : 'border-gray-200'">
            <input type="checkbox" v-model="overrideForm.isExcluded" class="rounded" />
            <div>
              <div class="font-medium text-sm">Excluir de este retiro</div>
              <p class="text-xs text-gray-500">
                No aparece en la tabla ni en alertas. Útil si la casa ya lo provee.
              </p>
            </div>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showOverrideDialog = false">Cancelar</Button>
          <Button @click="confirmOverride">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Recalculate dialog -->
    <Dialog v-model:open="showRecalcDialog">
      <DialogContent class="max-w-sm">
        <DialogHeader>
          <DialogTitle>Recalcular cantidades requeridas</DialogTitle>
          <DialogDescription>
            Elige la base para los artículos con ratio por caminante.
          </DialogDescription>
        </DialogHeader>
        <div class="py-2">
          <div v-if="loadingRecalcCount" class="flex items-center gap-2 text-sm text-gray-500 py-4 justify-center">
            <Loader2 class="w-4 h-4 animate-spin" /> Cargando conteos…
          </div>
          <RadioGroup v-else v-model="recalcBase" class="space-y-3">
            <!-- Opción: inscritos -->
            <label
              class="flex items-start gap-3 cursor-pointer rounded-lg border p-3 transition-colors hover:bg-gray-50"
              :class="recalcBase === 'actual' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'"
            >
              <RadioGroupItem value="actual" class="mt-0.5 shrink-0" />
              <div>
                <div class="font-medium text-sm">
                  Caminantes inscritos
                  <span class="font-normal text-gray-500">({{ recalcWalkerCount ?? '…' }})</span>
                </div>
                <p class="text-xs text-gray-500 mt-0.5">Solo los caminantes confirmados y no cancelados</p>
              </div>
            </label>
            <!-- Opción: esperados -->
            <label
              class="flex items-start gap-3 rounded-lg border p-3 transition-colors"
              :class="[
                retreatStore.selectedRetreat?.max_walkers
                  ? 'cursor-pointer hover:bg-gray-50'
                  : 'opacity-50 cursor-not-allowed',
                recalcBase === 'expected' ? 'border-blue-500 bg-blue-50' : 'border-gray-200',
              ]"
            >
              <RadioGroupItem
                value="expected"
                class="mt-0.5 shrink-0"
                :disabled="!retreatStore.selectedRetreat?.max_walkers"
              />
              <div>
                <div class="font-medium text-sm">
                  Caminantes esperados
                  <span class="font-normal text-gray-500">
                    ({{ retreatStore.selectedRetreat?.max_walkers ?? 'no configurado' }})
                  </span>
                </div>
                <p class="text-xs text-gray-500 mt-0.5">
                  Usa el cupo máximo del retiro
                  <span v-if="!retreatStore.selectedRetreat?.max_walkers" class="text-orange-500"> — configura max_walkers en el retiro</span>
                </p>
              </div>
            </label>
          </RadioGroup>
        </div>
        <div
          v-if="overrideItemCount > 0"
          class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-2"
        >
          <span class="shrink-0">🔒</span>
          <span>
            {{ overrideItemCount }} item{{ overrideItemCount > 1 ? 's tienen' : ' tiene' }}
            cantidad fija para este retiro y <b>no cambiarán</b> al recalcular.
          </span>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showRecalcDialog = false">Cancelar</Button>
          <Button :disabled="loadingRecalcCount" @click="confirmRecalculate">
            Recalcular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Add item dialog -->
    <Dialog v-model:open="showAddItemDialog">
      <DialogContent class="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agregar items al retiro</DialogTitle>
          <DialogDescription>
            Usa el catálogo global para items recurrentes, o crea uno nuevo solo para este retiro.
          </DialogDescription>
        </DialogHeader>
        <Tabs v-model="addItemTab" class="w-full">
          <TabsList class="grid grid-cols-2 w-full">
            <TabsTrigger value="catalog">Del catálogo</TabsTrigger>
            <TabsTrigger value="custom">Crear nuevo (solo este retiro)</TabsTrigger>
          </TabsList>
          <TabsContent value="catalog" class="space-y-3">
            <Input
              v-model="addItemSearch"
              placeholder="Buscar en el catálogo…"
              class="w-full"
            />
            <div v-if="loadingAvailable" class="text-center py-6 text-gray-500 text-sm">
              Cargando catálogo…
            </div>
            <div
              v-else-if="filteredAvailableItems.length === 0"
              class="text-center py-6 text-gray-500 text-sm"
            >
              {{
                availableItems.length === 0
                  ? 'Todos los items del catálogo ya están en el retiro.'
                  : 'No hay coincidencias para tu búsqueda.'
              }}
            </div>
            <div v-else class="max-h-80 overflow-y-auto border rounded">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 sticky top-0">
                  <tr>
                    <th class="text-center px-2 py-2 w-8">
                      <input
                        type="checkbox"
                        :checked="allFilteredAvailableSelected"
                        @change="toggleAllAvailable"
                        class="rounded"
                        aria-label="Seleccionar todos los disponibles"
                      />
                    </th>
                    <th class="text-left px-3 py-2">Item</th>
                    <th class="text-left px-3 py-2 hidden sm:table-cell">Categoría</th>
                    <th class="text-left px-3 py-2 hidden md:table-cell">Equipo</th>
                    <th class="text-left px-3 py-2 hidden lg:table-cell">Unidad</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="it in filteredAvailableItems"
                    :key="it.id"
                    class="border-t hover:bg-gray-50 cursor-pointer"
                    :class="{ 'bg-blue-50': selectedAvailableIds.has(it.id) }"
                    @click="toggleAvailableSelection(it.id)"
                  >
                    <td class="text-center px-2 py-2">
                      <input
                        type="checkbox"
                        :checked="selectedAvailableIds.has(it.id)"
                        @click.stop
                        @change="toggleAvailableSelection(it.id)"
                        class="rounded"
                      />
                    </td>
                    <td class="px-3 py-2">
                      <div class="font-medium">{{ it.name }}</div>
                      <div v-if="it.description" class="text-xs text-gray-500">{{ it.description }}</div>
                    </td>
                    <td class="px-3 py-2 hidden sm:table-cell text-gray-600">{{ it.categoryName }}</td>
                    <td class="px-3 py-2 hidden md:table-cell text-gray-600">{{ it.teamName }}</td>
                    <td class="px-3 py-2 hidden lg:table-cell text-gray-500">{{ it.unit }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-xs text-gray-500">
              {{ selectedAvailableIds.size }} de {{ filteredAvailableItems.length }} seleccionados
            </p>
            <details v-if="selectedAvailableIds.size > 0" class="text-sm">
              <summary class="cursor-pointer text-gray-500 hover:text-gray-700 select-none py-1">
                Overrides para este retiro (opcional, se aplican a todos los seleccionados)
              </summary>
              <div class="mt-2 space-y-2 border rounded p-3 bg-gray-50">
                <div>
                  <Label class="text-xs">Ratio por caminante</Label>
                  <Input v-model="catalogRatioOverride" type="number" min="0" step="0.01" placeholder="Vacío = usar ratio del catálogo" />
                </div>
                <div>
                  <Label class="text-xs">Cantidad fija (no se sobreescribe al Recalcular)</Label>
                  <Input v-model="catalogRequiredQtyOverride" type="number" min="0" placeholder="Vacío = calcular por ratio" />
                </div>
              </div>
            </details>
          </TabsContent>
          <TabsContent value="custom" class="space-y-3">
            <div class="p-3 bg-blue-50 border border-blue-100 rounded text-xs text-blue-900">
              Crea un item one-off que vive solo en este retiro. Útil para
              cosas específicas que no quieres en el catálogo global.
            </div>
            <div>
              <Label>Nombre <span class="text-red-500">*</span></Label>
              <Input
                v-model="customForm.customName"
                placeholder="Ej. Café Marlboro 30g"
                aria-required="true"
              />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <Label>Unidad</Label>
                <Input v-model="customForm.customUnit" placeholder="piezas" />
              </div>
              <div>
                <Label>Categoría</Label>
                <Select v-model="customForm.customCategoryId">
                  <SelectTrigger>
                    <SelectValue placeholder="Sin categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin categoría</SelectItem>
                    <SelectItem v-for="c in inventoryCategories" :key="c.id" :value="c.id">{{ c.name }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Cantidad requerida</Label>
              <Input v-model.number="customForm.requiredQuantity" type="number" min="0" />
            </div>
            <div>
              <Label>Notas (opcional)</Label>
              <Input v-model="customForm.notes" placeholder="Detalles…" />
            </div>
            <details class="text-sm">
              <summary class="cursor-pointer text-gray-500 hover:text-gray-700 select-none py-1">
                Overrides para este retiro (opcional)
              </summary>
              <div class="mt-2 space-y-2 border rounded p-3 bg-gray-50">
                <div>
                  <Label class="text-xs">Ratio por caminante</Label>
                  <Input v-model.number="customForm.ratioOverride" type="number" min="0" step="0.01" placeholder="Vacío = no aplica" />
                </div>
                <div>
                  <Label class="text-xs">Cantidad fija (no se sobreescribe al Recalcular)</Label>
                  <Input v-model.number="customForm.requiredQtyOverride" type="number" min="0" placeholder="Vacío = usar cantidad requerida" />
                </div>
              </div>
            </details>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" @click="showAddItemDialog = false">Cancelar</Button>
          <Button
            v-if="addItemTab === 'catalog'"
            :disabled="selectedAvailableIds.size === 0 || addingItems"
            @click="confirmAddItems"
          >
            {{ addingItems ? 'Agregando…' : `Agregar ${selectedAvailableIds.size || ''}` }}
          </Button>
          <Button
            v-else
            :disabled="!customForm.customName?.trim() || addingItems"
            @click="confirmAddCustomItem"
          >
            {{ addingItems ? 'Creando…' : 'Crear item' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Edit item dialog -->
    <Dialog v-model:open="showEditItemDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar item del catálogo</DialogTitle>
          <DialogDescription>
            Cambios al item afectan a este y a otros retiros que lo utilicen.
          </DialogDescription>
        </DialogHeader>
        <div v-if="editingItem" class="space-y-3">
          <div>
            <Label>Nombre</Label>
            <Input v-model="editingItem.name" />
          </div>
          <div>
            <Label>Descripción</Label>
            <Input v-model="editingItem.description" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <Label>Ratio por caminante</Label>
              <Input v-model.number="editingItem.ratio" type="number" step="0.01" min="0" />
            </div>
            <div>
              <Label>Cantidad fija (opcional)</Label>
              <Input
                v-model.number="editingItem.requiredQuantity"
                type="number"
                min="0"
                placeholder="Vacío = usar ratio"
              />
            </div>
          </div>
          <div>
            <Label>Unidad</Label>
            <Input v-model="editingItem.unit" placeholder="piezas, cajas, ml…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showEditItemDialog = false">Cancelar</Button>
          <Button @click="confirmEditItem">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete confirmation dialog -->
    <Dialog v-model:open="showDeleteDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ deleteContext.bulk ? 'Quitar items del retiro' : 'Quitar item del retiro' }}</DialogTitle>
          <DialogDescription>
            <span v-if="deleteContext.bulk">
              Vas a quitar <b>{{ deleteContext.count }}</b> items del inventario de este retiro.
            </span>
            <span v-else>
              Vas a quitar <b>{{ deleteContext.name }}</b> del inventario de este retiro.
            </span>
            El item seguirá disponible en el catálogo global y puede volverse a agregar después.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="showDeleteDialog = false">Cancelar</Button>
          <Button
            class="bg-red-600 hover:bg-red-700 text-white"
            @click="confirmDelete"
          >
            Sí, quitar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Help dialog -->
    <InventoryHelpDialog :open="showHelpDialog" @update:open="showHelpDialog = $event" />

    <!-- History dialog -->
    <Dialog v-model:open="showHistoryDialog">
      <DialogContent class="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historial de cambios</DialogTitle>
          <DialogDescription>Últimos 200 cambios al inventario de este retiro.</DialogDescription>
        </DialogHeader>
        <div v-if="historyEntries.length === 0" class="text-center py-8 text-gray-500">
          Sin cambios registrados todavía.
        </div>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="border-b">
              <th class="text-left py-2">Fecha</th>
              <th class="text-left py-2">Artículo</th>
              <th class="text-left py-2">Campo</th>
              <th class="text-left py-2">Antes</th>
              <th class="text-left py-2">Después</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in historyEntries" :key="h.id" class="border-b">
              <td class="py-2 whitespace-nowrap text-xs text-gray-500">{{ formatDateTime(h.createdAt) }}</td>
              <td class="py-2">{{ h.itemName }}</td>
              <td class="py-2 text-xs">{{ humanField(h.field) }}</td>
              <td class="py-2 text-xs text-red-600">{{ h.oldValue ?? '—' }}</td>
              <td class="py-2 text-xs text-green-700">{{ h.newValue ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
        <DialogFooter>
          <Button variant="outline" @click="showHistoryDialog = false">Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
  </TooltipProvider>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useInventoryStore } from '@/stores/inventoryStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useToast } from '@repo/ui';
import { Card, CardHeader, CardTitle, CardContent } from '@repo/ui';
import { Button } from '@repo/ui';
import { Input } from '@repo/ui';
import { Label } from '@repo/ui';
import { RadioGroup, RadioGroupItem } from '@repo/ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@repo/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@repo/ui';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@repo/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui';
import {
  Calculator,
  Upload,
  Download,
  AlertTriangle,
  Package,
  Search,
  X,
  Copy,
  Printer,
  History,
  CheckSquare,
  MoreHorizontal,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  Columns,
  Check,
  ShoppingCart,
  Shirt,
  HelpCircle,
  SlidersHorizontal,
  RefreshCw,
  Loader2,
} from 'lucide-vue-next';
import InventoryHelpDialog from '@/components/InventoryHelpDialog.vue';
import ExcelJS from 'exceljs';
import { api } from '@/services/api';
import { useRekaDialogFix } from '@/composables/useRekaDialogFix';

type Status = 'pending' | 'packed' | 'onsite' | 'consumed' | 'returned';

const STATUSES: Status[] = ['pending', 'packed', 'onsite', 'consumed', 'returned'];

const STATUS_LABELS: Record<Status, string> = {
  pending: 'Pendiente',
  packed: 'Empacado',
  onsite: 'En sitio',
  consumed: 'Consumido',
  returned: 'Devuelto',
};

const STATUS_EMOJI: Record<Status, string> = {
  pending: '⏳',
  packed: '📦',
  onsite: '🏠',
  consumed: '✅',
  returned: '↩️',
};

const STATUS_BADGE: Record<Status, string> = {
  pending: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  packed: 'bg-blue-50 text-blue-800 border-blue-200',
  onsite: 'bg-purple-50 text-purple-800 border-purple-200',
  consumed: 'bg-green-50 text-green-800 border-green-200',
  returned: 'bg-gray-100 text-gray-700 border-gray-300',
};

const { deferOpen, restoreBodyOverflow } = useRekaDialogFix();

function statusEmoji(s: Status) {
  return STATUS_EMOJI[s] || '⏳';
}
function statusLabel(s: Status) {
  return STATUS_LABELS[s] || 'Pendiente';
}
function statusBadgeClass(s: Status) {
  return STATUS_BADGE[s] || STATUS_BADGE.pending;
}

/** Nombre visible del item: catálogo, custom o (sin nombre). */
function displayName(item: any): string {
  return item?.inventoryItem?.name || item?.customName || '(sin nombre)';
}
/** Unidad: catálogo, custom o piezas. */
function displayUnit(item: any): string {
  return item?.inventoryItem?.unit || item?.customUnit || 'piezas';
}
/** Categoría para agrupar/mostrar. */
function displayCategory(item: any): string {
  return (
    item?.inventoryItem?.category?.name ||
    item?.customCategory?.name ||
    (item?.retreatShirtTypeId ? 'Camisetas' : 'Sin categoría')
  );
}
/** Equipo o "—". */
function displayTeam(item: any): string {
  return item?.inventoryItem?.team?.name || '—';
}
/** Si el item es de shirt-type, color hex del tipo (chip). */
function shirtColorOf(item: any): string | null {
  return item?.retreatShirtType?.color || null;
}

const route = useRoute();
const inventoryStore = useInventoryStore();
const { toast } = useToast();

const retreatId = computed(() => route.params.id as string);
const retreatStore = useRetreatStore();

const showImportDialog = ref(false);
const showCopyDialog = ref(false);
const showBulkBoxDialog = ref(false);
const showBulkStatusDialog = ref(false);
const showHistoryDialog = ref(false);
const showAddItemDialog = ref(false);
const showEditItemDialog = ref(false);
const showDeleteDialog = ref(false);
const showHelpDialog = ref(false);

// Override dialog
const showOverrideDialog = ref(false);
const overrideItem = ref<any>(null);
const overrideForm = ref<{
  ratioOverride: string;
  requiredQtyOverride: string;
  isExcluded: boolean;
}>({ ratioOverride: '', requiredQtyOverride: '', isExcluded: false });
const showExcluded = ref(false);

// Recalculate dialog
const showRecalcDialog = ref(false);
const recalcBase = ref<'actual' | 'expected'>('actual');
const recalcWalkerCount = ref<number | null>(null);
const loadingRecalcCount = ref(false);

// Add item
const addItemTab = ref<'catalog' | 'custom'>('catalog');
const addItemSearch = ref('');
const availableItems = ref<any[]>([]);
const loadingAvailable = ref(false);
const selectedAvailableIds = ref<Set<string>>(new Set());
const addingItems = ref(false);
const inventoryCategories = ref<{ id: string; name: string }[]>([]);
// Overrides al agregar del catálogo (aplican a todos los seleccionados)
const catalogRatioOverride = ref<string>('');
const catalogRequiredQtyOverride = ref<string>('');
const customForm = ref<{
  customName: string;
  customUnit: string;
  customCategoryId: string;
  requiredQuantity: number | null;
  notes: string;
  ratioOverride: number | null;
  requiredQtyOverride: number | null;
}>({
  customName: '',
  customUnit: 'piezas',
  customCategoryId: '__none__',
  requiredQuantity: null,
  notes: '',
  ratioOverride: null,
  requiredQtyOverride: null,
});

// Edit item
const editingItem = ref<{
  id: string;
  name: string;
  description: string;
  ratio: number;
  requiredQuantity: number | null;
  unit: string;
} | null>(null);

// Delete confirmation
const deleteContext = ref<{ bulk: boolean; itemId?: string; name?: string; count?: number }>({
  bulk: false,
});

// Column visibility (persistido en localStorage)
const COLUMNS_KEY = 'inventory.visibleColumns.v2';
type ColumnId = 'team' | 'required' | 'actual' | 'tobuy' | 'status' | 'box' | 'notes';
const columnToggles: { id: ColumnId; label: string }[] = [
  { id: 'team', label: 'Equipo' },
  { id: 'required', label: 'Requerido' },
  { id: 'actual', label: 'Actual' },
  { id: 'tobuy', label: 'Comprar' },
  { id: 'status', label: 'Ciclo' },
  { id: 'box', label: 'Caja' },
  { id: 'notes', label: 'Notas' },
];
const DEFAULT_VISIBLE: Record<ColumnId, boolean> = {
  team: true,
  required: true,
  actual: true,
  tobuy: true,
  status: true,
  box: true,
  notes: true,
};
function loadColumnPrefs(): Record<ColumnId, boolean> {
  try {
    const raw = localStorage.getItem(COLUMNS_KEY);
    if (raw) return { ...DEFAULT_VISIBLE, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_VISIBLE };
}
const visibleColumns = ref<Record<ColumnId, boolean>>(loadColumnPrefs());
function setColumnVisible(id: ColumnId, value: boolean) {
  visibleColumns.value = { ...visibleColumns.value, [id]: value };
  try {
    localStorage.setItem(COLUMNS_KEY, JSON.stringify(visibleColumns.value));
  } catch {
    /* ignore */
  }
}
const visibleColumnCount = computed(() =>
  // 1 fija (Artículo) + N visibles + 1 acciones
  1 + Object.values(visibleColumns.value).filter(Boolean).length + 1,
);
const searchQuery = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const importResults = ref<any>(null);

const alertsExpanded = ref(false);

const groupBy = ref<'category' | 'team' | 'box' | 'status' | 'sufficiency' | 'none'>('category');
const teamFilter = ref<string>('__all__');

type PillId = 'withStock' | 'insufficient' | 'withBox' | 'pending' | 'shirts';
const activePills = ref<Set<PillId>>(new Set());

const copySourceRetreats = ref<any[]>([]);
const copySourceRetreatId = ref<string>('');
const copyOverwrite = ref(false);
const copying = ref(false);
const copyResults = ref<{ copied: number; created: number; skipped: number } | null>(null);

const selectedItemIds = ref<Set<string>>(new Set());
const bulkBoxValue = ref('');
const bulkStatusValue = ref<Status>('packed');

const historyEntries = ref<any[]>([]);

const savingIndicator = ref<'' | 'saving' | 'saved'>('');
let savedTimer: ReturnType<typeof setTimeout> | null = null;

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 500;

const loading = computed(() => inventoryStore.loading);
const inventoryAlerts = computed(() => inventoryStore.inventoryAlerts);
const retreatInventoryByCategory = computed(() => inventoryStore.retreatInventoryByCategory);

const allItems = computed<any[]>(() => {
  const out: any[] = [];
  for (const items of Object.values(retreatInventoryByCategory.value || {})) {
    for (const it of items as any[]) {
      if (!it.isExcluded || showExcluded.value) out.push(it);
    }
  }
  return out;
});

const totalCount = computed(() => allItems.value.length);

const overrideItemCount = computed(() =>
  allItems.value.filter((it: any) => it.requiredQtyOverride != null).length,
);

const availableTeams = computed(() => {
  const set = new Set<string>();
  for (const it of allItems.value) {
    const t = it.inventoryItem?.team?.name;
    if (t) set.add(t);
  }
  return Array.from(set).sort();
});

const filterPills = computed(() => [
  { id: 'withStock' as PillId, label: 'Con stock', active: activePills.value.has('withStock') },
  {
    id: 'insufficient' as PillId,
    label: 'Insuficientes',
    active: activePills.value.has('insufficient'),
  },
  { id: 'withBox' as PillId, label: 'Con caja', active: activePills.value.has('withBox') },
  { id: 'pending' as PillId, label: 'Pendientes', active: activePills.value.has('pending') },
  { id: 'shirts' as PillId, label: 'Camisetas', active: activePills.value.has('shirts') },
]);

const hasActiveFilters = computed(
  () =>
    !!searchQuery.value.trim() ||
    teamFilter.value !== '__all__' ||
    activePills.value.size > 0,
);

const filteredItems = computed<any[]>(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return allItems.value.filter((it: any) => {
    if (teamFilter.value !== '__all__' && it.inventoryItem?.team?.name !== teamFilter.value) return false;
    if (activePills.value.has('withStock') && Number(it.currentQuantity || 0) <= 0) return false;
    if (activePills.value.has('insufficient') && it.isSufficient) return false;
    if (activePills.value.has('withBox') && !(it.boxLabel && String(it.boxLabel).trim())) return false;
    if (activePills.value.has('pending') && (it.status || 'pending') !== 'pending') return false;
    if (activePills.value.has('shirts') && !it.retreatShirtTypeId) return false;
    if (q) {
      const hay =
        (it.inventoryItem?.name || '').toLowerCase().includes(q) ||
        (it.customName || '').toLowerCase().includes(q) ||
        (it.inventoryItem?.team?.name || '').toLowerCase().includes(q) ||
        (it.inventoryItem?.category?.name || '').toLowerCase().includes(q) ||
        (it.customCategory?.name || '').toLowerCase().includes(q) ||
        (it.boxLabel || '').toLowerCase().includes(q) ||
        (it.notes || '').toLowerCase().includes(q);
      if (!hay) return false;
    }
    return true;
  });
});

const filteredCount = computed(() => filteredItems.value.length);

const groupedItems = computed<Record<string, any[]>>(() => {
  if (groupBy.value === 'none') {
    return filteredItems.value.length > 0 ? { 'Todos los artículos': filteredItems.value } : {};
  }
  const buckets: Record<string, any[]> = {};
  for (const it of filteredItems.value) {
    let key = '';
    switch (groupBy.value) {
      case 'category':
        key = it.inventoryItem?.category?.name ||
              it.customCategory?.name ||
              (it.retreatShirtTypeId ? 'Camisetas' : 'Sin categoría');
        break;
      case 'team':
        key = it.inventoryItem?.team?.name || it.customTeam?.name || 'Sin equipo';
        break;
      case 'box':
        key = (it.boxLabel && String(it.boxLabel).trim()) || 'Sin caja';
        break;
      case 'status':
        key = STATUS_LABELS[(it.status as Status) || 'pending'];
        break;
      case 'sufficiency':
        key = it.isSufficient ? 'Suficientes' : 'Insuficientes';
        break;
    }
    (buckets[key] ||= []).push(it);
  }
  const keys = Object.keys(buckets);
  keys.sort((a, b) => {
    if (groupBy.value === 'sufficiency') {
      const order = (k: string) => (k === 'Insuficientes' ? 0 : 1);
      return order(a) - order(b);
    }
    if (groupBy.value === 'status') {
      const order = (k: string) => {
        const map: Record<string, number> = {
          Pendiente: 0,
          Empacado: 1,
          'En sitio': 2,
          Consumido: 3,
          Devuelto: 4,
        };
        return map[k] ?? 99;
      };
      return order(a) - order(b);
    }
    return a.localeCompare(b);
  });
  const sorted: Record<string, any[]> = {};
  for (const k of keys) {
    sorted[k] = buckets[k].sort((a, b) =>
      (a.inventoryItem?.name || '').localeCompare(b.inventoryItem?.name || ''),
    );
  }
  return sorted;
});

const allFilteredSelected = computed(
  () =>
    filteredItems.value.length > 0 &&
    filteredItems.value.every((it) => selectedItemIds.value.has(it.id)),
);
const someFilteredSelected = computed(
  () =>
    !allFilteredSelected.value &&
    filteredItems.value.some((it) => selectedItemIds.value.has(it.id)),
);

onMounted(async () => {
  await loadInventoryData();
  await loadCopySourceRetreats();
});

watch(retreatId, async (id, prev) => {
  if (id && id !== prev) {
    selectedItemIds.value = new Set();
    await loadInventoryData();
    await loadCopySourceRetreats();
  }
});

async function loadInventoryData() {
  if (!retreatId.value) return;
  await Promise.all([
    inventoryStore.fetchRetreatInventoryByCategory(retreatId.value),
    inventoryStore.fetchInventoryAlerts(retreatId.value),
  ]);
}

async function loadCopySourceRetreats() {
  try {
    const { data } = await api.get('/retreats');
    copySourceRetreats.value = (data || []).filter((r: any) => r.id !== retreatId.value);
  } catch {
    copySourceRetreats.value = [];
  }
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return '';
  const raw = String(d).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return raw;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatDateTime(d: string | Date) {
  try {
    const dt = new Date(d);
    return dt.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(d);
  }
}

function humanField(field: string) {
  switch (field) {
    case 'currentQuantity':
      return 'Cantidad actual';
    case 'requiredQuantity':
      return 'Cantidad requerida';
    case 'boxLabel':
      return 'Caja';
    case 'notes':
      return 'Notas';
    case 'status':
      return 'Estado del ciclo';
    default:
      return field;
  }
}

async function calculateQuantities() {
  await openRecalcDialog();
}

async function openRecalcDialog() {
  loadingRecalcCount.value = true;
  recalcWalkerCount.value = null;
  showRecalcDialog.value = true;
  try {
    const { data } = await api.get(`/inventory/retreat/${retreatId.value}/walker-count`);
    recalcWalkerCount.value = data.walkerCount;
    // Smart default: inscritos si ya hay, esperados si todavía no
    recalcBase.value = data.walkerCount > 0 ? 'actual' : 'expected';
  } catch {
    // Si falla el count, igual abrimos el dialog con opción manual
    recalcWalkerCount.value = 0;
    recalcBase.value = 'expected';
  } finally {
    loadingRecalcCount.value = false;
  }
}

async function confirmRecalculate() {
  showRecalcDialog.value = false;
  await inventoryStore.calculateRequiredQuantities(retreatId.value, recalcBase.value);
  await loadInventoryData();
}

function markSaving() {
  savingIndicator.value = 'saving';
  if (savedTimer) clearTimeout(savedTimer);
}
function markSaved() {
  savingIndicator.value = 'saved';
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    savingIndicator.value = '';
  }, 2000);
}

function schedulePersist(item: any) {
  const key = item.id;
  const prev = pendingTimers.get(key);
  if (prev) clearTimeout(prev);
  markSaving();
  const t = setTimeout(() => {
    pendingTimers.delete(key);
    persistItem(item);
  }, DEBOUNCE_MS);
  pendingTimers.set(key, t);
}

function onCurrentQuantityInput(item: any) {
  if (typeof item.currentQuantity === 'number' && item.currentQuantity < 0) {
    item.currentQuantity = 0;
  }
  const required = Number(item.requiredQuantity ?? 0);
  const current = Number(item.currentQuantity ?? 0);
  item.isSufficient = required <= 0 || current >= required;
  schedulePersist(item);
}

function onBoxLabelInput(item: any) {
  schedulePersist(item);
}

function onNotesInput(item: any) {
  schedulePersist(item);
}

async function onStatusChange(item: any, newStatus: Status) {
  item.status = newStatus;
  markSaving();
  await persistItem(item);
}

function flushPending(item: any) {
  const key = item.id;
  const prev = pendingTimers.get(key);
  if (prev) {
    clearTimeout(prev);
    pendingTimers.delete(key);
    persistItem(item);
  }
}

async function persistItem(item: any) {
  try {
    await inventoryStore.updateRetreatInventory(
      retreatId.value,
      item.inventoryItemId || item.id,
      {
        currentQuantity: Number(item.currentQuantity ?? 0),
        notes: item.notes ?? '',
        boxLabel: item.boxLabel ?? null,
        status: (item.status as Status) || 'pending',
      },
    );
    markSaved();
  } catch {
    savingIndicator.value = '';
  }
}

function togglePill(id: PillId) {
  const s = new Set(activePills.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  activePills.value = s;
}

function applyInsufficientFilter() {
  activePills.value = new Set(['insufficient']);
  alertsExpanded.value = false;
}

function clearFilters() {
  searchQuery.value = '';
  teamFilter.value = '__all__';
  activePills.value = new Set();
}

function toggleSelection(id: string) {
  const s = new Set(selectedItemIds.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  selectedItemIds.value = s;
}

function allInGroupSelected(items: any[]) {
  return items.every((it) => selectedItemIds.value.has(it.id));
}

function toggleGroupSelection(items: any[]) {
  const s = new Set(selectedItemIds.value);
  if (allInGroupSelected(items)) {
    for (const it of items) s.delete(it.id);
  } else {
    for (const it of items) s.add(it.id);
  }
  selectedItemIds.value = s;
}

function toggleAllFiltered() {
  const s = new Set(selectedItemIds.value);
  if (allFilteredSelected.value) {
    for (const it of filteredItems.value) s.delete(it.id);
  } else {
    for (const it of filteredItems.value) s.add(it.id);
  }
  selectedItemIds.value = s;
}

function clearSelection() {
  selectedItemIds.value = new Set();
}

function selectedInventoryItemIds(): string[] {
  const ids: string[] = [];
  for (const it of allItems.value) {
    if (selectedItemIds.value.has(it.id)) ids.push(it.inventoryItemId || it.id);
  }
  return ids;
}

function openBulkBoxDialog() {
  bulkBoxValue.value = '';
  showBulkBoxDialog.value = true;
}

async function confirmBulkBox() {
  const ids = selectedInventoryItemIds();
  if (ids.length === 0) {
    showBulkBoxDialog.value = false;
    return;
  }
  showBulkBoxDialog.value = false;
  clearSelection();
  try {
    const r = await inventoryStore.bulkUpdateRetreatInventory(retreatId.value, ids, {
      boxLabel: bulkBoxValue.value.trim() || null,
    });
    toast({ title: 'Caja asignada', description: `${r.updated} items actualizados.` });
  } catch (e: any) {
    toast({
      title: 'Error',
      description: e?.response?.data?.message || 'No se pudo actualizar la caja.',
      variant: 'destructive',
    });
  }
}

function openBulkStatusDialog() {
  bulkStatusValue.value = 'packed';
  showBulkStatusDialog.value = true;
}

async function confirmBulkStatus() {
  const ids = selectedInventoryItemIds();
  if (ids.length === 0) {
    showBulkStatusDialog.value = false;
    return;
  }
  const statusValue = bulkStatusValue.value;
  showBulkStatusDialog.value = false;
  clearSelection();
  try {
    const r = await inventoryStore.bulkUpdateRetreatInventory(retreatId.value, ids, {
      status: statusValue,
    });
    toast({
      title: 'Estado actualizado',
      description: `${r.updated} items pasaron a "${STATUS_LABELS[statusValue]}".`,
    });
  } catch (e: any) {
    toast({
      title: 'Error',
      description: e?.response?.data?.message || 'No se pudo cambiar el estado.',
      variant: 'destructive',
    });
  }
}

async function openAddItemDialog() {
  showAddItemDialog.value = true;
  addItemTab.value = 'catalog';
  addItemSearch.value = '';
  selectedAvailableIds.value = new Set();
  catalogRatioOverride.value = '';
  catalogRequiredQtyOverride.value = '';
  customForm.value = {
    customName: '',
    customUnit: 'piezas',
    customCategoryId: '__none__',
    requiredQuantity: null,
    notes: '',
    ratioOverride: null,
    requiredQtyOverride: null,
  };
  loadingAvailable.value = true;
  try {
    const [items, cats] = await Promise.all([
      inventoryStore.fetchAvailableItemsForRetreat(retreatId.value),
      api.get('/inventory/categories').then((r) => r.data).catch(() => []),
    ]);
    availableItems.value = items;
    inventoryCategories.value = Array.isArray(cats) ? cats : [];
  } catch {
    availableItems.value = [];
    toast({
      title: 'Error',
      description: 'No se pudo cargar el catálogo disponible.',
      variant: 'destructive',
    });
  } finally {
    loadingAvailable.value = false;
  }
}

async function confirmAddCustomItem() {
  if (!customForm.value.customName?.trim()) return;
  addingItems.value = true;
  try {
    await inventoryStore.addCustomItemToRetreat(retreatId.value, {
      customName: customForm.value.customName.trim(),
      customUnit: customForm.value.customUnit?.trim() || 'piezas',
      customCategoryId:
        customForm.value.customCategoryId && customForm.value.customCategoryId !== '__none__'
          ? customForm.value.customCategoryId
          : null,
      requiredQuantity: Number(customForm.value.requiredQuantity ?? 0),
      notes: customForm.value.notes,
      ratioOverride: customForm.value.ratioOverride ?? null,
      requiredQtyOverride: customForm.value.requiredQtyOverride ?? null,
    });
    toast({ title: 'Item creado', description: customForm.value.customName });
    showAddItemDialog.value = false;
    await loadInventoryData();
  } catch (e: any) {
    toast({
      title: 'Error',
      description: e?.response?.data?.message || 'No se pudo crear el item.',
      variant: 'destructive',
    });
  } finally {
    addingItems.value = false;
  }
}

async function syncShirtsClick() {
  try {
    const r = await inventoryStore.syncShirtItems(retreatId.value);
    const parts: string[] = [];
    if (r.created) parts.push(`${r.created} creadas`);
    if (r.updated) parts.push(`${r.updated} actualizadas`);
    if (r.removed) parts.push(`${r.removed} eliminadas`);
    if (r.skipped) parts.push(`${r.skipped} con stock conservadas`);
    toast({
      title: 'Camisetas sincronizadas',
      description: parts.length ? parts.join(' · ') : 'Sin cambios.',
    });
    await loadInventoryData();
  } catch (e: any) {
    toast({
      title: 'Error',
      description: e?.response?.data?.message || 'No se pudo sincronizar camisetas.',
      variant: 'destructive',
    });
  }
}

async function syncGlobalCatalog() {
  try {
    const r = await inventoryStore.syncFromCatalog(retreatId.value);
    toast({
      title: 'Catálogo recargado',
      description: r.added > 0 ? `${r.added} ítem(s) añadido(s) al inventario.` : 'No hay ítems nuevos que agregar.',
    });
    if (r.added > 0) await loadInventoryData();
  } catch (e: any) {
    toast({
      title: 'Error',
      description: e?.response?.data?.message || 'No se pudo recargar el catálogo.',
      variant: 'destructive',
    });
  }
}

function openShoppingList() {
  const toShop = allItems.value
    .filter((it: any) => Number(it.requiredQuantity || 0) > Number(it.currentQuantity || 0))
    .map((it: any) => ({
      ...it,
      toBuy:
        Math.max(0, Number(it.requiredQuantity || 0) - Number(it.currentQuantity || 0)),
    }));
  if (toShop.length === 0) {
    toast({ title: 'Sin compras pendientes', description: 'Todos los items están cubiertos.' });
    return;
  }
  const buckets: Record<string, any[]> = {};
  for (const it of toShop) {
    const k = displayCategory(it);
    (buckets[k] ||= []).push(it);
  }
  const groups = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b));
  const today = new Date().toLocaleDateString('es-MX');
  let totalItems = 0;

  const rowsHtml = groups
    .map(([cat, items]) => {
      const sorted = items.sort((a, b) => displayName(a).localeCompare(displayName(b)));
      totalItems += sorted.length;
      const rows = sorted
        .map(
          (it) => `
            <tr>
              <td class="check"><input type="checkbox"></td>
              <td>${escapeHtml(displayName(it))}</td>
              <td class="qty">${Number(it.requiredQuantity || 0)} ${escapeHtml(displayUnit(it))}</td>
              <td class="qty muted">${Number(it.currentQuantity || 0)}</td>
              <td class="qty buy">${it.toBuy} ${escapeHtml(displayUnit(it))}</td>
              <td class="muted">${escapeHtml(it.notes || '')}</td>
            </tr>`,
        )
        .join('');
      return `
        <section class="box">
          <h2>${escapeHtml(cat)} <span class="count">(${sorted.length} items)</span></h2>
          <table>
            <thead>
              <tr><th></th><th>Artículo</th><th>Requiere</th><th>Tiene</th><th>A comprar</th><th>Notas</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Lista de compras — ${today}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; padding: 24px; color: #111; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  h2 { margin: 24px 0 8px; font-size: 17px; border-bottom: 2px solid #333; padding-bottom: 4px; }
  .count { font-weight: normal; color: #666; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; font-size: 13px; }
  th { background: #f3f3f3; }
  td.check { width: 28px; }
  td.qty { white-space: nowrap; font-weight: 600; text-align: right; }
  td.buy { color: #b91c1c; font-weight: 700; }
  td.muted { color: #555; font-size: 12px; font-weight: normal; }
  .hdr { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }
  .hdr .meta { color: #555; font-size: 12px; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 2px solid #333; font-size: 13px; color: #555; }
  @media print { body { padding: 8px; } section.box { page-break-inside: avoid; } button { display: none; } }
</style></head>
<body>
  <div class="hdr">
    <div>
      <h1>Lista de compras</h1>
      <div class="meta">Generado el ${today} · ${totalItems} items por comprar</div>
    </div>
    <button onclick="window.print()" style="padding:6px 14px; cursor:pointer;">Imprimir</button>
  </div>
  ${rowsHtml}
  <div class="footer">Total: ${totalItems} items en ${groups.length} categoría(s).</div>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) {
    toast({
      title: 'Bloqueo de pop-up',
      description: 'Permite ventanas emergentes para imprimir la lista.',
      variant: 'destructive',
    });
    return;
  }
  win.document.write(html);
  win.document.close();
}

const filteredAvailableItems = computed<any[]>(() => {
  const list = Array.isArray(availableItems.value) ? availableItems.value : [];
  const q = addItemSearch.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (it: any) =>
      it.name?.toLowerCase().includes(q) ||
      it.categoryName?.toLowerCase().includes(q) ||
      it.teamName?.toLowerCase().includes(q) ||
      it.description?.toLowerCase().includes(q),
  );
});

const allFilteredAvailableSelected = computed(
  () =>
    filteredAvailableItems.value.length > 0 &&
    filteredAvailableItems.value.every((it: any) => selectedAvailableIds.value.has(it.id)),
);

function toggleAvailableSelection(id: string) {
  const s = new Set(selectedAvailableIds.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  selectedAvailableIds.value = s;
}

function toggleAllAvailable() {
  const s = new Set(selectedAvailableIds.value);
  if (allFilteredAvailableSelected.value) {
    for (const it of filteredAvailableItems.value) s.delete(it.id);
  } else {
    for (const it of filteredAvailableItems.value) s.add(it.id);
  }
  selectedAvailableIds.value = s;
}

async function confirmAddItems() {
  const ids = Array.from(selectedAvailableIds.value);
  if (ids.length === 0) return;
  addingItems.value = true;
  let added = 0;
  let failed = 0;
  const overrides = {
    ratioOverride: catalogRatioOverride.value !== '' ? Number(catalogRatioOverride.value) : null,
    requiredQtyOverride: catalogRequiredQtyOverride.value !== '' ? Number(catalogRequiredQtyOverride.value) : null,
  };
  try {
    for (const id of ids) {
      try {
        await inventoryStore.addItemToRetreat(retreatId.value, id, overrides);
        added++;
      } catch {
        failed++;
      }
    }
    toast({
      title: 'Items agregados',
      description:
        failed > 0
          ? `${added} agregados, ${failed} fallaron.`
          : `${added} item(s) agregados al retiro.`,
    });
    await loadInventoryData();
    showAddItemDialog.value = false;
  } finally {
    addingItems.value = false;
  }
}

function openEditItemDialog(row: any) {
  if (!row?.inventoryItem) return;
  editingItem.value = {
    id: row.inventoryItem.id,
    name: row.inventoryItem.name || '',
    description: row.inventoryItem.description || '',
    ratio: Number(row.inventoryItem.ratio || 0),
    requiredQuantity:
      row.inventoryItem.requiredQuantity == null
        ? null
        : Number(row.inventoryItem.requiredQuantity),
    unit: row.inventoryItem.unit || '',
  };
  showEditItemDialog.value = true;
}

async function confirmEditItem() {
  if (!editingItem.value) return;
  try {
    await inventoryStore.updateInventoryItem(
      editingItem.value.id,
      {
        name: editingItem.value.name,
        description: editingItem.value.description,
        ratio: editingItem.value.ratio,
        requiredQuantity:
          editingItem.value.requiredQuantity === null || isNaN(Number(editingItem.value.requiredQuantity))
            ? null
            : Number(editingItem.value.requiredQuantity),
        unit: editingItem.value.unit,
      },
      retreatId.value,
    );
    toast({ title: 'Item actualizado', description: editingItem.value.name });
    showEditItemDialog.value = false;
    editingItem.value = null;
  } catch (e: any) {
    toast({
      title: 'Error',
      description: e?.response?.data?.message || 'No se pudo actualizar el item.',
      variant: 'destructive',
    });
  }
}

function openOverrideDialog(row: any) {
  overrideItem.value = row;
  overrideForm.value = {
    ratioOverride: row.ratioOverride != null ? String(row.ratioOverride) : '',
    requiredQtyOverride: row.requiredQtyOverride != null ? String(row.requiredQtyOverride) : '',
    isExcluded: !!row.isExcluded,
  };
  deferOpen(() => { showOverrideDialog.value = true; });
}

async function confirmOverride() {
  if (!overrideItem.value) return;
  const row = overrideItem.value;
  const itemId = row.inventoryItemId || row.id;
  const payload: Record<string, any> = {
    ratioOverride: overrideForm.value.ratioOverride !== ''
      ? Number(overrideForm.value.ratioOverride) : null,
    requiredQtyOverride: overrideForm.value.requiredQtyOverride !== ''
      ? Number(overrideForm.value.requiredQtyOverride) : null,
    isExcluded: overrideForm.value.isExcluded,
  };
  showOverrideDialog.value = false;
  overrideItem.value = null;
  try {
    await inventoryStore.updateRetreatInventory(retreatId.value, itemId, payload);
    await loadInventoryData();
    toast({ title: 'Configuración guardada' });
  } catch (e: any) {
    toast({ title: 'Error', description: e?.response?.data?.message || 'No se pudo guardar.', variant: 'destructive' });
  }
}

function askRemoveItem(row: any) {
  // Para items del catálogo, el service espera inventoryItemId.
  // Para ad-hoc y shirts, no hay inventoryItemId → usar el id de la fila pivote.
  deleteContext.value = {
    bulk: false,
    itemId: row.inventoryItemId || row.id,
    name: row.inventoryItem?.name || row.customName || '',
  };
  showDeleteDialog.value = true;
}

function askBulkRemove() {
  deleteContext.value = { bulk: true, count: selectedItemIds.value.size };
  showDeleteDialog.value = true;
}

async function confirmDelete() {
  const ctx = deleteContext.value;
  showDeleteDialog.value = false;
  deleteContext.value = { bulk: false };
  try {
    if (ctx.bulk) {
      const ids = selectedInventoryItemIds();
      const r = await inventoryStore.bulkRemoveItemsFromRetreat(retreatId.value, ids);
      toast({ title: 'Items quitados', description: `${r.removed} item(s) del retiro.` });
      clearSelection();
    } else if (ctx.itemId) {
      await inventoryStore.removeItemFromRetreat(retreatId.value, ctx.itemId);
      toast({ title: 'Item quitado', description: ctx.name });
    }
  } catch (e: any) {
    toast({
      title: 'Error',
      description: e?.response?.data?.message || 'No se pudo quitar el item.',
      variant: 'destructive',
    });
  }
}

async function openHistoryDialog() {
  try {
    historyEntries.value = await inventoryStore.fetchInventoryHistory(retreatId.value, { limit: 200 });
  } catch {
    historyEntries.value = [];
    toast({ title: 'Error', description: 'No se pudo cargar el historial.', variant: 'destructive' });
  }
  showHistoryDialog.value = true;
}

async function confirmCopy() {
  if (!copySourceRetreatId.value) return;
  copying.value = true;
  copyResults.value = null;
  try {
    const { data } = await api.post(
      `/inventory/retreat/${retreatId.value}/copy-from/${copySourceRetreatId.value}`,
      { overwrite: copyOverwrite.value },
    );
    copyResults.value = data;
    toast({
      title: 'Inventario copiado',
      description: `${data.copied + data.created} item(s) actualizados desde el retiro origen.`,
    });
    await loadInventoryData();
  } catch (e: any) {
    toast({
      title: 'Error al copiar',
      description: e?.response?.data?.message || 'No se pudo copiar el inventario.',
      variant: 'destructive',
    });
  } finally {
    copying.value = false;
  }
}

function openPackingList() {
  const itemsWithBox = allItems.value.filter(
    (it: any) => it.boxLabel && String(it.boxLabel).trim(),
  );
  const itemsNoBox = allItems.value.filter(
    (it: any) =>
      Number(it.currentQuantity || 0) > 0 && !(it.boxLabel && String(it.boxLabel).trim()),
  );
  const buckets: Record<string, any[]> = {};
  for (const it of itemsWithBox) {
    const k = String(it.boxLabel).trim();
    (buckets[k] ||= []).push(it);
  }
  if (itemsNoBox.length > 0) buckets['Sin caja (con stock)'] = itemsNoBox;

  const groups = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b));
  const today = new Date().toLocaleDateString('es-MX');

  const rowsHtml = groups
    .map(([box, items]) => {
      const rows = items
        .sort((a, b) => displayName(a).localeCompare(displayName(b)))
        .map(
          (it) => `
            <tr>
              <td class="check"><input type="checkbox"></td>
              <td>${escapeHtml(displayName(it))}</td>
              <td class="qty">${Number(it.currentQuantity || 0)} ${escapeHtml(displayUnit(it))}</td>
              <td class="muted">${escapeHtml(displayTeam(it))}</td>
              <td class="muted">${escapeHtml(it.notes || '')}</td>
            </tr>`,
        )
        .join('');
      return `
        <section class="box">
          <h2>${escapeHtml(box)} <span class="count">(${items.length} items)</span></h2>
          <table>
            <thead>
              <tr><th></th><th>Artículo</th><th>Cantidad</th><th>Equipo</th><th>Notas</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Lista de empaque — ${today}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; padding: 24px; color: #111; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  h2 { margin: 24px 0 8px; font-size: 17px; border-bottom: 2px solid #333; padding-bottom: 4px; }
  .count { font-weight: normal; color: #666; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; font-size: 13px; }
  th { background: #f3f3f3; }
  td.check { width: 28px; }
  td.qty { white-space: nowrap; font-weight: 600; }
  td.muted { color: #555; font-size: 12px; }
  .hdr { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }
  .hdr .meta { color: #555; font-size: 12px; }
  @media print { body { padding: 8px; } section.box { page-break-inside: avoid; } button { display: none; } }
</style></head>
<body>
  <div class="hdr">
    <div>
      <h1>Lista de empaque</h1>
      <div class="meta">Generado el ${today}</div>
    </div>
    <button onclick="window.print()" style="padding:6px 14px; cursor:pointer;">Imprimir</button>
  </div>
  ${rowsHtml || '<p>No hay items con caja asignada ni stock para empacar.</p>'}
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) {
    toast({
      title: 'Bloqueo de pop-up',
      description: 'Permite ventanas emergentes para imprimir la lista.',
      variant: 'destructive',
    });
    return;
  }
  win.document.write(html);
  win.document.close();
}

function escapeHtml(s: string) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}

async function exportInventory() {
  try {
    const data = await inventoryStore.exportInventory(retreatId.value);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inventario');
    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      worksheet.addRow(headers);
      data.forEach((row: any) => worksheet.addRow(Object.values(row)));
    }
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventario_retiro_${retreatId.value}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast({ title: 'Exportación exitosa', description: 'El inventario se ha exportado correctamente' });
  } catch {
    toast({ title: 'Error', description: 'No se pudo exportar el inventario', variant: 'destructive' });
  }
}

async function handleFileUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const data = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data as any);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) throw new Error('No se encontró ninguna hoja de cálculo');
    const jsonData: any[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const rowData: any = {};
        row.eachCell((cell, colNumber) => {
          const header = worksheet.getRow(1).getCell(colNumber).value?.toString() || `column${colNumber}`;
          rowData[header] = cell.value;
        });
        jsonData.push(rowData);
      }
    });
    const results = await inventoryStore.importInventory(retreatId.value, jsonData);
    importResults.value = results;
    if (results.errors.length === 0) showImportDialog.value = false;
    await loadInventoryData();
  } catch {
    toast({ title: 'Error', description: 'No se pudo procesar el archivo', variant: 'destructive' });
  }
}
</script>

<style scoped>
/* Sticky header en tabla scrolleable */
table thead th {
  position: sticky;
  top: 0;
  background-color: rgb(249 250 251);
  z-index: 10;
}
</style>
