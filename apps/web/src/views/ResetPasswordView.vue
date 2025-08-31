<template>
  <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">Set a new password</h2>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <div v-if="message" class="text-green-500 text-sm mb-4">
          {{ message }}
          <router-link to="/login" class="font-medium text-indigo-600 hover:text-indigo-500"> Click here to login </router-link>
        </div>
        <form v-else class="space-y-6" @submit.prevent="handleReset">
          <div>
            <label for="password" class="block text-sm font-medium text-gray-700"> New Password </label>
            <div class="mt-1">
              <input v-model="password" id="password" name="password" type="password" required class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900" />
            </div>
          </div>

          <div v-if="error" class="text-red-500 text-sm">
            {{ error }}
          </div>

          <div>
            <button type="submit" class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">Set new password</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/services/api';

const route = useRoute();
const password = ref('');
const message = ref<string | null>(null);
const error = ref<string | null>(null);

const handleReset = async () => {
  error.value = null;
  message.value = null;
  const token = route.query.token as string;

  if (!token) {
    error.value = 'No reset token found.';
    return;
  }

  try {
    const response = await api.post('/auth/password/reset', { token, password: password.value });
    message.value = response.data.message;
  } catch (err: any) {
    error.value = err.response?.data?.message || 'An error occurred.';
  }
};
</script>
