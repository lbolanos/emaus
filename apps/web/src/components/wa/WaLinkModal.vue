<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loader2 } from 'lucide-vue-next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
} from '@repo/ui'
import QrcodeVue from 'qrcode.vue'
import { useWaInboxStore } from '@/stores/waInboxStore'

/**
 * Flujo de vinculación (FR1 / D7): consentimiento → QR → conectado.
 * El modal se monta SIEMPRE (sin v-if) y abre por `open`; la etapa inicial es
 * el consentimiento y el API lo exige server-side también (400 sin flag).
 * El QR rota ~20 s: se refresca con polling de status cada 3 s mientras está
 * en etapa QR.
 */
const props = defineProps<{
  open: boolean
  retreatId: string | null
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'linked'): void
}>()

const { t } = useI18n()
const store = useWaInboxStore()

type Stage = 'consent' | 'qr' | 'connected'
const stage = ref<Stage>('consent')
const consentChecked = ref(false)
const linkId = ref<string | null>(null)
const qr = ref<string | null>(null)
const lastError = ref<string | null>(null)
const starting = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function resetFlow() {
  stopPolling()
  stage.value = 'consent'
  consentChecked.value = false
  linkId.value = null
  qr.value = null
  lastError.value = null
  starting.value = false
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      stopPolling()
    } else {
      resetFlow()
    }
  },
)

async function beginLink() {
  if (!props.retreatId || !consentChecked.value) return
  starting.value = true
  lastError.value = null
  try {
    const created = await store.link(props.retreatId, true)
    linkId.value = created.id
    stage.value = 'qr'
    // El QR llega por eventos del supervisor: se lee por polling de status.
    pollTimer = setInterval(async () => {
      if (!linkId.value || !props.open) return
      try {
        const status = await store.linkStatus(linkId.value)
        if (status.qr) qr.value = status.qr
        if (status.status === 'connected') {
          stopPolling()
          stage.value = 'connected'
          emit('linked')
        }
        if (status.lastError) lastError.value = status.lastError
      } catch {
        // Reintento en el siguiente tick.
      }
    }, 3000)
  } catch (err) {
    const message =
      (err as { response?: { data?: { message?: string; reason?: string } } })?.response?.data
        ?.message ||
      (err as { response?: { data?: { reason?: string } } })?.response?.data?.reason ||
      (err as Error).message
    lastError.value = message
  } finally {
    starting.value = false
  }
}

function close() {
  stopPolling()
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-md" data-testid="wa-link-modal">
      <DialogHeader>
        <DialogTitle>{{ t('waInbox.consent.title') }}</DialogTitle>
        <DialogDescription>{{ t('waInbox.consent.intro') }}</DialogDescription>
      </DialogHeader>

      <!-- Etapa 1: consentimiento (D7) -->
      <div v-if="stage === 'consent'" class="space-y-3">
        <ul class="text-sm text-muted-foreground space-y-2 list-disc pl-4">
          <li>{{ t('waInbox.consent.bullet1') }}</li>
          <li>{{ t('waInbox.consent.bullet2') }}</li>
          <li>{{ t('waInbox.consent.bullet3') }}</li>
          <li>{{ t('waInbox.consent.bullet4') }}</li>
          <li>{{ t('waInbox.consent.bullet5') }}</li>
        </ul>
        <label class="flex items-start gap-2 text-sm" data-testid="wa-consent-checkbox">
          <input v-model="consentChecked" type="checkbox" class="mt-0.5" />
          <span>{{ t('waInbox.consent.accept') }}</span>
        </label>
        <p v-if="lastError" class="text-sm text-red-600" data-testid="wa-link-error">
          {{ lastError }}
        </p>
      </div>

      <!-- Etapa 2: QR -->
      <div v-else-if="stage === 'qr'" class="space-y-3" data-testid="wa-qr-stage">
        <p class="text-sm text-muted-foreground">{{ t('waInbox.consent.scan') }}</p>
        <div class="flex items-center justify-center p-4">
          <div v-if="qr" class="bg-white p-3 rounded-lg">
            <QrcodeVue :value="qr" :size="220" level="M" render-as="canvas" />
          </div>
          <Loader2 v-else class="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
        <p class="text-xs text-muted-foreground text-center">{{ t('waInbox.consent.connecting') }}</p>
        <p v-if="lastError" class="text-sm text-red-600 text-center">{{ lastError }}</p>
      </div>

      <!-- Etapa 3: conectado -->
      <div v-else class="space-y-3 text-center py-4" data-testid="wa-connected-stage">
        <p class="text-sm font-medium text-emerald-700">{{ t('waInbox.consent.connected') }}</p>
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" @click="close">
          {{ stage === 'connected' ? t('waInbox.close') : t('waInbox.cancel') }}
        </Button>
        <Button
          v-if="stage === 'consent'"
          size="sm"
          :disabled="!consentChecked || starting"
          data-testid="wa-consent-continue"
          @click="beginLink"
        >
          <Loader2 v-if="starting" class="w-4 h-4 mr-1 animate-spin" />
          {{ t('waInbox.consent.continue') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
