<template>
  <div class="min-h-screen bg-background flex flex-col justify-center items-center p-4">
    <Card class="w-full max-w-md">
      <CardHeader class="space-y-1 text-center">
        <CardTitle class="text-2xl">
          {{ $t('passwordReset.requestTitle') }}
        </CardTitle>
        <CardDescription>
          {{ $t('passwordReset.requestDescription') }}
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4">
        <div v-if="message" class="text-center">
          <p class="text-green-500 text-sm mb-4">{{ message }}</p>
          <Button variant="link" @click="message = null">{{ $t('passwordReset.tryAnother') }}</Button>
        </div>
        <form v-else @submit.prevent="handleRequest" class="grid gap-4">
          <div class="grid gap-2">
            <Label for="email">{{ $t('login.emailLabel') }}</Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@correo.com"
              required
              v-model="email"
            />
          </div>
          <div v-if="error" class="text-destructive text-sm">
            {{ error }}
          </div>
          <Button type="submit" class="w-full">
            {{ $t('passwordReset.sendButton') }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '@/services/api';
import { getRecaptchaToken, RECAPTCHA_ACTIONS } from '@/services/recaptcha';
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

const { t } = useI18n();
const email = ref('');
const message = ref<string | null>(null);
const error = ref<string | null>(null);

const handleRequest = async () => {
  error.value = null;
  message.value = null;
  try {
    // Get reCAPTCHA token for bot protection
    const recaptchaToken = await getRecaptchaToken(RECAPTCHA_ACTIONS.PASSWORD_RESET_REQUEST);

    const response = await api.post('/auth/password/request', { email: email.value, recaptchaToken });
    message.value = response.data.message;
  } catch (err: any) {
    error.value = err.response?.data?.message || t('passwordReset.genericError');
  }
};
</script>