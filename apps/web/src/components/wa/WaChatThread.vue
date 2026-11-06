<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ExternalLink } from 'lucide-vue-next'
import { Button } from '@repo/ui'
import { buildWhatsAppChatLink } from '@/utils/phone'
import { toNationalPhone } from '@repo/types'
import type { WaConversationDto, WaInboxMessageDto } from '@repo/types'

/**
 * Hilo de un chat (FR3/FR8/D9/D10):
 *  - Mensajes SOLO con interpolación `{{ }}` — jamás v-html: el contenido es
 *    texto de terceros (S8 de specs/whatsapp-inbox).
 *  - Multimedia no se descarga (D9): placeholder con el tipo.
 *  - "Responder" abre el chat desde el teléfono propio del staff (D10).
 */
const props = defineProps<{
  messages: WaInboxMessageDto[]
  conversation: WaConversationDto | null
  loading: boolean
  /** El usuario puede crear pagos: habilita "Registrar como pago" (FR14). */
  canRegisterPayment?: boolean
}>()

const emit = defineEmits<{
  (e: 'register-receipt', message: WaInboxMessageDto): void
}>()

const { t } = useI18n()

// chatPhone trae los dígitos del JID (con lada); el deep link espera el
// nacional y le agrega la lada del país con el helper compartido.
const replyLink = computed(() => {
  const chatPhone = props.conversation?.chatPhone
  const country = props.conversation?.country ?? 'MX'
  if (!chatPhone) return null
  const national = toNationalPhone(chatPhone, country) || chatPhone
  return buildWhatsAppChatLink(national, country)
})

const ordered = computed(() => props.messages)

function openReply(): void {
  if (!replyLink.value) return;
  // 1 gesto = 1 window.open (patrón de WhatsAppSendQueue).
  window.open(replyLink.value, '_blank');
}

function formatTime(ts: string | Date): string {
  const date = typeof ts === 'string' ? new Date(ts) : ts
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
</script>

<template>
  <div class="rounded-lg border flex flex-col min-h-[320px]" data-testid="wa-chat-thread">
    <div
      v-if="!conversation"
      class="flex-1 flex items-center justify-center p-6 text-sm text-muted-foreground"
    >
      {{ t('waInbox.selectChat') }}
    </div>
    <template v-else>
      <div class="px-3 py-2 border-b flex items-center justify-between gap-2">
        <div class="text-sm font-medium truncate">
          {{ conversation.participantFirstName }} {{ conversation.participantLastName }}
        </div>
        <Button
          v-if="replyLink"
          variant="outline"
          size="sm"
          data-testid="wa-reply-button"
          @click="openReply"
        >
          <ExternalLink class="w-4 h-4 mr-1" />
          {{ t('waInbox.reply') }}
        </Button>
      </div>
      <div class="flex-1 overflow-y-auto p-3 space-y-2 max-h-[65vh]">
        <div
          v-if="loading && messages.length === 0"
          class="text-sm text-muted-foreground animate-pulse"
        >
          {{ t('waInbox.loading') }}
        </div>
        <div
          v-for="m in ordered"
          :key="m.id"
          class="flex"
          :data-testid="`wa-message-${m.id}`"
        >
          <div class="max-w-[85%]">
            <div class="rounded-lg bg-muted px-3 py-2">
              <div class="text-sm whitespace-pre-wrap break-words">{{ m.body ?? t('waInbox.multimedia') }}</div>
              <div class="text-[10px] text-muted-foreground mt-1 text-right">
                {{ formatTime(m.timestamp) }}
              </div>
            </div>
            <!-- FR14 (v1.1): imagen de caminante → comprobante de pago. -->
            <button
              v-if="canRegisterPayment && m.messageType === 'image'"
              type="button"
              class="mt-1 text-xs text-emerald-700 hover:underline"
              :data-testid="`wa-register-payment-${m.id}`"
              @click="emit('register-receipt', m)"
            >
              {{ t('waInbox.registerPayment') }}
            </button>
          </div>
        </div>
        <div v-if="!loading && messages.length === 0" class="text-sm text-muted-foreground">
          {{ t('waInbox.threadEmpty') }}
        </div>
      </div>
    </template>
  </div>
</template>
