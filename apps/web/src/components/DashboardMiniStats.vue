<script setup lang="ts">
import { Users, UserPlus } from 'lucide-vue-next';

defineProps<{
  isVisible: boolean;
  walkers: number;
  maxWalkers?: number | null;
  servers: number;
  maxServers?: number | null;
}>();
</script>

<template>
  <Teleport to="body">
    <Transition name="mini-bar">
      <div
        v-if="isVisible"
        class="fixed top-14 left-0 right-0 z-30 bg-background/95 backdrop-blur border-b shadow-sm"
      >
        <div class="max-w-6xl mx-auto px-4 py-2 flex items-center gap-5 flex-wrap text-sm">
          <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:block">
            Resumen
          </span>

          <div class="flex items-center gap-1.5">
            <Users class="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span class="font-semibold">{{ walkers }}</span>
            <span v-if="maxWalkers" class="text-muted-foreground">/ {{ maxWalkers }}</span>
            <span class="text-muted-foreground text-xs">caminantes</span>
          </div>

          <div class="flex items-center gap-1.5">
            <UserPlus class="w-3.5 h-3.5 text-green-500 shrink-0" />
            <span class="font-semibold">{{ servers }}</span>
            <span v-if="maxServers" class="text-muted-foreground">/ {{ maxServers }}</span>
            <span class="text-muted-foreground text-xs">servidores</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mini-bar-enter-active,
.mini-bar-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.mini-bar-enter-from,
.mini-bar-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
