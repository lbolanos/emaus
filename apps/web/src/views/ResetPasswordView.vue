<template>
  <div class="min-h-screen bg-background flex flex-col justify-center items-center p-4">
    <Card class="w-full max-w-md">
      <CardHeader class="space-y-1 text-center">
        <CardTitle class="text-2xl">
          {{ $t('passwordReset.setTitle') }}
        </CardTitle>
      </CardHeader>
      <CardContent class="grid gap-4">
        <div v-if="message" class="text-green-500 text-sm mb-4">
          {{ message }}
          <router-link to="/login" class="font-medium text-primary hover:underline"> {{ $t('passwordReset.loginLink') }} </router-link>
        </div>
        <form v-else @submit.prevent="handleReset" class="grid gap-4">
          <div class="grid gap-2">
            <Label for="password">{{ $t('passwordReset.newPasswordLabel') }}</Label>
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
            {{ $t('passwordReset.setButton') }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api } from '@/services/api';
import { Button } from '@repo/ui';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@repo/ui';
import { Input } from '@repo/ui';
import { Label } from '@repo/ui';

const route = useRoute();
const { t } = useI18n();
const password = ref('');
const message = ref<string | null>(null);
const error = ref<string | null>(null);

const handleReset = async () => {
  error.value = null;
  message.value = null;
  const token = route.query.token as string;

  if (!token) {
    error.value = t('passwordReset.noToken');
    return;
  }

  try {
    const response = await api.post('/auth/password/reset', { token, password: password.value });
    message.value = response.data.message;
  } catch (err: any) {
    error.value = err.response?.data?.message || t('passwordReset.genericError');
  }
};
</script>