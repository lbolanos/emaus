<template>
  <RouterView />
  <Toaster />
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
import Toaster from '@repo/ui/components/ui/toast/Toaster.vue';
</script>