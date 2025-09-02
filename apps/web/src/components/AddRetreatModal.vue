<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{{ $t('addRetreatModal.title') }}</DialogTitle>
        <DialogDescription>
          {{ $t('addRetreatModal.description') }}
        </DialogDescription>
      </DialogHeader>
      <form @submit.prevent="handleSubmit">
        <div class="grid gap-4 py-4">
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="parish" class="text-right">
              {{ $t('addRetreatModal.parishName') }}
            </Label>
            <Input id="parish" v-model="formData.parish" class="col-span-3" required />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="startDate" class="text-right">
              {{ $t('addRetreatModal.startDate') }}
            </Label>
            <Input id="startDate" type="date" v-model="startDate" class="col-span-3" required />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="endDate" class="text-right">
              {{ $t('addRetreatModal.endDate') }}
            </Label>
            <Input id="endDate" type="date" v-model="endDate" class="col-span-3" required />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="houseId" class="text-right">
              {{ $t('addRetreatModal.house') }}
            </Label>
            <Select v-model="formData.houseId">
              <SelectTrigger class="col-span-3">
                <SelectValue :placeholder="$t('addRetreatModal.selectHouse')" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="house in houseStore.houses" :key="house.id" :value="house.id">
                    {{ house.name }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" @click="emit('update:open', false)">
            {{ $t('addRetreatModal.cancel') }}
          </Button>
          <Button type="submit">
            {{ $t('addRetreatModal.submit') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
  <Dialog :open="showSuccessDialog" @update:open="closeSuccessDialog">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ $t('addRetreatModal.successTitle') }}</DialogTitle>
        <DialogDescription>
          {{ $t('addRetreatModal.successDescription') }}
        </DialogDescription>
      </DialogHeader>
      <div class="space-y-4">
        <div>
          <Label>{{ $t('addRetreatModal.walkerUrl') }}</Label>
          <Input :model-value="walkerUrl" readonly />
        </div>
        <div>
          <Label>{{ $t('addRetreatModal.serverUrl') }}</Label>
          <Input :model-value="serverUrl" readonly />
        </div>
      </div>
      <DialogFooter>
        <Button @click="closeSuccessDialog">{{ $t('common.close') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import type { CreateRetreat } from '@repo/types';
import { useHouseStore } from '@/stores/houseStore';
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'submit', data: CreateRetreat): Promise<Retreat | undefined> }>();

const houseStore = useHouseStore();

onMounted(() => {
  if (houseStore.houses.length === 0) {
    houseStore.fetchHouses();
  }
});

const formData = ref<CreateRetreat>({
  parish: '',
  startDate: new Date(),
  endDate: new Date(),
  houseId: undefined,
});

const toISODate = (date: Date) => date.toISOString().split('T')[0];

const startDate = computed({
  get: () => toISODate(formData.value.startDate),
  set: (val) => formData.value.startDate = new Date(val),
});

const endDate = computed({
  get: () => toISODate(formData.value.endDate),
  set: (val) => formData.value.endDate = new Date(val),
});

const showSuccessDialog = ref(false);
const createdRetreat = ref<Retreat | null>(null);

const walkerUrl = computed(() => {
  if (!createdRetreat.value) return '';
  return `${window.location.origin}/retreat/${createdRetreat.value.id}/walker-registration`;
});

const serverUrl = computed(() => {
  if (!createdRetreat.value) return '';
  return `${window.location.origin}/retreat/${createdRetreat.value.id}/registration`;
});

const handleSubmit = async () => {
  const retreat = await emit('submit', { ...formData.value });
  if (retreat) {
    createdRetreat.value = retreat;
    showSuccessDialog.value = true;
  }
};

const closeSuccessDialog = () => {
  showSuccessDialog.value = false;
  emit('update:open', false);
};
</script>
