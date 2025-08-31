<template>
  <div class="min-h-screen bg-background flex flex-col justify-center items-center p-4">
    <Card class="w-full max-w-md">
      <CardHeader class="space-y-1 text-center">
        <CardTitle class="text-2xl">
          Sign in to your account
        </CardTitle>
        <CardDescription>
          Enter your email and password below to login
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4">
        <form @submit.prevent="handleLogin" class="grid gap-4">
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
          <div class="grid gap-2">
            <div class="flex items-center">
              <Label for="password">Password</Label>
              <router-link to="/request-password-reset" class="ml-auto inline-block text-sm underline">
                Forgot your password?
              </router-link>
            </div>
            <Input id="password" type="password" required v-model="password" />
          </div>
          <div v-if="error" class="text-destructive text-sm">
            {{ error }}
          </div>
          <Button type="submit" class="w-full">
            Sign In
          </Button>
        </form>
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <span class="w-full border-t" />
          </div>
          <div class="relative flex justify-center text-xs uppercase">
            <span class="bg-background px-2 text-muted-foreground">
              Or continue with
            </span>
          </div>
        </div>
        <a :href="googleLoginUrl">
          <Button variant="outline" class="w-full">
            <img src="/google-logo.svg" alt="Google logo" class="w-4 h-4 mr-2" />
            Google
          </Button>
        </a>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@repo/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/ui/card';
import { Input } from '@repo/ui/components/ui/input';
import { Label } from '@repo/ui/components/ui/label';


const googleLoginUrl = `${import.meta.env.VITE_API_URL}/auth/google`;

const email = ref('');
const password = ref('');
const error = ref<string | null>(null);

const authStore = useAuthStore();
const router = useRouter();

const handleLogin = async () => {
  error.value = null;
  try {
    await authStore.login(email.value, password.value);
    router.push('/');
  } catch (err: any) {
    error.value = err.message || 'Failed to login';
  }
};
</script>
