<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'
import type { WaConversationDto } from '@repo/types'
import { waMediaLabelKey } from '@/utils/waMedia'

/**
 * Inbox chat list (consolidated inbox, FR3), grouped by walker since v1.4
 * (D23): each walker is one entry holding their own chat and their emergency
 * contacts' chats. A couple sharing a phone is one entry ("Ana y Beto"); a
 * contact of two walkers in different entries (siblings) shows under both —
 * same chat, same thread. Unread badges are per user (D11).
 */
const props = defineProps<{
  conversations: WaConversationDto[]
  activeChatJid: string | null
  /** Group the active chat was opened from (a chat may live in two groups). */
  activeWalkerId?: string | null
  loading: boolean
  emptyText: string
  /** Retreat zone for the times (timezone-handling). */
  retreatTimezone?: string | null
}>()

const emit = defineEmits<{
  (e: 'select', chatJid: string, walkerId: string | null): void
}>()

const { t } = useI18n()

type WalkerRef = WaConversationDto['forWalkers'][number]

interface WalkerGroup {
  /** Walker ids joined, or the chat JID for a chat with no walker attached. */
  key: string
  /** Walkers of the group: one, or a couple sharing a phone. */
  walkerIds: string[]
  name: string
  chats: WaConversationDto[]
  unread: number
  lastAt: number
}

function time(ts: string | Date): number {
  return (typeof ts === 'string' ? new Date(ts) : ts).getTime() || 0
}

function walkersOf(c: WaConversationDto): WalkerRef[] {
  if (c.forWalkers?.length) return c.forWalkers
  if (!c.participantId) return []
  return [
    { participantId: c.participantId, firstName: c.participantFirstName, lastName: c.participantLastName },
    ...(c.sharedWith ?? []).map((p) => ({ participantId: p.id, firstName: p.firstName, lastName: p.lastName })),
  ]
}

const groups = computed<WalkerGroup[]>(() => {
  const byKey = new Map<string, WalkerGroup>()
  /** walker id → key of the group that walker lives in. */
  const groupOfWalker = new Map<string, string>()

  const ensure = (key: string, walkers: WalkerRef[]): WalkerGroup => {
    let group = byKey.get(key)
    if (!group) {
      const names = walkers.map((w) => `${w.firstName} ${w.lastName}`.trim()).filter(Boolean)
      group = {
        key,
        walkerIds: walkers.map((w) => w.participantId),
        name: names.join(` ${t('waInbox.and')} `) || t('waInbox.participants'),
        chats: [],
        unread: 0,
        lastAt: 0,
      }
      byKey.set(key, group)
      for (const w of walkers) groupOfWalker.set(w.participantId, key)
    }
    return group
  }
  const add = (group: WalkerGroup, c: WaConversationDto) => {
    if (group.chats.includes(c)) return
    group.chats.push(c)
    group.unread += c.unreadCount
    group.lastAt = Math.max(group.lastAt, time(c.lastMessageAt))
  }

  // Walker chats first: they define the groups (a shared phone = one group).
  for (const c of props.conversations) {
    if (c.senderKind === 'emergency_contact') continue
    const walkers = walkersOf(c)
    const key = walkers.map((w) => w.participantId).join('+') || c.chatJid
    add(ensure(key, walkers), c)
  }
  // Contact chats join the group of each walker that listed them.
  for (const c of props.conversations) {
    if (c.senderKind !== 'emergency_contact') continue
    const walkers = walkersOf(c)
    if (walkers.length === 0) {
      add(ensure(c.chatJid, []), c)
      continue
    }
    for (const w of walkers) {
      const key = groupOfWalker.get(w.participantId) ?? w.participantId
      add(ensure(key, [w]), c)
    }
  }
  for (const group of byKey.values()) {
    // The walker's own chat first, then their contacts by recent activity.
    group.chats.sort((a, b) => {
      const own = Number(b.senderKind !== 'emergency_contact') - Number(a.senderKind !== 'emergency_contact')
      return own || time(b.lastMessageAt) - time(a.lastMessageAt)
    })
  }
  return Array.from(byKey.values()).sort((a, b) => b.lastAt - a.lastAt)
})

/** Manual open/closed state; untouched groups follow isOpenByDefault. */
const toggled = ref<Record<string, boolean>>({})

/** Walker a chat opened from this group is about (prefills payment and letter). */
function walkerFor(group: WalkerGroup, c: WaConversationDto): string | null {
  const ids = walkersOf(c).map((w) => w.participantId)
  return group.walkerIds.find((id) => ids.includes(id)) ?? c.participantId ?? null
}

function isActiveIn(group: WalkerGroup, c: WaConversationDto): boolean {
  if (c.chatJid !== props.activeChatJid) return false
  if (!props.activeWalkerId || group.walkerIds.length === 0) return true
  return group.walkerIds.includes(props.activeWalkerId)
}

function isOpen(group: WalkerGroup): boolean {
  const manual = toggled.value[group.key]
  if (manual !== undefined) return manual
  return group.unread > 0 || group.chats.some((c) => isActiveIn(group, c))
}

function toggle(group: WalkerGroup): void {
  toggled.value = { ...toggled.value, [group.key]: !isOpen(group) }
}

function select(group: WalkerGroup, c: WaConversationDto): void {
  emit('select', c.chatJid, walkerFor(group, c))
}

/** "Mamá — María", or "Contacto 2" when the record has no name or relation. */
function contactLabel(c: WaConversationDto): string {
  const label = [c.contact?.relation, c.contact?.name].filter(Boolean).join(' — ')
  return label || t('waInbox.contactSlot', { slot: c.contact?.slot ?? 1 })
}

/** Child row title: the walker's own chat ("Ana y Beto" on a shared phone) or the contact. */
function chatTitle(c: WaConversationDto): string {
  if (c.senderKind === 'emergency_contact') return contactLabel(c)
  const names = walkersOf(c).map((w) => `${w.firstName} ${w.lastName}`.trim())
  return names.join(` ${t('waInbox.and')} `) || t('waInbox.participants')
}

/** Last message preview: caption/text, else a per-type label; staff replies prefixed. */
function preview(c: WaConversationDto): string {
  const text = c.lastMessagePreview || t(waMediaLabelKey(c.lastMessageType))
  if (!c.lastMessageFromMe) return text
  return `${c.lastReplyByName || t('waInbox.you')}: ${text}`
}

function formatTime(ts: string | Date | number, tz?: string | null): string {
  const date = typeof ts === 'string' || typeof ts === 'number' ? new Date(ts) : ts
  return date.toLocaleString('es-MX', {
    timeZone: tz || undefined,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function unreadLabel(count: number): string {
  return count > 99 ? '99+' : String(count)
}
</script>

<template>
  <div class="rounded-lg border overflow-hidden flex flex-col min-h-[320px] h-full" data-testid="wa-conversation-list">
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
    <ul v-else class="divide-y overflow-y-auto flex-1 min-h-0">
      <li v-for="group in groups" :key="group.key" :data-testid="`wa-group-${group.key}`">
        <!-- One chat: the walker row opens it directly. -->
        <button
          v-if="group.chats.length === 1"
          type="button"
          class="w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors"
          :class="isActiveIn(group, group.chats[0]) ? 'bg-muted' : ''"
          :data-testid="`wa-chat-row-${group.chats[0].chatPhone}`"
          @click="select(group, group.chats[0])"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="font-medium text-sm truncate">{{ group.name }}</span>
            <span
              v-if="group.chats[0].unreadCount > 0"
              class="shrink-0 min-w-[1.25rem] px-1.5 h-5 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center"
              data-testid="wa-unread-badge"
            >
              {{ unreadLabel(group.chats[0].unreadCount) }}
            </span>
          </div>
          <div
            v-if="group.chats[0].senderKind === 'emergency_contact'"
            class="text-[11px] text-sky-800 truncate"
            data-testid="wa-contact-label"
          >
            👪 {{ contactLabel(group.chats[0]) }} · {{ t('waInbox.emergencyContact') }}
          </div>
          <div class="flex items-center justify-between gap-2 mt-0.5">
            <span class="text-xs text-muted-foreground truncate">{{ preview(group.chats[0]) }}</span>
            <span class="text-xs text-muted-foreground whitespace-nowrap">
              {{ formatTime(group.chats[0].lastMessageAt, retreatTimezone) }}
            </span>
          </div>
          <!-- v1.3: who is handling it — avoids two staff answering the same person. -->
          <div class="mt-1 text-[11px]">
            <span v-if="group.chats[0].awaitingReply" class="text-amber-700" data-testid="wa-awaiting-reply">
              {{ t('waInbox.awaitingReply') }}
            </span>
            <span v-else-if="group.chats[0].lastReplyByName" class="text-emerald-700" data-testid="wa-answered-by">
              ✓ {{ t('waInbox.answeredBy', { name: group.chats[0].lastReplyByName }) }}
            </span>
          </div>
        </button>

        <!-- Several chats (the walker and/or their contacts): collapsible group. -->
        <template v-else>
          <button
            type="button"
            class="w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors flex items-center gap-2"
            :aria-expanded="isOpen(group)"
            :data-testid="`wa-group-toggle-${group.key}`"
            @click="toggle(group)"
          >
            <component :is="isOpen(group) ? ChevronDown : ChevronRight" class="w-4 h-4 shrink-0 text-muted-foreground" />
            <span class="flex-1 min-w-0">
              <span class="flex items-center justify-between gap-2">
                <span class="font-medium text-sm truncate">{{ group.name }}</span>
                <span
                  v-if="group.unread > 0"
                  class="shrink-0 min-w-[1.25rem] px-1.5 h-5 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center"
                  data-testid="wa-group-unread"
                >
                  {{ unreadLabel(group.unread) }}
                </span>
              </span>
              <span class="flex items-center justify-between gap-2 mt-0.5 text-xs text-muted-foreground">
                <span>{{ t('waInbox.groupChats', { count: group.chats.length }) }}</span>
                <span class="whitespace-nowrap">{{ formatTime(group.lastAt, retreatTimezone) }}</span>
              </span>
            </span>
          </button>
          <ul v-if="isOpen(group)" class="border-t bg-muted/20">
            <li v-for="c in group.chats" :key="c.chatJid">
              <button
                type="button"
                class="w-full text-left pl-9 pr-3 py-2 hover:bg-muted/60 transition-colors"
                :class="isActiveIn(group, c) ? 'bg-muted' : ''"
                :data-testid="`wa-chat-row-${c.chatPhone}`"
                @click="select(group, c)"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="text-sm truncate" :class="c.senderKind === 'emergency_contact' ? 'text-sky-900' : 'font-medium'">
                    <template v-if="c.senderKind === 'emergency_contact'">👪 </template>{{ chatTitle(c) }}
                  </span>
                  <span
                    v-if="c.unreadCount > 0"
                    class="shrink-0 min-w-[1.25rem] px-1.5 h-5 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center"
                    data-testid="wa-unread-badge"
                  >
                    {{ unreadLabel(c.unreadCount) }}
                  </span>
                </div>
                <div class="text-[11px] text-muted-foreground">
                  {{ c.senderKind === 'emergency_contact' ? t('waInbox.emergencyContact') : t('waInbox.walkerChat') }}
                </div>
                <div class="flex items-center justify-between gap-2 mt-0.5">
                  <span class="text-xs text-muted-foreground truncate">{{ preview(c) }}</span>
                  <span class="text-xs text-muted-foreground whitespace-nowrap">
                    {{ formatTime(c.lastMessageAt, retreatTimezone) }}
                  </span>
                </div>
                <div class="mt-1 text-[11px]">
                  <span v-if="c.awaitingReply" class="text-amber-700" data-testid="wa-awaiting-reply">
                    {{ t('waInbox.awaitingReply') }}
                  </span>
                  <span v-else-if="c.lastReplyByName" class="text-emerald-700" data-testid="wa-answered-by">
                    ✓ {{ t('waInbox.answeredBy', { name: c.lastReplyByName }) }}
                  </span>
                </div>
              </button>
            </li>
          </ul>
        </template>
      </li>
    </ul>
  </div>
</template>
