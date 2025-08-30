<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="container mx-auto p-4">
    <header>
      <h1 class="text-2xl font-bold">Retreat Logistics</h1>
    </header>
    <main class="mt-4">
      <RouterView />
    </main>
  </div>
</template>