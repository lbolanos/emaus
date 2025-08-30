<script setup lang="ts">
import { useWalkerStore } from '@/stores/walkerStore'
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import Button from '@repo/ui/Button.vue'

const store = useWalkerStore()
const { walkers, loading, error } = storeToRefs(store)

onMounted(() => {
  store.fetchWalkers()
})
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-semibold">Walkers</h2>
      <Button>Add Walker</Button>
    </div>
    <div v-if="loading">Loading...</div>
    <div v-else-if="error" class="text-red-500">{{ error }}</div>
    <ul v-else class="space-y-2">
      <li
        v-for="walker in walkers"
        :key="walker.id"
        class="p-4 border rounded-md"
      >
        {{ walker.firstName }} {{ walker.lastName }} - {{ walker.email }}
      </li>
    </ul>
  </div>
</template>