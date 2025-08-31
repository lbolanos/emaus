<template>
  <SimpleModal :open="open" @update:open="emit('update:open', $event)" title="Add New Walker">
    <form @submit.prevent="handleSubmit">
      <div class="space-y-4">
        <div>
          <label for="firstName" class="block text-sm font-medium text-gray-700">First Name</label>
          <input v-model="formData.firstName" type="text" id="firstName" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required />
        </div>
        <div>
          <label for="lastName" class="block text-sm font-medium text-gray-700">Last Name</label>
          <input v-model="formData.lastName" type="text" id="lastName" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required />
        </div>
        <div>
          <label for="email" class="block text-sm font-medium text-gray-700">Email</label>
          <input v-model="formData.email" type="email" id="email" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900" required />
        </div>
      </div>
      <div class="mt-6 flex justify-end">
        <button type="button" @click="emit('update:open', false)" class="mr-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">Cancel</button>
        <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">Save Walker</button>
      </div>
    </form>
  </SimpleModal>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { CreateWalker } from '@repo/types';
import SimpleModal from './SimpleModal.vue';

const props = defineProps<{ open: boolean; retreatId: string }>();
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'submit', data: CreateWalker): void }>();

const formData = ref<Omit<CreateWalker, 'retreatId'>>({
  firstName: '',
  lastName: '',
  email: '',
});

const handleSubmit = () => {
  emit('submit', { ...formData.value, retreatId: props.retreatId });
  emit('update:open', false);
};
</script>