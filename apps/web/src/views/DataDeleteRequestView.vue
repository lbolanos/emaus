<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from '@repo/ui'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@repo/ui'
import {
  getParticipantByDeleteToken,
  deleteParticipantByDeleteToken,
} from '@/services/api'

const route = useRoute()
const token = String(route.params.token || '')

type Status = 'loading' | 'ready' | 'confirming' | 'deleted' | 'notFound' | 'error'

const status = ref<Status>('loading')
const participant = ref<{
  firstName: string
  lastName: string
  email: string
  retreatName: string | null
} | null>(null)

const loadParticipant = async () => {
  try {
    participant.value = await getParticipantByDeleteToken(token)
    status.value = 'ready'
  } catch (err: any) {
    if (err?.response?.status === 404) {
      status.value = 'notFound'
    } else {
      status.value = 'error'
    }
  }
}

const confirmDelete = async () => {
  status.value = 'confirming'
  try {
    await deleteParticipantByDeleteToken(token)
    status.value = 'deleted'
  } catch (err: any) {
    if (err?.response?.status === 404) {
      status.value = 'notFound'
    } else {
      status.value = 'error'
    }
  }
}

onMounted(loadParticipant)
</script>

<template>
  <div class="min-h-screen bg-white font-sans text-stone-800">
    <nav class="fixed w-full z-50 bg-white/90 backdrop-blur-md shadow-sm py-3">
      <div class="max-w-7xl mx-auto px-6 flex justify-between items-center">
        <router-link to="/" class="flex items-center gap-2">
          <img src="/crossRoseButtT.png" alt="Emmaus Rose" class="w-8 h-8" />
          <span class="text-xl font-light tracking-widest uppercase text-stone-800">
            {{ $t('landing.emmaus') }}
          </span>
        </router-link>
        <router-link
          to="/"
          class="text-sm font-medium text-stone-600 hover:text-sage-600 transition-colors"
        >
          {{ $t('dataDelete.backToHome') }}
        </router-link>
      </div>
    </nav>

    <main class="pt-28 pb-16 px-6">
      <div class="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle class="text-2xl">{{ $t('dataDelete.title') }}</CardTitle>
            <CardDescription v-if="status === 'ready' || status === 'confirming'">
              {{ $t('dataDelete.description') }}
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-6">
            <div v-if="status === 'loading'" class="text-stone-600">
              {{ $t('dataDelete.loading') }}
            </div>

            <template v-else-if="(status === 'ready' || status === 'confirming') && participant">
              <div class="rounded-md border bg-muted/40 p-4 text-sm space-y-1">
                <p class="font-medium">{{ $t('dataDelete.participantInfo') }}</p>
                <p>{{ participant.firstName }} {{ participant.lastName }}</p>
                <p class="text-stone-500">{{ participant.email }}</p>
                <p v-if="participant.retreatName" class="text-stone-500">
                  {{ participant.retreatName }}
                </p>
              </div>
              <div class="flex gap-3 justify-end">
                <router-link to="/">
                  <Button variant="outline" :disabled="status === 'confirming'">
                    {{ $t('dataDelete.cancelButton') }}
                  </Button>
                </router-link>
                <Button
                  variant="destructive"
                  :disabled="status === 'confirming'"
                  @click="confirmDelete"
                >
                  {{ $t('dataDelete.confirmButton') }}
                </Button>
              </div>
            </template>

            <div
              v-else-if="status === 'deleted'"
              class="rounded-md border border-green-200 bg-green-50 p-4 text-green-800"
            >
              <p class="font-semibold mb-1">{{ $t('dataDelete.successTitle') }}</p>
              <p class="text-sm">{{ $t('dataDelete.successMessage') }}</p>
            </div>

            <div
              v-else-if="status === 'notFound'"
              class="rounded-md border border-red-200 bg-red-50 p-4 text-red-800"
            >
              <p class="font-semibold mb-1">{{ $t('dataDelete.errorTitle') }}</p>
              <p class="text-sm">{{ $t('dataDelete.errorNotFound') }}</p>
            </div>

            <div
              v-else-if="status === 'error'"
              class="rounded-md border border-red-200 bg-red-50 p-4 text-red-800"
            >
              <p class="font-semibold mb-1">{{ $t('dataDelete.errorTitle') }}</p>
              <p class="text-sm">{{ $t('dataDelete.errorGeneric') }}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  </div>
</template>
