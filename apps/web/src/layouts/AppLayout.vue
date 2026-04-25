<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { defineAsyncComponent, onMounted, onUnmounted, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Sidebar from '@/components/layout/Sidebar.vue'
const AiChatWidget = defineAsyncComponent(() => import('@/components/AiChatWidget.vue'))
const UpdateBanner = defineAsyncComponent(() => import('@/components/UpdateBanner.vue'))
import { useUIStore } from '@/stores/ui'
import { useVersionStore } from '@/stores/versionStore'
import { Menu } from 'lucide-vue-next'

const route = useRoute()
const { t } = useI18n()
const uiStore = useUIStore()
const { isSidebarCollapsed, isMobile, isMobileMenuOpen, pageTitle } = storeToRefs(uiStore)
const versionStore = useVersionStore()

const mainRef = ref<HTMLElement>()

// Fallback map: route name → i18n key for pages without a visible h1
const routeTitleMap: Record<string, string> = {
  'walkers': 'sidebar.walkers',
  'servers': 'sidebar.servers',
  'angelitos': 'sidebar.partialServers',
  'waiting-list': 'sidebar.waitingList',
  'canceled': 'sidebar.canceled',
  'food': 'sidebar.food',
  'palancas': 'sidebar.palancas',
  'notes-and-meeting-points': 'sidebar.notesAndMeetingPoints',
  'cancellation-and-notes': 'sidebar.cancellationAndNotes',
  'message-templates': 'sidebar.settings.messageTemplates',
  'user-type-and-table': 'sidebar.userTypeAndTable',
  'payments': 'sidebar.payments',
  'bags-report': 'sidebar.bagsReport',
  'medicines-report': 'sidebar.medicinesReport',
  'retreat-dashboard': 'sidebar.retreatDashboard',
  'reception': 'sidebar.reception',
}

const updatePageTitle = async () => {
  await nextTick()
  setTimeout(() => {
    // Find h1 that is NOT inside a print-only container
    const allH1s = mainRef.value?.querySelectorAll('h1') || []
    let h1Text = ''
    for (const h1 of allH1s) {
      if (!h1.closest('.print-only-header')) {
        h1Text = h1.textContent?.trim() || ''
        break
      }
    }
    // If no visible h1 found, use the fallback map
    if (!h1Text) {
      const key = routeTitleMap[route.name as string]
      h1Text = key ? t(key) : ''
    }
    pageTitle.value = h1Text
  }, 50)
}

watch(() => route.fullPath, () => {
  updatePageTitle()
  isScrolled.value = false
})

// Hide title on scroll
const isScrolled = ref(false)
const handleScroll = () => {
  if (mainRef.value) {
    isScrolled.value = mainRef.value.scrollTop > 20
  }
}

// Touch swipe gesture handling
let touchStartX = 0
let touchStartY = 0

const handleTouchStart = (e: TouchEvent) => {
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
}

const handleTouchEnd = (e: TouchEvent) => {
  const touchEndX = e.changedTouches[0].clientX
  const touchEndY = e.changedTouches[0].clientY
  const deltaX = touchEndX - touchStartX
  const deltaY = Math.abs(touchEndY - touchStartY)

  // Only detect horizontal swipes (> 50px horizontal, < 50px vertical)
  if (Math.abs(deltaX) < 50 || deltaY > 50) return

  if (deltaX > 0 && touchStartX < 30 && !isMobileMenuOpen.value) {
    // Swipe right from left edge → open
    uiStore.openMobileMenu()
  } else if (deltaX < 0 && isMobileMenuOpen.value) {
    // Swipe left when open → close
    uiStore.closeMobileMenu()
  }
}

onMounted(() => {
  document.addEventListener('touchstart', handleTouchStart, { passive: true })
  document.addEventListener('touchend', handleTouchEnd, { passive: true })
  mainRef.value?.addEventListener('scroll', handleScroll, { passive: true })
  updatePageTitle()
  versionStore.startPolling()
})

onUnmounted(() => {
  document.removeEventListener('touchstart', handleTouchStart)
  document.removeEventListener('touchend', handleTouchEnd)
  mainRef.value?.removeEventListener('scroll', handleScroll)
  versionStore.stopPolling()
})
</script>

<template>
  <div class="flex h-dvh bg-gray-100 dark:bg-gray-900">
    <!-- Desktop sidebar -->
    <div class="hidden md:flex">
      <Sidebar />
    </div>

    <!-- Mobile: fixed hamburger button (always visible) -->
    <button
      v-if="isMobile && !isMobileMenuOpen"
      @click="uiStore.openMobileMenu()"
      class="fixed top-2.5 left-3 z-30 md:hidden rounded-full p-1.5 bg-gray-800 text-white shadow-lg hover:bg-gray-700 transition-colors"
    >
      <Menu class="w-5 h-5" />
    </button>

    <!-- Mobile: page title bar (hides on scroll) -->
    <div
      v-if="isMobile && !isMobileMenuOpen"
      class="fixed top-0 left-0 right-0 z-20 md:hidden flex items-center bg-gray-800 text-white px-3 py-2 shadow-lg transition-transform duration-200"
      :class="{ '-translate-y-full': isScrolled }"
    >
      <span class="text-sm font-medium truncate pl-10">{{ pageTitle }}</span>
    </div>

    <!-- Mobile drawer overlay -->
    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="isMobile && isMobileMenuOpen" class="fixed inset-0 z-40 flex md:hidden">
          <div class="fixed inset-0 bg-black/50 backdrop-blur-sm" @click="uiStore.closeMobileMenu()" />
          <div class="relative z-50 w-64 max-w-[80vw] h-full drawer-panel">
            <Sidebar />
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Main content -->
    <div class="flex flex-col flex-1 overflow-hidden">
      <UpdateBanner />
      <main ref="mainRef" class="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-2 md:p-4" :class="{ 'pt-14': isMobile, 'mobile-hide-h1': isMobile }">
        <router-view />
      </main>
    </div>
    <AiChatWidget />
  </div>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.3s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-active .drawer-panel,
.drawer-leave-active .drawer-panel {
  transition: transform 0.3s ease;
}
.drawer-enter-from .drawer-panel,
.drawer-leave-to .drawer-panel {
  transform: translateX(-100%);
}
</style>

<style>
.mobile-hide-h1 h1 {
  display: none !important;
}

@media print {
  /* Remove all layout constraints for printing */
  .flex.h-dvh {
    display: block !important;
    height: auto !important;
    overflow: visible !important;
  }
  .flex.h-dvh > .hidden.md\:flex,
  .flex.h-dvh > button,
  .flex.h-dvh > .fixed {
    display: none !important;
  }
  .flex.h-dvh > .flex.flex-col.flex-1 {
    overflow: visible !important;
  }
  .flex.h-dvh > .flex.flex-col.flex-1 > main {
    padding: 0 !important;
    overflow: visible !important;
    margin: 0 !important;
  }
}
</style>
