<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{{ isEditing ? $t('responsibilities.addEditModal.editTitle') : $t('responsibilities.addEditModal.createTitle') }}</DialogTitle>
      </DialogHeader>
      <div class="grid gap-4 py-4">
        <div class="grid grid-cols-4 items-center gap-4">
          <Label for="name" class="text-right">
            {{ $t('responsibilities.addEditModal.responsabilityNameLabel') }}
          </Label>
          <Input id="name" v-model="responsabilityName" class="col-span-3" :placeholder="$t('responsibilities.addEditModal.responsabilityNamePlaceholder')" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="handleClose">
          {{ $t('common.cancel') }}
        </Button>
        <Button @click="handleSave">
          {{ $t('responsibilities.addEditModal.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Input, Label } from '@repo/ui';
import type { Responsability } from '@repo/types';

const props = defineProps<{
  open: boolean;
  responsability: Responsability | null;
}>();

const emit = defineEmits(['close', 'save']);

const responsabilityName = ref('');

const isEditing = computed(() => !!props.responsability);

watch(() => props.responsability, (newResponsability) => {
  if (newResponsability) {
    responsabilityName.value = newResponsability.name;
  } else {
    responsabilityName.value = '';
  }
});

const handleClose = () => {
  emit('close');
};

const handleSave = () => {
  if (responsabilityName.value.trim()) {
    emit('save', { ...props.responsability, name: responsabilityName.value });
    handleClose();
  }
};
</script>
