<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { WaConversationDto } from '@repo/types'
import { waMediaLabelKey } from '@/utils/waMedia'

/**
 * Walker chat list (consolidated inbox, FR3). Selects the active chat; unread
 * badges are per user (D11, server-side read state).
 */
defineProps<{
  conversations: WaConversationDto[]
  activeChatJid: string | null
  loading: boolean
  emptyText: string
  /** Retreat zone for the times (timezone-handling). */
  retreatTimezone?: string | null
}>()

const emit = defineEmits<{
  (e: 'select', chatJid: string): void
}>()

const { t } = useI18n()

/** "Ana y Beto" when a couple shares the phone (v1.3). */
function displayName(c: WaConversationDto): string {
  const primary = `${c.participantFirstName || t('waInbox.participants')} ${c.participantLastName}`.trim()
  const others = (c.sharedWith ?? []).map((p) => `${p.firstName} ${p.lastName}`.trim())
  return others.length ? [primary, ...others].join(` ${t('waInbox.and')} `) : primary
}

/** Last message preview: caption/text, else a per-type label; staff replies prefixed. */
function preview(c: WaConversationDto): string {
  const text = c.lastMessagePreview || t(waMediaLabelKey(c.lastMessageType))
  if (!c.lastMessageFromMe) return text
  return `${c.lastReplyByName || t('waInbox.you')}: ${text}`
}

function formatTime(ts: string | Date, tz?: string | null): string {
  const date = typeof ts === 'string' ? new Date(ts) : ts
  return date.toLocaleString('es-MX', {
    timeZone: tz || undefined,
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
            <span class="font-medium text-sm truncate">{{ displayName(c) }}</span>
            <span
              v-if="c.unreadCount > 0"
              class="shrink-0 min-w-[1.25rem] px-1.5 h-5 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center"
              data-testid="wa-unread-badge"
            >
              {{ c.unreadCount > 99 ? '99+' : c.unreadCount }}
            </span>
          </div>
          <div class="flex items-center justify-between gap-2 mt-0.5">
            <span class="text-xs text-muted-foreground truncate">{{ preview(c) }}</span>
            <span class="text-xs text-muted-foreground whitespace-nowrap">
              {{ formatTime(c.lastMessageAt, retreatTimezone) }}
            </span>
          </div>
          <!-- v1.3: who is handling it — avoids two staff answering the same walker. -->
          <div class="mt-1 text-[11px]">
            <span
              v-if="c.awaitingReply"
              class="text-amber-700"
              data-testid="wa-awaiting-reply"
            >
              {{ t('waInbox.awaitingReply') }}
            </span>
            <span
              v-else-if="c.lastReplyByName"
              class="text-emerald-700"
              data-testid="wa-answered-by"
            >
              ✓ {{ t('waInbox.answeredBy', { name: c.lastReplyByName }) }}
            </span>
          </div>
        </button>
      </li>
    </ul>
  </div>
</template>
