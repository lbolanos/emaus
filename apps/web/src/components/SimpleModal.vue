<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
    <div class="bg-white rounded-lg shadow-lg max-w-lg w-full p-6" ref="modalContent">
      <div class="flex justify-between items-center border-b pb-3">
        <h3 class="text-lg font-semibold">{{ title }}</h3>
        <button @click="closeModal" class="p-1 rounded-full hover:bg-gray-200">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      <div class="mt-4">
        <slot></slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onClickOutside } from '@vueuse/core';

const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

const modalContent = ref(null);

const closeModal = () => {
  emit('update:open', false);
};

onClickOutside(modalContent, closeModal);
</script>
