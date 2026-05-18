<template>
  <div class="min-h-screen bg-background flex flex-col justify-center items-center p-4">
    <Card class="w-full max-w-md">
      <CardHeader class="space-y-1 text-center">
        <CardTitle class="text-2xl">{{ t('emailVerify.title') }}</CardTitle>
      </CardHeader>
      <CardContent class="grid gap-4">
        <div v-if="state === 'loading'" class="text-muted-foreground text-sm text-center py-4">
          {{ t('emailVerify.checking') }}
        </div>

        <div v-else-if="state === 'success'" class="grid gap-4">
          <div class="text-green-600 text-center font-medium">
            {{ message }}
          </div>
          <p class="text-sm text-muted-foreground text-center">
            {{ t('emailVerify.successHint') }}
          </p>
          <Button as-child class="w-full">
            <router-link :to="continueTarget">
              {{ continueLabel }}
            </router-link>
          </Button>
        </div>

        <div v-else-if="state === 'error'" class="grid gap-4">
          <div class="text-destructive text-center font-medium">
            {{ message || t('emailVerify.errorDefault') }}
          </div>
          <p class="text-sm text-muted-foreground text-center">
            {{ t('emailVerify.errorHint') }}
          </p>
          <form @submit.prevent="handleResend" class="grid gap-3">
            <div class="grid gap-2">
              <Label for="email">{{ t('emailVerify.emailLabel') }}</Label>
              <Input
                id="email"
                type="email"
                required
                v-model="resendEmail"
                :placeholder="t('emailVerify.emailPlaceholder')"
                :disabled="resending"
              />
            </div>
            <Button type="submit" :disabled="resending" class="w-full">
              {{ resending ? t('emailVerify.resending') : t('emailVerify.resend') }}
            </Button>
          </form>
          <div v-if="resendMessage" class="text-sm text-center text-green-600">
            {{ resendMessage }}
          </div>
          <router-link to="/login" class="text-sm text-center text-primary hover:underline">
            {{ t('emailVerify.backToLogin') }}
          </router-link>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@repo/ui';

type State = 'loading' | 'success' | 'error';

const { t } = useI18n();
const route = useRoute();
const authStore = useAuthStore();
const state = ref<State>('loading');
const message = ref<string | null>(null);

const continueTarget = computed(() => (authStore.user ? '/app' : '/login'));
const continueLabel = computed(() =>
  authStore.user ? t('emailVerify.goApp') : t('emailVerify.goLogin'),
);

const resendEmail = ref('');
const resending = ref(false);
const resendMessage = ref<string | null>(null);

onMounted(async () => {
  const token = (route.query.token as string | undefined) || '';
  if (!token || token.length < 32) {
    state.value = 'error';
    message.value = t('emailVerify.invalidOrExpired');
    return;
  }

  try {
    const res = await api.post('/auth/verify-email', { token });
    state.value = 'success';
    message.value = res.data?.message || t('emailVerify.successDefault');
    // Refresh authStore so any open tabs / the banner pick up emailVerified=true.
    // Fire-and-forget: failure here doesn't change the success state.
    authStore.checkAuthStatus().catch(() => {
      /* ignored: anonymous users won't have a session and that's fine */
    });
  } catch (err: any) {
    state.value = 'error';
    message.value = err?.response?.data?.message || t('emailVerify.errorDefault');
  }
});

async function handleResend() {
  resending.value = true;
  resendMessage.value = null;
  try {
    const res = await api.post('/auth/resend-verification', { email: resendEmail.value });
    resendMessage.value = res.data?.message || t('emailVerify.resendGeneric');
  } catch (err: any) {
    // Anti-enum: even on error, show generic message.
    resendMessage.value = err?.response?.data?.message || t('emailVerify.resendGeneric');
  } finally {
    resending.value = false;
  }
}
</script>
