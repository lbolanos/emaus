<template>
  <aside class="w-64 bg-gray-800 text-white flex flex-col dark">
    <div class="h-16 flex items-center justify-center text-2xl font-bold">
      EMAUS
    </div>

    <div class="px-4 py-2 border-t border-b border-gray-700">
      <div v-if="auth.isAuthenticated && auth.user" class="flex items-center gap-4">
        <span>{{ auth.user.displayName }}</span>
        <Button @click="handleLogout" variant="ghost" size="icon">
          <LogOut class="w-5 h-5" />
        </Button>
      </div>
    </div>

    <nav class="flex-1 px-2 py-4 space-y-1">
      <router-link
        v-if="retreatStore.selectedRetreatId"
        :to="{ name: 'retreat-dashboard', params: { id: retreatStore.selectedRetreatId } }"
        v-slot="{ href, navigate, isActive }"
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white']"
        >
          <LayoutDashboard class="w-6 h-6 mr-3" />
          {{ $t('sidebar.retreatDashboard') }}
        </a>
      </router-link>
      <router-link
        v-if="retreatStore.selectedRetreatId"
        :to="{ name: 'walkers' }"
        v-slot="{ href, navigate, isActive }"
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white']"
        >
          <Users class="w-6 h-6 mr-3" />
          {{ $t('sidebar.walkers') }}
        </a>
      </router-link>
      
      <router-link
        v-if="retreatStore.selectedRetreatId"
        :to="{ name: 'servers' }"
        v-slot="{ href, navigate, isActive }"
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white']"
        >
          <Users class="w-6 h-6 mr-3" />
          {{ $t('sidebar.servers') }}
        </a>
      </router-link>
      <!-- Add other menu items here -->
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { LogOut, Users, LayoutDashboard } from 'lucide-vue-next'; // Import LayoutDashboard icon
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'vue-router';
import { Button } from '@repo/ui/components/ui/button';
import { useRetreatStore } from '@/stores/retreatStore'; // New import

const auth = useAuthStore();
const router = useRouter();
const retreatStore = useRetreatStore(); // New instance

const handleLogout = async () => {
  await auth.logout();
  router.push('/login');
};
</script>