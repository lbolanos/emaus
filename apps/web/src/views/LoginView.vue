<template>
  <div class="min-h-screen bg-background flex flex-col justify-center items-center p-4">
    <router-link to="/" class="flex items-center gap-2 mb-4">
      <img src="/crossRoseButtT.png" alt="Emmaus Rose" class="w-8 h-8" />
      <span class="text-xl font-light tracking-widest uppercase">{{ $t('landing.emmaus') }}</span>
    </router-link>
    <Card class="w-full max-w-md">
      <CardHeader class="space-y-1 text-center">
        <CardTitle class="text-2xl">
          {{ isRegisterMode ? $t('login.registerTitle') : $t('login.title') }}
        </CardTitle>
        <CardDescription>
          {{ isRegisterMode ? $t('login.registerDescription') : $t('login.description') }}
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4">
        <div class="grid gap-4">
          <!-- Name field (register only) -->
          <div v-if="isRegisterMode" class="grid gap-2">
            <Label for="displayName">{{ $t('login.nameLabel') }}</Label>
            <Input
              id="displayName"
              type="text"
              autocomplete="name"
              required
              v-model="displayName"
              @keyup.enter="handleRegister"
            />
          </div>
          <div class="grid gap-2">
            <Label for="email">{{ $t('login.emailLabel') }}</Label>
            <Input
              id="email"
              type="email"
              placeholder="user{'@'}example.com"
              autocomplete="email"
              required
              v-model="email"
              @keyup.enter="isRegisterMode ? handleRegister() : handleLogin()"
            />
          </div>
          <div class="grid gap-2">
            <div class="flex items-center">
              <Label for="password">{{ $t('login.passwordLabel') }}</Label>
              <router-link v-if="!isRegisterMode" to="/request-password-reset" class="ml-auto inline-block text-sm underline">
                {{ $t('login.forgotPassword') }}
              </router-link>
            </div>
            <Input
              id="password"
              type="password"
              :autocomplete="isRegisterMode ? 'new-password' : 'current-password'"
              :minlength="isRegisterMode ? 8 : undefined"
              required
              v-model="password"
              @keyup.enter="isRegisterMode ? handleRegister() : handleLogin()"
            />
            <p v-if="isRegisterMode" class="text-xs text-muted-foreground">
              {{ $t('login.passwordHint') }}
            </p>
          </div>
          <!-- Confirm password (register only) -->
          <div v-if="isRegisterMode" class="grid gap-2">
            <Label for="confirmPassword">{{ $t('login.confirmPasswordLabel') }}</Label>
            <Input
              id="confirmPassword"
              type="password"
              autocomplete="new-password"
              minlength="8"
              required
              v-model="confirmPassword"
              @keyup.enter="handleRegister"
            />
          </div>
          <div v-if="error" class="text-destructive text-sm">
            {{ error }}
          </div>
          <!-- Login button -->
          <Button
            v-if="!isRegisterMode"
            type="button"
            @click="handleLogin"
            :disabled="authStore.loading"
            class="w-full"
          >
            {{ authStore.loading ? $t('login.loading') : $t('login.loginButton') }}
          </Button>
          <!-- Register button -->
          <Button
            v-else
            type="button"
            @click="handleRegister"
            :disabled="authStore.loading"
            class="w-full"
          >
            {{ authStore.loading ? $t('login.loading') : $t('login.registerButton') }}
          </Button>
        </div>
        <div v-if="!isRegisterMode" class="relative">
          <div class="absolute inset-0 flex items-center">
            <span class="w-full border-t" />
          </div>
          <div class="relative flex justify-center text-xs uppercase">
            <span class="bg-background px-2 text-muted-foreground">
              {{ $t('login.orContinueWith') }}
            </span>
          </div>
        </div>
        <a v-if="!isRegisterMode" :href="googleLoginUrl">
          <Button variant="outline" class="w-full">
            <img src="/google-logo.svg" alt="Google logo" class="w-4 h-4 mr-2" />
            {{ $t('login.google') }}
          </Button>
        </a>
      </CardContent>
    </Card>
    <!-- Toggle link -->
    <div class="mt-4 text-sm text-muted-foreground">
      <template v-if="isRegisterMode">
        {{ $t('login.hasAccount') }}
        <button type="button" class="underline text-foreground ml-1" @click="toggleMode">
          {{ $t('login.loginLink') }}
        </button>
      </template>
      <template v-else>
        {{ $t('login.noAccount') }}
        <button type="button" class="underline text-foreground ml-1" @click="toggleMode">
          {{ $t('login.createAccount') }}
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/authStore';
import { useRetreatStore } from '@/stores/retreatStore';
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
import { getApiUrl } from '@/config/runtimeConfig';

const { t } = useI18n();
const googleLoginUrl = `${getApiUrl()}/auth/google`;

const isRegisterMode = ref(false);
const displayName = ref('');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const error = ref<string | null>(null);

const authStore = useAuthStore();
const retreatStore = useRetreatStore();
const router = useRouter();

const toggleMode = () => {
  isRegisterMode.value = !isRegisterMode.value;
  error.value = null;
};

const handleLogin = async () => {
  error.value = null;
  try {
    const recaptchaToken = await getRecaptchaToken(RECAPTCHA_ACTIONS.LOGIN);
    await authStore.login(email.value, password.value, recaptchaToken);
    await retreatStore.fetchRetreats();
    if (retreatStore.mostRecentRetreat) {
      router.push({ name: 'retreat-dashboard', params: { id: retreatStore.mostRecentRetreat.id } });
    } else {
      router.push('/app');
    }
  } catch (err: any) {
    error.value = err.message || 'Failed to login';
  }
};

const handleRegister = async () => {
  error.value = null;
  if (password.value !== confirmPassword.value) {
    error.value = t('login.passwordMismatch');
    return;
  }
  if (password.value.length < 8) {
    error.value = t('login.passwordTooShort');
    return;
  }
  try {
    const recaptchaToken = await getRecaptchaToken(RECAPTCHA_ACTIONS.USER_REGISTER);
    await authStore.register({
      email: email.value,
      password: password.value,
      displayName: displayName.value,
      recaptchaToken,
    });
    isRegisterMode.value = false;
    displayName.value = '';
    password.value = '';
    confirmPassword.value = '';
  } catch (err: any) {
    error.value = err.message || t('login.registerFailed');
  }
};
</script>
