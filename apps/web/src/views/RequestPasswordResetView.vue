<template>
  <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">Reset your password</h2>
      <p class="mt-2 text-center text-sm text-gray-600">
        Enter your email address and we will send you a link to reset your password.
      </p>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <div v-if="message" class="text-green-500 text-sm mb-4">
          {{ message }}
        </div>
        <form v-else class="space-y-6" @submit.prevent="handleRequest">
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700"> Email address </label>
            <div class="mt-1">
              <input v-model="email" id="email" name="email" type="email" autocomplete="email" required class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900" />
            </div>
          </div>

          <div v-if="error" class="text-red-500 text-sm">
            {{ error }}
          </div>

          <div>
            <button type="submit" class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">Send password reset email</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { api } from '@/services/api';

const email = ref('');
const message = ref<string | null>(null);
const error = ref<string | null>(null);

const handleRequest = async () => {
  error.value = null;
  message.value = null;
  try {
    const response = await api.post('/auth/password/request', { email: email.value });
    message.value = response.data.message;
  } catch (err: any) {
    error.value = err.response?.data?.message || 'An error occurred.';
  }
};
</script>
