<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{{ $t('addWalkerModal.title') }}</DialogTitle>
        <DialogDescription>
          {{ $t('addWalkerModal.description') }}
        </DialogDescription>
      </DialogHeader>
      <form @submit.prevent="handleSubmit">
        <div class="grid gap-4 py-4">
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="firstName" class="text-right">
              {{ $t('addWalkerModal.firstName') }}
            </Label>
            <Input id="firstName" v-model="formData.firstName" class="col-span-3" required />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="lastName" class="text-right">
              {{ $t('addWalkerModal.lastName') }}
            </Label>
            <Input id="lastName" v-model="formData.lastName" class="col-span-3" required />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="email" class="text-right">
              {{ $t('addWalkerModal.email') }}
            </Label>
            <Input id="email" type="email" v-model="formData.email" class="col-span-3" required />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" @click="emit('update:open', false)">
            {{ $t('addWalkerModal.cancel') }}
          </Button>
          <Button type="submit">
            {{ $t('addWalkerModal.submit') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { CreateWalker } from '@repo/types';
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

const props = defineProps<{ open: boolean; retreatId: string }>();
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'submit', data: CreateWalker): void }>();

const formData = ref<Omit<CreateWalker, 'retreatId'>>({
  firstName: '',
  lastName: '',
  email: '',
});

const handleSubmit = () => {
  emit('submit', { ...formData.value, retreatId: props.retreatId });
  // Reset form after submit
  formData.value = {
    firstName: '',
    lastName: '',
    email: '',
  };
  emit('update:open', false);
};
</script>
