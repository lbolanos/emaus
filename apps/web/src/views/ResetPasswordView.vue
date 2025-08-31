<template>
  <div class="min-h-screen bg-background flex flex-col justify-center items-center p-4">
    <Card class="w-full max-w-md">
      <CardHeader class="space-y-1 text-center">
        <CardTitle class="text-2xl">
          Set a new password
        </CardTitle>
      </CardHeader>
      <CardContent class="grid gap-4">
        <div v-if="message" class="text-green-500 text-sm mb-4">
          {{ message }}
          <router-link to="/login" class="font-medium text-primary hover:underline"> Click here to login </router-link>
        </div>
        <form v-else @submit.prevent="handleReset" class="grid gap-4">
          <div class="grid gap-2">
            <Label for="password">New Password</Label>
            <Input
              id="password"
              type="password"
              required
              v-model="password"
            />
          </div>
          <div v-if="error" class="text-destructive text-sm">
            {{ error }}
          </div>
          <Button type="submit" class="w-full">
            Set new password
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/services/api';
import { Button } from '@repo/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/ui/card';
import { Input } from '@repo/ui/components/ui/input';
import { Label } from '@repo/ui/components/ui/label';

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