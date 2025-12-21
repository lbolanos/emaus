<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-[1200px] max-h-[90vh] overflow-hidden flex flex-col">
      <DialogHeader class="">
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
            <Badge v-if="hasUnsavedChanges" variant="destructive" class="text-xs">
              <AlertCircle class="w-3 h-3 mr-1" />
              Cambios sin guardar
            </Badge>
          </div>
        </div>
      </DialogHeader>

      <!-- Controls Bar -->
      <div class="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg border">
        <div class="flex items-center gap-2">
          <Label class="text-sm font-medium">Piso:</Label>
          <Select v-model="selectedFloor">
            <SelectTrigger class="w-32">
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
            <SelectTrigger class="w-32">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="litera">Litera</SelectItem>
              <SelectItem value="colchon">Colchón</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="flex items-center gap-2">
          <Label class="text-sm font-medium">Uso:</Label>
          <Select v-model="selectedUsage">
            <SelectTrigger class="w-32">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="caminante">Caminante</SelectItem>
              <SelectItem value="servidor">Servidor</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="flex items-center gap-2 ml-auto">
          <Button v-if="hasUnsavedChanges" variant="default" size="sm" @click="handleSave" :disabled="isSaving" class="flex items-center gap-1">
            <Loader2 v-if="isSaving" class="w-4 h-4 animate-spin" />
            <Save v-else class="w-4 h-4" />
            Guardar
          </Button>
          <Button variant="outline" size="sm" @click="exportMap">
            <Download class="w-4 h-4 mr-1" />
            Exportar
          </Button>
          <Button variant="outline" size="sm" @click="printMap">
            <Printer class="w-4 h-4 mr-1" />
            Imprimir
          </Button>
        </div>
      </div>

      <!-- Legend -->
      <div class="flex flex-wrap items-center gap-4 p-3 bg-blue-50 rounded-lg text-sm">
        <div class="font-medium">Leyenda:</div>
        <div class="flex items-center gap-1">
          <div class="w-4 h-4 rounded bg-green-500"></div>
          <span>Normal</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-4 h-4 rounded bg-yellow-500"></div>
          <span>Litera</span>
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
      </div>

      <!-- Main Content -->
      <div class="flex-1 overflow-hidden">
        <ScrollArea class="h-[500px] w-full">
          <div class="p-6">
            <!-- Statistics Cards -->
            <div class="grid grid-cols-4 gap-4 mb-6">
              <Card class="p-4">
                <div class="text-center">
                  <div class="text-2xl font-bold text-blue-600">{{ totalBeds }}</div>
                  <div class="text-sm text-gray-600">Total Camas</div>
                </div>
              </Card>
              <Card class="p-4">
                <div class="text-center">
                  <div class="text-2xl font-bold text-green-600">{{ totalFloors }}</div>
                  <div class="text-sm text-gray-600">Pisos</div>
                </div>
              </Card>
              <Card class="p-4">
                <div class="text-center">
                  <div class="text-2xl font-bold text-orange-600">{{ totalRooms }}</div>
                  <div class="text-sm text-gray-600">Habitaciones</div>
                </div>
              </Card>
              <Card class="p-4">
                <div class="text-center">
                  <div class="text-2xl font-bold text-purple-600">{{ filteredBeds.length }}</div>
                  <div class="text-sm text-gray-600">Filtradas</div>
                </div>
              </Card>
            </div>

            <!-- Floor Sections -->
            <div v-for="(floorBeds, floorNum) in groupedFilteredBeds" :key="floorNum" class="mb-8">
              <!-- Floor Header -->
              <div class="flex items-center gap-3 mb-4 pb-2 border-b-2 border-gray-200">
                <div class="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold text-lg">
                  {{ floorNum }}
                </div>
                <h3 class="text-xl font-bold">Piso {{ floorNum }}</h3>
                <Badge variant="outline" class="ml-auto">{{ floorBeds.length }} cama(s)</Badge>
              </div>

              <!-- Room Grid for this Floor -->
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div v-for="(roomBeds, roomNum) in groupBedsByRoom(floorBeds)" :key="roomNum" class="border rounded-lg overflow-hidden">
                  <!-- Room Header -->
                  <div class="flex items-center gap-2 p-3 bg-gray-100 border-b">
                    <DoorOpen class="w-4 h-4 text-gray-600" />
                    <h4 class="font-semibold">Habitación {{ roomNum }}</h4>
                    <Badge variant="secondary" class="ml-auto">{{ roomBeds.length }}</Badge>
                  </div>

                  <!-- Beds in Room -->
                  <div class="p-4">
                    <div class="grid grid-cols-2 gap-3">
                      <div
                        v-for="bed in roomBeds"
                        :key="bed.id || `${bed.roomNumber}-${bed.bedNumber}`"
                        class="relative group"
                      >
                        <div
                          :class="[
                            'p-3 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md',
                            getBedColorClasses(bed.type, bed.defaultUsage),
                            selectedBed === bed ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                          ]"
                          @click="selectBed(bed)"
                          @mouseenter="hoveredBed = bed"
                          @mouseleave="hoveredBed = null"
                        >
                          <div class="flex flex-col items-center text-center">
                            <div class="font-bold text-sm mb-1">Cama {{ bed.bedNumber }}</div>
                            <div class="text-xs opacity-75">{{ getBedTypeLabel(bed.type) }}</div>
                            <div class="text-xs mt-1">
                              <Badge :variant="bed.defaultUsage === 'caminante' ? 'default' : 'secondary'" class="text-xs">
                                {{ bed.defaultUsage === 'caminante' ? 'C' : 'S' }}
                              </Badge>
                            </div>
                          </div>

                          <!-- Bed Actions Overlay -->
                          <div v-if="selectedBed === bed" class="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="sm" variant="outline" @click.stop="editBed(bed)">
                              <Edit class="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" @click.stop="deleteBed(bed)">
                              <Trash2 class="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Add Bed Button -->
                    <div class="mt-3">
                      <Button variant="dashed" size="sm" class="w-full" @click="addBedToRoom(floorNum, String(roomNum))">
                        <Plus class="w-4 h-4 mr-1" />
                        Agregar Cama Siguiente
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Add Room Button -->
              <div class="mt-4">
                <Button variant="outline" @click="addRoomToFloor(floorNum)" class="w-full">
                  <Plus class="w-4 h-4 mr-1" />
                  Agregar Habitación al Piso {{ floorNum }}
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
        </ScrollArea>
      </div>

      <!-- Bed Details Panel -->
      <div v-if="selectedBed" class="border-t p-4 bg-gray-50">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <h4 class="font-semibold">
              {{ editingBed ? 'Editar Cama' : 'Detalles de Cama Seleccionada' }}
            </h4>
            <div class="text-sm text-gray-600">
              Habitación {{ editingBed ? editingBed.roomNumber : selectedBed.roomNumber }},
              Cama {{ editingBed ? editingBed.bedNumber : selectedBed.bedNumber }},
              Piso {{ editingBed ? editingBed.floor || 1 : selectedBed.floor || 1 }}
            </div>
          </div>
          <div class="flex gap-2">
            <Button v-if="editingBed" variant="outline" size="sm" @click="cancelBedEdit">
              Cancelar
            </Button>
            <Button v-if="editingBed" variant="default" size="sm" @click="saveBedEdit">
              Guardar Cambios
            </Button>
            <Button variant="ghost" size="sm" @click="selectedBed = null; editingBed = null">
              <X class="w-4 h-4" />
            </Button>
          </div>
        </div>

        <!-- View Mode -->
        <div v-if="!editingBed" class="grid grid-cols-4 gap-4 mt-3">
          <div>
            <Label class="text-xs text-gray-500">Tipo</Label>
            <div>{{ getBedTypeLabel(selectedBed.type) }}</div>
          </div>
          <div>
            <Label class="text-xs text-gray-500">Uso</Label>
            <div>{{ selectedBed.defaultUsage === 'caminante' ? 'Caminante' : 'Servidor' }}</div>
          </div>
          <div>
            <Label class="text-xs text-gray-500">Estado</Label>
            <Badge variant="outline">Disponible</Badge>
          </div>
          <div>
            <Label class="text-xs text-gray-500">Capacidad</Label>
            <div>1 persona</div>
          </div>
        </div>

        <!-- Edit Mode -->
        <div v-if="editingBed" class="grid grid-cols-4 gap-4 mt-3">
          <div>
            <Label class="text-xs text-gray-500">Número de Habitación</Label>
            <Input v-model="editingBed.roomNumber" class="mt-1" />
          </div>
          <div>
            <Label class="text-xs text-gray-500">Número de Cama</Label>
            <Input v-model="editingBed.bedNumber" class="mt-1" />
          </div>
          <div>
            <Label class="text-xs text-gray-500">Tipo</Label>
            <Select v-model="editingBed.type">
              <SelectTrigger class="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="litera">Litera</SelectItem>
                <SelectItem value="colchon">Colchón</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label class="text-xs text-gray-500">Uso</Label>
            <Select v-model="editingBed.defaultUsage">
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
                <SelectItem value="litera">Litera</SelectItem>
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
import { ref, computed, watch, reactive, nextTick } from 'vue';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, ScrollArea, Card, Badge, Input, useToast } from '@repo/ui';
import { AlertCircle, Loader2, Save } from 'lucide-vue-next';
import { Building, Download, Printer, DoorOpen, Bed, Plus, Edit, Trash2, X } from 'lucide-vue-next';
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

const selectedFloor = ref<string>('all');
const selectedBedType = ref<string>('all');
const selectedUsage = ref<string>('all');
const selectedBed = ref<BedType | null>(null);
const hoveredBed = ref<BedType | null>(null);
const hasUnsavedChanges = ref(false);
const isSaving = ref(false);
const originalHouse = ref<House | null>(null);
const localHouse = ref<House | null>(null);
const editingBed = ref<BedType | null>(null);
const showBulkAddModal = ref(false);
const bulkAddData = ref({
  startFloor: 1,
  endFloor: 1,
  roomsPerFloor: 1,
  bedsPerRoom: 1,
  bedType: 'normal' as const,
  defaultUsage: 'caminante' as const
});

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
  const floors = [...new Set(localHouse.value.beds.map(bed => bed.floor || 1))];
  return floors.sort((a, b) => a - b);
});

const filteredBeds = computed(() => {
  if (!localHouse.value?.beds) return [];

  return localHouse.value.beds.filter(bed => {
    const floorMatch = selectedFloor.value === 'all' || (bed.floor || 1).toString() === selectedFloor.value;
    const typeMatch = selectedBedType.value === 'all' || bed.type === selectedBedType.value;
    const usageMatch = selectedUsage.value === 'all' || bed.defaultUsage === selectedUsage.value;

    return floorMatch && typeMatch && usageMatch;
  });
});

const groupedFilteredBeds = computed(() => {
  const groups: { [key: number]: (BedType & { id?: string })[] } = {};

  filteredBeds.value.forEach(bed => {
    const floor = bed.floor || 1;
    if (!groups[floor]) {
      groups[floor] = [];
    }
    groups[floor].push(bed);
  });

  return groups;
});

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

const handleOpenChange = (open: boolean) => {
  if (!open && hasUnsavedChanges.value) {
    const confirmed = window.confirm(
      'Tienes cambios sin guardar. ¿Estás seguro que quieres cerrar? Se perderán todos los cambios.'
    );
    if (!confirmed) return;
  }
  emit('update:open', open);
};

const handleSave = async () => {
  if (!localHouse.value) return;

  isSaving.value = true;
  try {
    const success = await emit('save-house', localHouse.value);
    if (success) {
      originalHouse.value = JSON.parse(JSON.stringify(localHouse.value));
      // Update props.house to match the saved state
      if (props.house) {
        props.house.beds = [...localHouse.value.beds];
      }
      hasUnsavedChanges.value = false;
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


// Methods
const getBedColorClasses = (type: string, usage: string) => {
  const baseClasses = 'relative border-2 ';

  // Background color based on type
  const typeColors = {
    normal: 'bg-green-100 border-green-500 hover:bg-green-200',
    litera: 'bg-yellow-100 border-yellow-500 hover:bg-yellow-200',
    colchon: 'bg-purple-100 border-purple-500 hover:bg-purple-200'
  };

  // Border style based on usage
  const usageStyles = usage === 'caminante'
    ? 'border-dashed'
    : 'border-solid';

  return baseClasses + (typeColors[type as keyof typeof typeColors] || typeColors.normal) + ' ' + usageStyles;
};

const getBedTypeLabel = (type: string) => {
  const labels = {
    normal: 'Normal',
    litera: 'Litera',
    colchon: 'Colchón'
  };
  return labels[type as keyof typeof labels] || type;
};

const groupBedsByRoom = (floorBeds: (BedType & { id?: string })[]) => {
  const rooms: { [key: string]: (BedType & { id?: string })[] } = {};
  floorBeds.forEach(bed => {
    const roomNum = bed.roomNumber || '1';
    if (!rooms[roomNum]) {
      rooms[roomNum] = [];
    }
    rooms[roomNum].push(bed);
  });
  return rooms;
};

const selectBed = (bed: BedType) => {
  selectedBed.value = bed;
};

const editBed = (bed: BedType) => {
  // Start editing the selected bed locally
  editingBed.value = { ...bed }; // Create a copy to edit
  selectedBed.value = bed; // Ensure the bed is selected
};

const deleteBed = (bed: BedType) => {
  if (localHouse.value && localHouse.value.beds) {
    const index = localHouse.value.beds.findIndex(b =>
      b.roomNumber === bed.roomNumber &&
      b.bedNumber === bed.bedNumber &&
      (b.floor || 1) === (bed.floor || 1)
    );
    if (index > -1) {
      localHouse.value.beds.splice(index, 1);
      hasUnsavedChanges.value = true;
      checkForChanges();

      toast({
        title: 'Cama eliminada localmente',
        description: `Cama ${bed.bedNumber} eliminada de la habitación ${bed.roomNumber}. Haga clic en "Guardar" para persistir.`,
      });
    }
  }
};

const saveBedEdit = () => {
  if (!editingBed.value || !selectedBed.value || !localHouse.value) return;

  // Find the bed in localHouse and update it
  const index = localHouse.value.beds?.findIndex(b =>
    b.roomNumber === selectedBed.value?.roomNumber &&
    b.bedNumber === selectedBed.value?.bedNumber &&
    (b.floor || 1) === (selectedBed.value?.floor || 1)
  );

  if (index !== undefined && index > -1) {
    // Update the bed with the edited values
    localHouse.value.beds![index] = { ...editingBed.value };
    hasUnsavedChanges.value = true;
    checkForChanges();

    toast({
      title: 'Cama actualizada localmente',
      description: `Cama ${editingBed.value.bedNumber} actualizada. Haga clic en "Guardar" para persistir.`,
    });

    // Update the selected bed reference
    selectedBed.value = { ...editingBed.value };
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

  hasUnsavedChanges.value = true;
  checkForChanges();

  toast({
    title: 'Camas agregadas localmente',
    description: `Se agregaron ${newBeds.length} camas. Haga clic en "Guardar" para persistir.`,
  });

  closeBulkAddModal();
};

const addBedToRoom = (floor: number, room: string) => {
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
  let lastBedType = 'normal' as const;
  let lastBedUsage = 'caminante' as const;

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
    lastBedType = (lastBed.type as 'normal' | 'litera' | 'colchon') || 'normal';
    lastBedUsage = (lastBed.defaultUsage as 'caminante' | 'servidor') || 'caminante';
  }

  const newBed = {
    id: generateUUID(),
    floor: Number(floor),
    roomNumber: String(room),
    bedNumber: nextBedNumber.toString(),
    type: lastBedType,
    defaultUsage: lastBedUsage
  };

  // Add to localHouse
  if (localHouse.value) {
    if (!localHouse.value.beds) {
      localHouse.value.beds = [];
    }
    localHouse.value.beds.push(newBed);
    hasUnsavedChanges.value = true;
    checkForChanges(); // Trigger change detection
  }

  toast({
    title: 'Cama agregada localmente',
    description: `Cama ${newBed.bedNumber} (${getBedTypeLabel(newBed.type)}) agregada a la habitación ${room}. Haga clic en "Guardar" para persistir.`,
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
    const newBed = {
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
      hasUnsavedChanges.value = true;
      checkForChanges(); // Trigger change detection
    }

    toast({
      title: 'Habitación agregada localmente',
      description: `Habitación ${roomNum} agregada al piso ${floor} con cama 1. Haga clic en "Guardar" para persistir.`,
    });
  }
};

const openAddModal = () => {
  openBulkAddModal();
};

const exportMap = () => {
  const data = {
    house: props.house?.name,
    beds: props.house?.beds,
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
  window.print();
};

// Watch for house changes
watch(() => props.house, (newHouse) => {
  if (newHouse) {
    // Initialize localHouse with a deep copy
    localHouse.value = JSON.parse(JSON.stringify(newHouse));
    originalHouse.value = JSON.parse(JSON.stringify(newHouse));
    hasUnsavedChanges.value = false;
  }
  selectedFloor.value = 'all';
  selectedBedType.value = 'all';
  selectedUsage.value = 'all';
  selectedBed.value = null;
}, { immediate: true });

// Watch for changes in localHouse to detect unsaved changes
watch(() => localHouse.value, () => {
  checkForChanges();
}, { deep: true });
</script>

<style scoped>
@media print {
  .no-print {
    display: none !important;
  }
}
</style>