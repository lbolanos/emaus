<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { WaConversationDto } from '@repo/types'

/**
 * Lista de chats de caminantes (bandeja consolidada, FR3). Selecciona el chat
 * activo; los badges de no leídos son por usuario (D11, read_state server-side).
 */
defineProps<{
  conversations: WaConversationDto[]
  activeChatJid: string | null
  loading: boolean
  emptyText: string
}>()

const emit = defineEmits<{
  (e: 'select', chatJid: string): void
}>()

const { t } = useI18n()

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
  <div class="rounded-lg border overflow-hidden flex flex-col min-h-[320px]" data-testid="wa-conversation-list">
    <div
      v-if="loading && conversations.length === 0"
      class="p-4 text-sm text-muted-foreground animate-pulse"
    >
      {{ t('waInbox.loading') }}
    </div>
    <div
      v-else-if="conversations.length === 0"
      class="p-4 text-sm text-muted-foreground"
    >
      {{ emptyText }}
    </div>
    <ul v-else class="divide-y overflow-y-auto max-h-[70vh]">
      <li v-for="c in conversations" :key="c.chatJid">
        <button
          type="button"
          class="w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors"
          :class="c.chatJid === activeChatJid ? 'bg-muted' : ''"
          :data-testid="`wa-chat-row-${c.chatPhone}`"
          @click="emit('select', c.chatJid)"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="font-medium text-sm truncate">
              {{ c.participantFirstName || t('waInbox.participants') }}
              {{ c.participantLastName }}
            </span>
            <span
              v-if="c.unreadCount > 0"
              class="shrink-0 min-w-[1.25rem] px-1.5 h-5 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center"
              data-testid="wa-unread-badge"
            >
              {{ c.unreadCount > 99 ? '99+' : c.unreadCount }}
            </span>
          </div>
          <div class="flex items-center justify-between gap-2 mt-0.5">
            <span class="text-xs text-muted-foreground truncate">
              {{ c.lastMessagePreview || t('waInbox.multimedia') }}
            </span>
            <span class="text-xs text-muted-foreground whitespace-nowrap">
              {{ formatTime(c.lastMessageAt) }}
            </span>
          </div>
        </button>
      </li>
    </ul>
  </div>
</template>
