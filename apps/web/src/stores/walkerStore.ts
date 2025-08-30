import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Walker } from '@repo/types'
import api from '@/services/api'

export const useWalkerStore = defineStore('walker', () => {
  const walkers = ref<Walker[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const walkerCount = computed(() => walkers.value.length)

  async function fetchWalkers() {
    loading.value = true
    error.value = null
    try {
      const response = await api.get('/walkers')
      walkers.value = response.data
    } catch (err) {
      error.value = 'Failed to fetch walkers.'
    } finally {
      loading.value = false
    }
  }

  return { walkers, loading, error, walkerCount, fetchWalkers }
})