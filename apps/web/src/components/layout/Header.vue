<template>
  <header class="flex items-center justify-between h-16 px-4 bg-white border-b">
    <div>
      <!-- Can add breadcrumbs or page title here -->
    </div>
    <div v-if="auth.isAuthenticated && auth.user" class="flex items-center gap-4">
      <span>{{ auth.user.displayName }}</span>
      <button @click="handleLogout" class="p-2 rounded-full hover:bg-gray-100">
        <LogOut class="w-5 h-5" />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { LogOut } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'vue-router';

const auth = useAuthStore();
const router = useRouter();

const handleLogout = async () => {
  await auth.logout();
  router.push('/login');
};
</script>
