<template>
  <div class="min-h-screen bg-background flex flex-col justify-center items-center p-4">
    <Card class="w-full max-w-md">
      <CardHeader class="space-y-1 text-center">
        <CardTitle class="text-2xl">
          Reset your password
        </CardTitle>
        <CardDescription>
          Enter your email address and we will send you a link to reset your password.
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4">
        <div v-if="message" class="text-center">
          <p class="text-green-500 text-sm mb-4">{{ message }}</p>
          <Button variant="link" @click="message = null">Try another email</Button>
        </div>
        <form v-else @submit.prevent="handleRequest" class="grid gap-4">
          <div class="grid gap-2">
            <Label for="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="m@example.com"
              required
              v-model="email"
            />
          </div>
          <div v-if="error" class="text-destructive text-sm">
            {{ error }}
          </div>
          <Button type="submit" class="w-full">
            Send password reset email
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { api } from '@/services/api';
import { Button } from '@repo/ui';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui';
import { Input } from '@repo/ui';
import { Label } from '@repo/ui';

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