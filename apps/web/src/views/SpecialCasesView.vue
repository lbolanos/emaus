<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { Flag, MessageSquare, Phone } from 'lucide-vue-next'
import type { Participant } from '@repo/types'
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui'
import { useRetreatStore } from '@/stores/retreatStore'
import { useParticipantStore } from '@/stores/participantStore'
import ParticipantSpecialCaseToggle from '@/components/ParticipantSpecialCaseToggle.vue'
import HealthNeedsConnection from '@/components/offline/HealthNeedsConnection.vue'
import MessageDialog from '@/components/MessageDialog.vue'
import { createLocaleComparator } from '@/utils/sort'

/**
 * Inbox of "casos especiales" (specs/special-case): walkers the palanquero
 * flagged for the coordinator. Computed from the retreat's participant list
 * (no endpoint of its own); the route and sidebar item require
 * participant:health, and the API only sends the fields to that set.
 * Attending a case = contact the walker outside the system, then remove the
 * flag here.
 */

const { t } = useI18n()
const retreatStore = useRetreatStore()
const participantStore = useParticipantStore()
// Special cases are health regime: a list served from the phone has none of
// them (specs/offline-mode), so it would read as an empty inbox.
const { participants, fromCache } = storeToRefs(participantStore)

const loading = ref(false)
const retreatId = computed(
  () => retreatStore.selectedRetreatId || retreatStore.mostRecentRetreat?.id || null,
)

const compareNames = createLocaleComparator('es')
const cases = computed(() =>
  (participants.value || [])
    .filter((p) => p.specialCase === true && p.type === 'walker' && !p.isCancelled)
    .sort((a, b) =>
      compareNames(`${a.firstName} ${a.lastName}`.trim(), `${b.firstName} ${b.lastName}`.trim()),
    ),
)

async function loadCases(id: string | null) {
  if (!id) return
  loading.value = true
  try {
    // filters is shared state: other views leave keys behind (e.g. type='server'
    // from the leader-assignment modal) that would hide walkers from this list.
    Object.keys(participantStore.filters).forEach((key) => {
      delete participantStore.filters[key]
    })
    participantStore.filters.retreatId = id
    await participantStore.fetchParticipants()
  } catch (error) {
    console.error('Error loading special cases:', error)
  } finally {
    loading.value = false
  }
}

watch(
  retreatId,
  async (id) => {
    if (!id && retreatStore.retreats.length === 0) {
      await retreatStore.fetchRetreats()
      return
    }
    await loadCases(id)
  },
  { immediate: true },
)

// Contact: the dialog stays mounted (no v-if) so forceTemplateType-style
// watchers fire, and the participant comes from the list just loaded (it
// carries payments/debts for the template variables).
const messageDialogOpen = ref(false)
const messageParticipant = ref<Participant | null>(null)
const messageRetreatId = ref<string | null>(null)

function openContact(participant: Participant) {
  messageParticipant.value = participant
  messageRetreatId.value = retreatId.value
  messageDialogOpen.value = true
}
</script>

<template>
  <div class="space-y-4">
    <div class="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl shadow-sm overflow-hidden">
      <div class="flex items-center gap-3 px-4 py-3">
        <div class="flex items-center justify-center w-8 h-8 bg-amber-100 rounded-lg">
          <Flag class="w-4 h-4 text-amber-600" />
        </div>
        <div>
          <h1 class="text-sm font-semibold text-amber-900">{{ t('specialCases.title') }}</h1>
          <p class="text-xs text-amber-700">
            {{ t('specialCases.subtitle') }}<template v-if="!fromCache"> ·
            <span data-testid="special-cases-count">{{ t('specialCases.pendingCount', { count: cases.length }) }}</span></template>
          </p>
        </div>
      </div>
    </div>

    <div v-if="loading" class="space-y-2 animate-pulse" data-testid="special-cases-loading">
      <div v-for="i in 3" :key="i" class="h-10 bg-muted rounded" />
    </div>

    <HealthNeedsConnection v-else-if="fromCache" :message="t('offline.specialCasesNeedConnection')" />

    <p
      v-else-if="cases.length === 0"
      class="text-sm text-muted-foreground text-center py-10 border rounded-xl"
      data-testid="special-cases-empty"
    >
      {{ t('specialCases.empty') }}
    </p>

    <div v-else class="border rounded-xl overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{{ t('specialCases.columns.name') }}</TableHead>
            <TableHead>{{ t('specialCases.columns.phone') }}</TableHead>
            <TableHead>{{ t('specialCases.columns.category') }}</TableHead>
            <TableHead>{{ t('specialCases.columns.notes') }}</TableHead>
            <TableHead class="text-right">{{ t('specialCases.columns.actions') }}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="participant in cases" :key="participant.id" data-testid="special-case-row">
            <TableCell class="font-medium">
              {{ participant.firstName }} {{ participant.lastName }}
            </TableCell>
            <TableCell>
              <a
                v-if="participant.cellPhone"
                :href="`tel:${participant.cellPhone}`"
                class="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Phone class="w-3.5 h-3.5" />
                {{ participant.cellPhone }}
              </a>
            </TableCell>
            <TableCell>
              <span
                v-if="participant.specialCaseCategory"
                class="inline-flex items-center rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
              >
                {{ t(`specialCases.categories.${participant.specialCaseCategory}`) }}
              </span>
            </TableCell>
            <TableCell class="max-w-[320px] whitespace-pre-wrap text-sm">
              <span v-if="participant.specialCaseNotes">{{ participant.specialCaseNotes }}</span>
              <span v-else class="text-muted-foreground">{{ t('specialCases.noNotes') }}</span>
            </TableCell>
            <TableCell>
              <div class="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="special-case-contact"
                  @click="openContact(participant)"
                >
                  <MessageSquare class="mr-1.5 h-3.5 w-3.5" />
                  {{ t('specialCases.contact') }}
                </Button>
                <ParticipantSpecialCaseToggle :participant="participant" variant="button" />
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <MessageDialog
      v-model:open="messageDialogOpen"
      context="retreat"
      :retreat-id="messageRetreatId ?? undefined"
      :participant="messageParticipant"
    />
  </div>
</template>
