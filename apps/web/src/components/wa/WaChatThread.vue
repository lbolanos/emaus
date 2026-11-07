<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, ExternalLink } from 'lucide-vue-next'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@repo/ui'
import { buildWhatsAppChatLink } from '@/utils/phone'
import { toNationalPhone } from '@repo/types'
import ParticipantInfoPopover from '@/components/ParticipantInfoPopover.vue'
import type { Participant, WaConversationDto, WaInboxMessageDto } from '@repo/types'

/**
 * Hilo de un chat (FR3/FR8/D9/D10 + UX móvil v1.1):
 *  - Mensajes SOLO con interpolación `{{ }}` — jamás v-html: el contenido es
 *    texto de terceros (S8 de specs/whatsapp-inbox).
 *  - Multimedia no se descarga (D9): placeholder con el tipo + registrar pago.
 *  - "Responder" abre el chat desde el teléfono propio del staff (D10).
 *  - Móvil: botón Volver (el padre oculta la lista cuando hay chat activo) y
 *    tap en la burbuja → vista ampliada legible ("ver más grande").
 *  - Horas en la ZONA DEL RETIRO (regla 5 de timezone-handling), separadores
 *    Hoy / Ayer / fecha.
 */
const props = defineProps<{
  messages: WaInboxMessageDto[]
  conversation: WaConversationDto | null
  loading: boolean
  /** El usuario puede crear pagos: habilita "Registrar como pago" (FR14). */
  canRegisterPayment?: boolean
  /** Zona del retiro para horas y separadores de día. */
  retreatTimezone?: string | null
  /** Ficha del caminante (backlog UX): Participant completo para el popover. */
  popoverParticipant?: Participant | null
  retreatId?: string | null
}>()

const emit = defineEmits<{
  (e: 'register-receipt', message: WaInboxMessageDto): void
  (e: 'view-photo', message: WaInboxMessageDto): void
  (e: 'back'): void
}>()

const { t } = useI18n()

const tz = computed(() => props.retreatTimezone || 'America/Mexico_City')

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

// Vista ampliada ("ver más grande"): tap en la burbuja → texto grande + fecha
// completa. En textos largos de caminantes, text-sm no se lee cómodo.
const enlarged = ref<WaInboxMessageDto | null>(null)

function enlarge(message: WaInboxMessageDto): void {
  // Imagen → visor grande del padre (descarga bajo demanda, FR14); el diálogo
  // ampliado es solo para texto.
  if (message.messageType === 'image') {
    emit('view-photo', message)
    return
  }
  enlarged.value = message
}

function asDate(ts: string | Date): Date {
  return typeof ts === 'string' ? new Date(ts) : ts
}

/** Fecha civil YYYY-MM-DD del timestamp, en la zona del retiro. */
function civilDay(ts: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz.value }).format(asDate(ts))
}

function shiftCivil(civil: string, days: number): string {
  const [y, m, d] = civil.split('-').map((part) => parseInt(part, 10))
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

interface DayGroup {
  day: string
  label: string
  messages: WaInboxMessageDto[]
}

const dayGroups = computed<DayGroup[]>(() => {
  const today = civilDay(new Date())
  const yesterday = shiftCivil(today, -1)
  const groups: DayGroup[] = []
  for (const message of ordered.value) {
    const day = civilDay(message.timestamp)
    let group = groups.find((g) => g.day === day)
    if (!group) {
      const label =
        day === today
          ? t('waInbox.today')
          : day === yesterday
            ? t('waInbox.yesterday')
            : new Intl.DateTimeFormat('es-MX', {
                timeZone: tz.value,
                weekday: 'long',
                day: '2-digit',
                month: 'long',
              }).format(asDate(message.timestamp))
      group = { day, label, messages: [] }
      groups.push(group)
    }
    group.messages.push(message)
  }
  return groups
})

function openReply(): void {
  if (!replyLink.value) return;
  // 1 gesto = 1 window.open (patrón de WhatsAppSendQueue).
  window.open(replyLink.value, '_blank');
}

function formatTime(ts: string | Date): string {
  return asDate(ts).toLocaleString('es-MX', {
    timeZone: tz.value,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatFull(ts: string | Date): string {
  return asDate(ts).toLocaleString('es-MX', {
    timeZone: tz.value,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
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
        <div class="flex items-center gap-1 min-w-0">
          <!-- Móvil: volver a la lista (el padre oculta el hilo al volver). -->
          <Button
            variant="ghost"
            size="sm"
            class="lg:hidden px-2"
            data-testid="wa-thread-back"
            :aria-label="t('waInbox.back')"
            @click="emit('back')"
          >
            <ArrowLeft class="w-4 h-4" />
          </Button>
          <div class="text-sm font-medium truncate">
            {{ conversation.participantFirstName }} {{ conversation.participantLastName }}
          </div>
          <!-- Ficha del caminante sin salir de la bandeja (backlog UX). -->
          <ParticipantInfoPopover
            v-if="popoverParticipant"
            variant="icon"
            :participant="popoverParticipant"
            :retreat-id="retreatId ?? undefined"
          />
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
        <template v-for="group in dayGroups" :key="group.label">
          <div class="text-center text-[10px] uppercase tracking-wide text-muted-foreground py-1">
            {{ group.label }}
          </div>
          <div
            v-for="m in group.messages"
            :key="m.id"
            class="flex"
            :data-testid="`wa-message-${m.id}`"
          >
            <div class="max-w-[85%]">
              <button
                type="button"
                class="block text-left rounded-lg bg-muted hover:bg-muted/70 transition-colors px-3 py-2 w-full cursor-pointer"
                :aria-label="t('waInbox.enlarge')"
                @click="enlarge(m)"
              >
                <div class="text-sm whitespace-pre-wrap break-words">{{ m.body ?? t('waInbox.multimedia') }}</div>
                <div class="text-[10px] text-muted-foreground mt-1 text-right">
                  {{ formatTime(m.timestamp) }}
                </div>
              </button>
              <!-- FR14 (v1.1) + feedback Leo 2026-11-07: ver la foto ANTES de
                   decidir si es comprobante real, y registrarla como pago. -->
              <div
                v-if="canRegisterPayment && m.messageType === 'image'"
                class="mt-1 flex items-center gap-3"
              >
                <button
                  type="button"
                  class="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  :data-testid="`wa-view-photo-${m.id}`"
                  @click="emit('view-photo', m)"
                >
                  {{ t('waInbox.viewPhoto') }}
                </button>
                <span class="text-muted-foreground">·</span>
                <button
                  type="button"
                  class="text-xs text-emerald-700 hover:underline"
                  :data-testid="`wa-register-payment-${m.id}`"
                  @click="emit('register-receipt', m)"
                >
                  {{ t('waInbox.registerPayment') }}
                </button>
              </div>
            </div>
          </div>
        </template>
        <div v-if="!loading && messages.length === 0" class="text-sm text-muted-foreground">
          {{ t('waInbox.threadEmpty') }}
        </div>
      </div>
    </template>

    <!-- Vista ampliada ("ver más grande"): texto grande, fecha completa. -->
    <Dialog :open="!!enlarged" @update:open="enlarged = null">
      <DialogContent class="sm:max-w-lg" data-testid="wa-message-enlarged">
        <DialogHeader>
          <DialogTitle>{{ conversation?.participantFirstName }} {{ conversation?.participantLastName }}</DialogTitle>
        </DialogHeader>
        <p
          v-if="enlarged"
          class="text-lg leading-relaxed whitespace-pre-wrap break-words min-h-[80px]"
          data-testid="wa-enlarged-body"
        >
          {{ enlarged.body }}
        </p>
        <p v-if="enlarged" class="text-xs text-muted-foreground">
          {{ formatFull(enlarged.timestamp) }}
        </p>
      </DialogContent>
    </Dialog>
  </div>
</template>
