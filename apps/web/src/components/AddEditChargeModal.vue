<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{{ isEditing ? $t('charges.addEditModal.editTitle') : $t('charges.addEditModal.createTitle') }}</DialogTitle>
      </DialogHeader>
      <div class="grid gap-4 py-4">
        <div class="grid grid-cols-4 items-center gap-4">
          <Label for="name" class="text-right">
            {{ $t('charges.addEditModal.chargeNameLabel') }}
          </Label>
          <Input id="name" v-model="chargeName" class="col-span-3" :placeholder="$t('charges.addEditModal.chargeNamePlaceholder')" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="handleClose">
          {{ $t('common.cancel') }}
        </Button>
        <Button @click="handleSave">
          {{ $t('charges.addEditModal.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@repo/ui/components/ui/dialog';
import { Input } from '@repo/ui/components/ui/input';
import { Label } from '@repo/ui/components/ui/label';
import type { Charge } from '@repo/types/retreat';

const props = defineProps<{
  open: boolean;
  charge: Charge | null;
}>();

const emit = defineEmits(['close', 'save']);

const chargeName = ref('');

const isEditing = computed(() => !!props.charge);

watch(() => props.charge, (newCharge) => {
  if (newCharge) {
    chargeName.value = newCharge.name;
  } else {
    chargeName.value = '';
  }
});

const handleClose = () => {
  emit('close');
};

const handleSave = () => {
  if (chargeName.value.trim()) {
    emit('save', { ...props.charge, name: chargeName.value });
    handleClose();
  }
};
</script>
