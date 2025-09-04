<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ $t('editRetreatModal.title') }}</DialogTitle>
        <DialogDescription>{{ $t('editRetreatModal.description') }}</DialogDescription>
      </DialogHeader>
      <form @submit.prevent="handleSubmit">
        <div class="grid gap-4 py-4">
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="parish" class="text-right">{{ $t('editRetreatModal.parish') }}</Label>
            <Input id="parish" v-model="form.parish" class="col-span-3" required />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="startDate" class="text-right">{{ $t('editRetreatModal.startDate') }}</Label>
            <Input id="startDate" type="date" v-model="form.startDate" class="col-span-3" required />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="endDate" class="text-right">{{ $t('editRetreatModal.endDate') }}</Label>
            <Input id="endDate" type="date" v-model="form.endDate" class="col-span-3" required />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="houseId" class="text-right">{{ $t('editRetreatModal.house') }}</Label>
            <Select v-model="form.houseId">
              <SelectTrigger id="houseId" class="col-span-3">
                <SelectValue :placeholder="$t('editRetreatModal.selectHouse')" />
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
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="openingNotes" class="text-right">
              {{ $t('editRetreatModal.openingNotes') }}
            </Label>
            <Textarea id="openingNotes" v-model="form.openingNotes" class="col-span-3" />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="closingNotes" class="text-right">
              {{ $t('editRetreatModal.closingNotes') }}
            </Label>
            <Textarea id="closingNotes" v-model="form.closingNotes" class="col-span-3" />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="thingsToBringNotes" class="text-right">
              {{ $t('editRetreatModal.thingsToBringNotes') }}
            </Label>
            <Textarea id="thingsToBringNotes" v-model="form.thingsToBringNotes" class="col-span-3" />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="cost" class="text-right">
              {{ $t('editRetreatModal.cost') }}
            </Label>
            <Input id="cost" v-model="form.cost" class="col-span-3" />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="paymentInfo" class="text-right">
              {{ $t('editRetreatModal.paymentInfo') }}
            </Label>
            <Textarea id="paymentInfo" v-model="form.paymentInfo" class="col-span-3" />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="paymentMethods" class="text-right">
              {{ $t('editRetreatModal.paymentMethods') }}
            </Label>
            <Textarea id="paymentMethods" v-model="form.paymentMethods" class="col-span-3" />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="max_walkers" class="text-right">
              {{ $t('addRetreatModal.max_walkers') }}
            </Label>
            <Input id="max_walkers" type="number" v-model.number="form.max_walkers" class="col-span-3" />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="max_servers" class="text-right">
              {{ $t('addRetreatModal.max_servers') }}
            </Label>
            <Input id="max_servers" type="number" v-model.number="form.max_servers" class="col-span-3" />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit">{{ $t('editRetreatModal.saveChanges') }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@repo/ui/components/ui/dialog';
import { Input } from '@repo/ui/components/ui/input';
import { Label } from '@repo/ui/components/ui/label';
import { Button } from '@repo/ui/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select';
import { Textarea } from '@repo/ui/components/ui/textarea';
import { useHouseStore } from '@/stores/houseStore';
import { useRetreatStore } from '@/stores/retreatStore';
import type { Retreat } from '@repo/types';

const props = defineProps<{ open: boolean; retreat: Retreat | null }>();
const emit = defineEmits(['update:open']);

const houseStore = useHouseStore();
const retreatStore = useRetreatStore();

const form = ref<Partial<Retreat>>({
  id: '',
  parish: '',
  startDate: new Date(),
  endDate: new Date(),
  houseId: undefined,
  max_walkers: undefined,
  max_servers: undefined,
});

watch(() => props.retreat, (newRetreat) => {
  if (newRetreat) {
    form.value = { 
      ...newRetreat, 
      startDate: new Date(newRetreat.startDate).toISOString().split('T')[0], 
      endDate: new Date(newRetreat.endDate).toISOString().split('T')[0] 
    };
  }
}, { immediate: true });

onMounted(() => {
  houseStore.fetchHouses();
});

const handleSubmit = async () => {
  await retreatStore.updateRetreat({ ...form.value, startDate: new Date(form.value.startDate), endDate: new Date(form.value.endDate) });
  emit('update:open', false);
};
</script>
