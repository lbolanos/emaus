<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { LogOut } from 'lucide-vue-next'
import { Button } from '@repo/ui'
import type { WaLinkDto } from '@repo/types'

/**
 * The retreat's link board (specs/whatsapp-inbox FR2). Each link's phone ONLY
 * comes from the API when the caller is its owner (or superadmin): this just
 * shows the field when present — the stripping happens server side.
 */
defineProps<{
  links: WaLinkDto[]
  currentUserId: string | null
  /** The superadmin can unlink any link (D14). */
  isSuperadmin?: boolean
}>()

const emit = defineEmits<{
  (e: 'unlink', linkId: string): void
}>()

const { t } = useI18n()

const statusClass = (status: string): string => {
  switch (status) {
    case 'connected':
      return 'bg-emerald-100 text-emerald-800'
    case 'qr':
    case 'pending':
      return 'bg-amber-100 text-amber-800'
    case 'error':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}
</script>

<template>
  <div
    v-if="links.length > 0"
    class="rounded-lg border p-3 flex flex-col gap-2"
    data-testid="wa-link-panel"
  >
    <div
      v-for="waLink in links"
      :key="waLink.id"
      class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
    >
      <div class="flex items-center gap-2 flex-wrap">
        <span
          class="px-2 py-0.5 rounded-full text-xs font-medium"
          :class="statusClass(waLink.status)"
        >
          {{ t(`waInbox.status.${waLink.status}`) }}
        </span>
        <span class="text-sm font-medium">{{ waLink.ownerName || waLink.userId }}</span>
        <span
          v-if="waLink.linkedPhone"
          class="text-sm text-muted-foreground"
          data-testid="wa-link-phone"
        >
          {{ waLink.linkedPhone }}
        </span>
        <span v-if="waLink.lastError" class="text-xs text-red-600">{{ waLink.lastError }}</span>
      </div>
      <Button
        v-if="currentUserId && (waLink.userId === currentUserId || isSuperadmin)"
        variant="outline"
        size="sm"
        @click="emit('unlink', waLink.id)"
      >
        <LogOut class="w-4 h-4 mr-1" />
        {{ t('waInbox.unlink') }}
      </Button>
    </div>
  </div>
</template>
