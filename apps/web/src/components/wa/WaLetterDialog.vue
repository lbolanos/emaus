<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui'

/**
 * "Add as letter" (specs/whatsapp-inbox v1.3, D20): the staff picks who the
 * letter is for (defaults to the chat's walker), edits the text that will be
 * printed and keeps or drops the image (a PDF arrives already rendered to an
 * image by the parent). Mounted once by the inbox view, opened via v-model.
 * v1.5: for a document (Word, PDF…) it can also keep the original file with
 * the letter — the server downloads and verifies it; it is not printed.
 */
const props = defineProps<{
  open: boolean
  participants: Array<{ id: string; name: string }>
  defaultParticipantId: string | null
  initialText: string
  /** Image that would print with the letter (data-URL), if any. */
  attachmentDataUrl: string | null
  preparingAttachment: boolean
  saving: boolean
  /** v1.5: name of the original document the letter may keep (null = not a document). */
  documentName?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (
    e: 'submit',
    payload: { participantId: string; bodyText: string; includeAttachment: boolean; includeDocument: boolean },
  ): void
}>()

const { t } = useI18n()
const participantId = ref('')
const bodyText = ref('')
const includeAttachment = ref(true)
const includeDocument = ref(true)
const error = ref<string | null>(null)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    participantId.value = props.defaultParticipantId ?? ''
    bodyText.value = props.initialText
    includeAttachment.value = true
    includeDocument.value = true
    error.value = null
  },
)

function submit(): void {
  if (!bodyText.value.trim()) {
    error.value = t('waInbox.letter.emptyBody')
    return
  }
  if (!participantId.value) return
  emit('submit', {
    participantId: participantId.value,
    bodyText: bodyText.value,
    includeAttachment: includeAttachment.value && Boolean(props.attachmentDataUrl),
    includeDocument: includeDocument.value && Boolean(props.documentName),
  })
}
</script>

<template>
  <Dialog :open="open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="sm:max-w-lg" data-testid="wa-letter-dialog">
      <DialogHeader>
        <DialogTitle>{{ t('waInbox.letter.title') }}</DialogTitle>
        <DialogDescription>{{ t('waInbox.letter.description') }}</DialogDescription>
      </DialogHeader>
      <form class="min-w-0 space-y-4" @submit.prevent="submit">
        <label class="block text-sm">
          <span class="font-medium">{{ t('waInbox.letter.recipient') }}</span>
          <select
            v-model="participantId"
            class="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            data-testid="wa-letter-recipient"
            required
          >
            <option v-for="p in participants" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="block text-sm">
          <span class="font-medium">{{ t('waInbox.letter.body') }}</span>
          <textarea
            v-model="bodyText"
            rows="7"
            class="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            data-testid="wa-letter-body"
          />
        </label>
        <div class="text-sm">
          <div class="font-medium">{{ t('waInbox.letter.attachment') }}</div>
          <div v-if="preparingAttachment" class="mt-1 text-muted-foreground animate-pulse">
            {{ t('waInbox.letter.preparing') }}
          </div>
          <label v-else-if="attachmentDataUrl" class="mt-1 flex items-center gap-3">
            <input v-model="includeAttachment" type="checkbox" data-testid="wa-letter-include-attachment" />
            <img
              :src="attachmentDataUrl"
              class="h-20 w-auto max-w-[160px] rounded border object-contain"
              alt=""
            />
          </label>
          <div v-else-if="!documentName" class="mt-1 text-muted-foreground">
            {{ t('waInbox.letter.noAttachment') }}
          </div>
          <!-- v1.5: the original file (Word, PDF…), kept in the folder; not printed. -->
          <label v-if="documentName" class="mt-2 flex items-start gap-2">
            <input
              v-model="includeDocument"
              type="checkbox"
              class="mt-0.5"
              data-testid="wa-letter-include-document"
            />
            <span>
              {{ t('waInbox.letter.includeDocument', { name: documentName }) }}
              <span class="block text-xs text-muted-foreground">{{ t('waInbox.letter.includeDocumentHint') }}</span>
            </span>
          </label>
        </div>
        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        <DialogFooter class="flex-wrap gap-2">
          <Button type="button" variant="outline" @click="emit('update:open', false)">
            {{ t('waInbox.cancel') }}
          </Button>
          <Button
            type="submit"
            :disabled="saving || preparingAttachment || !participantId"
            data-testid="wa-letter-save"
          >
            {{ t('waInbox.letter.save') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
