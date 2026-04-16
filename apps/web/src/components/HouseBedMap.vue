<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-[1400px] h-[90vh] max-h-[90vh] overflow-hidden-scroll flex flex-col">
      <DialogHeader class="flex-shrink-0">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Building class="w-5 h-5" />
            <div>
              <DialogTitle>Mapa de Camas - {{ house?.name }}</DialogTitle>
              <DialogDescription class="mt-1">
                Visualización interactiva de la organización de camas por pisos y habitaciones
              </DialogDescription>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Badge v-if="hasUnsavedChanges" variant="destructive" class="text-xs animate-pulse">
              <AlertCircle class="w-3 h-3 mr-1" />
              Cambios sin guardar
            </Badge>
            <Badge v-if="selectedBed" variant="outline" class="text-xs">
              <Eye class="w-3 h-3 mr-1" />
              1 cama seleccionada
            </Badge>
          </div>
        </div>
      </DialogHeader>

      <!-- Controls Bar -->
      <div class="flex flex-wrap items-center gap-3 p-3 bg-gray-50 rounded-lg border flex-shrink-0">
        <!-- Search -->
        <div class="flex items-center gap-2 flex-1 min-w-[160px]">
          <Label class="text-sm font-medium whitespace-nowrap hidden sm:block">Buscar:</Label>
          <div class="relative flex-1">
            <Search class="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              v-model="searchQuery"
              placeholder="Habitación o cama..."
              class="pl-8 h-9"
            />
          </div>
        </div>

        <!-- Mobile filter toggle -->
        <Button
          variant="outline"
          size="sm"
          class="sm:hidden h-9 relative"
          @click="showFilters = !showFilters"
        >
          <Search class="w-4 h-4 mr-1" />
          Filtros
          <span
            v-if="activeFilterCount > 0"
            class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center"
          >{{ activeFilterCount }}</span>
        </Button>

        <!-- Filters — always visible on sm+, collapsible on mobile -->
        <div :class="['flex flex-wrap items-center gap-3', showFilters ? 'flex' : 'hidden sm:flex', 'w-full sm:w-auto']">
          <div class="flex items-center gap-2">
            <Label class="text-sm font-medium">Piso:</Label>
            <Select v-model="selectedFloor">
              <SelectTrigger class="w-32 h-9">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem v-for="floor in availableFloors" :key="floor" :value="floor.toString()">
                  Piso {{ floor }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="flex items-center gap-2">
            <Label class="text-sm font-medium">Tipo:</Label>
            <Select v-model="selectedBedType">
              <SelectTrigger class="w-32 h-9">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="litera_abajo">Litera Inferior</SelectItem>
                <SelectItem value="litera_arriba">Litera Superior</SelectItem>
                <SelectItem value="colchon">Colchón</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="flex items-center gap-2">
            <Label class="text-sm font-medium">Uso:</Label>
            <Select v-model="selectedUsage">
              <SelectTrigger class="w-32 h-9">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="caminante">Caminante</SelectItem>
                <SelectItem value="servidor">Servidor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div v-if="availableSectors.length > 0" class="flex items-center gap-2">
            <Label class="text-sm font-medium">Sector:</Label>
            <Select v-model="selectedSector">
              <SelectTrigger class="w-36 h-9">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem v-for="sector in availableSectors" :key="sector" :value="sector">
                  {{ sector }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-2 ml-auto">
          <!-- Undo/Redo -->
          <Button
            v-if="historyIndex > 0"
            variant="outline"
            size="sm"
            @click="undo"
            class="h-9"
            title="Deshacer (Ctrl+Z)"
          >
            <RotateCcw class="w-4 h-4" />
          </Button>
          <Button
            v-if="historyIndex < history.length - 1"
            variant="outline"
            size="sm"
            @click="redo"
            class="h-9"
            title="Rehacer (Ctrl+Y)"
          >
            <RotateCw class="w-4 h-4" />
          </Button>

          <!-- Save -->
          <Button v-if="hasUnsavedChanges" variant="default" size="sm" @click="handleSave" :disabled="isSaving" class="flex items-center gap-1 h-9">
            <Loader2 v-if="isSaving" class="w-4 h-4 animate-spin" />
            <Save v-else class="w-4 h-4" />
            Guardar
          </Button>

          <!-- Combined Actions Menu -->
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" class="h-9 w-9 p-0">
                <MoreVertical class="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem @click="selectAllBeds">
                <CheckSquare class="w-4 h-4 mr-2" />
                Seleccionar todas
              </DropdownMenuItem>
              <DropdownMenuItem @click="deselectAllBeds">
                <Square class="w-4 h-4 mr-2" />
                Deseleccionar todas
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="bulkDeleteBeds" :disabled="selectedBeds.length === 0">
                <Trash2 class="w-4 h-4 mr-2" />
                Eliminar seleccionadas
              </DropdownMenuItem>
              <DropdownMenuItem @click="bulkChangeType" :disabled="selectedBeds.length === 0">
                <Edit class="w-4 h-4 mr-2" />
                Cambiar tipo
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="showLegend = !showLegend">
                <EyeOff v-if="showLegend" class="w-4 h-4 mr-2" />
                <Eye v-else class="w-4 h-4 mr-2" />
                {{ showLegend ? 'Ocultar leyenda' : 'Mostrar leyenda' }}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="exportMap">
                <FileText class="w-4 h-4 mr-2" />
                Exportar JSON
              </DropdownMenuItem>
              <DropdownMenuItem @click="exportToCSV">
                <FileSpreadsheet class="w-4 h-4 mr-2" />
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem @click="printMap">
                <Printer class="w-4 h-4 mr-2" />
                Imprimir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <!-- Legend & Stats -->
      <div v-if="showLegend" class="flex flex-wrap items-center gap-4 p-3 bg-blue-50 rounded-lg text-sm">
        <div class="font-medium">Leyenda:</div>
        <div class="flex items-center gap-1">
          <div class="w-4 h-4 rounded bg-green-500"></div>
          <span>Normal</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-4 h-4 rounded bg-yellow-500"></div>
          <span>Litera Inferior</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-4 h-4 rounded bg-orange-500"></div>
          <span>Litera Superior</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-4 h-4 rounded bg-purple-500"></div>
          <span>Colchón</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-4 h-4 rounded-full bg-blue-100 border-2 border-blue-500"></div>
          <span>Caminante</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-4 h-4 rounded-full bg-orange-100 border-2 border-orange-500"></div>
          <span>Servidor</span>
        </div>
        <div class="flex items-center gap-1 ml-auto">
          <div class="w-4 h-4 rounded border-2 border-gray-300"></div>
          <span>Seleccionada</span>
        </div>
      </div>

      <!-- Border Style Legend -->
      <div v-if="showLegend" class="flex flex-wrap items-center gap-4 p-3 bg-amber-50 rounded-lg text-sm">
        <div class="font-medium">Bordes:</div>
        <div class="flex items-center gap-1">
          <div class="w-4 h-4 bg-green-100 border-2 border-green-500 border-solid"></div>
          <span>Guardado</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-4 h-4 bg-green-100 border-2 border-green-500 border-dashed"></div>
          <span>Nuevo/Modificado</span>
        </div>
        <div class="text-xs text-gray-600 ml-auto">
          Las camas con bordes discontinuos tienen cambios pendientes de guardar
        </div>
      </div>

      <!-- Keyboard Shortcuts (inside legend) -->
      <div v-if="showLegend" class="text-xs text-gray-500 px-3 py-2 bg-gray-50 rounded-lg flex-shrink-0">
        Atajos: <kbd class="px-1 py-0.5 bg-white rounded border">Ctrl+Z</kbd> Deshacer |
        <kbd class="px-1 py-0.5 bg-white rounded border">Ctrl+Y</kbd> Rehacer |
        <kbd class="px-1 py-0.5 bg-white rounded border">Delete</kbd> Eliminar seleccionada |
        <kbd class="px-1 py-0.5 bg-white rounded border">Esc</kbd> Deseleccionar
      </div>

      <!-- Main Content -->
      <div class="flex-1 overflow-hidden flex flex-col min-h-0">
        <div class="flex-1 w-full overflow-y-auto scrollbar-thin p-6">
          <div>
            <!-- Statistics Cards -->
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <Card class="p-3 hover:shadow-md transition-shadow cursor-pointer" @click="selectFloor('all')">
                <div class="text-center">
                  <div class="text-2xl font-bold text-blue-600">{{ totalBeds }}</div>
                  <div class="text-xs text-gray-600">Total Camas</div>
                </div>
              </Card>
              <Card class="p-3">
                <div class="text-center">
                  <div class="text-2xl font-bold text-green-600">{{ totalFloors }}</div>
                  <div class="text-xs text-gray-600">Pisos</div>
                </div>
              </Card>
              <Card class="p-3">
                <div class="text-center">
                  <div class="text-2xl font-bold text-orange-600">{{ totalRooms }}</div>
                  <div class="text-xs text-gray-600">Habitaciones</div>
                </div>
              </Card>
              <Card class="p-3">
                <div class="text-center">
                  <div class="text-2xl font-bold text-purple-600">{{ filteredBeds.length }}</div>
                  <div class="text-xs text-gray-600">Filtradas</div>
                </div>
              </Card>
              <Card class="p-3">
                <div class="text-center">
                  <div class="text-2xl font-bold text-red-600">{{ selectedBeds.length }}</div>
                  <div class="text-xs text-gray-600">Seleccionadas</div>
                </div>
              </Card>
            </div>

            <!-- Floor Sections -->
            <div v-for="(floorBeds, sectorKey) in groupedFilteredBeds" :key="sectorKey" class="mb-8">
              <!-- Floor Header -->
              <div class="flex items-center gap-3 mb-4 pb-2 border-b-2 border-gray-200">
                <div class="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold text-lg">
                  {{ parseSectorKey(String(sectorKey)).floor }}
                </div>
                <div class="flex items-center gap-2 flex-1">
                  <h3 class="text-xl font-bold whitespace-nowrap">
                    Piso {{ parseSectorKey(String(sectorKey)).floor }}
                    <span v-if="parseSectorKey(String(sectorKey)).label" class="font-normal text-gray-500 text-lg"> - {{ parseSectorKey(String(sectorKey)).label }}</span>
                  </h3>
                </div>
                <div class="ml-auto flex items-center gap-2">
                  <Badge variant="outline">{{ floorBeds.length }} cama(s)</Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" class="h-7 w-7 p-0">
                        <MoreVertical class="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem @click="startEditFloorLabel(parseSectorKey(String(sectorKey)).floor, parseSectorKey(String(sectorKey)).label)">
                        <Pencil class="w-4 h-4 mr-2" />
                        Editar sector
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem @click="selectAllBedsInRoom(floorBeds)">
                        <CheckSquare class="w-4 h-4 mr-2" />
                        Seleccionar todo el sector
                      </DropdownMenuItem>
                      <DropdownMenuItem @click="addBedToRoom(parseSectorKey(String(sectorKey)).floor, getNextRoomInFloor(parseSectorKey(String(sectorKey)).floor, parseSectorKey(String(sectorKey)).label), parseSectorKey(String(sectorKey)).label)">
                        <Plus class="w-4 h-4 mr-2" />
                        Agregar habitación
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <!-- Room Grid for this Floor -->
              <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <div v-for="(roomBeds, roomNum) in groupBedsByRoom(floorBeds)" :key="roomNum" class="border rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
                  <!-- Room Header -->
                  <div class="flex items-center gap-2 p-3 bg-gray-100 border-b">
                    <DoorOpen class="w-4 h-4 text-gray-600" />
                    <h4 class="font-semibold">Habitación {{ roomNum }}</h4>
                    <div class="ml-auto flex items-center gap-2">
                      <Badge variant="secondary" class="text-xs">{{ roomBeds.length }} camas</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" class="h-6 w-6 p-0">
                            <MoreVertical class="w-3 h-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem @click="selectAllBedsInRoom(roomBeds)">
                            <CheckSquare class="w-4 h-4 mr-2" />
                            Seleccionar todas
                          </DropdownMenuItem>
                          <DropdownMenuItem @click="addBedToRoom(parseSectorKey(String(sectorKey)).floor, String(roomNum), parseSectorKey(String(sectorKey)).label)">
                            <Plus class="w-4 h-4 mr-2" />
                            Agregar cama
                          </DropdownMenuItem>
                          <DropdownMenuItem @click="duplicateRoom(parseSectorKey(String(sectorKey)).floor, String(roomNum))">
                            <Copy class="w-4 h-4 mr-2" />
                            Duplicar habitación
                          </DropdownMenuItem>
                          <DropdownMenuItem @click="openChangeSector(parseSectorKey(String(sectorKey)).floor, String(roomNum), parseSectorKey(String(sectorKey)).label)">
                            <Tag class="w-4 h-4 mr-2" />
                            Cambiar sector
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <!-- Beds in Room -->
                  <div class="p-2 sm:p-4">
                    <div class="grid grid-cols-2 sm:grid-cols-2 gap-2 sm:gap-3">
                      <div
                        v-for="bed in roomBeds"
                        :key="bed.id || `${bed.roomNumber}-${bed.bedNumber}`"
                        class="relative group"
                        :data-bed-id="bed.id || `${bed.roomNumber}-${bed.bedNumber}`"
                      >
                        <div
                          :class="[
                            'p-2 sm:p-3 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md hover:scale-105 relative',
                            getBedColorClasses(bed.type, bed.defaultUsage, bed),
                            selectedBeds.includes(bed) ? 'ring-2 ring-blue-500 ring-offset-2 scale-105 shadow-lg' : '',
                            hoveredBed === bed ? 'z-10' : ''
                          ]"
                          @click="toggleBedSelection(bed, $event)"
                          @mouseenter="hoveredBed = bed"
                          @mouseleave="hoveredBed = null"
                          tabindex="0"
                          @keydown.enter="toggleBedSelection(bed, $event)"
                          @keydown.space.prevent="toggleBedSelection(bed, $event)"
                          @keydown.delete.stop="quickDeleteBed(bed)"
                        >
                          <!-- Modified Indicator -->
                          <div v-if="isBedModified(bed)" class="absolute top-0 left-0 right-0 h-1 bg-orange-400 rounded-t-lg z-20" title="Con cambios pendientes"></div>

                          <!-- Selection Checkbox -->
                          <div class="absolute top-1 left-1 z-20">
                            <div
                              v-if="selectedBeds.includes(bed)"
                              class="w-4 h-4 bg-blue-500 rounded flex items-center justify-center text-white text-xs"
                            >
                              ✓
                            </div>
                          </div>

                          <!-- Bed Content -->
                          <div class="flex flex-col items-center text-center">
                            <div class="font-bold text-xs sm:text-sm mb-0.5 sm:mb-1">Cama {{ bed.bedNumber }}</div>
                            <div class="text-[10px] sm:text-xs opacity-75 leading-tight">{{ getBedTypeLabel(bed.type) }}</div>
                            <div class="mt-0.5 sm:mt-1">
                              <div
                                class="px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-medium"
                                :class="bed.defaultUsage === 'caminante'
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : 'bg-orange-100 text-orange-800 border border-orange-200'"
                              >
                                {{ bed.defaultUsage === 'caminante' ? 'C' : 'S' }}
                              </div>
                            </div>
                          </div>

                          <!-- Bed Actions Menu -->
                          <div class="absolute top-1 right-1 z-50" @click.stop>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  class="h-6 w-6 p-0 hover:bg-white/80 rounded flex items-center justify-center"
                                  title="Más opciones"
                                >
                                  <MoreVertical class="w-3 h-3" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" class="min-w-44">
                                <DropdownMenuItem @click.stop="editBed(bed)">
                                  <Edit class="w-4 h-4 mr-2" />
                                  Editar cama
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem @click.stop="changeBedTypeInline(bed, 'normal')">
                                  <div class="w-3 h-3 rounded bg-green-500 mr-2 flex-shrink-0"></div>
                                  Normal
                                </DropdownMenuItem>
                                <DropdownMenuItem @click.stop="changeBedTypeInline(bed, 'litera_abajo')">
                                  <div class="w-3 h-3 rounded bg-yellow-500 mr-2 flex-shrink-0"></div>
                                  Litera Inferior
                                </DropdownMenuItem>
                                <DropdownMenuItem @click.stop="changeBedTypeInline(bed, 'litera_arriba')">
                                  <div class="w-3 h-3 rounded bg-orange-500 mr-2 flex-shrink-0"></div>
                                  Litera Superior
                                </DropdownMenuItem>
                                <DropdownMenuItem @click.stop="changeBedTypeInline(bed, 'colchon')">
                                  <div class="w-3 h-3 rounded bg-purple-500 mr-2 flex-shrink-0"></div>
                                  Colchón
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem @click.stop="changeBedUsageInline(bed, 'caminante')">
                                  <div class="w-3 h-3 rounded-full bg-blue-100 border-2 border-blue-500 mr-2 flex-shrink-0"></div>
                                  Caminante
                                </DropdownMenuItem>
                                <DropdownMenuItem @click.stop="changeBedUsageInline(bed, 'servidor')">
                                  <div class="w-3 h-3 rounded-full bg-orange-100 border-2 border-orange-500 mr-2 flex-shrink-0"></div>
                                  Servidor
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem @click.stop="duplicateBed(bed)">
                                  <Copy class="w-4 h-4 mr-2" />
                                  Duplicar
                                </DropdownMenuItem>
                                <DropdownMenuItem @click.stop="quickDeleteBed(bed)" class="text-red-600 focus:text-red-600">
                                  <Trash2 class="w-4 h-4 mr-2" />
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        <!-- Hover Tooltip -->
                        <div
                          v-if="hoveredBed === bed"
                          class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap z-50"
                        >
                          Piso {{ bed.floor || 1 }} • {{ getBedTypeLabel(bed.type) }} • {{ bed.defaultUsage === 'caminante' ? 'Caminante' : 'Servidor' }}
                        </div>
                      </div>
                    </div>

                    <!-- Add Bed Button -->
                    <div class="mt-3">
                      <Button variant="dashed" size="sm" class="w-full h-8" @click="addBedToRoom(parseSectorKey(String(sectorKey)).floor, String(roomNum), parseSectorKey(String(sectorKey)).label)">
                        <Plus class="w-4 h-4 mr-1" />
                        Agregar Cama
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Add Room Button -->
              <div class="mt-4">
                <Button variant="outline" @click="addBedToRoom(parseSectorKey(String(sectorKey)).floor, getNextRoomInFloor(parseSectorKey(String(sectorKey)).floor, parseSectorKey(String(sectorKey)).label), parseSectorKey(String(sectorKey)).label)" class="w-full">
                  <Plus class="w-4 h-4 mr-1" />
                  Agregar Habitación al Piso {{ parseSectorKey(String(sectorKey)).floor }}
                </Button>
              </div>
            </div>

            <!-- Empty State -->
            <div v-if="filteredBeds.length === 0" class="text-center py-12">
              <Bed class="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 class="text-lg font-semibold text-gray-600 mb-2">No hay camas</h3>
              <p class="text-gray-500 mb-4">
                {{ house?.beds?.length === 0
                  ? 'Esta casa no tiene camas configuradas'
                  : 'No hay camas que coincidan con los filtros seleccionados'
                }}
              </p>
              <Button @click="openAddModal" v-if="house?.beds?.length === 0">
                <Plus class="w-4 h-4 mr-1" />
                Agregar Camas
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- Bed Details Panel -->
      <div v-if="selectedBeds.length > 0" class="border-t p-4 bg-gray-50 flex-shrink-0">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-4">
            <h4 class="font-semibold">
              {{ selectedBeds.length === 1 ? 'Detalles de Cama' : `${selectedBeds.length} camas seleccionadas` }}
            </h4>
            <div v-if="selectedBeds.length === 1 && selectedBed" class="text-sm text-gray-600">
              Habitación {{ selectedBed.roomNumber }}, Cama {{ selectedBed.bedNumber }}, Piso {{ selectedBed.floor || 1 }}
            </div>
          </div>
          <div class="flex gap-2">
            <Button variant="outline" size="sm" @click="deselectAllBeds">
              <X class="w-4 h-4" />
            </Button>
          </div>
        </div>

        <!-- Single Bed View/Edit -->
        <div v-if="selectedBeds.length === 1">
          <!-- View Mode -->
          <div v-if="!editingBed" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
            <Card class="p-3">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded" :class="getBedColorClass(selectedBed?.type || 'normal')"></div>
                <div>
                  <div class="text-xs text-gray-500">Tipo</div>
                  <div class="font-medium">{{ getBedTypeLabel(selectedBed?.type || 'normal') }}</div>
                </div>
              </div>
            </Card>
            <Card class="p-3">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-full border-2" :class="selectedBed?.defaultUsage === 'caminante' ? 'bg-blue-100 border-blue-500' : 'bg-orange-100 border-orange-500'"></div>
                <div>
                  <div class="text-xs text-gray-500">Uso</div>
                  <div class="font-medium">{{ selectedBed?.defaultUsage === 'caminante' ? 'Caminante' : 'Servidor' }}</div>
                </div>
              </div>
            </Card>
            <Card class="p-3">
              <div>
                <div class="text-xs text-gray-500">Estado</div>
                <div class="font-medium text-green-600">Disponible</div>
              </div>
            </Card>
            <Card class="p-3">
              <div>
                <div class="text-xs text-gray-500">Capacidad</div>
                <div class="font-medium">1 persona</div>
              </div>
            </Card>
          </div>

          <!-- Actions -->
          <div class="flex gap-2">
            <Button variant="default" size="sm" @click="editBed(selectedBed!)" :disabled="!selectedBed">
              <Edit class="w-4 h-4 mr-1" />
              Editar
            </Button>
            <Button variant="outline" size="sm" @click="duplicateBed(selectedBed!)" :disabled="!selectedBed">
              <Copy class="w-4 h-4 mr-1" />
              Duplicar
            </Button>
            <Button variant="outline" size="sm" @click="quickDeleteBed(selectedBed!)" :disabled="!selectedBed">
              <Trash2 class="w-4 h-4 mr-1" />
              Eliminar
            </Button>
          </div>
        </div>

        <!-- Multiple Beds Selection -->
        <div v-else>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
            <Card class="p-3">
              <div class="text-center">
                <div class="text-lg font-bold">{{ selectedBeds.length }}</div>
                <div class="text-xs text-gray-500">Camas seleccionadas</div>
              </div>
            </Card>
            <Card class="p-3">
              <div class="text-center">
                <div class="text-lg font-bold">{{ countByType('normal') }}</div>
                <div class="text-xs text-gray-500">Normales</div>
              </div>
            </Card>
            <Card class="p-3">
              <div class="text-center">
                <div class="text-lg font-bold">{{ countByType('litera_abajo') + countByType('litera_arriba') }}</div>
                <div class="text-xs text-gray-500">Literas ({{ countByType('litera_abajo') }} inf / {{ countByType('litera_arriba') }} sup)</div>
              </div>
            </Card>
            <Card class="p-3">
              <div class="text-center">
                <div class="text-lg font-bold">{{ countByType('colchon') }}</div>
                <div class="text-xs text-gray-500">Colchones</div>
              </div>
            </Card>
          </div>

          <!-- Bulk Actions -->
          <div class="flex gap-2 flex-wrap">
            <Button variant="default" size="sm" @click="bulkChangeType">
              <Edit class="w-4 h-4 mr-1" />
              Cambiar tipo
            </Button>
            <Button variant="default" size="sm" @click="bulkChangeUsage">
              <Users class="w-4 h-4 mr-1" />
              Cambiar uso
            </Button>
            <Button variant="outline" size="sm" @click="bulkMoveBeds">
              <Move class="w-4 h-4 mr-1" />
              Mover a habitación
            </Button>
            <Button variant="outline" size="sm" @click="bulkDeleteBeds" class="text-red-600 hover:text-red-700">
              <Trash2 class="w-4 h-4 mr-1" />
              Eliminar todas
            </Button>
          </div>
        </div>

        <!-- Edit Mode (for single bed) -->
        <div v-if="editingBed && selectedBeds.length === 1" class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 p-3 bg-white rounded-lg border">
          <div>
            <Label class="text-xs text-gray-500">Habitación</Label>
            <Input v-model="editingBed.roomNumber" class="mt-1 h-8" />
          </div>
          <div>
            <Label class="text-xs text-gray-500">Cama</Label>
            <Input v-model="editingBed.bedNumber" class="mt-1 h-8" />
          </div>
          <div>
            <Label class="text-xs text-gray-500">Tipo</Label>
            <Select v-model="editingBed.type">
              <SelectTrigger class="mt-1 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="litera_abajo">Litera Inferior</SelectItem>
                <SelectItem value="litera_arriba">Litera Superior</SelectItem>
                <SelectItem value="colchon">Colchón</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label class="text-xs text-gray-500">Uso</Label>
            <Select v-model="editingBed.defaultUsage">
              <SelectTrigger class="mt-1 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="caminante">Caminante</SelectItem>
                <SelectItem value="servidor">Servidor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="md:col-span-4 flex gap-2 mt-2">
            <Button variant="default" size="sm" @click="saveBedEdit">
              <Save class="w-4 h-4 mr-1" />
              Guardar cambios
            </Button>
            <Button variant="outline" size="sm" @click="cancelBedEdit">
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>

  <!-- Bulk Type Change Modal -->
  <Dialog :open="showBulkTypeModal" @update:open="showBulkTypeModal = $event">
    <DialogContent class="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>Cambiar Tipo de Camas</DialogTitle>
        <DialogDescription>
          Se cambiará el tipo de {{ selectedBeds.length }} cama(s) seleccionada(s)
        </DialogDescription>
      </DialogHeader>

      <div class="py-4">
        <Label class="text-sm font-medium">Nuevo tipo:</Label>
        <Select v-model="bulkNewType">
          <SelectTrigger class="mt-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="litera_abajo">Litera Inferior</SelectItem>
                <SelectItem value="litera_arriba">Litera Superior</SelectItem>
            <SelectItem value="colchon">Colchón</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex justify-end gap-2">
        <Button variant="outline" @click="showBulkTypeModal = false">
          Cancelar
        </Button>
        <Button @click="applyBulkTypeChange">
          Aplicar cambios
        </Button>
      </div>
    </DialogContent>
  </Dialog>

  <!-- Bulk Usage Change Modal -->
  <Dialog :open="showBulkUsageModal" @update:open="showBulkUsageModal = $event">
    <DialogContent class="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>Cambiar Uso de Camas</DialogTitle>
        <DialogDescription>
          Se cambiará el uso de {{ selectedBeds.length }} cama(s) seleccionada(s)
        </DialogDescription>
      </DialogHeader>

      <div class="py-4">
        <Label class="text-sm font-medium">Nuevo uso:</Label>
        <Select v-model="bulkNewUsage">
          <SelectTrigger class="mt-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="caminante">Caminante</SelectItem>
            <SelectItem value="servidor">Servidor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex justify-end gap-2">
        <Button variant="outline" @click="showBulkUsageModal = false">
          Cancelar
        </Button>
        <Button @click="applyBulkUsageChange">
          Aplicar cambios
        </Button>
      </div>
    </DialogContent>
  </Dialog>

  <!-- Bulk Move Modal -->
  <Dialog :open="showBulkMoveModal" @update:open="showBulkMoveModal = $event">
    <DialogContent class="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>Mover Camas</DialogTitle>
        <DialogDescription>
          Mover {{ selectedBeds.length }} cama(s) a otra habitación
        </DialogDescription>
      </DialogHeader>

      <div class="py-4 space-y-3">
        <div>
          <Label class="text-sm font-medium">Piso:</Label>
          <Select v-model="bulkMoveFloor">
            <SelectTrigger class="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="floor in availableFloors" :key="floor" :value="floor.toString()">
                Piso {{ floor }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label class="text-sm font-medium">Habitación:</Label>
          <Select v-model="bulkMoveRoom" class="mt-2">
            <SelectTrigger class="mt-2">
              <SelectValue placeholder="Selecciona habitación" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="room in availableRoomsForFloor" :key="room" :value="room">
                Habitación {{ room }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div class="flex justify-end gap-2">
        <Button variant="outline" @click="showBulkMoveModal = false">
          Cancelar
        </Button>
        <Button @click="applyBulkMove">
          Mover camas
        </Button>
      </div>
    </DialogContent>
  </Dialog>

  
  <!-- Change Room Sector Dialog -->
  <Dialog :open="showChangeSectorDialog" @update:open="showChangeSectorDialog = $event">
    <DialogContent class="sm:max-w-[420px]">
      <DialogHeader>
        <DialogTitle>Cambiar sector — Habitación {{ changeSectorRoom }}</DialogTitle>
        <DialogDescription>
          Selecciona un sector existente o escribe uno nuevo. Déjalo vacío para quitar el sector.
        </DialogDescription>
      </DialogHeader>
      <div class="py-4 space-y-4">
        <!-- Existing sectors -->
        <div v-if="sectorsOnCurrentFloor.length > 0">
          <p class="text-xs font-medium text-muted-foreground mb-2">Sectores en este piso</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="sector in sectorsOnCurrentFloor"
              :key="sector"
              type="button"
              :class="[
                'px-3 py-1 rounded-full text-sm border transition-colors',
                changeSectorDraft === sector
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted hover:bg-muted/80 border-border'
              ]"
              @click="changeSectorDraft = changeSectorDraft === sector ? '' : sector"
            >
              {{ sector }}
            </button>
          </div>
        </div>
        <!-- New sector input -->
        <div>
          <p class="text-xs font-medium text-muted-foreground mb-2">
            {{ sectorsOnCurrentFloor.length > 0 ? 'O escribe un sector nuevo' : 'Nombre del sector' }}
          </p>
          <Input
            v-model="changeSectorDraft"
            placeholder="Ej: Ala Norte, Sector B..."
            @keydown.enter="saveRoomSector"
          />
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <Button variant="outline" @click="showChangeSectorDialog = false">Cancelar</Button>
        <Button @click="saveRoomSector">Mover habitación</Button>
      </div>
    </DialogContent>
  </Dialog>

  <!-- Floor Label Edit Dialog -->
  <Dialog :open="showFloorLabelDialog" @update:open="showFloorLabelDialog = $event">
    <DialogContent class="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>Sector del Piso {{ editingFloorLabel }}</DialogTitle>
        <DialogDescription>
          Escribe el nombre del sector para identificar este grupo de camas (ej: "Ala Norte", "Sector B").
        </DialogDescription>
      </DialogHeader>
      <div class="py-4">
        <Input
          v-model="floorLabelDraft"
          placeholder="Ej: Planta Baja, Ala Norte..."
          @keydown.enter="saveFloorLabel"
        />
      </div>
      <div class="flex justify-end gap-2">
        <Button variant="outline" @click="showFloorLabelDialog = false">Cancelar</Button>
        <Button @click="saveFloorLabel">Guardar sector</Button>
      </div>
    </DialogContent>
  </Dialog>

  <!-- Delete Confirmation Dialog -->
  <Dialog :open="showDeleteConfirmDialog" @update:open="showDeleteConfirmDialog = $event">
    <DialogContent class="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>Eliminar camas</DialogTitle>
        <DialogDescription>
          ¿Estás seguro que quieres eliminar {{ selectedBeds.length }} cama(s)? Esta acción no se puede deshacer.
        </DialogDescription>
      </DialogHeader>
      <div class="flex justify-end gap-2 mt-4">
        <Button variant="outline" @click="showDeleteConfirmDialog = false">Cancelar</Button>
        <Button variant="destructive" @click="confirmBulkDelete">Eliminar</Button>
      </div>
    </DialogContent>
  </Dialog>

  <!-- Close Without Saving Dialog -->
  <Dialog :open="showCloseConfirmDialog" @update:open="showCloseConfirmDialog = $event">
    <DialogContent class="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>Cambios sin guardar</DialogTitle>
        <DialogDescription>
          Tienes cambios sin guardar. ¿Estás seguro que quieres cerrar? Se perderán todos los cambios.
        </DialogDescription>
      </DialogHeader>
      <div class="flex justify-end gap-2 mt-4">
        <Button variant="outline" @click="showCloseConfirmDialog = false">Seguir editando</Button>
        <Button variant="destructive" @click="confirmClose">Cerrar sin guardar</Button>
      </div>
    </DialogContent>
  </Dialog>

  <!-- Bulk Add Modal -->
  <Dialog :open="showBulkAddModal" @update:open="showBulkAddModal = $event">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>Agregar Camas en Lote</DialogTitle>
        <DialogDescription>
          Configura múltiples camas rápidamente para esta casa
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-4 py-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <Label for="startFloor">Piso Inicial</Label>
            <Input
              id="startFloor"
              type="number"
              min="1"
              v-model="bulkAddData.startFloor"
              class="mt-1"
            />
          </div>
          <div>
            <Label for="endFloor">Piso Final</Label>
            <Input
              id="endFloor"
              type="number"
              min="1"
              v-model="bulkAddData.endFloor"
              class="mt-1"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <Label for="roomsPerFloor">Habitaciones por Piso</Label>
            <Input
              id="roomsPerFloor"
              type="number"
              min="1"
              v-model="bulkAddData.roomsPerFloor"
              class="mt-1"
            />
          </div>
          <div>
            <Label for="bedsPerRoom">Camas por Habitación</Label>
            <Input
              id="bedsPerRoom"
              type="number"
              min="1"
              v-model="bulkAddData.bedsPerRoom"
              class="mt-1"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <Label for="bedType">Tipo de Cama</Label>
            <Select v-model="bulkAddData.bedType">
              <SelectTrigger class="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="litera_abajo">Litera Inferior</SelectItem>
                <SelectItem value="litera_arriba">Litera Superior</SelectItem>
                <SelectItem value="colchon">Colchón</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label for="defaultUsage">Uso Predeterminado</Label>
            <Select v-model="bulkAddData.defaultUsage">
              <SelectTrigger class="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="caminante">Caminante</SelectItem>
                <SelectItem value="servidor">Servidor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="bg-blue-50 p-3 rounded-lg">
          <p class="text-sm text-blue-800">
            <strong>Total de camas a agregar:</strong>
            {{ calculateTotalBeds() }}
          </p>
          <p class="text-xs text-blue-600 mt-1">
            {{ calculateBedsDescription() }}
          </p>
        </div>
      </div>

      <div class="flex justify-end gap-2">
        <Button variant="outline" @click="closeBulkAddModal">
          Cancelar
        </Button>
        <Button @click="executeBulkAdd" :disabled="calculateTotalBeds() === 0">
          Agregar Camas
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Card, Badge, Input, useToast, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@repo/ui';
import { AlertCircle, Loader2, Save, Search, RotateCcw, RotateCw, CheckSquare, Square, FileText, FileSpreadsheet, MoreVertical, Copy, Users, Move, Eye, EyeOff, Pencil } from 'lucide-vue-next';
import { Building, Download, Printer, DoorOpen, Bed, Plus, Edit, Trash2, X, Tag } from 'lucide-vue-next';
import type { House, Bed as BedType } from '@repo/types';

const props = defineProps({
  open: Boolean,
  house: {
    type: Object as () => House | null,
    default: null,
  },
});

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'save-house', data: House): Promise<boolean>;
}>();

const { toast } = useToast();

// Search and filter
const searchQuery = ref<string>('');
const selectedFloor = ref<string>('all');
const selectedBedType = ref<string>('all');
const selectedUsage = ref<string>('all');
const selectedSector = ref<string>('all');

// Selection state
const selectedBeds = ref<(BedType & { id?: string })[]>([]);
const hoveredBed = ref<BedType | null>(null);
const selectedBed = computed(() => selectedBeds.value.length === 1 ? selectedBeds.value[0] : null);

// State management
const hasUnsavedChanges = ref(false);
const isSaving = ref(false);
const originalHouse = ref<House | null>(null);
const localHouse = ref<House | null>(null);
const editingBed = ref<BedType | null>(null);

// Undo/Redo
const history = ref<House[]>([]);
const historyIndex = ref(-1);
const maxHistorySize = 50;

// Modal states
const showBulkAddModal = ref(false);
const showBulkTypeModal = ref(false);
const showBulkUsageModal = ref(false);
const showBulkMoveModal = ref(false);
const bulkNewType = ref<'normal' | 'litera_abajo' | 'litera_arriba' | 'colchon'>('normal');
const bulkNewUsage = ref<'caminante' | 'servidor'>('caminante');
const bulkMoveFloor = ref<string>('1');
const bulkMoveRoom = ref<string>('1');

// Inline functions for dropdown menu
const changeBedTypeInline = (bed: BedType & { id?: string }, type: 'normal' | 'litera_abajo' | 'litera_arriba' | 'colchon') => {
  if (!localHouse.value) return;

  const index = localHouse.value.beds?.findIndex(b =>
    (b.id && bed.id && b.id === bed.id) ||
    (!b.id && !bed.id &&
     b.roomNumber === bed.roomNumber &&
     b.bedNumber === bed.bedNumber &&
     (b.floor || 1) === (bed.floor || 1))
  );

  if (index !== undefined && index > -1 && localHouse.value.beds) {
    const bedCountBefore = localHouse.value.beds.length;
    localHouse.value.beds[index].type = type;
    const bedCountAfter = localHouse.value.beds.length;

    saveToHistory();
    hasUnsavedChanges.value = true;
    checkForChanges();

    if (bedCountAfter === bedCountBefore) {
      toast({
        title: 'Tipo cambiado',
        description: `Cama ${bed.bedNumber} ahora es ${getBedTypeLabel(type)}`,
      });
    } else {
      toast({
        title: 'Error',
        description: 'Error al cambiar tipo de cama',
        variant: 'destructive',
      });
    }
  }
};

const changeBedUsageInline = (bed: BedType & { id?: string }, usage: 'caminante' | 'servidor') => {
  if (!localHouse.value) return;

  const index = localHouse.value.beds?.findIndex(b =>
    (b.id && bed.id && b.id === bed.id) ||
    (!b.id && !bed.id &&
     b.roomNumber === bed.roomNumber &&
     b.bedNumber === bed.bedNumber &&
     (b.floor || 1) === (bed.floor || 1))
  );

  if (index !== undefined && index > -1 && localHouse.value.beds) {
    const bedCountBefore = localHouse.value.beds.length;
    localHouse.value.beds[index].defaultUsage = usage;
    const bedCountAfter = localHouse.value.beds.length;

    saveToHistory();
    hasUnsavedChanges.value = true;
    checkForChanges();

    if (bedCountAfter === bedCountBefore) {
      toast({
        title: 'Uso cambiado',
        description: `Cama ${bed.bedNumber} ahora es para ${usage === 'caminante' ? 'Caminante' : 'Servidor'}`,
      });
    } else {
      toast({
        title: 'Error',
        description: 'Error al cambiar uso de cama',
        variant: 'destructive',
      });
    }
  }
};

// Bulk add data
const bulkAddData = ref({
  startFloor: 1,
  endFloor: 1,
  roomsPerFloor: 1,
  bedsPerRoom: 1,
  bedType: 'normal' as const,
  defaultUsage: 'caminante' as const
});

// UI state with localStorage persistence
const showLegend = ref(localStorage.getItem('houseBedMap_showLegend') !== 'false');
const showFilters = ref(false);

const activeFilterCount = computed(() => {
  let count = 0;
  if (selectedFloor.value !== 'all') count++;
  if (selectedBedType.value !== 'all') count++;
  if (selectedUsage.value !== 'all') count++;
  if (selectedSector.value !== 'all') count++;
  if (searchQuery.value) count++;
  return count;
});

// Confirmation dialogs
const showDeleteConfirmDialog = ref(false);
const showCloseConfirmDialog = ref(false);

// Floor label editing
const editingFloorLabel = ref<number | null>(null);
const floorLabelDraft = ref('');
const floorLabelOriginal = ref('');
const showFloorLabelDialog = ref(false);

// Room sector change
const showChangeSectorDialog = ref(false);
const changeSectorFloor = ref<number>(1);
const changeSectorRoom = ref<string>('');
const changeSectorDraft = ref('');

// Helper function to generate a UUID v4
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Computed properties
const availableFloors = computed(() => {
  if (!localHouse.value?.beds) return [];
  const floorSet = new Set(localHouse.value.beds.map(bed => bed.floor || 1));
  const floors: number[] = [];
  floorSet.forEach(floor => floors.push(floor));
  return floors.sort((a, b) => a - b);
});

const availableSectors = computed(() => {
  if (!localHouse.value?.beds) return [];
  const labels = new Set<string>();
  localHouse.value.beds.forEach(bed => {
    const lbl = (bed as any).floorLabel || '';
    if (lbl) labels.add(lbl);
  });
  return [...labels].sort((a, b) => a.localeCompare(b));
});

const availableRoomsForFloor = computed(() => {
  if (!localHouse.value?.beds || !bulkMoveFloor.value) return [];
  const floor = Number(bulkMoveFloor.value);
  const rooms = new Set(
    localHouse.value.beds
      .filter(b => (b.floor || 1) === floor)
      .map(b => b.roomNumber)
  );
  return [...rooms].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
});

const filteredBeds = computed(() => {
  if (!localHouse.value?.beds) return [];

  return localHouse.value.beds.filter(bed => {
    const floorMatch = selectedFloor.value === 'all' || (bed.floor || 1).toString() === selectedFloor.value;
    const typeMatch = selectedBedType.value === 'all' || bed.type === selectedBedType.value;
    const usageMatch = selectedUsage.value === 'all' || bed.defaultUsage === selectedUsage.value;
    const sectorMatch = selectedSector.value === 'all' || ((bed as any).floorLabel || '') === selectedSector.value;
    const searchMatch = !searchQuery.value ||
      bed.roomNumber.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      bed.bedNumber.toLowerCase().includes(searchQuery.value.toLowerCase());

    return floorMatch && typeMatch && usageMatch && sectorMatch && searchMatch;
  });
});

const parseSectorKey = (key: string): { floor: number; label: string } => {
  const idx = key.indexOf('||');
  return { floor: Number(key.slice(0, idx)), label: key.slice(idx + 2) };
};

const groupedFilteredBeds = computed(() => {
  const groups: { [key: string]: (BedType & { id?: string })[] } = {};

  filteredBeds.value.forEach(bed => {
    const floor = bed.floor || 1;
    const label = (bed as any).floorLabel || '';
    const key = `${floor}||${label}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(bed);
  });

  // Sort by floor number asc, then label asc
  const sorted: { [key: string]: (BedType & { id?: string })[] } = {};
  Object.keys(groups)
    .sort((a, b) => {
      const pa = parseSectorKey(a);
      const pb = parseSectorKey(b);
      if (pa.floor !== pb.floor) return pa.floor - pb.floor;
      return pa.label.localeCompare(pb.label);
    })
    .forEach(key => { sorted[key] = groups[key]; });

  return sorted;
});

const startEditFloorLabel = (floorNum: number, currentLabel: string) => {
  editingFloorLabel.value = floorNum;
  floorLabelOriginal.value = currentLabel;
  floorLabelDraft.value = currentLabel;
  showFloorLabelDialog.value = true;
};

const saveFloorLabel = () => {
  if (!localHouse.value?.beds || editingFloorLabel.value === null) return;
  const floor = editingFloorLabel.value;
  const oldLabel = floorLabelDraft.value !== undefined ? floorLabelDraft.value : '';
  // Save the label only to beds that belong to this specific sector
  // We identify the sector by the label stored before editing started
  // (stored in floorLabelDraftOriginal via the dialog open)
  localHouse.value.beds.forEach(bed => {
    if ((bed.floor || 1) === floor && ((bed as any).floorLabel || '') === (floorLabelOriginal.value)) {
      (bed as any).floorLabel = floorLabelDraft.value || undefined;
    }
  });
  editingFloorLabel.value = null;
  showFloorLabelDialog.value = false;
  checkForChanges();
};

const sectorsOnCurrentFloor = computed(() => {
  if (!localHouse.value?.beds) return [];
  const labels = new Set<string>();
  localHouse.value.beds.forEach(bed => {
    if ((bed.floor || 1) === changeSectorFloor.value) {
      const lbl = (bed as any).floorLabel || '';
      if (lbl) labels.add(lbl);
    }
  });
  return [...labels].sort((a, b) => a.localeCompare(b));
});

const openChangeSector = (floor: number, room: string, currentLabel: string) => {
  changeSectorFloor.value = floor;
  changeSectorRoom.value = room;
  changeSectorDraft.value = currentLabel;
  showChangeSectorDialog.value = true;
};

const saveRoomSector = () => {
  if (!localHouse.value?.beds) return;
  const newLabel = changeSectorDraft.value.trim() || undefined;
  localHouse.value.beds.forEach(bed => {
    if ((bed.floor || 1) === changeSectorFloor.value && String(bed.roomNumber) === changeSectorRoom.value) {
      (bed as any).floorLabel = newLabel;
    }
  });
  showChangeSectorDialog.value = false;
  checkForChanges();
  toast({
    title: 'Sector actualizado',
    description: newLabel
      ? `Habitación ${changeSectorRoom.value} movida al sector "${newLabel}"`
      : `Habitación ${changeSectorRoom.value} sin sector asignado`,
  });
};

const getNextRoomInFloor = (floorNum: number, sectorLabel?: string): string => {
  const roomsInFloor = (localHouse.value?.beds ?? [])
    .filter(b => {
      const floorMatch = (b.floor || 1) === floorNum;
      const labelMatch = sectorLabel !== undefined ? ((b as any).floorLabel || '') === sectorLabel : true;
      return floorMatch && labelMatch;
    })
    .map(b => b.roomNumber);
  const roomNums = [...new Set(roomsInFloor)].sort(alphanumericCompare);
  const last = roomNums[roomNums.length - 1] || '0';
  const match = last.match(/^([A-Za-z]*)(\d+)$/);
  if (match) {
    return match[1] + (parseInt(match[2], 10) + 1);
  }
  return String(parseInt(last, 10) + 1 || 1);
};

const getFloorLabelByNumber = (floorNum: number): string | undefined => {
  return localHouse.value?.beds?.find(b => (b.floor || 1) === floorNum && b.floorLabel)?.floorLabel ?? undefined;
};

const totalBeds = computed(() => localHouse.value?.beds?.length || 0);
const totalFloors = computed(() => availableFloors.value.length);
const totalRooms = computed(() => {
  const rooms = new Set(localHouse.value?.beds?.map(bed => `${bed.floor || 1}-${bed.roomNumber}`) || []);
  return rooms.size;
});

// Function to compare two objects deeply
const deepEqual = (obj1: any, obj2: any): boolean => {
  if (obj1 === obj2) return true;

  if (obj1 == null || obj2 == null) return obj1 === obj2;

  if (typeof obj1 !== typeof obj2) return false;

  if (typeof obj1 !== 'object') return obj1 === obj2;

  if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key)) return false;
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }

  return true;
};

// Function to check if there are actual changes
const checkForChanges = () => {
  if (!localHouse.value || !originalHouse.value) {
    hasUnsavedChanges.value = false;
    return;
  }
  const hasChanges = !deepEqual(localHouse.value, originalHouse.value);
  hasUnsavedChanges.value = hasChanges;
};

// History management
const saveToHistory = () => {
  if (!localHouse.value) return;

  // Remove any history after current index
  history.value = history.value.slice(0, historyIndex.value + 1);

  // Add current state to history (deep copy to avoid reference issues)
  const houseCopy = {
    ...localHouse.value,
    beds: localHouse.value.beds ? [...localHouse.value.beds] : []
  };

  history.value.push(houseCopy);

  // Limit history size
  if (history.value.length > maxHistorySize) {
    history.value.shift();
  } else {
    historyIndex.value++;
  }
};

const undo = () => {
  if (historyIndex.value > 0) {
    historyIndex.value--;
    localHouse.value = JSON.parse(JSON.stringify(history.value[historyIndex.value]));
    hasUnsavedChanges.value = true;
    selectedBeds.value = [];
    editingBed.value = null;

    toast({
      title: 'Deshacer',
      description: 'Cambio revertido',
    });
  }
};

const redo = () => {
  if (historyIndex.value < history.value.length - 1) {
    historyIndex.value++;
    localHouse.value = JSON.parse(JSON.stringify(history.value[historyIndex.value]));
    hasUnsavedChanges.value = true;
    selectedBeds.value = [];
    editingBed.value = null;

    toast({
      title: 'Rehacer',
      description: 'Cambio reaplicado',
    });
  }
};

// Keyboard navigation
const handleKeydown = (e: KeyboardEvent) => {
  // Only handle keys when the modal is open
  if (!props.open) return;

  // Escape: Deselect all
  if (e.key === 'Escape') {
    e.preventDefault();
    deselectAllBeds();
    return;
  }

  // Ctrl+Z: Undo
  if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
    return;
  }

  // Ctrl+Y or Ctrl+Shift+Z: Redo
  if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
    e.preventDefault();
    redo();
    return;
  }

  // Delete: Delete selected beds
  if (e.key === 'Delete' && selectedBeds.value.length > 0) {
    e.preventDefault();
    bulkDeleteBeds();
    return;
  }

  // Ctrl+A: Select all filtered beds
  if (e.ctrlKey && e.key === 'a') {
    e.preventDefault();
    selectAllBeds();
    return;
  }
};

// Selection methods
const toggleBedSelection = (bed: BedType & { id?: string }, event: MouseEvent | KeyboardEvent) => {
  // Check if this is a multi-selection (Ctrl/Cmd + Click)
  const isMultiSelect = event.ctrlKey || event.metaKey;

  if (isMultiSelect) {
    const index = selectedBeds.value.findIndex(b =>
      (b.id && b.id === bed.id) ||
      (!b.id && !bed.id && b.roomNumber === bed.roomNumber && b.bedNumber === bed.bedNumber && (b.floor || 1) === (bed.floor || 1))
    );

    if (index > -1) {
      selectedBeds.value.splice(index, 1);
    } else {
      selectedBeds.value.push(bed);
    }
  } else {
    // Single selection
    selectedBeds.value = [bed];
  }
};

const selectAllBeds = () => {
  selectedBeds.value = [...filteredBeds.value];
};

const deselectAllBeds = () => {
  selectedBeds.value = [];
  editingBed.value = null;
};

const selectAllBedsInRoom = (roomBeds: (BedType & { id?: string })[]) => {
  const combinedSet = new Set([...selectedBeds.value, ...roomBeds]);
  selectedBeds.value = [];
  combinedSet.forEach(bed => selectedBeds.value.push(bed));
};

const selectFloor = (floor: string) => {
  selectedFloor.value = floor;
};

// Count helpers
const countByType = (type: string) => {
  return selectedBeds.value.filter(bed => bed.type === type).length;
};

// Color helpers
const getBedColorClass = (type: string) => {
  const colors = {
    normal: 'bg-green-500',
    litera_abajo: 'bg-yellow-500',
    litera_arriba: 'bg-orange-500',
    colchon: 'bg-purple-500'
  };
  return colors[type as keyof typeof colors] || colors.normal;
};

// Bulk operations
const bulkDeleteBeds = () => {
  if (selectedBeds.value.length === 0) return;
  showDeleteConfirmDialog.value = true;
};

const confirmBulkDelete = () => {
  showDeleteConfirmDialog.value = false;

  if (localHouse.value && localHouse.value.beds) {
    selectedBeds.value.forEach(bedToDelete => {
      const index = localHouse.value!.beds!.findIndex(bed =>
        (bed.id && bed.id === bedToDelete.id) ||
        (!bed.id && !bedToDelete.id && bed.roomNumber === bedToDelete.roomNumber && bed.bedNumber === bedToDelete.bedNumber && (bed.floor || 1) === (bedToDelete.floor || 1))
      );

      if (index > -1) {
        localHouse.value!.beds!.splice(index, 1);
      }
    });

    saveToHistory();
    hasUnsavedChanges.value = true;
    checkForChanges();

    toast({
      title: 'Camas eliminadas',
      description: `${selectedBeds.value.length} cama(s) eliminada(s)`,
    });

    deselectAllBeds();
  }
};

const bulkChangeType = () => {
  if (selectedBeds.value.length === 0) return;
  showBulkTypeModal.value = true;
};

const applyBulkTypeChange = () => {
  if (!localHouse.value || selectedBeds.value.length === 0) return;

  selectedBeds.value.forEach(bed => {
    const index = localHouse.value!.beds!.findIndex(b =>
      (b.id && b.id === bed.id) ||
      (!b.id && !bed.id && b.roomNumber === bed.roomNumber && b.bedNumber === bed.bedNumber && (b.floor || 1) === (bed.floor || 1))
    );

    if (index > -1) {
      localHouse.value!.beds![index].type = bulkNewType.value;
    }
  });

  saveToHistory();
  hasUnsavedChanges.value = true;
  checkForChanges();
  showBulkTypeModal.value = false;

  toast({
    title: 'Tipo cambiado',
    description: `${selectedBeds.value.length} cama(s) actualizada(s) a ${getBedTypeLabel(bulkNewType.value)}`,
  });
};

const bulkChangeUsage = () => {
  if (selectedBeds.value.length === 0) return;
  showBulkUsageModal.value = true;
};

const applyBulkUsageChange = () => {
  if (!localHouse.value || selectedBeds.value.length === 0) return;

  selectedBeds.value.forEach(bed => {
    const index = localHouse.value!.beds!.findIndex(b =>
      (b.id && b.id === bed.id) ||
      (!b.id && !bed.id && b.roomNumber === bed.roomNumber && b.bedNumber === bed.bedNumber && (b.floor || 1) === (bed.floor || 1))
    );

    if (index > -1) {
      localHouse.value!.beds![index].defaultUsage = bulkNewUsage.value;
    }
  });

  saveToHistory();
  hasUnsavedChanges.value = true;
  checkForChanges();
  showBulkUsageModal.value = false;

  toast({
    title: 'Uso cambiado',
    description: `${selectedBeds.value.length} cama(s) actualizada(s) a ${bulkNewUsage.value === 'caminante' ? 'Caminante' : 'Servidor'}`,
  });
};

const bulkMoveBeds = () => {
  if (selectedBeds.value.length === 0) return;
  showBulkMoveModal.value = true;
  bulkMoveFloor.value = '1';
  bulkMoveRoom.value = '1';
};

const applyBulkMove = () => {
  if (!localHouse.value || selectedBeds.value.length === 0) return;

  selectedBeds.value.forEach(bed => {
    const index = localHouse.value!.beds!.findIndex(b =>
      (b.id && b.id === bed.id) ||
      (!b.id && !bed.id && b.roomNumber === bed.roomNumber && b.bedNumber === bed.bedNumber && (b.floor || 1) === (bed.floor || 1))
    );

    if (index > -1) {
      localHouse.value!.beds![index].floor = parseInt(bulkMoveFloor.value);
      localHouse.value!.beds![index].roomNumber = bulkMoveRoom.value;
    }
  });

  saveToHistory();
  hasUnsavedChanges.value = true;
  checkForChanges();
  showBulkMoveModal.value = false;

  toast({
    title: 'Camas movidas',
    description: `${selectedBeds.value.length} cama(s) movida(s) al piso ${bulkMoveFloor.value}, habitación ${bulkMoveRoom.value}`,
  });

  deselectAllBeds();
};

// Quick actions
const duplicateBed = (bed: BedType & { id?: string }) => {
  if (!localHouse.value) return;

  const newBed = {
    ...bed,
    id: generateUUID(),
    bedNumber: (parseInt(bed.bedNumber) + 1).toString()
  };

  if (!localHouse.value.beds) {
    localHouse.value.beds = [];
  }

  localHouse.value.beds.push(newBed);
  saveToHistory();
  hasUnsavedChanges.value = true;
  checkForChanges();

  toast({
    title: 'Cama duplicada',
    description: `Cama ${newBed.bedNumber} creada en habitación ${bed.roomNumber}`,
  });
};

const duplicateRoom = (floor: number, roomNumber: string) => {
  if (!localHouse.value) return;

  const roomBeds = localHouse.value.beds?.filter(bed =>
    (bed.floor || 1) === floor && bed.roomNumber === roomNumber
  ) || [];

  if (roomBeds.length === 0) return;

  const newRoomNumber = prompt(`Número para la nueva habitación (basado en ${roomNumber}):`, (parseInt(roomNumber) + 1).toString());
  if (!newRoomNumber) return;

  const newBeds = roomBeds.map(bed => ({
    ...bed,
    id: generateUUID(),
    roomNumber: newRoomNumber
  }));

  localHouse.value.beds?.push(...newBeds);
  saveToHistory();
  hasUnsavedChanges.value = true;
  checkForChanges();

  toast({
    title: 'Habitación duplicada',
    description: `Habitación ${newRoomNumber} creada con ${newBeds.length} camas`,
  });
};

const quickDeleteBed = (bed: BedType & { id?: string }) => {
  if (!localHouse.value) return;

  const index = localHouse.value.beds?.findIndex(b =>
    (b.id && b.id === bed.id) ||
    (!b.id && !bed.id && b.roomNumber === bed.roomNumber && b.bedNumber === bed.bedNumber && (b.floor || 1) === (bed.floor || 1))
  );

  if (index !== undefined && index > -1) {
    localHouse.value.beds?.splice(index, 1);
    saveToHistory();
    hasUnsavedChanges.value = true;
    checkForChanges();

    toast({
      title: 'Cama eliminada',
      description: `Cama ${bed.bedNumber} eliminada`,
    });

    if (selectedBeds.value.includes(bed)) {
      selectedBeds.value = selectedBeds.value.filter(b => b !== bed);
    }
  }
};

// Export functions
const exportToCSV = () => {
  if (!localHouse.value?.beds) return;

  const headers = ['Piso', 'Sector', 'Habitación', 'Cama', 'Tipo', 'Uso'];
  const rows = localHouse.value.beds.map(bed => [
    bed.floor || 1,
    (bed as any).floorLabel || '',
    bed.roomNumber,
    bed.bedNumber,
    getBedTypeLabel(bed.type),
    bed.defaultUsage === 'caminante' ? 'Caminante' : 'Servidor'
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.house?.name || 'casa'}_camas.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// Lifecycle hooks
onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
});

const handleOpenChange = (open: boolean) => {
  if (!open && hasUnsavedChanges.value) {
    showCloseConfirmDialog.value = true;
    return;
  }
  emit('update:open', open);
};

const confirmClose = () => {
  showCloseConfirmDialog.value = false;
  hasUnsavedChanges.value = false;
  emit('update:open', false);
};

const handleSave = async () => {
  if (!localHouse.value) return;

  isSaving.value = true;
  try {
    const success = await emit('save-house', localHouse.value);
    if (success) {
      originalHouse.value = JSON.parse(JSON.stringify(localHouse.value));
      // Update props.house to match the saved state
      if (props.house && localHouse.value.beds) {
        props.house.beds = [...localHouse.value.beds];
      }
      hasUnsavedChanges.value = false;
      history.value = [];
      historyIndex.value = -1;
      toast({
        title: 'Cambios guardados',
        description: 'La configuración de camas ha sido actualizada exitosamente',
      });
    }
  } catch (error) {
    toast({
      title: 'Error al guardar',
      description: 'Ocurrió un error al guardar los cambios',
      variant: 'destructive',
    });
  } finally {
    isSaving.value = false;
  }
};

// Helper function to check if a bed is new or edited
const isBedModified = (bed: BedType & { id?: string }) => {
  if (!originalHouse.value?.beds) return false; // No original data, assume not modified

  // If bed has no ID, check if it exists in original by properties
  if (!bed.id) {
    const existsInOriginal = originalHouse.value.beds.some(b =>
      !b.id &&
      b.roomNumber === bed.roomNumber &&
      b.bedNumber === bed.bedNumber &&
      (b.floor || 1) === (bed.floor || 1)
    );

    if (!existsInOriginal) {
      return true; // New bed
    }
  }

  // Find the original bed
  const originalBed = originalHouse.value.beds.find(b =>
    (b.id && bed.id && b.id === bed.id) ||
    (!b.id && !bed.id &&
     b.roomNumber === bed.roomNumber &&
     b.bedNumber === bed.bedNumber &&
     (b.floor || 1) === (bed.floor || 1))
  );

  if (!originalBed) {
    return true; // New bed
  }

  // Check if any properties changed
  return originalBed.type !== bed.type ||
         originalBed.defaultUsage !== bed.defaultUsage ||
         originalBed.roomNumber !== bed.roomNumber ||
         originalBed.bedNumber !== bed.bedNumber ||
         (originalBed.floor || 1) !== (bed.floor || 1);
};

// Methods
const getBedColorClasses = (type: string, usage: string, bed?: BedType & { id?: string }) => {
  const baseClasses = 'relative border-2 ';

  // Check if bed is modified (new or edited)
  const modified = bed ? isBedModified(bed) : false;

  // Background color based on type
  const typeColors = {
    normal: 'bg-green-100 border-green-500 hover:bg-green-200',
    litera_abajo: 'bg-yellow-100 border-yellow-500 hover:bg-yellow-200',
    litera_arriba: 'bg-orange-100 border-orange-500 hover:bg-orange-200',
    colchon: 'bg-purple-100 border-purple-500 hover:bg-purple-200'
  };

  // Border style based on modification status
  const borderStyle = modified ? 'border-dashed' : 'border-solid';

  // Add visual indicator for modified beds
  const modifiedClass = modified ? 'ring-2 ring-orange-200 ring-offset-1' : '';

  return baseClasses + (typeColors[type as keyof typeof typeColors] || typeColors.normal) + ' ' + borderStyle + ' ' + modifiedClass;
};

const getBedTypeLabel = (type: string) => {
  const labels = {
    normal: 'Normal',
    litera_abajo: 'Litera Inferior',
    litera_arriba: 'Litera Superior',
    colchon: 'Colchón'
  };
  return labels[type as keyof typeof labels] || type;
};

const alphanumericCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

const groupBedsByRoom = (floorBeds: (BedType & { id?: string })[]) => {
  const rooms: { [key: string]: (BedType & { id?: string })[] } = {};
  floorBeds.forEach(bed => {
    const roomNum = bed.roomNumber || '1';
    if (!rooms[roomNum]) {
      rooms[roomNum] = [];
    }
    rooms[roomNum].push(bed);
  });
  // Sort rooms alphanumerically, then sort beds within each room by bedNumber
  const sorted: { [key: string]: (BedType & { id?: string })[] } = {};
  Object.keys(rooms)
    .sort(alphanumericCompare)
    .forEach(key => {
      sorted[key] = rooms[key].sort((a, b) => alphanumericCompare(a.bedNumber, b.bedNumber));
    });
  return sorted;
};

const editBed = (bed: BedType & { id?: string }) => {
  // Start editing the selected bed locally
  editingBed.value = { ...bed }; // Create a copy to edit
  selectedBeds.value = [bed]; // Ensure the bed is selected
};

const deleteBed = (bed: BedType & { id?: string }) => {
  quickDeleteBed(bed);
};

const saveBedEdit = () => {
  if (!editingBed.value || !selectedBed.value || !localHouse.value) return;

  // Find the bed in localHouse and update it
  const index = localHouse.value.beds?.findIndex(b =>
    (b.id && b.id === selectedBed.value?.id) ||
    (!b.id && !selectedBed.value?.id && b.roomNumber === selectedBed.value?.roomNumber && b.bedNumber === selectedBed.value?.bedNumber && (b.floor || 1) === (selectedBed.value?.floor || 1))
  );

  if (index !== undefined && index > -1) {
    // Update the bed with the edited values
    localHouse.value.beds![index] = { ...editingBed.value };
    saveToHistory();
    hasUnsavedChanges.value = true;
    checkForChanges();

    toast({
      title: 'Cama actualizada',
      description: `Cama ${editingBed.value.bedNumber} actualizada correctamente`,
    });

    // Update the selected bed reference
    selectedBeds.value = [{ ...editingBed.value }];
    editingBed.value = null;
  }
};

const cancelBedEdit = () => {
  editingBed.value = null;
};

const openBulkAddModal = () => {
  showBulkAddModal.value = true;
  // Find the next available floor number
  if (localHouse.value?.beds && localHouse.value.beds.length > 0) {
    const maxFloor = Math.max(...localHouse.value.beds.map(bed => bed.floor || 1));
    bulkAddData.value.startFloor = maxFloor + 1;
    bulkAddData.value.endFloor = maxFloor + 1;
  }
};

const closeBulkAddModal = () => {
  showBulkAddModal.value = false;
};

const calculateTotalBeds = () => {
  const floors = Math.abs(bulkAddData.value.endFloor - bulkAddData.value.startFloor) + 1;
  return floors * bulkAddData.value.roomsPerFloor * bulkAddData.value.bedsPerRoom;
};

const calculateBedsDescription = () => {
  const floors = Math.abs(bulkAddData.value.endFloor - bulkAddData.value.startFloor) + 1;
  const floorText = floors === 1 ? `${bulkAddData.value.startFloor} piso` : `pisos ${bulkAddData.value.startFloor} al ${bulkAddData.value.endFloor}`;
  return `${floors} ${floorText}, ${bulkAddData.value.roomsPerFloor} habitación(es) por piso, ${bulkAddData.value.bedsPerRoom} cama(s) por habitación`;
};

const executeBulkAdd = () => {
  if (!localHouse.value) return;

  const newBeds: BedType[] = [];

  for (let floor = bulkAddData.value.startFloor; floor <= bulkAddData.value.endFloor; floor++) {
    for (let room = 1; room <= bulkAddData.value.roomsPerFloor; room++) {
      for (let bed = 1; bed <= bulkAddData.value.bedsPerRoom; bed++) {
        newBeds.push({
          id: generateUUID(),
          floor,
          roomNumber: room.toString(),
          bedNumber: bed.toString(),
          type: bulkAddData.value.bedType,
          defaultUsage: bulkAddData.value.defaultUsage
        });
      }
    }
  }

  // Add all new beds to localHouse
  if (!localHouse.value.beds) {
    localHouse.value.beds = [];
  }
  localHouse.value.beds.push(...newBeds);

  saveToHistory();
  hasUnsavedChanges.value = true;
  checkForChanges();

  toast({
    title: 'Camas agregadas',
    description: `Se agregaron ${newBeds.length} camas correctamente`,
  });

  closeBulkAddModal();
};

const addBedToRoom = (floor: number, room: string, sectorLabel?: string) => {
  // Convert to regular array to avoid Proxy issues
  const bedsArray = localHouse.value?.beds ? [...localHouse.value.beds] : [];

  // Find existing beds in this room and floor to determine next bed number
  const targetFloor = Number(floor); // Ensure it's a number
  const targetRoom = String(room);

  const existingBeds = bedsArray.filter(bed => {
    const bedFloor = Number(bed.floor) || 1;
    const bedRoom = String(bed.roomNumber);
    return bedFloor === targetFloor && bedRoom === targetRoom;
  });

  // Find the highest numeric bed number in this room
  let nextBedNumber = 1;
  let lastBedType: 'normal' | 'litera_abajo' | 'litera_arriba' | 'colchon' = 'normal';
  let lastBedUsage: 'caminante' | 'servidor' = 'caminante';

  // Sort existing beds by bed number to find the last one
  const sortedBeds = existingBeds.sort((a, b) => {
    const bedNumA = parseInt(a.bedNumber) || 0;
    const bedNumB = parseInt(b.bedNumber) || 0;
    return bedNumA - bedNumB;
  });

  if (sortedBeds.length > 0) {
    const lastBed = sortedBeds[sortedBeds.length - 1];
    const lastBedNum = parseInt(lastBed.bedNumber) || 0;
    nextBedNumber = lastBedNum + 1;
    // Use the type and usage from the last bed in the room
    lastBedType = lastBed.type || 'normal';
    lastBedUsage = lastBed.defaultUsage || 'caminante';
  }

  const newBed: any = {
    id: generateUUID(),
    floor: Number(floor),
    roomNumber: String(room),
    bedNumber: nextBedNumber.toString(),
    type: lastBedType,
    defaultUsage: lastBedUsage
  };
  if (sectorLabel) newBed.floorLabel = sectorLabel;

  // Add to localHouse
  if (localHouse.value) {
    if (!localHouse.value.beds) {
      localHouse.value.beds = [];
    }
    localHouse.value.beds.push(newBed);
    saveToHistory();
    hasUnsavedChanges.value = true;
    checkForChanges(); // Trigger change detection
  }

  toast({
    title: 'Cama agregada',
    description: `Cama ${newBed.bedNumber} (${getBedTypeLabel(newBed.type)}) agregada a la habitación ${room}`,
  });
};

const addRoomToFloor = (floor: number) => {
  const roomNumber = prompt(`Número de la nueva habitación en el piso ${floor}:`, '1');
  if (roomNumber) {
    const roomNumberStr = roomNumber.trim();
    const roomNum = roomNumberStr;

    // Check if room already exists on this floor (in local data)
    const existingRoom = localHouse.value?.beds?.some(bed =>
      (bed.floor || 1) === floor && String(bed.roomNumber) === roomNum
    );

    if (existingRoom) {
      toast({
        title: 'Error',
        description: `La habitación ${roomNum} ya existe en el piso ${floor}`,
        variant: 'destructive',
      });
      return;
    }

    // Create a new bed for the room
    const newBed: any = {
      id: generateUUID(),
      floor: Number(floor),
      roomNumber: roomNum,
      bedNumber: '1',
      type: 'normal' as const,
      defaultUsage: 'caminante' as const
    };

    // Add to localHouse for local-first approach
    if (localHouse.value) {
      if (!localHouse.value.beds) {
        localHouse.value.beds = [];
      }
      localHouse.value.beds.push(newBed);
      saveToHistory();
      hasUnsavedChanges.value = true;
      checkForChanges(); // Trigger change detection
    }

    toast({
      title: 'Habitación agregada',
      description: `Habitación ${roomNum} agregada al piso ${floor} con cama 1`,
    });
  }
};

const openAddModal = () => {
  openBulkAddModal();
};

const exportMap = () => {
  const data = {
    house: props.house?.name,
    beds: localHouse.value?.beds || [],
    exportDate: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.house?.name || 'casa'}_camas.json`;
  a.click();
  URL.revokeObjectURL(url);
};

const printMap = () => {
  const house = localHouse.value;
  if (!house) return;

  const bedTypeLabel = (type: string) => ({
    normal: 'Normal', litera_abajo: 'Litera Inf.', litera_arriba: 'Litera Sup.', colchon: 'Colchón'
  }[type] || type);

  const bedBg = (type: string) => ({
    normal: '#dcfce7', litera_abajo: '#fef9c3', litera_arriba: '#fed7aa', colchon: '#ede9fe'
  }[type] || '#f3f4f6');

  // Build grouped content
  const floors: Record<number, Record<string, typeof house.beds>> = {};
  (house.beds ?? []).forEach(bed => {
    const f = bed.floor || 1;
    const r = bed.roomNumber || '1';
    if (!floors[f]) floors[f] = {};
    if (!floors[f][r]) floors[f][r] = [];
    floors[f][r].push(bed);
  });

  const sortedFloors = Object.keys(floors).map(Number).sort((a, b) => a - b);

  let body = `<h1 style="font-size:18px;margin-bottom:16px">${house.name}</h1>
  <div style="margin-bottom:20px;padding:10px;border:1px solid #e5e7eb;border-radius:6px;font-size:11px">
    <strong style="display:block;margin-bottom:6px">Leyenda:</strong>
    <div style="display:flex;flex-wrap:wrap;gap:10px">
      <span><span style="display:inline-block;width:10px;height:10px;background:#22c55e;border-radius:2px;margin-right:3px"></span>Normal</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#eab308;border-radius:2px;margin-right:3px"></span>Litera Inferior</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#f97316;border-radius:2px;margin-right:3px"></span>Litera Superior</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#a855f7;border-radius:2px;margin-right:3px"></span>Colchón</span>
      <span style="margin-left:10px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#dbeafe;border:2px solid #3b82f6;margin-right:3px"></span>Caminante (C)</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ffedd5;border:2px solid #f97316;margin-right:3px"></span>Servidor (S)</span>
    </div>
  </div>`;

  for (const floorNum of sortedFloors) {
    const rooms = floors[floorNum];
    const allBeds = Object.values(rooms).flat();
    const label = allBeds.find(b => b?.floorLabel)?.floorLabel ?? '';
    body += `<div style="margin-bottom:24px">
      <h2 style="font-size:14px;font-weight:bold;border-bottom:2px solid #374151;padding-bottom:4px;margin-bottom:12px">
        Piso ${floorNum}${label ? ` — ${label}` : ''}
      </h2>
      <div style="display:flex;flex-wrap:wrap;gap:12px">`;

    const sortedRooms = Object.keys(rooms).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const roomNum of sortedRooms) {
      const roomBeds = (rooms[roomNum] ?? []).sort((a, b) =>
        a.bedNumber.localeCompare(b.bedNumber, undefined, { numeric: true }));
      body += `<div style="border:1px solid #d1d5db;border-radius:6px;overflow:hidden;min-width:130px">
        <div style="background:#f3f4f6;padding:4px 8px;font-size:11px;font-weight:600;border-bottom:1px solid #d1d5db">
          Hab. ${roomNum}
        </div>
        <div style="padding:6px;display:flex;flex-direction:column;gap:4px">`;
      for (const bed of roomBeds) {
        body += `<div style="background:${bedBg(bed.type)};border-radius:4px;padding:4px 6px;font-size:10px">
          <span style="font-weight:600">Cama ${bed.bedNumber}</span>
          <span style="color:#6b7280;margin-left:4px">${bedTypeLabel(bed.type)}</span>
          <span style="float:right;color:${bed.defaultUsage === 'caminante' ? '#1d4ed8' : '#c2410c'};font-weight:600">
            ${bed.defaultUsage === 'caminante' ? 'C' : 'S'}
          </span>
        </div>`;
      }
      body += `</div></div>`;
    }
    body += `</div></div>`;
  }

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <title>Mapa de Camas - ${house.name}</title>
    <style>
      body { font-family: sans-serif; font-size: 12px; color: #111; padding: 20px; margin: 0; }
      @media print { body { padding: 10px; } }
    </style>
  </head><body>${body}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
};

// Watch for house changes
watch(() => props.house, (newHouse) => {
  if (newHouse) {
    // Initialize localHouse with a deep copy
    localHouse.value = JSON.parse(JSON.stringify(newHouse));
    originalHouse.value = JSON.parse(JSON.stringify(newHouse));
    hasUnsavedChanges.value = false;
    // Initialize history
    history.value = [JSON.parse(JSON.stringify(newHouse))];
    historyIndex.value = 0;
  }
  selectedFloor.value = 'all';
  selectedBedType.value = 'all';
  selectedUsage.value = 'all';
  selectedSector.value = 'all';
  selectedBeds.value = [];
  searchQuery.value = '';
}, { immediate: true });

// Watch for changes in localHouse to detect unsaved changes
watch(() => localHouse.value, () => {
  checkForChanges();
}, { deep: true });

// Watch for legend visibility changes and save to localStorage
watch(showLegend, (newValue) => {
  localStorage.setItem('houseBedMap_showLegend', newValue.toString());
});
</script>

<style scoped>
@media print {
  .no-print {
    display: none !important;
  }

  /* Hide interactive elements during print */
  button, .cursor-pointer, .group-hover\:opacity-100 {
    display: none !important;
  }

  /* Ensure proper print layout */
  .bed-card {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  /* Optimize colors for printing */
  .bg-green-100 { background-color: #f0f9ff !important; }
  .bg-yellow-100 { background-color: #fefce8 !important; }
  .bg-purple-100 { background-color: #faf5ff !important; }
}

/* Smooth transitions for better UX */
.bed-transition {
  transition: all 0.2s ease-in-out;
}

/* Custom scrollbar for better aesthetics */
.scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: rgb(156 163 175) transparent;
}

.scrollbar-thin::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.scrollbar-thin::-webkit-scrollbar-track {
  background: rgb(243 244 246);
  border-radius: 4px;
}

.scrollbar-thin::-webkit-scrollbar-thumb {
  background-color: rgb(156 163 175);
  border-radius: 4px;
  border: 2px solid transparent;
  background-clip: content-box;
}

.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background-color: rgb(107 114 128);
  background-clip: content-box;
}

/* Ensure ScrollArea works properly */
[data-radix-scroll-area-viewport] {
  height: 100% !important;
}

/* Fix for dialog content overflow */
.overflow-hidden-scroll {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 100%;
}

/* Loading animation */
@keyframes pulse-subtle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

.pulse-subtle {
  animation: pulse-subtle 2s ease-in-out infinite;
}

/* Bed hover effects */
.bed-card {
  transform-style: preserve-3d;
  transition: transform 0.2s, box-shadow 0.2s;
}

.bed-card:hover {
  transform: translateZ(10px) scale(1.02);
}

/* Selection state */
.selected-bed {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5);
}

/* Focus states for accessibility */
.focus-ring:focus {
  outline: 2px solid transparent;
  outline-offset: 2px;
  box-shadow: 0 0 0 2px rgb(59 130 246);
}
</style>