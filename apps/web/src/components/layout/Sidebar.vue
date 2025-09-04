<template>
  <aside
    class="bg-gray-800 text-white flex flex-col dark transition-all duration-300 ease-in-out"
    :class="isCollapsed ? 'w-20' : 'w-64'"
  >
    <div class="h-16 flex items-center justify-center relative">
      <span v-if="!isCollapsed" class="text-2xl font-bold">EMAUS</span>
       <!-- Show initials when collapsed -->
      <span v-else class="text-2xl font-bold">E</span>
      <button @click="toggleSidebar" class="absolute right-0 top-1/2 transform -translate-y-1/2 translate-x-1/2 bg-gray-700 hover:bg-gray-600 rounded-full p-1 z-10">
        <ChevronLeft class="w-5 h-5 transition-transform duration-300" :class="{ 'rotate-180': isCollapsed }" />
      </button>
    </div>

    <div class="px-4 py-2 border-t border-b border-gray-700">
      <div v-if="auth.isAuthenticated && auth.user" class="flex items-center gap-4" :class="{ 'justify-center': isCollapsed }">
        <span v-if="!isCollapsed">{{ auth.user.displayName }}</span>
        <Button @click="handleLogout" variant="ghost" size="icon">
          <LogOut class="w-5 h-5" />
        </Button>
      </div>
    </div>

    <nav class="flex-1 px-2 py-4 space-y-1">
      <router-link
        vif="retreatStore.selectedRetreatId"
        :to="{ name: 'retreat-dashboard', params: { id: retreatStore.selectedRetreatId } }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[
            isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
            { 'justify-center': isCollapsed }
          ]"
        >
          <LayoutDashboard class="w-6 h-6" :class="{ 'mr-3': !isCollapsed }" />
          <span v-if="!isCollapsed">{{ $t('sidebar.retreatDashboard') }}</span>
        </a>
      </router-link>
      <router-link
        vif="retreatStore.selectedRetreatId"
        :to="{ name: 'walkers' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[
            isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
            { 'justify-center': isCollapsed }
          ]"
        >
          <Users class="w-6 h-6" :class="{ 'mr-3': !isCollapsed }" />
          <span v-if="!isCollapsed">{{ $t('sidebar.walkers') }}</span>
        </a>
      </router-link>
      
      <router-link
        vif="retreatStore.selectedRetreatId"
        :to="{ name: 'servers' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[
            isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
            { 'justify-center': isCollapsed }
          ]"
        >
          <UtensilsCrossed class="w-6 h-6" :class="{ 'mr-3': !isCollapsed }" />
          <span v-if="!isCollapsed">{{ $t('sidebar.servers') }}</span>
        </a>
      </router-link>
      <router-link
        vif="retreatStore.selectedRetreatId"
        :to="{ name: 'palancas' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[
            isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
            { 'justify-center': isCollapsed }
          ]"
        >
          <HandHeart class="w-6 h-6" :class="{ 'mr-3': !isCollapsed }" />
          <span v-if="!isCollapsed">{{ $t('sidebar.palancas') }}</span>
        </a>
      </router-link>
      <router-link
        vif="retreatStore.selectedRetreatId"
        :to="{ name: 'payments' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[
            isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
            { 'justify-center': isCollapsed }
          ]"
        >
          <DollarSign class="w-6 h-6" :class="{ 'mr-3': !isCollapsed }" />
          <span v-if="!isCollapsed">{{ $t('sidebar.payments') }}</span>
        </a>
      </router-link>
      <router-link
        vif="retreatStore.selectedRetreatId"
        :to="{ name: 'notes-and-meeting-points' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[
            isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
            { 'justify-center': isCollapsed }
          ]"
        >
          <NotebookPen class="w-6 h-6" :class="{ 'mr-3': !isCollapsed }" />
          <span v-if="!isCollapsed">{{ $t('sidebar.notesAndMeetingPoints') }}</span>
        </a>
      </router-link>
      <router-link
        vif="retreatStore.selectedRetreatId"
        :to="{ name: 'rooms' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[
            isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
            { 'justify-center': isCollapsed }
          ]"
        >
          <Building class="w-6 h-6" :class="{ 'mr-3': !isCollapsed }" />
          <span v-if="!isCollapsed">{{ $t('sidebar.rooms') }}</span>
        </a>
      </router-link>
      <router-link
        vif="retreatStore.selectedRetreatId"
        :to="{ name: 'user-type-and-table' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[
            isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
            { 'justify-center': isCollapsed }
          ]"
        >
          <UsersRound class="w-6 h-6" :class="{ 'mr-3': !isCollapsed }" />
          <span v-if="!isCollapsed">{{ $t('sidebar.userTypeAndTable') }}</span>
        </a>
      </router-link>
      <router-link
        vif="retreatStore.selectedRetreatId"
        :to="{ name: 'food' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[
            isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
            { 'justify-center': isCollapsed }
          ]"
        >
          <Salad class="w-6 h-6" :class="{ 'mr-3': !isCollapsed }" />
          <span v-if="!isCollapsed">{{ $t('sidebar.food') }}</span>
        </a>
      </router-link>
      <router-link
        vif="retreatStore.selectedRetreatId"
        :to="{ name: 'cancellation-and-notes' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[
            isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
            { 'justify-center': isCollapsed }
          ]"
        >
          <FileX class="w-6 h-6" :class="{ 'mr-3': !isCollapsed }" />
          <span v-if="!isCollapsed">{{ $t('sidebar.cancellationAndNotes') }}</span>
        </a>
      </router-link>
      <router-link
        vif="retreatStore.selectedRetreatId"
        :to="{ name: 'waiting-list' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[
            isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
            { 'justify-center': isCollapsed }
          ]"
        >
          <UserCheck class="w-6 h-6" :class="{ 'mr-3': !isCollapsed }" />
          <span v-if="!isCollapsed">{{ $t('sidebar.waitingList') }}</span>
        </a>
      </router-link>
      <router-link
        vif="retreatStore.selectedRetreatId"
        :to="{ name: 'bags-report' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[
            isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
            { 'justify-center': isCollapsed }
          ]"
        >
          <ShoppingBag class="w-6 h-6" :class="{ 'mr-3': !isCollapsed }" />
          <span v-if="!isCollapsed">{{ $t('sidebar.bagsReport') }}</span>
        </a>
      </router-link>
      <router-link
        vif="retreatStore.selectedRetreatId"
        :to="{ name: 'medicines-report' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[
            isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
            { 'justify-center': isCollapsed }
          ]"
        >
          <Pill class="w-6 h-6" :class="{ 'mr-3': !isCollapsed }" />
          <span v-if="!isCollapsed">{{ $t('sidebar.medicinesReport') }}</span>
        </a>
      </router-link>
      <router-link
        vif="retreatStore.selectedRetreatId"
        :to="{ name: 'bed-assignments', params: { id: retreatStore.selectedRetreatId } }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[
            isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
            { 'justify-center': isCollapsed }
          ]"
        >
          <Bed class="w-6 h-6" :class="{ 'mr-3': !isCollapsed }" />
          <span v-if="!isCollapsed">{{ $t('sidebar.bedAssignments') }}</span>
        </a>
      </router-link>
      <router-link
        vif="retreatStore.selectedRetreatId"
        :to="{ name: 'canceled' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[
            isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
            { 'justify-center': isCollapsed }
          ]"
        >
          <Ban class="w-6 h-6" :class="{ 'mr-3': !isCollapsed }" />
          <span v-if="!isCollapsed">{{ $t('sidebar.canceled') }}</span>
        </a>
      </router-link>
      <router-link
        :to="{ name: 'houses' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <a
          :href="href"
          @click="navigate"
          class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="[
            isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
            { 'justify-center': isCollapsed }
          ]"
        >
          <Home class="w-6 h-6" :class="{ 'mr-3': !isCollapsed }" />
          <span v-if="!isCollapsed">{{ $t('sidebar.houses') }}</span>
        </a>
      </router-link>
      <!-- Add other menu items here following the same pattern -->
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { LogOut, Users, UtensilsCrossed, LayoutDashboard, ChevronLeft, Home, Ban, Bed, HandHeart, DollarSign, NotebookPen, Building, UsersRound, Salad, FileX, UserCheck, ShoppingBag, Pill } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'vue-router';
import { Button } from '@repo/ui/components/ui/button';
import { useRetreatStore } from '@/stores/retreatStore';

const auth = useAuthStore();
const router = useRouter();
const retreatStore = useRetreatStore();

const isCollapsed = ref(false);

const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value;
};

const handleLogout = async () => {
  await auth.logout();
  router.push('/login');
};
</script>
