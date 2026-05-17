<template>
  <Transition name="banner">
    <div
      v-if="shouldShow"
      class="flex items-center justify-between gap-3 px-4 py-2 bg-yellow-500 text-white text-sm font-medium shadow-sm z-50 flex-shrink-0"
      role="alert"
    >
      <div class="flex items-center gap-2 min-w-0">
        <Mail class="w-4 h-4 flex-shrink-0" />
        <span class="truncate">
          {{ t('emailVerify.banner.message') }}
        </span>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button
          v-if="!sent"
          @click="resend"
          :disabled="loading"
          class="px-3 py-1 rounded bg-white text-yellow-700 font-semibold text-xs hover:bg-yellow-50 transition-colors disabled:opacity-60"
        >
          {{ loading ? t('emailVerify.banner.sending') : t('emailVerify.banner.resend') }}
        </button>
        <span v-else class="text-xs italic">{{ t('emailVerify.banner.sent') }}</span>
        <button
          @click="dismiss"
          class="p-1 rounded hover:bg-yellow-600 transition-colors"
          :aria-label="t('emailVerify.banner.close')"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Mail, X } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';

const { t } = useI18n();

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const STORAGE_KEY = 'emailVerifyBanner.dismissedFor';
const dismissedForId = ref<string | null>(
  typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null,
);
const loading = ref(false);
const sent = ref(false);

const shouldShow = computed(() => {
  if (!user.value) return false;
  // emailVerified comes from /auth/status; treat undefined as verified to
  // avoid showing the banner for users who registered before the field existed.
  if (user.value.emailVerified !== false) return false;
  if (dismissedForId.value && dismissedForId.value === user.value.id) return false;
  return true;
});

function dismiss() {
  if (!user.value) return;
  dismissedForId.value = user.value.id;
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, user.value.id);
  }
}

async function resend() {
  if (!user.value?.email || loading.value) return;
  loading.value = true;
  try {
    await api.post('/auth/resend-verification', { email: user.value.email });
    sent.value = true;
  } catch {
    // Endpoint always returns 200 (anti-enum) — still mark as sent
    sent.value = true;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.banner-enter-active,
.banner-leave-active {
  transition: max-height 0.3s ease, opacity 0.2s ease;
  max-height: 200px;
  overflow: hidden;
}
.banner-enter-from,
.banner-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
