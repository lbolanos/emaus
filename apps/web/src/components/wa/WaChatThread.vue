<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, ExternalLink, Maximize2, Minimize2 } from 'lucide-vue-next'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@repo/ui'
import { buildWhatsAppChatLink } from '@/utils/phone'
import { toNationalPhone } from '@repo/types'
import ParticipantInfoPopover from '@/components/ParticipantInfoPopover.vue'
import ParticipantQuickPhoneEditor from '@/components/ParticipantQuickPhoneEditor.vue'
import type {
  Participant,
  WaConversationDto,
  WaInboxMessageDto,
  WaMediaVariantsDto,
  WaRawMediaDto,
} from '@repo/types'
import { isPdfDocument, waMediaLabelKey } from '@/utils/waMedia'

/**
 * A chat thread (FR3/FR8/D9/D10 + mobile UX v1.1, v1.3):
 *  - Messages ONLY through `{{ }}` interpolation — never v-html: the content
 *    is third-party text (S8 of specs/whatsapp-inbox).
 *  - Media is downloaded on demand: image thumbnails, voice notes, documents.
 *  - "Reply" opens the chat from the staff member's own phone (D10); staff
 *    replies are shown right-aligned with their author (v1.3).
 *  - Mobile: Back button (the parent hides the list while a chat is active)
 *    and tapping a bubble opens a larger, readable view.
 *  - Times in the RETREAT'S ZONE (rule 5 of timezone-handling), with Today /
 *    Yesterday / date separators.
 *  - v1.4: an emergency contact's chat is labeled as such ("Mamá — María,
 *    contacto de emergencia de Juan"); the header carries the quick phone
 *    editor of the walker (add a contact's WhatsApp number in two clicks) and
 *    the desktop "expand conversation" toggle.
 */
const props = defineProps<{
  messages: WaInboxMessageDto[]
  conversation: WaConversationDto | null
  loading: boolean
  /** The user can create payments: enables "Register as payment" (FR14). */
  canRegisterPayment?: boolean
  /** Retreat zone for times and day separators. */
  retreatTimezone?: string | null
  /** Walker profile (UX backlog): full Participant for the popover. */
  popoverParticipant?: Participant | null
  retreatId?: string | null
  /** Image variants by messageId (v1.2): thumb in the thread, large in the viewer. */
  mediaMap?: Record<string, WaMediaVariantsDto> | null
  /** v1.3: downloaded voice notes / documents by messageId. */
  rawMediaMap?: Record<string, WaRawMediaDto> | null
  /** v1.3: the user can review letters (letter:update) — enables "add as letter". */
  canAddLetter?: boolean
  /** v1.4: the list is hidden and the thread takes the full width (desktop). */
  expanded?: boolean
  /** v1.4: retreat house's country, validates the quick phone editor. */
  phoneCountry?: string | null
}>()

const emit = defineEmits<{
  (e: 'register-receipt', message: WaInboxMessageDto): void
  (e: 'view-photo', message: WaInboxMessageDto): void
  (e: 'back'): void
  (e: 'add-letter', message: WaInboxMessageDto): void
  (e: 'open-document', message: WaInboxMessageDto): void
  (e: 'play-audio', message: WaInboxMessageDto): void
  (e: 'reply-template'): void
  (e: 'toggle-expand'): void
  (e: 'phones-saved'): void
}>()

const { t } = useI18n()

const tz = computed(() => props.retreatTimezone || 'America/Mexico_City')

const isContactChat = computed(() => props.conversation?.senderKind === 'emergency_contact')

/** Walkers of the chat: "Ana y Beto" when a couple shares the phone (v1.3). */
const walkerNames = computed(() => {
  const c = props.conversation
  if (!c) return ''
  const names = c.forWalkers?.length
    ? c.forWalkers.map((w) => `${w.firstName} ${w.lastName}`.trim())
    : [
        `${c.participantFirstName} ${c.participantLastName}`.trim(),
        ...(c.sharedWith ?? []).map((p) => `${p.firstName} ${p.lastName}`.trim()),
      ]
  return names.join(` ${t('waInbox.and')} `)
})

/** The walker(s) — or, for an emergency contact, "Mamá — María" (v1.4). */
const headerName = computed(() => {
  const c = props.conversation
  if (!c) return ''
  if (!isContactChat.value) return walkerNames.value
  return (
    [c.contact?.relation, c.contact?.name].filter(Boolean).join(' — ') ||
    t('waInbox.contactSlot', { slot: c.contact?.slot ?? 1 })
  )
})

/** Media without caption shows its type label (documents show the file name instead). */
function showTypeLabel(m: WaInboxMessageDto): boolean {
  if (m.messageType === 'document') return false
  if (m.messageType === 'image' && props.mediaMap?.[m.id]?.thumb) return false
  return m.messageType !== 'text' && m.messageType !== 'audio'
}

type ActionKind = 'view' | 'open' | 'payment' | 'letter'

/**
 * Actions offered under an incoming message (v1.3). Payments only take images
 * (a PDF's first page is rendered to one); letters take text, images and PDFs.
 */
function actionsFor(m: WaInboxMessageDto): Array<{ kind: ActionKind; label: string }> {
  if (m.fromMe) return []
  const actions: Array<{ kind: ActionKind; label: string }> = []
  const pdf = m.messageType === 'document' && isPdfDocument(m.mediaMime, m.mediaFileName)
  if (m.messageType === 'image') actions.push({ kind: 'view', label: t('waInbox.viewPhoto') })
  if (m.messageType === 'document') actions.push({ kind: 'open', label: t('waInbox.openDocument') })
  if (props.canRegisterPayment && (m.messageType === 'image' || pdf)) {
    actions.push({ kind: 'payment', label: t('waInbox.registerPayment') })
  }
  const letterable = m.messageType === 'image' || pdf || (m.messageType === 'text' && Boolean(m.body))
  if (props.canAddLetter && letterable && !m.letterId) {
    actions.push({ kind: 'letter', label: t('waInbox.addLetter') })
  }
  return actions
}

function runAction(kind: ActionKind, m: WaInboxMessageDto): void {
  if (kind === 'view') emit('view-photo', m)
  else if (kind === 'open') emit('open-document', m)
  else if (kind === 'payment') emit('register-receipt', m)
  else emit('add-letter', m)
}

// chatPhone holds the JID digits (with calling code); the deep link expects
// the national number and adds the country's code with the shared helper.
const replyLink = computed(() => {
  const chatPhone = props.conversation?.chatPhone
  const country = props.conversation?.country ?? 'MX'
  if (!chatPhone) return null
  const national = toNationalPhone(chatPhone, country) || chatPhone
  return buildWhatsAppChatLink(national, country)
})

const ordered = computed(() => props.messages)

// Larger view: tapping a bubble shows big text + the full date. Long walker
// messages are hard to read at text-sm.
const enlarged = ref<WaInboxMessageDto | null>(null)

function enlarge(message: WaInboxMessageDto): void {
  // Image → the parent's large viewer (on-demand download, FR14); the larger
  // view dialog is for text only.
  if (message.messageType === 'image') {
    emit('view-photo', message)
    return
  }
  // v1.3: a document opens, a voice note plays — the text dialog would be empty.
  if (message.messageType === 'document') {
    emit('open-document', message)
    return
  }
  if (message.messageType === 'audio') {
    emit('play-audio', message)
    return
  }
  enlarged.value = message
}

function asDate(ts: string | Date): Date {
  return typeof ts === 'string' ? new Date(ts) : ts
}

/** Civil date YYYY-MM-DD of the timestamp, in the retreat's zone. */
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
  // 1 gesture = 1 window.open (WhatsAppSendQueue pattern).
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
  <div class="rounded-lg border flex flex-col min-h-[320px] h-full" data-testid="wa-chat-thread">
    <div
      v-if="!conversation"
      class="flex-1 flex items-center justify-center p-6 text-sm text-muted-foreground"
    >
      {{ t('waInbox.selectChat') }}
    </div>
    <template v-else>
      <div class="px-3 py-2 border-b flex items-center justify-between gap-2">
        <div class="flex items-center gap-1 min-w-0">
          <!-- Mobile: back to the list (the parent hides the thread). -->
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
          <div class="min-w-0">
            <div class="text-sm font-medium truncate" data-testid="wa-thread-title">
              <template v-if="isContactChat">👪 </template>{{ headerName }}
            </div>
            <!-- v1.4: whose emergency contact this is. -->
            <div
              v-if="isContactChat"
              class="text-[11px] text-sky-800 truncate"
              data-testid="wa-thread-contact-of"
            >
              {{ t('waInbox.contactOfWalker', { walker: walkerNames }) }}
            </div>
          </div>
          <!-- Walker profile without leaving the inbox (UX backlog). -->
          <ParticipantInfoPopover
            v-if="popoverParticipant"
            variant="icon"
            :participant="popoverParticipant"
            :retreat-id="retreatId ?? undefined"
          />
          <!-- v1.4: add/fix the walker's or a contact's WhatsApp number right here
               (participant:update); the chat shows up on the next ingestion cycle. -->
          <ParticipantQuickPhoneEditor
            v-if="popoverParticipant"
            :participant="popoverParticipant"
            :country="phoneCountry"
            @saved="emit('phones-saved')"
          />
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <!-- v1.3: templated reply through the existing MessageDialog (logs history).
               Not for a contact's chat: the dialog defaults to the walker's phone. -->
          <Button
            v-if="conversation.participantId && !isContactChat"
            variant="outline"
            size="sm"
            data-testid="wa-reply-template"
            @click="emit('reply-template')"
          >
            {{ t('waInbox.replyTemplate') }}
          </Button>
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
          <!-- v1.4 (D24): hide the list and give the thread the full width (desktop). -->
          <Button
            variant="ghost"
            size="sm"
            class="hidden lg:inline-flex px-2"
            :aria-pressed="expanded ? 'true' : 'false'"
            :aria-label="expanded ? t('waInbox.collapseThread') : t('waInbox.expandThread')"
            :title="expanded ? t('waInbox.collapseThread') : t('waInbox.expandThread')"
            data-testid="wa-thread-expand"
            @click="emit('toggle-expand')"
          >
            <Minimize2 v-if="expanded" class="w-4 h-4" />
            <Maximize2 v-else class="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
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
            :class="m.fromMe ? 'justify-end' : ''"
            :data-testid="`wa-message-${m.id}`"
          >
            <div class="max-w-[85%]">
              <!-- v1.3: staff replies sent from a linked phone, right-aligned. -->
              <div
                v-if="m.fromMe"
                class="text-[10px] text-emerald-800 text-right mb-0.5"
                data-testid="wa-staff-reply"
              >
                {{ m.senderName || t('waInbox.staffReply') }}
              </div>
              <button
                type="button"
                class="block text-left rounded-lg transition-colors px-3 py-2 w-full cursor-pointer"
                :class="m.fromMe ? 'bg-emerald-50 hover:bg-emerald-100 border border-emerald-100' : 'bg-muted hover:bg-muted/70'"
                :aria-label="t('waInbox.enlarge')"
                @click="enlarge(m)"
              >
                <!-- Image: thumbnail once the batch arrived (v1.2); tap = large viewer. -->
                <img
                  v-if="m.messageType === 'image' && mediaMap?.[m.id]?.thumb"
                  :src="mediaMap[m.id].thumb"
                  class="mb-1 w-full max-h-48 object-cover rounded-md"
                  alt="Foto recibida"
                  data-testid="wa-thumb"
                />
                <!-- Document: icon + file name (v1.3). -->
                <div
                  v-if="m.messageType === 'document'"
                  class="text-sm font-medium break-all"
                  data-testid="wa-document"
                >
                  {{ t('waInbox.media.document') }}{{ m.mediaFileName ? ` · ${m.mediaFileName}` : '' }}
                </div>
                <div
                  v-if="m.body || showTypeLabel(m)"
                  class="text-sm whitespace-pre-wrap break-words"
                >
                  {{ m.body ?? t(waMediaLabelKey(m.messageType)) }}
                </div>
                <div class="text-[10px] text-muted-foreground mt-1 text-right">
                  {{ formatTime(m.timestamp) }}
                </div>
              </button>
              <!-- Voice note (v1.3): downloaded on demand, played inline. -->
              <div v-if="m.messageType === 'audio'" class="mt-1">
                <audio
                  v-if="rawMediaMap?.[m.id]"
                  :src="rawMediaMap[m.id].dataUrl"
                  controls
                  preload="auto"
                  class="w-60 max-w-full"
                  data-testid="wa-audio"
                />
                <button
                  v-else
                  type="button"
                  class="text-xs text-emerald-700 hover:underline"
                  :data-testid="`wa-play-audio-${m.id}`"
                  @click="emit('play-audio', m)"
                >
                  ▶ {{ t('waInbox.playAudio') }}
                </button>
              </div>
              <!-- v1.3: what the team already did with this message. -->
              <div
                v-if="m.paymentRegisteredByName"
                class="mt-1 text-[11px] text-emerald-800"
                :data-testid="`wa-payment-registered-${m.id}`"
              >
                💵 {{ t('waInbox.paymentRegisteredBy', { name: m.paymentRegisteredByName }) }}
              </div>
              <div
                v-if="m.letterAddedByName"
                class="mt-1 text-[11px] text-purple-800"
                :data-testid="`wa-letter-added-${m.id}`"
              >
                ✉️ {{ t('waInbox.letterAddedBy', { name: m.letterAddedByName }) }}
              </div>
              <div
                v-if="actionsFor(m).length"
                class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1"
              >
                <button
                  v-for="action in actionsFor(m)"
                  :key="action.kind"
                  type="button"
                  class="text-xs hover:underline"
                  :class="action.kind === 'payment' ? 'text-emerald-700' : 'text-muted-foreground hover:text-foreground'"
                  :data-testid="`wa-action-${action.kind}-${m.id}`"
                  @click="runAction(action.kind, m)"
                >
                  {{ action.label }}
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

    <!-- Larger view: big text and the full date. -->
    <Dialog :open="!!enlarged" @update:open="enlarged = null">
      <DialogContent class="sm:max-w-lg" data-testid="wa-message-enlarged">
        <DialogHeader>
          <DialogTitle>{{ headerName }}</DialogTitle>
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
