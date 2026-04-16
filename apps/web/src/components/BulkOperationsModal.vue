<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[900px] h-[85vh] flex flex-col">
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

      <form @submit.prevent="handleSubmit" class="flex flex-col h-full min-h-0">
        <div class="flex-1 overflow-y-auto space-y-6 pr-1">
          <!-- Saved Presets -->
          <div class="bg-gray-50 border rounded-lg p-3">
            <div class="flex items-center gap-2">
              <Label class="text-sm font-medium whitespace-nowrap">Plantilla guardada:</Label>
              <Select v-model="selectedPresetId">
                <SelectTrigger class="h-8 text-sm flex-1">
                  <SelectValue placeholder="Seleccionar plantilla..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- Nueva configuración --</SelectItem>
                  <SelectItem
                    v-for="preset in savedPresets"
                    :key="preset.id"
                    :value="preset.id"
                  >
                    {{ preset.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="h-8 whitespace-nowrap"
                @click="showSavePreset = !showSavePreset"
              >
                <Save class="w-3 h-3 mr-1" /> Guardar
              </Button>
              <Button
                v-if="selectedPresetId && selectedPresetId !== '__none__'"
                type="button"
                variant="ghost"
                size="sm"
                class="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                @click="deletePreset(selectedPresetId)"
              >
                <Trash2 class="w-3 h-3" />
              </Button>
            </div>

            <!-- Inline save dialog -->
            <div v-if="showSavePreset" class="flex items-center gap-2 mt-2 pt-2 border-t" @keydown.enter.prevent.stop="savePreset">
              <input
                v-model="newPresetName"
                placeholder="Nombre de la plantilla..."
                class="h-8 text-sm flex-1 rounded-md border border-input bg-background px-3 py-1 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Button type="button" size="sm" class="h-8" :disabled="!newPresetName.trim()" @click.prevent.stop="savePreset">
                Guardar
              </Button>
              <Button type="button" variant="ghost" size="sm" class="h-8" @click.prevent.stop="showSavePreset = false; newPresetName = ''">
                Cancelar
              </Button>
            </div>
          </div>

          <!-- Sections 1-3: Config (hidden when preview is maximized) -->
          <div v-show="!previewMaximized" class="space-y-6">

          <!-- Section 1: Bed Template -->
          <div class="border-b pb-4">
            <h3 class="font-semibold text-lg flex items-center gap-2 mb-3">
              <span class="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">1</span>
              Plantilla de Camas por Habitación
            </h3>
            <p class="text-sm text-muted-foreground mb-3">
              Define qué camas tendrá cada habitación. Esta plantilla se aplica a todas las habitaciones.
            </p>

            <div class="flex gap-2 mb-3">
              <Button type="button" variant="outline" size="sm" @click="addBedTemplate('normal')">
                <Plus class="w-3 h-3 mr-1" /> Normal
              </Button>
              <Button type="button" variant="outline" size="sm" @click="addBunkPair()">
                <Plus class="w-3 h-3 mr-1" /> Litera (par)
              </Button>
              <Button type="button" variant="outline" size="sm" @click="addBedTemplate('colchon')">
                <Plus class="w-3 h-3 mr-1" /> Colchón
              </Button>
            </div>

            <div v-if="bedTemplate.length === 0" class="text-sm text-muted-foreground italic py-2">
              Agrega al menos una cama a la plantilla.
            </div>
            <div v-else class="space-y-1">
              <div
                v-for="(entry, idx) in bedTemplate"
                :key="entry.id"
                class="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5 text-sm"
              >
                <span class="w-6 text-center font-mono text-gray-400">{{ idx + 1 }}</span>
                <BedDouble v-if="entry.type === 'normal'" class="w-4 h-4 text-gray-500" />
                <ArrowDown v-else-if="entry.type === 'litera_abajo'" class="w-4 h-4 text-blue-500" />
                <ArrowUp v-else-if="entry.type === 'litera_arriba'" class="w-4 h-4 text-blue-500" />
                <Layers v-else class="w-4 h-4 text-amber-500" />
                <span class="flex-1">{{ typeLabels[entry.type] }}</span>
                <Button type="button" variant="ghost" size="sm" class="h-6 w-6 p-0" @click="removeBedTemplate(idx)">
                  <X class="w-3 h-3" />
                </Button>
              </div>
              <div class="text-xs text-muted-foreground mt-2">
                {{ bedTemplate.length }} cama(s) por habitación
              </div>
            </div>
          </div>

          <!-- Section 2: Floor Configuration -->
          <div class="border-b pb-4">
            <h3 class="font-semibold text-lg flex items-center gap-2 mb-3">
              <span class="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">2</span>
              Configuración por Piso
            </h3>

            <div v-if="floors.length === 0" class="text-sm text-muted-foreground italic py-2">
              Agrega al menos un piso.
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="(floor, idx) in floors"
                :key="floor.id"
                class="border rounded-lg p-3 bg-gray-50"
              >
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm font-medium">Piso {{ idx + 1 }}</span>
                  <Button type="button" variant="ghost" size="sm" class="h-6 w-6 p-0" @click="removeFloor(idx)">
                    <X class="w-3 h-3" />
                  </Button>
                </div>
                <div class="grid grid-cols-5 gap-3">
                  <div>
                    <Label class="text-xs">Num. Piso</Label>
                    <Input
                      v-model.number="floor.floorNumber"
                      type="number"
                      min="0"
                      class="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label class="text-xs">Sector</Label>
                    <Input
                      v-model="floor.label"
                      placeholder="Ej: Ala Norte"
                      class="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label class="text-xs">Hab. inicio</Label>
                    <Input
                      v-model="floor.roomStart"
                      type="text"
                      placeholder="Ej: 1 o A30"
                      class="mt-1 h-8 text-sm"
                    />
                    <span v-if="!isValidRange(floor.roomStart, floor.roomEnd)" class="text-xs text-red-500">
                      Rango inválido
                    </span>
                  </div>
                  <div>
                    <Label class="text-xs">Hab. fin</Label>
                    <Input
                      v-model="floor.roomEnd"
                      type="text"
                      placeholder="Ej: 10 o A40"
                      class="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label class="text-xs">Uso por defecto</Label>
                    <Select v-model="floor.defaultUsage">
                      <SelectTrigger class="mt-1 h-8 text-sm">
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
            </div>

            <Button type="button" variant="outline" size="sm" class="mt-3" @click="addFloor()">
              <Plus class="w-3 h-3 mr-1" /> Agregar Piso
            </Button>

            <!-- Floor validation errors -->
            <div v-if="overlappingFloors.length > 0" class="text-xs text-red-500 mt-2">
              <div v-for="msg in overlappingFloors" :key="msg">{{ msg }}</div>
            </div>
          </div>

          <!-- Section 3: Usage Overrides (collapsible) -->
          <div class="border-b pb-4">
            <button
              type="button"
              class="flex items-center gap-2 w-full text-left"
              @click="showOverrides = !showOverrides"
            >
              <h3 class="font-semibold text-lg flex items-center gap-2">
                <span class="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-muted-foreground text-sm font-bold">3</span>
                Excepciones de Uso
              </h3>
              <Badge variant="outline" class="text-xs">Opcional</Badge>
              <ChevronDown
                class="w-4 h-4 ml-auto transition-transform"
                :class="{ 'rotate-180': showOverrides }"
              />
            </button>
            <p v-if="showOverrides" class="text-sm text-muted-foreground mt-2 mb-3">
              Sobrescribe el uso por defecto para rangos específicos de habitaciones.
            </p>

            <div v-if="showOverrides" class="space-y-2">
              <div
                v-for="(override, idx) in usageOverrides"
                :key="override.id"
                class="grid grid-cols-5 gap-3 items-end bg-gray-50 rounded-lg p-3"
              >
                <div>
                  <Label class="text-xs">Hab. Desde</Label>
                  <Input
                    v-model="override.roomStart"
                    type="text"
                    placeholder="Ej: 1 o A30"
                    class="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label class="text-xs">Hab. Hasta</Label>
                  <Input
                    v-model="override.roomEnd"
                    type="text"
                    placeholder="Ej: 10 o A40"
                    class="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label class="text-xs">Uso</Label>
                  <Select v-model="override.usage">
                    <SelectTrigger class="mt-1 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="caminante">Caminante</SelectItem>
                      <SelectItem value="servidor">Servidor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label class="text-xs">Piso</Label>
                  <Select v-model="override.floorFilter">
                    <SelectTrigger class="mt-1 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem
                        v-for="f in floors"
                        :key="f.id"
                        :value="String(f.floorNumber)"
                      >
                        Piso {{ f.floorNumber }}{{ f.label ? ` - ${f.label}` : '' }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div class="flex justify-end">
                  <Button type="button" variant="ghost" size="sm" class="h-8 w-8 p-0" @click="removeOverride(idx)">
                    <X class="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <Button type="button" variant="outline" size="sm" @click="addOverride()">
                <Plus class="w-3 h-3 mr-1" /> Agregar Excepción
              </Button>
            </div>
          </div>

          </div><!-- end config sections wrapper -->

          <!-- Section 4: Preview -->
          <div :class="previewMaximized ? 'flex-1 flex flex-col min-h-0' : ''">
            <h3 class="font-semibold text-lg flex items-center gap-2 mb-3">
              <span class="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">4</span>
              Previsualización
              <Badge variant="outline" class="text-xs">{{ previewBeds.length }} cama(s)</Badge>
              <Button
                v-if="previewBeds.length > 0"
                type="button"
                variant="ghost"
                size="sm"
                class="ml-auto h-7 w-7 p-0"
                @click="previewMaximized = !previewMaximized"
                :title="previewMaximized ? 'Minimizar' : 'Maximizar'"
              >
                <Minimize2 v-if="previewMaximized" class="w-4 h-4" />
                <Maximize2 v-else class="w-4 h-4" />
              </Button>
            </h3>

            <!-- Stats -->
            <div v-if="previewBeds.length > 0" class="bg-gray-50 p-3 rounded-lg border mb-3">
              <div class="flex items-center gap-4 text-sm">
                <div>
                  <span class="text-muted-foreground">Habitaciones:</span>
                  <span class="font-semibold ml-1">{{ stats.totalRooms }}</span>
                </div>
                <div>
                  <span class="text-muted-foreground">Camas:</span>
                  <span class="font-semibold ml-1">{{ stats.totalBeds }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full bg-blue-400"></span>
                  <span class="text-muted-foreground">Caminante:</span>
                  <span class="font-semibold ml-1">{{ stats.walkerBeds }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span class="text-muted-foreground">Servidor:</span>
                  <span class="font-semibold ml-1">{{ stats.serverBeds }}</span>
                </div>
              </div>
            </div>

            <div
              class="border rounded-lg overflow-hidden bg-white overflow-y-auto"
              :class="previewMaximized ? 'flex-1' : 'max-h-[300px]'"
            >
              <div v-if="previewBeds.length === 0" class="text-center py-8 text-gray-500">
                <Settings class="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p class="text-sm">Configura los parámetros para ver la previsualización</p>
              </div>

              <div v-else class="p-4 space-y-4">
                <div
                  v-for="(floorBeds, floorNum) in groupedPreviewBeds"
                  :key="floorNum"
                  class="border-l-4 pl-4 bg-gray-50 p-4 rounded"
                  :class="floorBeds[0]?.defaultUsage === 'servidor' ? 'border-amber-300' : 'border-blue-300'"
                >
                  <div class="flex items-center gap-2 mb-3">
                    <div class="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center">
                      {{ floorNum }}
                    </div>
                    <h4 class="font-semibold text-sm">
                      Piso {{ floorNum }}
                      <span v-if="getFloorLabel(Number(floorNum))" class="text-muted-foreground font-normal">
                        - {{ getFloorLabel(Number(floorNum)) }}
                      </span>
                    </h4>
                    <Badge variant="outline" class="ml-auto text-xs">{{ floorBeds.length }} cama(s)</Badge>
                  </div>

                  <div v-for="(roomBeds, roomNum) in groupBedsByRoom(floorBeds)" :key="roomNum" class="mb-3 ml-4">
                    <div class="flex items-center gap-2 mb-1">
                      <DoorOpen class="w-4 h-4 text-gray-500" />
                      <span class="text-sm font-medium text-gray-700">Habitación {{ roomNum }}</span>
                      <Badge
                        :variant="'outline'"
                        class="text-xs"
                        :class="roomBeds[0]?.defaultUsage === 'servidor' ? 'border-amber-300 text-amber-700 bg-amber-50' : 'border-blue-300 text-blue-700 bg-blue-50'"
                      >
                        {{ usageLabels[roomBeds[0]?.defaultUsage] || '' }}
                      </Badge>
                    </div>

                    <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5 ml-6">
                      <div
                        v-for="bed in roomBeds"
                        :key="bed.id"
                        class="p-1.5 rounded text-xs border shadow-sm"
                        :class="bed.defaultUsage === 'servidor' ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'"
                      >
                        <div class="font-medium">Cama {{ bed.bedNumber }}</div>
                        <div class="text-gray-500">{{ bed.typeLabel }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <DialogFooter class="flex justify-between items-center pt-4 border-t mt-4 flex-shrink-0">
          <div class="flex gap-2">
            <Button type="button" variant="outline" @click="emit('update:open', false)">
              Cancelar
            </Button>
          </div>
          <div class="flex gap-2">
            <Button
              type="submit"
              :disabled="!isValid"
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
import { ref, computed, watch, onMounted } from 'vue';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger,
  SelectValue, Badge,
} from '@repo/ui';
import { Settings, Plus, X, DoorOpen, ChevronDown, BedDouble, ArrowUp, ArrowDown, Layers, Save, Trash2, Maximize2, Minimize2 } from 'lucide-vue-next';

type BedType = 'normal' | 'litera_abajo' | 'litera_arriba' | 'colchon';
type UsageType = 'caminante' | 'servidor';

interface BedTemplateEntry {
  id: string;
  type: BedType;
}

interface FloorConfig {
  id: string;
  floorNumber: number;
  label: string;
  roomStart: string;
  roomEnd: string;
  defaultUsage: UsageType;
}

interface UsageOverride {
  id: string;
  roomStart: string;
  roomEnd: string;
  usage: UsageType;
  floorFilter: string; // 'all' or stringified floor number
}

// Parse room identifier like "A30" into { prefix: "A", num: 30 }
function parseRoomId(value: string): { prefix: string; num: number } | null {
  const str = String(value).trim();
  const match = str.match(/^([A-Za-z]*)(\d+)$/);
  if (!match) return null;
  return { prefix: match[1], num: parseInt(match[2], 10) };
}

// Generate room numbers from start to end (e.g., "A30" to "A40" → ["A30","A31",...,"A40"])
function generateRoomRange(start: string, end: string): string[] {
  const s = parseRoomId(start);
  const e = parseRoomId(end);
  if (!s || !e) return [];
  if (s.prefix !== e.prefix) return [];
  if (s.num > e.num) return [];
  const rooms: string[] = [];
  for (let i = s.num; i <= e.num; i++) {
    rooms.push(`${s.prefix}${i}`);
  }
  return rooms;
}

// Check if a room number falls within a range
function roomInRange(roomNumber: string, rangeStart: string, rangeEnd: string): boolean {
  const r = parseRoomId(roomNumber);
  const s = parseRoomId(rangeStart);
  const e = parseRoomId(rangeEnd);
  if (!r || !s || !e) return false;
  if (r.prefix !== s.prefix) return false;
  return r.num >= s.num && r.num <= e.num;
}

// Check if two ranges overlap
function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = parseRoomId(aStart);
  const ae = parseRoomId(aEnd);
  const bs = parseRoomId(bStart);
  const be = parseRoomId(bEnd);
  if (!as || !ae || !bs || !be) return false;
  if (as.prefix !== bs.prefix) return false;
  return as.num <= be.num && bs.num <= ae.num;
}

// Validate that a range is valid (same prefix, start <= end)
function isValidRange(start: string, end: string): boolean {
  const s = parseRoomId(start);
  const e = parseRoomId(end);
  if (!s || !e) return false;
  if (s.prefix !== e.prefix) return false;
  return s.num <= e.num;
}

interface SavedPreset {
  id: string;
  name: string;
  bedTemplate: { type: BedType }[];
  floors: Omit<FloorConfig, 'id'>[];
  usageOverrides: Omit<UsageOverride, 'id'>[];
}

// Backwards compatibility: convert old numeric presets to string format
function migratePreset(preset: SavedPreset): SavedPreset {
  return {
    ...preset,
    floors: preset.floors.map(f => ({
      ...f,
      roomStart: String(f.roomStart),
      roomEnd: String(f.roomEnd),
    })),
    usageOverrides: preset.usageOverrides.map(o => ({
      ...o,
      roomStart: String(o.roomStart),
      roomEnd: String(o.roomEnd),
    })),
  };
}

const PRESETS_STORAGE_KEY = 'bulk-operations-presets';

defineProps({
  open: Boolean,
});

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'submit', beds: any[]): void;
}>();

const typeLabels: Record<string, string> = {
  normal: 'Normal',
  litera_abajo: 'Litera Inferior',
  litera_arriba: 'Litera Superior',
  colchon: 'Colchón',
};

const usageLabels: Record<string, string> = {
  caminante: 'Caminante',
  servidor: 'Servidor',
};

let nextId = 0;
const uid = () => String(++nextId);

// --- Section 1: Bed Template ---
const bedTemplate = ref<BedTemplateEntry[]>([]);

function addBedTemplate(type: BedType) {
  bedTemplate.value.push({ id: uid(), type });
}

function addBunkPair() {
  bedTemplate.value.push({ id: uid(), type: 'litera_abajo' });
  bedTemplate.value.push({ id: uid(), type: 'litera_arriba' });
}

function removeBedTemplate(idx: number) {
  bedTemplate.value.splice(idx, 1);
}

// --- Section 2: Floor Configuration ---
const floors = ref<FloorConfig[]>([]);

function addFloor() {
  const nextFloorNum = floors.value.length > 0
    ? Math.max(...floors.value.map(f => f.floorNumber)) + 1
    : 1;
  floors.value.push({
    id: uid(),
    floorNumber: nextFloorNum,
    label: '',
    roomStart: '1',
    roomEnd: '10',
    defaultUsage: 'caminante',
  });
}

function removeFloor(idx: number) {
  floors.value.splice(idx, 1);
}

// Check for overlapping room ranges within the same floor number
const overlappingFloors = computed(() => {
  const byFloor = new Map<number, FloorConfig[]>();
  for (const f of floors.value) {
    if (!byFloor.has(f.floorNumber)) byFloor.set(f.floorNumber, []);
    byFloor.get(f.floorNumber)!.push(f);
  }
  const overlaps: string[] = [];
  for (const [floorNum, configs] of byFloor) {
    for (let i = 0; i < configs.length; i++) {
      for (let j = i + 1; j < configs.length; j++) {
        const a = configs[i], b = configs[j];
        if (rangesOverlap(a.roomStart, a.roomEnd, b.roomStart, b.roomEnd)) {
          overlaps.push(`Piso ${floorNum}: habitaciones ${a.roomStart}-${a.roomEnd} y ${b.roomStart}-${b.roomEnd} se solapan`);
        }
      }
    }
  }
  return overlaps;
});

// --- UI state ---
const previewMaximized = ref(false);

// --- Section 3: Usage Overrides ---
const showOverrides = ref(false);
const usageOverrides = ref<UsageOverride[]>([]);

function addOverride() {
  usageOverrides.value.push({
    id: uid(),
    roomStart: '1',
    roomEnd: '1',
    usage: 'servidor',
    floorFilter: 'all',
  });
}

function removeOverride(idx: number) {
  usageOverrides.value.splice(idx, 1);
}

// --- UUID generator for output ---
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// --- Determine effective usage for a room on a floor ---
function getEffectiveUsage(roomNumber: string, floorNumber: number, floorDefaultUsage: UsageType): UsageType {
  let usage = floorDefaultUsage;
  // Apply overrides in order (later overrides win)
  for (const ov of usageOverrides.value) {
    if (roomInRange(roomNumber, ov.roomStart, ov.roomEnd)) {
      if (ov.floorFilter === 'all' || Number(ov.floorFilter) === floorNumber) {
        usage = ov.usage;
      }
    }
  }
  return usage;
}

// --- Preview generation ---
const previewBeds = computed(() => {
  if (bedTemplate.value.length === 0 || floors.value.length === 0) return [];

  const beds: any[] = [];

  for (const floor of floors.value) {
    const rooms = generateRoomRange(floor.roomStart, floor.roomEnd);
    for (const roomNumber of rooms) {
      const usage = getEffectiveUsage(roomNumber, floor.floorNumber, floor.defaultUsage);
      for (let i = 0; i < bedTemplate.value.length; i++) {
        const tpl = bedTemplate.value[i];
        beds.push({
          id: generateUUID(),
          floor: floor.floorNumber,
          roomNumber,
          bedNumber: String(i + 1),
          type: tpl.type,
          typeLabel: typeLabels[tpl.type] || tpl.type,
          defaultUsage: usage,
          usageLabel: usageLabels[usage] || usage,
          floorLabel: floor.label || undefined,
        });
      }
    }
  }

  return beds;
});

const groupedPreviewBeds = computed(() => {
  const groups: Record<string, any[]> = {};
  for (const bed of previewBeds.value) {
    const key = String(bed.floor);
    if (!groups[key]) groups[key] = [];
    groups[key].push(bed);
  }
  return groups;
});

function groupBedsByRoom(floorBeds: any[]): Record<string, any[]> {
  const rooms: Record<string, any[]> = {};
  for (const bed of floorBeds) {
    if (!rooms[bed.roomNumber]) rooms[bed.roomNumber] = [];
    rooms[bed.roomNumber].push(bed);
  }
  return rooms;
}

function getFloorLabel(floorNumber: number): string {
  return floors.value.find(f => f.floorNumber === floorNumber)?.label || '';
}

// --- Stats ---
const stats = computed(() => {
  const beds = previewBeds.value;
  const roomSet = new Set(beds.map(b => `${b.floor}-${b.roomNumber}`));
  return {
    totalBeds: beds.length,
    totalRooms: roomSet.size,
    walkerBeds: beds.filter(b => b.defaultUsage === 'caminante').length,
    serverBeds: beds.filter(b => b.defaultUsage === 'servidor').length,
  };
});

// --- Presets ---
const savedPresets = ref<SavedPreset[]>([]);
const selectedPresetId = ref<string>('__none__');
const showSavePreset = ref(false);
const newPresetName = ref('');

function loadPresetsFromStorage() {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (raw) savedPresets.value = (JSON.parse(raw) as SavedPreset[]).map(migratePreset);
  } catch { /* ignore corrupt data */ }
}

function persistPresets() {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(savedPresets.value));
}

function applyPreset(preset: SavedPreset) {
  bedTemplate.value = preset.bedTemplate.map(b => ({ id: uid(), type: b.type }));
  floors.value = preset.floors.map(f => ({ ...f, id: uid() }));
  usageOverrides.value = preset.usageOverrides.map(o => ({ ...o, id: uid() }));
  if (usageOverrides.value.length > 0) showOverrides.value = true;
}

function savePreset() {
  const name = newPresetName.value.trim();
  if (!name) return;

  const preset: SavedPreset = {
    id: uid(),
    name,
    bedTemplate: bedTemplate.value.map(b => ({ type: b.type })),
    floors: floors.value.map(({ id: _, ...rest }) => rest),
    usageOverrides: usageOverrides.value.map(({ id: _, ...rest }) => rest),
  };

  savedPresets.value.push(preset);
  persistPresets();
  selectedPresetId.value = preset.id;
  showSavePreset.value = false;
  newPresetName.value = '';
}

function deletePreset(presetId: string) {
  savedPresets.value = savedPresets.value.filter(p => p.id !== presetId);
  persistPresets();
  if (selectedPresetId.value === presetId) selectedPresetId.value = '__none__';
}

watch(selectedPresetId, (id) => {
  if (!id || id === '__none__') return;
  const preset = savedPresets.value.find(p => p.id === id);
  if (preset) applyPreset(preset);
});

onMounted(() => {
  loadPresetsFromStorage();
});

// --- Validation ---
const isValid = computed(() => {
  if (bedTemplate.value.length === 0) return false;
  if (floors.value.length === 0) return false;
  if (overlappingFloors.value.length > 0) return false;
  for (const f of floors.value) {
    if (!isValidRange(f.roomStart, f.roomEnd)) return false;
  }
  return previewBeds.value.length > 0;
});

// --- Submit ---
function handleSubmit() {
  if (!isValid.value) return;
  emit('submit', previewBeds.value);
  emit('update:open', false);
}
</script>
