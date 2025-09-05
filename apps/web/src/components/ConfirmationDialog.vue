<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
      </DialogHeader>
      <p>{{ message }}</p>
      <DialogFooter class="sm:justify-end">
        <Button type="button" variant="secondary" @click="handleClose">
          {{ cancelButtonText }}
        </Button>
        <Button type="button" variant="destructive" @click="handleConfirm">
          {{ confirmButtonText }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/ui/dialog';

defineProps<{
  open: boolean;
  title: string;
  message: string;
  confirmButtonText: string;
  cancelButtonText: string;
}>();

const emit = defineEmits(['close', 'confirm']);

const handleClose = () => {
  emit('close');
};

const handleConfirm = () => {
  emit('confirm');
};
</script>
