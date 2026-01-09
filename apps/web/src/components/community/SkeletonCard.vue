<template>
  <div class="p-4 border rounded-lg bg-card">
    <div class="flex items-center space-x-4">
      <div class="skeleton-avatar w-12 h-12 rounded-full bg-muted animate-pulse"></div>
      <div class="flex-1 space-y-2">
        <div class="skeleton-line h-4 bg-muted rounded w-3/4 animate-pulse"></div>
        <div class="skeleton-line h-3 bg-muted rounded w-1/2 animate-pulse"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>
