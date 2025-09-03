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
            <Input id="name" v-model="formData.name" class="col-span-3" required />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="address1" class="text-right">Address 1</Label>
            <gmp-place-autocomplete
              ref="autocompleteField"
              class="col-span-3"
              placeholder="Enter an address"
              :requested-fields="['addressComponents', 'location', 'googleMapsURI']"
            >
            </gmp-place-autocomplete>
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="address2" class="text-right">Address 2</Label>
            <Input id="address2" v-model="formData.address2" class="col-span-3" />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="city" class="text-right">City</Label>
            <Input id="city" v-model="formData.city" class="col-span-3" required />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="state" class="text-right">State</Label>
            <Input id="state" v-model="formData.state" class="col-span-3" required />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="zipCode" class="text-right">Zip Code</Label>
            <Input id="zipCode" v-model="formData.zipCode" class="col-span-3" required />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="country" class="text-right">Country</Label>
            <Input id="country" v-model="formData.country" class="col-span-3" required />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="googleMapsUrl" class="text-right">Google Maps URL</Label>
            <Input id="googleMapsUrl" v-model="formData.googleMapsUrl" class="col-span-3" required />
          </div>
          <div v-if="formData.latitude && formData.longitude" ref="mapContainer" class="h-64 mt-4"></div>
        </div>

        <!-- Step 2: Capacity -->
        <div v-if="currentStep === 2" class="grid gap-4 py-4">
          <h3 class="font-semibold text-lg text-center">Step 2: Capacity</h3>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="capacity" class="text-right">Bed Capacity</Label>
            <Input id="capacity" v-model.number="formData.capacity" type="number" class="col-span-3" required disabled />
          </div>
          <div class="mt-4">
            <h3 class="font-semibold">Beds</h3>
            <div v-for="(bed, index) in formData.beds" :key="index" class="grid grid-cols-12 gap-2 items-center mt-2">
              <Input v-model="bed.roomNumber" placeholder="Room #" class="col-span-2" />
              <Input v-model="bed.bedNumber" placeholder="Bed #" class="col-span-2" />
              <Select v-model="bed.type">
                <SelectTrigger class="col-span-3">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="litera">Litera</SelectItem>
                  <SelectItem value="colchon">Colchon</SelectItem>
                </SelectContent>
              </Select>
              <Select v-model="bed.defaultUsage">
                <SelectTrigger class="col-span-3">
                  <SelectValue placeholder="Usage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="caminante">Caminante</SelectItem>
                  <SelectItem value="servidor">Servidor</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="destructive" size="icon" @click="removeBed(index)" class="col-span-1">
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
            <Button type="button" variant="outline" size="sm" @click="addBed" class="mt-2">Add Bed</Button>
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
import { ref, watch, computed, nextTick } from 'vue';
import { Button } from '@repo/ui/components/ui/button';
import { Progress } from '@repo/ui/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/ui/dialog';
import { Input } from '@repo/ui/components/ui/input';
import { Label } from '@repo/ui/components/ui/label';
import { Textarea } from '@repo/ui/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';
import { Trash2 } from 'lucide-vue-next';
// import type { House } from 'types'; // TODO: Define types

const props = defineProps<{
  open: boolean;
  house?: any | null; // TODO: use House type
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'submit', data: any): void; // TODO: use House type
}>();

const currentStep = ref(1);

const nextStep = () => {
  if (currentStep.value < 3) {
    currentStep.value++;
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
  capacity: props.house?.capacity || 0,
  latitude: props.house?.latitude || null,
  longitude: props.house?.longitude || null,
  beds: props.house?.beds ? JSON.parse(JSON.stringify(props.house.beds)) : [],
});

const formData = ref(getInitialFormData());

const initMap = (lat: number, lng: number) => {
  if (mapContainer.value) {
    const center = { lat, lng };
    if (!map) {
      map = new google.maps.Map(mapContainer.value, {
        center,
        zoom: 15,
      });
    } else {
      map.setCenter(center);
    }
    if (!marker) {
      marker = new google.maps.Marker({
        position: center,
        map: map,
      });
    } else {
      marker.setPosition(center);
    }
  }
};

const handlePlaceChange = async ({ placePrediction }: any) => {
  if (!placePrediction) return;

  const place = placePrediction.toPlace();
  await place.fetchFields({
    fields: ['addressComponents', 'location', 'googleMapsURI'],
  });

  if (place.addressComponents) {
    const address: { [key: string]: string } = {};
    place.addressComponents.forEach((component: any) => {
      const type = component.types[0];
      address[type] = component.longText;
    });
    formData.value.address1 = `${address.street_number || ''} ${address.route || ''}`.trim();
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
};

watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    currentStep.value = 1; // Reset to first step when opening
    formData.value = getInitialFormData();
    formData.value.capacity = formData.value.beds.length;
    await nextTick();
    // Set the initial value of the autocomplete input if editing
    if (autocompleteField.value) {
      if (formData.value.address1) {
        autocompleteField.value.value = formData.value.address1;
      }
      autocompleteField.value.addEventListener('gmp-select', handlePlaceChange);
    }
  } else {
    if (autocompleteField.value) {
      autocompleteField.value.removeEventListener('gmp-select', handlePlaceChange);
    }
    map = null;
    marker = null;
  }
});

watch(() => formData.value.beds, (newBeds) => {
  formData.value.capacity = newBeds.length;
}, { deep: true });

watch([() => formData.value.latitude, currentStep], async ([newLat, newStep]) => {
  if (newLat && formData.value.longitude && newStep === 1) {
    await nextTick();
    initMap(newLat, formData.value.longitude);
  }
}, { immediate: true });

const addBed = () => {
  formData.value.beds.push({
    roomNumber: '',
    bedNumber: '',
    type: 'normal',
    defaultUsage: 'caminante',
  });
};

const removeBed = (index: number) => {
  formData.value.beds.splice(index, 1);
};

const handleCancel = () => {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  emit('update:open', false);
};

const handleSubmit = () => {
  // Manually update address1 from the autocomplete input before submitting
  if (autocompleteField.value) {
    formData.value.address1 = autocompleteField.value.value || formData.value.address1;
  }
  emit('submit', formData.value);

  // Defer closing the dialog to allow other operations to complete
  nextTick(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    emit('update:open', false);
  });
};
</script>