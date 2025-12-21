<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[800px] max-h-[85vh] overflow-hidden flex flex-col">
      <DialogHeader class="">
        <div class="flex items-center justify-between">
          <div>
            <DialogTitle>{{ isEditing ? 'Editar Casa' : 'Agregar Nueva Casa' }}</DialogTitle>
            <DialogDescription class="mt-1">
              {{ isEditing ? 'Edita los detalles de la casa.' : 'Ingresa los detalles de la nueva casa.' }}
            </DialogDescription>
          </div>
          <div class="flex items-center gap-2">
            <Badge v-if="hasUnsavedChanges" variant="destructive" class="text-xs">
              <AlertCircle class="w-3 h-3 mr-1" />
              Cambios sin guardar
            </Badge>
            <Badge variant="outline" class="text-xs">
              {{ isEditing ? 'Editando' : 'Nueva' }}
            </Badge>
          </div>
        </div>
      </DialogHeader>
      <Progress :model-value="(currentStep / 3) * 100" />
      <form @submit.prevent="handleSubmit" @keydown.enter.prevent="handleEnterKey" class="flex-1 flex flex-col overflow-hidden">
        <!-- Step 1: General Information -->
        <div v-if="currentStep === 1" class="grid gap-1">
          <h3 class="font-semibold text-lg text-center flex items-center justify-center gap-2">
            <span class="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">1</span>
            Información General
          </h3>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="name" class="text-right font-medium">
              Nombre <span class="text-red-500">*</span>
            </Label>
            <div class="col-span-3">
              <Input
                id="name"
                v-model="formData.name"
                placeholder="Ej: Casa Retiro Emaús"
                :class="{ 'border-red-500': formErrors.name }"
                @blur="validateField('name')"
                aria-describedby="name-error"
              />
              <p v-if="formErrors.name" id="name-error" class="text-red-500 text-sm mt-1 flex items-center gap-1">
                <AlertCircle class="w-4 h-4" />
                {{ formErrors.name }}
              </p>
              <p v-else class="text-gray-500 text-xs mt-1">Nombre identificativo de la casa</p>
            </div>
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="address1" class="text-right font-medium">
              Dirección <span class="text-red-500">*</span>
            </Label>
            <div class="col-span-3">
              <div class="relative">
                <gmp-place-autocomplete
                  v-if="address1_is_editing"
                  ref="autocompleteField"
                  class="w-full"
                  placeholder="Buscar dirección..."
                  :requested-fields="['addressComponents', 'location', 'googleMapsURI']"
                  :value="formData.address1"
                >
                </gmp-place-autocomplete>
                <div v-else class="relative">
                  <Input
                    id="address1"
                    v-model="formData.address1"
                    :class="{ 'border-red-500': formErrors.address1, 'pr-10': true }"
                    @click="address1_is_editing = true"
                    readonly
                    aria-describedby="address1-error address1-help"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    class="absolute right-0 top-0 h-full px-2"
                    @click="address1_is_editing = true"
                  >
                    <Search class="w-4 h-4" />
                  </Button>
                </div>
                <p v-if="formErrors.address1" id="address1-error" class="text-red-500 text-sm mt-1 flex items-center gap-1">
                  <AlertCircle class="w-4 h-4" />
                  {{ formErrors.address1 }}
                </p>
                <p v-else id="address1-help" class="text-gray-500 text-xs mt-1">
                  Click para buscar o editar dirección usando Google Maps
                </p>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="address2" class="text-right font-medium">Dirección 2</Label>
            <div class="col-span-3">
              <Input
                id="address2"
                v-model="formData.address2"
                placeholder="Apartamento, suite, etc. (opcional)"
              />
              <p class="text-gray-500 text-xs mt-1">Información adicional de la dirección</p>
            </div>
          </div>

          <!-- Read-only fields that get auto-filled -->
          <div class="bg-gray-50 p-3 rounded-lg">
            <p class="text-sm text-gray-600 mb-2 font-medium">Estos campos se autocompletan al seleccionar una dirección:</p>
            <div class="grid grid-cols-2 gap-4">
              <div class="grid grid-cols-4 items-center gap-2">
                <Label for="city" class="text-right text-sm">Ciudad</Label>
                <div class="col-span-3">
                  <Input
                    id="city"
                    v-model="formData.city"
                    placeholder="Ciudad"
                    readonly
                    class="bg-white text-gray-700"
                    :class="{ 'border-red-500': formErrors.city }"
                    aria-describedby="city-error"
                  />
                  <p v-if="formErrors.city" id="city-error" class="text-red-500 text-sm mt-1 flex items-center gap-1">
                    <AlertCircle class="w-4 h-4" />
                    {{ formErrors.city }}
                  </p>
                </div>
              </div>
              <div class="grid grid-cols-4 items-center gap-2">
                <Label for="state" class="text-right text-sm">Estado</Label>
                <div class="col-span-3">
                  <Input
                    id="state"
                    v-model="formData.state"
                    placeholder="Estado"
                    readonly
                    class="bg-white text-gray-700"
                    :class="{ 'border-red-500': formErrors.state }"
                    aria-describedby="state-error"
                  />
                  <p v-if="formErrors.state" id="state-error" class="text-red-500 text-sm mt-1 flex items-center gap-1">
                    <AlertCircle class="w-4 h-4" />
                    {{ formErrors.state }}
                  </p>
                </div>
              </div>
              <div class="grid grid-cols-4 items-center gap-2">
                <Label for="zipCode" class="text-right text-sm">C.P.</Label>
                <div class="col-span-3">
                  <Input
                    id="zipCode"
                    v-model="formData.zipCode"
                    placeholder="Código Postal"
                    readonly
                    class="bg-white text-gray-700"
                    :class="{ 'border-red-500': formErrors.zipCode }"
                    aria-describedby="zipCode-error"
                  />
                  <p v-if="formErrors.zipCode" id="zipCode-error" class="text-red-500 text-sm mt-1 flex items-center gap-1">
                    <AlertCircle class="w-4 h-4" />
                    {{ formErrors.zipCode }}
                  </p>
                </div>
              </div>
              <div class="grid grid-cols-4 items-center gap-2">
                <Label for="country" class="text-right text-sm">País</Label>
                <div class="col-span-3">
                  <Input
                    id="country"
                    v-model="formData.country"
                    placeholder="País"
                    readonly
                    class="bg-white text-gray-700"
                    :class="{ 'border-red-500': formErrors.country }"
                    aria-describedby="country-error"
                  />
                  <p v-if="formErrors.country" id="country-error" class="text-red-500 text-sm mt-1 flex items-center gap-1">
                    <AlertCircle class="w-4 h-4" />
                    {{ formErrors.country }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="googleMapsUrl" class="text-right font-medium">URL Google Maps</Label>
            <div class="col-span-3">
              <div class="flex gap-2">
                <Input
                  id="googleMapsUrl"
                  v-model="formData.googleMapsUrl"
                  placeholder="https://maps.google.com/..."
                  readonly
                  class="bg-white"
                  :class="{ 'border-red-500': formErrors.googleMapsUrl }"
                  aria-describedby="googleMapsUrl-error"
                />
                <Button
                  v-if="formData.googleMapsUrl"
                  type="button"
                  variant="outline"
                  size="sm"
                  @click="openGoogleMaps"
                  class="whitespace-nowrap"
                >
                  <ExternalLink class="w-4 h-4 mr-1" />
                  Ver
                </Button>
              </div>
              <p v-if="formErrors.googleMapsUrl" id="googleMapsUrl-error" class="text-red-500 text-sm mt-1 flex items-center gap-1">
                <AlertCircle class="w-4 h-4" />
                {{ formErrors.googleMapsUrl }}
              </p>
              <p v-else class="text-gray-500 text-xs mt-1">Se genera automáticamente al seleccionar la dirección</p>
            </div>
          </div>

          <!-- Map section with loading state -->
          <div v-if="formData.latitude && formData.longitude" class="mt-2">
            <div ref="mapContainer" class="h-64 rounded-lg border overflow-hidden relative">
              <div v-if="mapLoading" class="absolute inset-0 flex items-center justify-center bg-gray-100">
                <div class="flex items-center gap-2">
                  <Loader2 class="w-4 h-4 animate-spin" />
                  <span class="text-sm text-gray-600">Cargando mapa...</span>
                </div>
              </div>
            </div>
            <p class="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <MapPin class="w-3 h-3" />
              Ubicación: {{ formData.latitude.toFixed(6) }}, {{ formData.longitude.toFixed(6) }}
            </p>
          </div>
        </div>

        <!-- Step 2: Capacity -->
        <div v-if="currentStep === 2" class="grid">
          <h3 class="font-semibold text-lg text-center flex items-center justify-center gap-1">
            <span class="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">2</span>
            Capacidad y Camas
          </h3>

          <!-- Capacity Summary Cards -->
          <div class="grid grid-cols-3 gap-2 mb-2 mt-2">
            <Card class="p-4">
              <div class="text-center">
                <div class="text-2xl font-bold text-blue-600">{{ totalCapacity }}</div>
                <div class="text-sm text-gray-600">Capacidad Total</div>
              </div>
            </Card>
            <Card class="p-4">
              <div class="text-center">
                <div class="text-2xl font-bold text-green-600">{{ caminanteCapacity }}</div>
                <div class="text-sm text-gray-600">Caminantes</div>
              </div>
            </Card>
            <Card class="p-4">
              <div class="text-center">
                <div class="text-2xl font-bold text-orange-600">{{ servidorCapacity }}</div>
                <div class="text-sm text-gray-600">Servidores</div>
              </div>
            </Card>
          </div>

          <!-- Quick Actions -->
          <div class="flex justify-between items-center mb-4">
            <h3 class="font-semibold text-base flex items-center gap-2">
              <BedIcon class="w-4 h-4" />
              Configuración de Camas
            </h3>
            <div class="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                @click="showBulkOperations = !showBulkOperations"
                class="flex items-center gap-1"
              >
                <Settings class="w-4 h-4" />
                Operaciones
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                @click="importBeds"
                class="flex items-center gap-1"
              >
                <Upload class="w-4 h-4" />
                Importar
              </Button>
            </div>
          </div>

          <!-- Bulk Operations Panel -->
          <div v-if="showBulkOperations" class="bg-gray-50 p-4 rounded-lg mb-4">
            <h4 class="font-medium mb-3">Operaciones Masivas</h4>
            <div class="grid grid-cols-3 gap-4 mb-3">
              <div>
                <Label class="text-sm">Piso inicial</Label>
                <Input v-model.number="bulkOps.startFloor" type="number" min="1" placeholder="1" />
              </div>
              <div>
                <Label class="text-sm">Número de pisos</Label>
                <Input v-model.number="bulkOps.numFloors" type="number" min="1" placeholder="2" />
              </div>
              <div>
                <Label class="text-sm">Camas por piso</Label>
                <Input v-model.number="bulkOps.bedsPerFloor" type="number" min="1" placeholder="4" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4 mb-3">
              <div>
                <Label class="text-sm">Tipo de cama</Label>
                <Select v-model="bulkOps.bedType">
                  <SelectTrigger>
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
                <Label class="text-sm">Uso por defecto</Label>
                <Select v-model="bulkOps.defaultUsage">
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar uso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="caminante">Caminante</SelectItem>
                    <SelectItem value="servidor">Servidor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div class="flex gap-2">
              <Button type="button" size="sm" @click="applyBulkOperations">
                Generar Camas
              </Button>
              <Button type="button" variant="outline" size="sm" @click="clearAllBeds">
                <Trash2 class="w-4 h-4 mr-1" />
                Limpiar Todo
              </Button>
            </div>
          </div>
        <!-- Enhanced Beds List -->
          <ScrollArea ref="bedScrollArea" class="h-[400px] w-full rounded-md border p-4">
            <!-- Group beds by floor -->
            <div v-for="(floorBeds, floorNum) in groupedBeds" :key="floorNum" class="mb-4">
              <div class="flex items-center gap-2 mb-3 pb-2 border-b">
                <div class="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                  {{ floorNum }}
                </div>
                <h4 class="font-semibold text-sm">Piso {{ floorNum }}</h4>
                <Badge variant="outline" class="ml-auto">{{ floorBeds.length }} cama(s)</Badge>
              </div>

              <!-- Group beds by room within floor -->
              <div v-for="(roomBeds, roomNum) in groupBedsByRoom(floorBeds)" :key="roomNum" class="mb-2 ml-4">
                <div class="flex items-center gap-2">
                  <DoorOpen class="w-4 h-4 text-gray-500" />
                  <span class="text-sm font-medium text-gray-700">Habitación {{ roomNum }}</span>
                </div>

                <div class="grid grid-cols-12 gap-2 items-center ml-6 text-[8px] text-gray-500">
                  <div class="col-span-3 ">Cama</div>
                  <div class="col-span-3 ">Tipo</div>
                  <div class="col-span-3 ">Uso Pred.</div>
                  <div class="col-span-3 text-right">Acciones</div>
                </div>

                <div v-for="bed in roomBeds" :key="bed.index" class="grid grid-cols-12 gap-2 items-center ml-6 rounded hover:bg-gray-50 transition-colors">
                  <div class="col-span-3">
                    <Input
                      v-model="bed.bedNumber"
                      placeholder="#"
                      :class="{ 'border-red-500': formErrors[`beds[${bed.index}].bedNumber`] } + ' h-6 text-[12px]'"
                      @blur="validateBedField(bed.index, 'bedNumber')"
                    />
                  </div>
                  <div class="col-span-3">
                    <Select v-model="bed.type">
                      <SelectTrigger  class="h-6 text-[12px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="litera">Litera</SelectItem>
                        <SelectItem value="colchon">Colchón</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div class="col-span-3">
                    <Select v-model="bed.defaultUsage">
                      <SelectTrigger  class="h-6 text-[12px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="caminante">Caminante</SelectItem>
                        <SelectItem value="servidor">Servidor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div class="col-span-3 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      @click="confirmDeleteBed(bed.index)"
                      class="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 class="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Empty state -->
            <div v-if="formData.beds.length === 0" class="text-center py-8 text-gray-500">
              <BedIcon class="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p class="text-sm">No hay camas configuradas</p>
              <p class="text-xs mt-1">Usa los botones de abajo para agregar camas</p>
            </div>
          </ScrollArea>

          <!-- Editable Next Bed -->
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-2">
            <div class="flex items-center">
              <Info class="w-4 h-4 mr-2 text-blue-600" />
              <span class="text-[10px] text-blue-800 font-medium">Configurar próxima cama:</span>
            </div>
            <div class="grid grid-cols-5 gap-2 items-center">
              <div>
                <Label class=" text-[10px] text-blue-700">Piso</Label>
                <Input v-model.number="nextBedData.floor" type="number" min="1" class="h-6 text-[10px]" />
              </div>
              <div>
                <Label class="text-[10px] text-blue-700">Habitación</Label>
                <Input v-model="nextBedData.roomNumber" placeholder="#" class="h-6 text-[10px]" />
              </div>
              <div>
                <Label class="text-[10px] text-blue-700">Cama</Label>
                <Input v-model="nextBedData.bedNumber" placeholder="#" class="h-6 text-[10px]" />
              </div>
              <div>
                <Label class="text-[10px] text-blue-700">Tipo</Label>
                <Select v-model="nextBedData.type">
                  <SelectTrigger class="h-6 text-[10px]">
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
                <Label class="text-[10px] text-blue-700">Uso</Label>
                <Select v-model="nextBedData.defaultUsage">
                  <SelectTrigger class="h-6 text-[10px]">
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

          <!-- Quick Add Buttons -->
          <div class="flex gap-2 bg-gray-50 rounded-lg justify-center">
            <Button type="button" variant="outline" size="sm" @click="addNewFloor" class="flex items-center gap-1">
              <Plus class="w-4 h-4" />
              Nuevo Piso
            </Button>
            <Button type="button" variant="outline" size="sm" @click="addNewRoom" class="flex items-center gap-1">
              <DoorOpen class="w-4 h-4" />
              Nueva Habitación
            </Button>
            <Button type="button" variant="outline" size="sm" @click="addBed" class="flex items-center gap-1">
              <Plus class="w-4 h-4" />
              Nueva Cama
            </Button>
          </div>
        </div>

        <!-- Step 3: Notes -->
        <div v-if="currentStep === 3" class="grid gap-4 py-4">
          <h3 class="font-semibold text-lg text-center flex items-center justify-center gap-2">
            <span class="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">3</span>
            Notas Adicionales
          </h3>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="notes" class="text-right font-medium">Notas</Label>
            <div class="col-span-3">
              <Textarea
                id="notes"
                v-model="formData.notes"
                placeholder="Ingresa cualquier información adicional sobre la casa..."
                rows="4"
                class="resize-none"
              />
              <p class="text-gray-500 text-xs mt-1">
                Información adicional sobre instalaciones, restricciones, o cualquier otro detalle relevante
              </p>
            </div>
          </div>

          <!-- Summary Section -->
          <div class="bg-blue-50 p-4 rounded-lg mt-6">
            <h4 class="font-semibold text-sm mb-2 flex items-center gap-2">
              <FileText class="w-4 h-4" />
              Resumen de la Casa
            </h4>
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span class="font-medium">Nombre:</span> {{ formData.name || 'Sin nombre' }}
              </div>
              <div>
                <span class="font-medium">Dirección:</span> {{ formData.address1 || 'Sin dirección' }}
              </div>
              <div>
                <span class="font-medium">Total Camas:</span> {{ totalCapacity }}
              </div>
              <div>
                <span class="font-medium">Capacidad:</span> {{ caminanteCapacity }} caminantes, {{ servidorCapacity }} servidores
              </div>
            </div>
          </div>
        </div>

        <!-- Enhanced Dialog Footer -->
        <DialogFooter class="flex justify-between items-center">
          <div class="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              @click="handleResetForm"
              class="text-gray-500"
            >
              <RotateCcw class="w-4 h-4 mr-1" />
              Reiniciar
            </Button>
          </div>
          <div class="flex gap-2">
            <Button type="button" variant="outline" @click="handleCancel">
              Cancelar
            </Button>
            <Button v-if="currentStep > 1" type="button" variant="outline" @click="prevStep">
              <ArrowLeft class="w-4 h-4 mr-1" />
              Anterior
            </Button>
            <Button v-if="currentStep < 3" type="button" @click="nextStep" class="flex items-center gap-1">
              Siguiente
              <ArrowRight class="w-4 h-4 ml-1" />
            </Button>
            <Button
              v-if="currentStep === 3"
              type="submit"
              :disabled="isSubmitting"
              class="flex items-center gap-1"
            >
              <Loader2 v-if="isSubmitting" class="w-4 h-4 animate-spin" />
              <Save v-else class="w-4 h-4" />
              {{ isEditing ? 'Guardar Cambios' : 'Guardar Casa' }}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick, reactive } from 'vue';
import { Button, Progress, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, ScrollArea, useToast, Card, Badge, Alert, AlertDescription } from '@repo/ui';
import { Trash2, Search, AlertCircle, MapPin, Loader2, ExternalLink, Bed as BedIcon, Settings, Upload, Plus, DoorOpen, Info, FileText, RotateCcw, ArrowLeft, ArrowRight, Save } from 'lucide-vue-next';
import type { House, Bed } from '@repo/types';
import { z } from 'zod';

const props = defineProps({
  open: Boolean,
  house: {
    type: Object as () => House | null,
    default: null,
  },
});

const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'submit', data: any): Promise<boolean> }>();

const { toast } = useToast();
const currentStep = ref(1);
const address1_is_editing = ref(true);
const mapLoading = ref(false);
const isSubmitting = ref(false);
const hasUnsavedChanges = ref(false);
const showBulkOperations = ref(false);

const bedScrollArea = ref<InstanceType<typeof ScrollArea> | null>(null);

// Bulk operations configuration
const bulkOps = reactive({
  startFloor: 1,
  numFloors: 2,
  bedsPerFloor: 4,
  bedType: 'normal' as 'normal' | 'litera' | 'colchon',
  defaultUsage: 'caminante' as 'caminante' | 'servidor'
});
const getInitialFormData = () => ({
  id: props.house?.id || null,
  name: props.house?.name || '',
  address1: props.house?.address1 || '',
  address2: props.house?.address2 || '',
  city: props.house?.city || '',
  state: props.house?.state || '',
  zipCode: props.house?.zipCode || '',
  country: props.house?.country || '',
  googleMapsUrl: props.house?.googleMapsUrl || '',
  notes: props.house?.notes || '',
  latitude: props.house?.latitude || null,
  longitude: props.house?.longitude || null,
  beds: props.house?.beds ? JSON.parse(JSON.stringify(props.house.beds)) : [],
});

const formData = ref(getInitialFormData());
const formErrors = reactive<Record<string, string>>({});

const step1Schema = z.object({
  name: z.string().min(1, 'Name is required'),
  address1: z.string().min(1, 'Address 1 is required'),
  address2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  zipCode: z.string().min(1, 'Zip Code is required'),
  country: z.string().min(1, 'Country is required'),
  googleMapsUrl: z.string().url('Must be a valid URL').min(1, 'Google Maps URL is required'),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
}).refine((data: any) => data.latitude !== null && data.longitude !== null, {
    message: "A valid address with location is required. Please use the autocomplete.",
    path: ["address1"],
});

const step2Schema = z.object({
  beds: z.array(z.object({
    roomNumber: z.string().min(1, 'Required'),
    bedNumber: z.string().min(1, 'Required'),
    floor: z.number().int().optional(),
    type: z.string().min(1, 'Type is required'),
    defaultUsage: z.string().min(1, 'Usage is required'),
  })).min(1, 'At least one bed is required'),
});

const step3Schema = z.object({
  notes: z.string().optional(),
});

const totalCapacity = computed(() => formData.value.beds.length);

const caminanteCapacity = computed(() =>
  formData.value.beds.filter((bed: Bed) => bed.defaultUsage === 'caminante').length
);

const servidorCapacity = computed(() =>
  formData.value.beds.filter((bed: Bed) => bed.defaultUsage === 'servidor').length
);

const stepSchemas = [step1Schema, step2Schema, step3Schema];

// Default next bed data for editing
const nextBedData = reactive({
  roomNumber: '1',
  floor: 1,
  bedNumber: '1',
  type: 'normal' as 'normal' | 'litera' | 'colchon',
  defaultUsage: 'caminante' as 'caminante' | 'servidor'
});

// Function to update next bed data based on current beds
const updateNextBedData = () => {
  const beds = formData.value.beds;

  if (beds.length === 0) {
    nextBedData.roomNumber = '1';
    nextBedData.floor = 1;
    nextBedData.bedNumber = '1';
    nextBedData.type = 'normal';
    nextBedData.defaultUsage = 'caminante';
    return;
  }

  // Find the actual last bed that was most recently created
  // This should be the logical last bed for proper sequencing
  const logicalLastBed = findLastBedInLogicalOrder(beds);

  if (!logicalLastBed) {
    const fallbackBed = beds[beds.length - 1];
    nextBedData.roomNumber = '1';
    nextBedData.floor = 1;
    nextBedData.bedNumber = '1';
    nextBedData.type = fallbackBed?.type || 'normal';
    nextBedData.defaultUsage = fallbackBed?.defaultUsage || 'caminante';
    return;
  }

  const newBedNumber = incrementAlphanumeric(logicalLastBed.bedNumber) || (parseInt(logicalLastBed.bedNumber) + 1).toString();


  // Update the reactive nextBedData
  nextBedData.roomNumber = logicalLastBed.roomNumber;
  nextBedData.floor = logicalLastBed.floor;
  nextBedData.bedNumber = newBedNumber;
  nextBedData.type = logicalLastBed.type || 'normal';
  nextBedData.defaultUsage = logicalLastBed.defaultUsage || 'caminante';

};

// Watch for changes in beds and update next bed data
watch(() => formData.value.beds, () => {
  updateNextBedData();
}, { deep: true, immediate: true });

// Computed property for display
const nextBedInfo = computed(() => {
  const typeLabels: Record<string, string> = {
    'normal': 'Normal',
    'litera': 'Litera',
    'colchon': 'Colchón'
  };

  const usageLabels: Record<string, string> = {
    'caminante': 'Caminante',
    'servidor': 'Servidor'
  };

  return {
    ...nextBedData,
    typeLabel: typeLabels[nextBedData.type] || nextBedData.type,
    usageLabel: usageLabels[nextBedData.defaultUsage] || nextBedData.defaultUsage,
    display: `Piso ${nextBedData.floor}, Habitación ${nextBedData.roomNumber}, Cama ${nextBedData.bedNumber} (${typeLabels[nextBedData.type] || nextBedData.type}, ${usageLabels[nextBedData.defaultUsage] || nextBedData.defaultUsage})`
  };
});

const validateField = (fieldName: string) => {
  if (!fieldName) return;

  // Create a partial schema with just the field we want to validate
  const fieldSchemaMap: Record<string, z.ZodTypeAny> = {
    name: z.string().min(1, 'Name is required'),
    address1: z.string().min(1, 'Address 1 is required'),
    address2: z.string().optional(),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    zipCode: z.string().min(1, 'Zip Code is required'),
    country: z.string().min(1, 'Country is required'),
    googleMapsUrl: z.string().url('Must be a valid URL').min(1, 'Google Maps URL is required'),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
  };

  const fieldSchema = fieldSchemaMap[fieldName];
  if (!fieldSchema) return;

  const fieldValue = formData.value[fieldName as keyof typeof formData.value];
  const result = fieldSchema.safeParse(fieldValue);
  if (!result.success) {
    formErrors[fieldName] = result.error.errors[0].message;
  } else {
    delete formErrors[fieldName];
  }
};

const validateBedField = (index: number, fieldName: string) => {
  const path = `beds[${index}].${fieldName}`;
  const schema = step2Schema;
  if (!schema) return;

  // Create a temporary object with just this bed for validation
  const tempData = { beds: [formData.value.beds[index]] };
  const result = schema.safeParse(tempData);

  if (!result.success) {
    const bedError = result.error.errors.find(e =>
      e.path.length === 3 &&
      e.path[0] === 'beds' &&
      e.path[1] === 0 &&
      e.path[2] === fieldName
    );

    if (bedError) {
      formErrors[path] = bedError.message;
    }
  } else {
    delete formErrors[path];
  }
};

const validateStep = (step: number) => {
  const schema = stepSchemas[step - 1];
  if (!schema) return true;

  // Clear previous errors
  Object.keys(formErrors).forEach(key => delete formErrors[key]);

  const result = schema.safeParse(formData.value);
  if (!result.success) {
    const errors: string[] = [];
    result.error.errors.forEach((e: z.ZodIssue) => {
      const path = e.path.join('.');
      formErrors[path] = e.message;
      errors.push(e.message);
    });
    toast({
      title: `Por favor corrige los errores en el paso ${step}`,
      description: errors.join('\n'),
      variant: 'destructive',
    });
    return false;
  }
  return true;
};

const scrollToBedListBottom = async () => {
  await nextTick();
  // The ref `bedScrollArea` gives us access to the component instance.
  // The scrollable element is a child of the component's root element.
  const scrollAreaElement = bedScrollArea.value?.$el as HTMLElement | undefined;
  if (scrollAreaElement) {
    const viewport = scrollAreaElement.querySelector<HTMLElement>('[data-reka-scroll-area-viewport]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }
};
const incrementAlphanumeric = (value: string): string => {
  if (!value) return '1';
  const match = value.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1] || '';
    const number = parseInt(match[2], 10);
    const result = `${prefix}${number + 1}`;

    return result;
  }
  // If no numeric part found, try to parse as pure number
  const numValue = parseInt(value, 10);
  if (!isNaN(numValue)) {
    const result = (numValue + 1).toString();

    return result;
  }
  // Fallback: append '1' to the existing value
  const result = `${value}1`;
  return result;
};

const findLastBedInLogicalOrder = (beds: Bed[]) => {

  if (beds.length === 0) return null;

  // Group beds by floor, then by room, then sort by bed number
  const bedsByFloor: { [floor: number]: { [room: string]: Bed[] } } = {};

  // Organize beds by floor and room
  beds.forEach(bed => {
    const floor = bed.floor || 1;
    const room = bed.roomNumber || '1';

    if (!bedsByFloor[floor]) {
      bedsByFloor[floor] = {};
    }
    if (!bedsByFloor[floor][room]) {
      bedsByFloor[floor][room] = [];
    }
    bedsByFloor[floor][room].push(bed);
  });

  // Find the highest floor number
  const floors = Object.keys(bedsByFloor)
    .map(f => parseInt(f))
    .sort((a, b) => a - b);

  const lastFloor = floors[floors.length - 1];

  // Find the highest room number on the last floor
  const roomsOnLastFloor = Object.keys(bedsByFloor[lastFloor]);
  const lastRoom = roomsOnLastFloor.sort((a, b) => {
    // Try to sort numerically, fall back to string comparison
    const aNum = parseInt(a);
    const bNum = parseInt(b);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum;
    }
    return a.localeCompare(b);
  })[roomsOnLastFloor.length - 1];


  // Sort beds in the last room by bed number
  const bedsInLastRoom = bedsByFloor[lastFloor][lastRoom].sort((a, b) => {
    // Extract numeric part for proper sorting
    const aNum = parseInt(a.bedNumber.replace(/\D/g, ''));
    const bNum = parseInt(b.bedNumber.replace(/\D/g, ''));
    const aMatch = a.bedNumber.match(/^(.*?)(\d+)$/);
    const bMatch = b.bedNumber.match(/^(.*?)(\d+)$/);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      // Same numeric value, sort by prefix
      if (aNum === bNum) {
        const aPrefix = aMatch ? aMatch[1] : '';
        const bPrefix = bMatch ? bMatch[1] : '';
        return aPrefix.localeCompare(bPrefix);
      }
      return aNum - bNum;
    }
    return a.bedNumber.localeCompare(b.bedNumber);
  });

  const lastBed = bedsInLastRoom[bedsInLastRoom.length - 1];
  return lastBed;
};

const addBed = () => {
  const newBed = {
    roomNumber: nextBedData.roomNumber,
    floor: nextBedData.floor,
    bedNumber: nextBedData.bedNumber,
    type: nextBedData.type,
    defaultUsage: nextBedData.defaultUsage,
  };

  // Use Vue.set or spread to ensure reactivity
  formData.value.beds = [...formData.value.beds, newBed];
  hasUnsavedChanges.value = true;

  // Small delay to ensure DOM update before scrolling
  setTimeout(() => {
    scrollToBedListBottom();
  }, 50);

};

const addNewRoom = () => {
  const beds = formData.value.beds;
  if (beds.length > 0) {
    // Find the current room number and increment it
    const currentRoomNumber = nextBedData.roomNumber;
    const newRoomNumber = incrementAlphanumeric(currentRoomNumber);

    const newBed = {
      roomNumber: newRoomNumber,
      floor: nextBedData.floor, // Keep same floor as configured in next bed
      bedNumber: '1', // Start with bed 1 in new room
      type: nextBedData.type, // Use type from next bed configuration
      defaultUsage: nextBedData.defaultUsage, // Use usage from next bed configuration
    };

    formData.value.beds = [...formData.value.beds, newBed];
    hasUnsavedChanges.value = true;
    scrollToBedListBottom();
  } else {
    // If no beds exist, just add a blank one (same as addBed)
    addBed();
    // addBed() will call scrollToBedListBottom()
  }
};

const addNewFloor = () => {
  const beds = formData.value.beds;
  if (beds.length > 0) {
    const newFloor = (nextBedData.floor || 1) + 1;

    const newBed = {
      roomNumber: '1', // Reset room number for the new floor
      floor: newFloor,
      bedNumber: '1', // Start with bed 1 on new floor
      type: nextBedData.type, // Use type from next bed configuration
      defaultUsage: nextBedData.defaultUsage, // Use usage from next bed configuration
    };

    formData.value.beds = [...formData.value.beds, newBed];
    hasUnsavedChanges.value = true;
    scrollToBedListBottom();
  } else {
    // If no beds exist, just add a blank one
    addBed();
  }
};

const groupedBeds = computed(() => {
  const groups: { [key: number]: (Bed & { index: number })[] } = {};
  formData.value.beds.forEach((bed, index) => {
    const floor = bed.floor || 1;
    if (!groups[floor]) {
      groups[floor] = [];
    }
    groups[floor].push({ ...bed, index });
  });
  return groups;
});

const groupBedsByRoom = (floorBeds: (Bed & { index: number })[]) => {
  const rooms: { [key: string]: (Bed & { index: number })[] } = {};
  floorBeds.forEach(bed => {
    const roomNum = bed.roomNumber || '1';
    if (!rooms[roomNum]) {
      rooms[roomNum] = [];
    }
    rooms[roomNum].push(bed);
  });
  return rooms;
};

const confirmDeleteBed = async (index: number) => {
  const bed = formData.value.beds[index];
  const confirmed = window.confirm(
    `¿Estás seguro que quieres eliminar la cama ${bed.bedNumber} de la habitación ${bed.roomNumber}?`
  );
  if (confirmed) {
    removeBed(index);
  }
};

const removeBed = (index: number) => {
  formData.value.beds.splice(index, 1);
  hasUnsavedChanges.value = true;
};

const applyBulkOperations = () => {
  const newBeds: Bed[] = [];
  const { startFloor, numFloors, bedsPerFloor, bedType, defaultUsage } = bulkOps;

  for (let floor = startFloor; floor < startFloor + numFloors; floor++) {
    for (let room = 1; room <= Math.ceil(bedsPerFloor / 4); room++) {
      const bedsInRoom = Math.min(4, bedsPerFloor - (room - 1) * 4);
      for (let bed = 1; bed <= bedsInRoom; bed++) {
        newBeds.push({
          roomNumber: room.toString(),
          floor,
          bedNumber: bed.toString(),
          type: bedType,
          defaultUsage,
        });
      }
    }
  }

  formData.value.beds = [...formData.value.beds, ...newBeds];
  showBulkOperations.value = false;
  hasUnsavedChanges.value = true;
  toast({
    title: 'Camas generadas',
    description: `Se agregaron ${newBeds.length} camas exitosamente`,
  });
  scrollToBedListBottom();
};

const clearAllBeds = () => {
  if (formData.value.beds.length === 0) return;

  const confirmed = window.confirm(
    `¿Estás seguro que quieres eliminar todas las ${formData.value.beds.length} camas?`
  );
  if (confirmed) {
    formData.value.beds = [];
    hasUnsavedChanges.value = true;
    toast({
      title: 'Camas eliminadas',
      description: 'Todas las camas han sido eliminadas',
    });
  }
};

const importBeds = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const beds = JSON.parse(e.target?.result as string);
          if (Array.isArray(beds)) {
            formData.value.beds = beds;
            hasUnsavedChanges.value = true;
            toast({
              title: 'Camas importadas',
              description: `Se importaron ${beds.length} camas exitosamente`,
            });
          }
        } catch (error) {
          toast({
            title: 'Error al importar',
            description: 'El archivo no tiene un formato válido',
            variant: 'destructive',
          });
        }
      };
      reader.readAsText(file);
    }
  };
  input.click();
};

const nextStep = () => {
  if (validateStep(currentStep.value)) {
    if (currentStep.value < 3) {
      currentStep.value++;
    }
  }
};

const prevStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--;
  }
};

const isEditing = computed(() => !!props.house);
const autocompleteField = ref<any>(null);
const mapContainer = ref<HTMLElement | null>(null);
let map: google.maps.Map | null = null;
let marker: google.maps.Marker | null = null;

const initMap = async (lat: number, lng: number) => {
  if (mapContainer.value) {
    mapLoading.value = true;
    try {
      const center = { lat, lng };
      if (!map) {
        map = new google.maps.Map(mapContainer.value, { center, zoom: 15 });
      } else {
        map.setCenter(center);
      }
      if (!marker) {
        marker = new google.maps.Marker({ position: center, map: map });
      } else {
        marker.setPosition(center);
      }
    } catch (error) {
      toast({
        title: 'Error al cargar el mapa',
        description: 'No se pudo inicializar el mapa de Google',
        variant: 'destructive',
      });
    } finally {
      mapLoading.value = false;
    }
  }
};

const openGoogleMaps = () => {
  if (formData.value.googleMapsUrl) {
    window.open(formData.value.googleMapsUrl, '_blank');
  }
};

const handlePlaceChange = async ({ placePrediction }: any) => {
  if (!placePrediction) return;

  const place = placePrediction.toPlace();
  await place.fetchFields({
    fields: ['addressComponents','displayName', 'location', 'googleMapsURI'],
  });

  if (place.addressComponents) {
    const address: { [key: string]: string } = {};
    place.addressComponents.forEach((component: any) => {
      const type = component.types[0];
      address[type] = component.longText;
    });
    formData.value.address1 = `${address.route || ''} ${address.street_number || ''}, ${address.sublocality_level_1 || ''}`.trim();
    formData.value.city = address.locality || '';
    formData.value.state = address.administrative_area_level_1 || '';
    formData.value.zipCode = address.postal_code || '';
    formData.value.country = address.country || '';
  }
  if (place.location) {
    formData.value.latitude = place.location.lat();
    formData.value.longitude = place.location.lng();
  }
  if (place.googleMapsURI) {
    formData.value.googleMapsUrl = place.googleMapsURI;
  }
  address1_is_editing.value = false;
};

watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    currentStep.value = 1;
    formData.value = getInitialFormData();
    hasUnsavedChanges.value = false;
    isSubmitting.value = false;
    showBulkOperations.value = false;
    Object.keys(formErrors).forEach(key => delete formErrors[key]);
    address1_is_editing.value = !formData.value.address1;

    await nextTick();
    if (autocompleteField.value) {
      if (formData.value.address1) {
        autocompleteField.value.value = formData.value.address1;
      }
    }
  } else {
    map = null;
    marker = null;
  }
});

watch(autocompleteField, (newField, oldField) => {
  if (oldField) {
    oldField.removeEventListener('gmp-select', handlePlaceChange);
  }
  if (newField) {
    newField.addEventListener('gmp-select', handlePlaceChange);
  }
});

watch([() => formData.value.latitude, currentStep], async ([newLat, newStep]) => {
  if (newLat && formData.value.longitude && newStep === 1) {
    await nextTick();
    initMap(newLat, formData.value.longitude);
  }
}, { deep: true, immediate: true });

// Watch for form changes
watch(formData, () => {
  hasUnsavedChanges.value = true;
}, { deep: true });

const handleEnterKey = (event: KeyboardEvent) => {
  // Allow Enter in textareas
  const target = event.target as HTMLElement;
  if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
    return;
  }
  event.preventDefault();
};

const handleResetForm = () => {
  if (hasUnsavedChanges.value) {
    const confirmed = window.confirm(
      '¿Estás seguro que quieres reiniciar el formulario? Se perderán todos los cambios no guardados.'
    );
    if (!confirmed) return;
  }

  formData.value = getInitialFormData();
  hasUnsavedChanges.value = false;
  currentStep.value = 1;
  Object.keys(formErrors).forEach(key => delete formErrors[key]);

  toast({
    title: 'Formulario reiniciado',
    description: 'El formulario ha sido restablecido a sus valores iniciales',
  });
};

const handleCancel = () => {
  if (hasUnsavedChanges.value) {
    const confirmed = window.confirm(
      '¿Tienes cambios sin guardar. ¿Estás seguro que quieres cancelar?'
    );
    if (!confirmed) return;
  }

  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  emit('update:open', false);
};

const handleSubmit = async () => {
  for (let i = 1; i <= 3; i++) {
    if (!validateStep(i)) {
      currentStep.value = i;
      return;
    }
  }

  isSubmitting.value = true;

  try {
    if (autocompleteField.value) {
      formData.value.address1 = autocompleteField.value.value || formData.value.address1;
    }

    const success = await emit('submit', { ...formData.value, capacity: formData.value.beds.length });

    if (success) {
      hasUnsavedChanges.value = false;
      nextTick(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        emit('update:open', false);
      });
    }
  } catch (error) {
    toast({
      title: 'Error al guardar',
      description: 'Ocurrió un error inesperado al guardar la casa',
      variant: 'destructive',
    });
  } finally {
    isSubmitting.value = false;
  }
};
</script>
