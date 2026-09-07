<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { DropdownMenuItem } from '@repo/ui'
import { useRetreatStore } from '@/stores/retreatStore'
import { useParticipantStore } from '@/stores/participantStore'
import { useRekaDialogFix } from '@/composables/useRekaDialogFix'
import ParticipantList from '@/components/ParticipantList.vue'
import RetreatBirthdaysDialog from '@/components/RetreatBirthdaysDialog.vue'
import { getBirthdaysDuringRetreat } from '@/utils/retreatBirthdays'
import { Cake, DoorOpen } from 'lucide-vue-next'

const walkerTableColumns = ['id_on_retreat','firstName', 'lastName', 'email', 'cellPhone', 'parish', 'paymentRemaining']
const walkerFormShowColumns = ['id_on_retreat','firstName', 'lastName', 'cellPhone', 'parish', 'paymentRemaining', 'email']
const nonEditableColumns = ['email']
const walkerFormEditColumns = walkerTableColumns.filter(c => !nonEditableColumns.includes(c))

const { t } = useI18n()
const router = useRouter()
const retreatStore = useRetreatStore()
const participantStore = useParticipantStore()

// Ambas acciones salen de un DropdownMenuItem, así que el diálogo se abre con
// deferOpen: si no, reka-ui deja `pointer-events: none` pegado en el body.
const { deferOpen } = useRekaDialogFix()

const retreatId = computed(() => retreatStore.selectedRetreatId || retreatStore.mostRecentRetreat?.id)

function goToReception() {
  if (retreatId.value) {
    router.push({ name: 'reception', params: { id: retreatId.value } })
  }
}

// Los cumpleaños se consultan a demanda, no avisando solos: antes salía un toast
// al entrar aquí y se perdía en cuanto el usuario lo cerraba o cambiaba de vista.
const birthdaysDialogOpen = ref(false)

const birthdayWalkers = computed(() => {
  const currentRetreat = retreatStore.selectedRetreat || retreatStore.mostRecentRetreat
  if (!currentRetreat) return []
  const walkers = participantStore.participants.filter(p => p.type === 'walker')
  return getBirthdaysDuringRetreat(walkers, currentRetreat.startDate, currentRetreat.endDate)
})

onMounted(async () => {
  if (retreatStore.retreats.length === 0) await retreatStore.fetchRetreats()
  const id = retreatStore.selectedRetreatId || retreatStore.mostRecentRetreat?.id
  if (id) {
    participantStore.filters.retreatId = id
    try { await participantStore.fetchParticipants() } catch (e) { console.error(e) }
  }
})
</script>

<template>
  <ParticipantList
    type="walker"
    :columns-to-show-in-table="walkerTableColumns"
    :columns-to-show-in-form="walkerFormShowColumns"
    :columns-to-edit-in-form="walkerFormEditColumns"
  >
    <template #extra-menu-items>
      <DropdownMenuItem @select="deferOpen(() => { birthdaysDialogOpen = true })">
        <Cake class="mr-2 h-4 w-4 text-amber-600" />
        {{ t('participants.birthdays.title') }}
        <span
          v-if="birthdayWalkers.length > 0"
          class="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold"
        >
          {{ birthdayWalkers.length }}
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem v-if="retreatId" @select="deferOpen(goToReception)">
        <DoorOpen class="mr-2 h-4 w-4" />
        {{ t('sidebar.goToReception') }}
      </DropdownMenuItem>
    </template>
  </ParticipantList>

  <RetreatBirthdaysDialog
    v-model:open="birthdaysDialogOpen"
    :birthdays="birthdayWalkers"
  />
</template>
