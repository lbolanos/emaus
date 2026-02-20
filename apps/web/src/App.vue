<template>
  <RouterView />
  <Toaster />
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { RouterView } from 'vue-router';
import { Toaster } from '@repo/ui';
import { useAuthStore } from '@/stores/authStore';

const authStore = useAuthStore();

const hideRecaptchaBadge = (hide: boolean) => {
  const badge = document.querySelector('.grecaptcha-badge') as HTMLElement | null;
  if (badge) badge.style.visibility = hide ? 'hidden' : 'visible';
};

watch(() => authStore.isAuthenticated, (loggedIn) => {
  hideRecaptchaBadge(loggedIn);
  // Badge may load after auth state resolves, retry briefly
  if (loggedIn) {
    const interval = setInterval(() => {
      const badge = document.querySelector('.grecaptcha-badge');
      if (badge) {
        (badge as HTMLElement).style.visibility = 'hidden';
        clearInterval(interval);
      }
    }, 500);
    setTimeout(() => clearInterval(interval), 5000);
  }
}, { immediate: true });
</script>