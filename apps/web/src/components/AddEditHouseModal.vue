<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[600px]">
      <DialogHeader>
        <DialogTitle>{{ isEditing ? 'Edit House' : 'Add New House' }}</DialogTitle>
        <DialogDescription>
          {{ isEditing ? 'Edit the details of the house.' : 'Enter the details of the new house.' }}
        </DialogDescription>
      </DialogHeader>
      <Progress :model-value="(currentStep / 3) * 100" class="mb-4" />
      <form @submit.prevent="handleSubmit">
        <!-- Step 1: General Information -->
        <div v-if="currentStep === 1" class="grid gap-4 py-4">
          <h3 class="font-semibold text-lg text-center">Step 1: General Information</h3>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="name" class="text-right">Name</Label>
            <div class="col-span-3">
              <Input id="name" v-model="formData.name" />
              <p v-if="formErrors.name" class="text-red-500 text-sm">{{ formErrors.name }}</p>
            </div>
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="address1" class="text-right">Address 1</Label>
            <div class="col-span-3">
              <gmp-place-autocomplete
                v-if="address1_is_editing"
                ref="autocompleteField"
                class="w-full"
                placeholder="Enter an address"
                :requested-fields="['addressComponents', 'location', 'googleMapsURI']"
                :value="formData.address1"
              >
              </gmp-place-autocomplete>
              <Input
                v-else
                id="address1"
                v-model="formData.address1"
                @click="address1_is_editing = true"
              />
              <p v-if="formErrors.address1" class="text-red-500 text-sm">{{ formErrors.address1 }}</p>
            </div>
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="address2" class="text-right">Address 2</Label>
            <Input id="address2" v-model="formData.address2" class="col-span-3" />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="city" class="text-right">City</Label>
            <div class="col-span-3">
              <Input id="city" v-model="formData.city" />
              <p v-if="formErrors.city" class="text-red-500 text-sm">{{ formErrors.city }}</p>
            </div>
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="state" class="text-right">State</Label>
            <div class="col-span-3">
              <Input id="state" v-model="formData.state" />
              <p v-if="formErrors.state" class="text-red-500 text-sm">{{ formErrors.state }}</p>
            </div>
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="zipCode" class="text-right">Zip Code</Label>
            <div class="col-span-3">
              <Input id="zipCode" v-model="formData.zipCode" />
              <p v-if="formErrors.zipCode" class="text-red-500 text-sm">{{ formErrors.zipCode }}</p>
            </div>
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="country" class="text-right">Country</Label>
            <div class="col-span-3">
              <Input id="country" v-model="formData.country" />
              <p v-if="formErrors.country" class="text-red-500 text-sm">{{ formErrors.country }}</p>
            </div>
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="googleMapsUrl" class="text-right">Google Maps URL</Label>
            <div class="col-span-3">
              <Input id="googleMapsUrl" v-model="formData.googleMapsUrl" />
              <p v-if="formErrors.googleMapsUrl" class="text-red-500 text-sm">{{ formErrors.googleMapsUrl }}</p>
            </div>
          </div>
          <div v-if="formData.latitude && formData.longitude" ref="mapContainer" class="h-64 mt-4"></div>
        </div>

        <!-- Step 2: Capacity -->
        <div v-if="currentStep === 2" class="grid gap-4 py-4">
          <h3 class="font-semibold text-lg text-center">Step 2: Capacity</h3>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="capacity" class="text-right">Bed Capacity</Label>
            <Input id="capacity" :model-value="formData.beds.length" type="number" class="col-span-3" required disabled />
          </div>
          <div class="mt-4">
            <h3 class="font-semibold">Beds</h3>
            <ScrollArea ref="bedScrollArea" class="h-[300px] w-full rounded-md border p-4">
              <div v-for="(field, index) in formData.beds" :key="index" class="grid grid-cols-12 gap-2 items-center mb-2">
                <div class="col-span-2">
                  <Input v-model.number="field.floor" type="number" placeholder="Floor" />
                  <p v-if="formErrors['beds[' + index + '].floor']" class="text-red-500 text-sm">{{ formErrors['beds[' + index + '].floor'] }}</p>
                </div>
                <div class="col-span-2">
                  <Input v-model="field.roomNumber" placeholder="Room #" />
                  <p v-if="formErrors['beds[' + index + '].roomNumber']" class="text-red-500 text-sm">{{ formErrors['beds[' + index + '].roomNumber'] }}</p>
                </div>
                <div class="col-span-2">
                  <Input v-model="field.bedNumber" placeholder="Bed #" />
                   <p v-if="formErrors['beds[' + index + '].bedNumber']" class="text-red-500 text-sm">{{ formErrors['beds[' + index + '].bedNumber'] }}</p>
                </div>
                <div class="col-span-2">
                  <Select v-model="field.type">
                    <SelectTrigger>
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="litera">Litera</SelectItem>
                      <SelectItem value="colchon">Colchon</SelectItem>
                    </SelectContent>
                  </Select>
                  <p v-if="formErrors['beds[' + index + '].type']" class="text-red-500 text-sm">{{ formErrors['beds[' + index + '].type'] }}</p>
                </div>
                <div class="col-span-2">
                  <Select v-model="field.defaultUsage">
                    <SelectTrigger>
                      <SelectValue placeholder="Usage" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="caminante">Caminante</SelectItem>
                      <SelectItem value="servidor">Servidor</SelectItem>
                    </SelectContent>
                  </Select>
                  <p v-if="formErrors['beds[' + index + '].defaultUsage']" class="text-red-500 text-sm">{{ formErrors['beds[' + index + '].defaultUsage'] }}</p>
                </div>
                <Button type="button" variant="destructive" size="icon" @click="removeBed(index)" class="col-span-1">
                  <Trash2 class="h-4 w-4" />
                </Button>
              </div>
            </ScrollArea>
            <div class="flex gap-2 mt-2">
              <Button type="button" variant="outline" size="sm" @click="addNewFloor">Add New Floor</Button>
              <Button type="button" variant="outline" size="sm" @click="addNewRoom">Add New Room</Button>
              <Button type="button" variant="outline" size="sm" @click="addBed">Add Bed</Button>
            </div>
          </div>
        </div>

        <!-- Step 3: Notes -->
        <div v-if="currentStep === 3" class="grid gap-4 py-4">
          <h3 class="font-semibold text-lg text-center">Step 3: Notes</h3>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="notes" class="text-right">Notes</Label>
            <Textarea id="notes" v-model="formData.notes" class="col-span-3" />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" @click="handleCancel">
            Cancel
          </Button>
          <Button v-if="currentStep > 1" type="button" variant="outline" @click="prevStep">
            Back
          </Button>
          <Button v-if="currentStep < 3" type="button" @click="nextStep">
            Next
          </Button>
          <Button v-if="currentStep === 3" type="submit">
            {{ isEditing ? 'Save Changes' : 'Save House' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick, reactive } from 'vue';
import { Button, Progress, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, ScrollArea, useToast } from '@repo/ui';
import { Trash2 } from 'lucide-vue-next';
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

const bedScrollArea = ref<InstanceType<typeof ScrollArea> | null>(null);
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

const stepSchemas = [step1Schema, step2Schema, step3Schema];

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
      title: `Please correct the errors in step ${step}`,
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
  if (!value) return '';
  const match = value.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1] || '';
    const number = parseInt(match[2], 10);
    return `${prefix}${number + 1}`;
  }
  return ''; // or return value to not change it, or some other default
};

const addBed = () => {
  const beds = formData.value.beds;
  if (beds.length > 0) {
    const lastBed = beds[beds.length - 1];

    formData.value.beds.push({
      roomNumber: lastBed.roomNumber, // Keep the same room number
      floor: lastBed.floor,
      bedNumber: incrementAlphanumeric(lastBed.bedNumber),
      type: lastBed.type,
      defaultUsage: lastBed.defaultUsage,
    });
    scrollToBedListBottom();
  } else {
    // Default for the very first bed
    formData.value.beds.push({
      roomNumber: '1',
      floor: 1,
      bedNumber: '1',
      type: 'normal',
      defaultUsage: 'caminante',
    });
    scrollToBedListBottom();
  }
};

const addNewRoom = () => {
  const beds = formData.value.beds;
  if (beds.length > 0) {
    const lastBed = beds[beds.length - 1];

    formData.value.beds.push({
      roomNumber: incrementAlphanumeric(lastBed.roomNumber),
      floor: lastBed.floor,
      bedNumber: '1',
      type: lastBed.type,
      defaultUsage: lastBed.defaultUsage,
    });
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
    const lastBed = beds[beds.length - 1];
    const newFloor = (lastBed.floor || 1) + 1;

    formData.value.beds.push({
      roomNumber: '1', // Reset room number for the new floor
      floor: newFloor,
      bedNumber: '1',
      type: lastBed.type,
      defaultUsage: lastBed.defaultUsage,
    });
    scrollToBedListBottom();
  } else {
    // If no beds exist, just add a blank one
    addBed();
  }
};

const removeBed = (index: number) => {
  formData.value.beds.splice(index, 1);
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

const initMap = (lat: number, lng: number) => {
  if (mapContainer.value) {
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


const handleCancel = () => {
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

  if (autocompleteField.value) {
    formData.value.address1 = autocompleteField.value.value || formData.value.address1;
  }
  
  const success = await emit('submit', { ...formData.value, capacity: formData.value.beds.length });

  if (success) {
    nextTick(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      emit('update:open', false);
    });
  }
};
</script>
