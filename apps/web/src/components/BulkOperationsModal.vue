<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[800px] max-h-[85vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <div class="flex items-center gap-2">
          <DialogTitle class="flex items-center gap-2">
            <Settings class="w-5 h-5" />
            Operaciones Masivas - Configuración
          </DialogTitle>
          <DialogDescription class="mt-1">
            Configura y previsualiza la adición masiva de camas
          </DialogDescription>
        </div>
      </DialogHeader>

      <form @submit.prevent="handleSubmit" class="flex-1 flex flex-col overflow-hidden">
        <!-- Configuration Section -->
        <div class="grid gap-4 py-4 border-b">
          <h3 class="font-semibold text-lg flex items-center gap-2">
            <span class="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">1</span>
            Configuración
          </h3>

          <div class="grid grid-cols-4 gap-4">
            <div>
              <Label for="startFloor" class="text-sm font-medium">Piso inicial</Label>
              <Input
                id="startFloor"
                v-model.number="config.startFloor"
                type="number"
                min="1"
                placeholder="1"
                class="mt-1"
              />
            </div>
            <div>
              <Label for="numFloors" class="text-sm font-medium">Número de pisos</Label>
              <Input
                id="numFloors"
                v-model.number="config.numFloors"
                type="number"
                min="1"
                placeholder="2"
                class="mt-1"
              />
            </div>
            <div>
              <Label for="startRoom" class="text-sm font-medium">Habitación inicial</Label>
              <Input
                id="startRoom"
                v-model.number="config.startRoom"
                type="number"
                min="1"
                placeholder="1"
                class="mt-1"
              />
            </div>
            <div>
              <Label for="roomsPerFloor" class="text-sm font-medium">Habitaciones por piso</Label>
              <Input
                id="roomsPerFloor"
                v-model.number="config.roomsPerFloor"
                type="number"
                min="1"
                placeholder="2"
                class="mt-1"
              />
            </div>
          </div>

          <div class="grid grid-cols-4 gap-4">
            <div>
              <Label for="bedsPerRoom" class="text-sm font-medium">Camas por habitación</Label>
              <Input
                id="bedsPerRoom"
                v-model.number="config.bedsPerRoom"
                type="number"
                min="1"
                placeholder="4"
                class="mt-1"
              />
            </div>
            <div>
              <Label class="text-sm font-medium">Tipo de cama</Label>
              <Select v-model="config.bedType">
                <SelectTrigger class="mt-1">
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="litera">Litera</SelectItem>
                  <SelectItem value="colchon">Colchón</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label class="text-sm font-medium">Uso por defecto</Label>
              <Select v-model="config.defaultUsage">
                <SelectTrigger class="mt-1">
                  <SelectValue placeholder="Seleccionar uso" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="caminante">Caminante</SelectItem>
                  <SelectItem value="servidor">Servidor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="flex items-end">
              <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                <div class="font-medium mb-1">Total estimado:</div>
                <div class="text-lg font-bold text-blue-800">
                  {{ config.numFloors * config.roomsPerFloor * config.bedsPerRoom }} camas
                </div>
                <div class="text-blue-600">
                  {{ config.numFloors }} pisos × {{ config.roomsPerFloor }} habitaciones × {{ config.bedsPerRoom }} camas
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Preview Section -->
        <div class="min-h-0 flex-1 flex flex-col">
          <h3 class="font-semibold text-lg flex items-center gap-2 py-4">
            <span class="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">2</span>
            Previsualización
            <Badge variant="outline" class="text-xs">{{ previewBeds.length }} cama(s) totales</Badge>
          </h3>

          <div class="flex-1 flex flex-col border rounded-lg overflow-hidden">
            <!-- Preview Header with Stats -->
            <div class="bg-gray-50 p-3 border-b flex-shrink-0">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Badge variant="outline" class="text-sm">{{ previewBeds.length }} cama(s) totales</Badge>
                  <Badge variant="outline" class="text-sm">{{ Object.keys(groupedPreviewBeds).length }} piso(s)</Badge>
                </div>
                <div class="text-xs text-gray-500">
                  Configuración: {{ config.numFloors }}×{{ config.roomsPerFloor }}×{{ config.bedsPerRoom }}
                </div>
              </div>
            </div>

            <ScrollArea class="flex-1 min-h-0">
              <div class="p-4">
                <div v-if="previewBeds.length === 0" class="text-center py-8 text-gray-500">
                  <Settings class="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p class="text-sm">Configura los parámetros para ver la previsualización</p>
                  <p class="text-xs mt-1">Ajusta la configuración y verás cómo se organizarán las camas</p>
                </div>

                <div v-else class="space-y-4">
                  <!-- Group by floor -->
                  <div v-for="(floorBeds, floorNum) in groupedPreviewBeds" :key="floorNum" class="border-l-4 border-blue-200 pl-4">
                    <div class="flex items-center gap-2 mb-3">
                      <div class="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center">
                        {{ floorNum }}
                      </div>
                      <h4 class="font-semibold text-sm text-blue-800">Piso {{ floorNum }}</h4>
                      <Badge variant="outline" class="ml-auto">{{ floorBeds.length }} cama(s)</Badge>
                    </div>

                    <!-- Group by room -->
                    <div v-for="(roomBeds, roomNum) in groupBedsByRoom(floorBeds)" :key="roomNum" class="mb-4 ml-4">
                      <div class="flex items-center gap-2 mb-2">
                        <DoorOpen class="w-4 h-4 text-gray-500" />
                        <span class="text-sm font-medium text-gray-700">Habitación {{ roomNum }}</span>
                        <Badge variant="outline" class="text-xs">{{ roomBeds.length }} cama(s)</Badge>
                      </div>

                      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 ml-6">
                        <div v-for="bed in roomBeds" :key="bed.id" class="bg-gray-50 p-2 rounded text-xs border border-gray-200 hover:bg-gray-100 transition-colors">
                          <div class="font-medium text-gray-700">Cama {{ bed.bedNumber }}</div>
                          <div class="text-gray-500">{{ bed.typeLabel }}</div>
                          <div class="text-gray-500">{{ bed.usageLabel }}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>

        <!-- Action Buttons -->
        <DialogFooter class="flex justify-between items-center pt-4 border-t">
          <div class="flex gap-2">
            <Button
              type="button"
              variant="outline"
              @click="emit('update:open', false)"
            >
              Cancelar
            </Button>
          </div>
          <div class="flex gap-2">
            <Button
              type="submit"
              :disabled="previewBeds.length === 0"
              class="flex items-center gap-1"
            >
              <Plus class="w-4 h-4" />
              Agregar {{ previewBeds.length }} cama(s)
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, ScrollArea, Badge } from '@repo/ui';
import { Settings, Plus, DoorOpen } from 'lucide-vue-next';

const props = defineProps({
  open: Boolean,
});

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'submit', beds: any[]): void;
}>();

const config = ref({
  startFloor: 1,
  numFloors: 2,
  startRoom: 1,
  roomsPerFloor: 2,
  bedsPerRoom: 4,
  bedType: 'normal' as 'normal' | 'litera' | 'colchon',
  defaultUsage: 'caminante' as 'caminante' | 'servidor'
});

const typeLabels: Record<string, string> = {
  'normal': 'Normal',
  'litera': 'Litera',
  'colchon': 'Colchón'
};

const usageLabels: Record<string, string> = {
  'caminante': 'Caminante',
  'servidor': 'Servidor'
};

// Generate preview beds based on configuration
const previewBeds = computed(() => {
  const beds = [];
  const { startFloor, numFloors, startRoom, roomsPerFloor, bedsPerRoom, bedType, defaultUsage } = config.value;

  let bedId = 1;
  for (let floor = startFloor; floor < startFloor + numFloors; floor++) {
    for (let room = startRoom; room < startRoom + roomsPerFloor; room++) {
      for (let bed = 1; bed <= bedsPerRoom; bed++) {
        beds.push({
          id: bedId++,
          floor,
          roomNumber: room.toString(),
          bedNumber: bed.toString(),
          type: bedType,
          typeLabel: typeLabels[bedType] || bedType,
          defaultUsage,
          usageLabel: usageLabels[defaultUsage] || defaultUsage
        });
      }
    }
  }

  return beds;
});

// Group preview beds by floor
const groupedPreviewBeds = computed(() => {
  const groups: { [key: number]: any[] } = {};
  previewBeds.value.forEach(bed => {
    if (!groups[bed.floor]) {
      groups[bed.floor] = [];
    }
    groups[bed.floor].push(bed);
  });
  return groups;
});

// Group beds by room within a floor
const groupBedsByRoom = (floorBeds: any[]) => {
  const rooms: { [key: string]: any[] } = {};
  floorBeds.forEach(bed => {
    if (!rooms[bed.roomNumber]) {
      rooms[bed.roomNumber] = [];
    }
    rooms[bed.roomNumber].push(bed);
  });
  return rooms;
};

const handleSubmit = () => {
  if (previewBeds.value.length > 0) {
    emit('submit', previewBeds.value);
    emit('update:open', false);
  }
};

// Watch for config changes
watch(() => config.value, () => {
  // Preview updates automatically via computed
}, { deep: true });
</script>