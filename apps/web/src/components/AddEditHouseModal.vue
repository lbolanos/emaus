<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[600px]">
      <DialogHeader>
        <DialogTitle>{{ isEditing ? 'Edit House' : 'Add New House' }}</DialogTitle>
        <DialogDescription>
          {{ isEditing ? 'Edit the details of the house.' : 'Enter the details of the new house.' }}
        </DialogDescription>
      </DialogHeader>
      <form @submit.prevent="handleSubmit">
        <div class="grid gap-4 py-4">
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="name" class="text-right">Name</Label>
            <Input id="name" v-model="formData.name" class="col-span-3" required />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="address" class="text-right">Address</Label>
            <Textarea id="address" v-model="formData.address" class="col-span-3" />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="googleMapsUrl" class="text-right">Google Maps URL</Label>
            <Input id="googleMapsUrl" v-model="formData.googleMapsUrl" class="col-span-3" />
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
        <DialogFooter>
          <Button type="button" variant="outline" @click="emit('update:open', false)">
            Cancel
          </Button>
          <Button type="submit">
            {{ isEditing ? 'Save Changes' : 'Save House' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Button } from '@repo/ui/components/ui/button';
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

const isEditing = computed(() => !!props.house);

const getInitialFormData = () => ({
  id: props.house?.id || null,
  name: props.house?.name || '',
  address: props.house?.address || '',
  googleMapsUrl: props.house?.googleMapsUrl || '',
  beds: props.house?.beds ? JSON.parse(JSON.stringify(props.house.beds)) : [],
});

const formData = ref(getInitialFormData());

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    formData.value = getInitialFormData();
  }
});

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

const handleSubmit = () => {
  emit('submit', formData.value);
  emit('update:open', false);
};
</script>