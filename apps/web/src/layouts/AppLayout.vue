<script setup lang="ts">
import { storeToRefs } from 'pinia'
import Header from '@/components/layout/Header.vue'
import Sidebar from '@/components/layout/Sidebar.vue'
import { useUIStore } from '@/stores/ui'

const uiStore = useUIStore()
const { isSidebarCollapsed } = storeToRefs(uiStore)
</script>

<template>
  <div
    class="flex h-screen bg-gray-100 dark:bg-gray-900"
    :class="{ 'sidebar-collapsed': isSidebarCollapsed }"
  >
    <Sidebar />
    <div class="flex flex-col flex-1 overflow-hidden">
      <Header />
      <main class="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-4">
        <router-view />
      </main>
    </div>
  </div>
</template>
