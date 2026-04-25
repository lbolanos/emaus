<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from '@repo/ui'
import { useRetreatStore } from '@/stores/retreatStore'
import { useParticipantStore } from '@/stores/participantStore'
import ParticipantList from '@/components/ParticipantList.vue'
import { DoorOpen } from 'lucide-vue-next'

const walkerTableColumns = ['id_on_retreat','firstName', 'lastName', 'email', 'cellPhone', 'parish', 'totalPaid']
const walkerFormShowColumns = ['id_on_retreat','firstName', 'lastName', 'cellPhone', 'parish', 'totalPaid', 'email']
const nonEditableColumns = ['email']
const walkerFormEditColumns = walkerTableColumns.filter(c => !nonEditableColumns.includes(c))

const { toast } = useToast()
const { t } = useI18n()
const router = useRouter()
const retreatStore = useRetreatStore()
const participantStore = useParticipantStore()

const retreatId = computed(() => retreatStore.selectedRetreatId || retreatStore.mostRecentRetreat?.id)

function goToReception() {
  if (retreatId.value) {
    router.push({ name: 'reception', params: { id: retreatId.value } })
  }
}

function checkBirthdaysDuringRetreat() {
  const currentRetreat = retreatStore.selectedRetreat || retreatStore.mostRecentRetreat
  if (!currentRetreat) return

  const retreatStart = new Date(currentRetreat.startDate)
  const retreatEnd = new Date(currentRetreat.endDate)
  const walkers = participantStore.participants.filter(p => p.type === 'walker')

  const birthdayWalkers = walkers.filter((walker) => {
    if (!walker.birthDate) return false
    const birthDateStr = new Date(walker.birthDate).toISOString()
    const dateParts = birthDateStr.split('T')[0].split('-').map(Number)
    if (dateParts.length !== 3) { console.warn('Invalid date format:', walker.birthDate); return false }
    const [, birthMonth, birthDay] = dateParts
    const currentDate = new Date(retreatStart)
    const endDate = new Date(retreatEnd)
    while (currentDate <= endDate) {
      if (currentDate.getMonth() + 1 === birthMonth && currentDate.getDate() === birthDay) return true
      currentDate.setDate(currentDate.getDate() + 1)
    }
    return false
  })

  if (birthdayWalkers.length > 0) {
    const walkerNames = birthdayWalkers.map((w) => `${w.firstName} ${w.lastName}`).join(', ')
    const birthdayText = birthdayWalkers.length === 1 ? 'cumple años' : 'cumplen años'
    toast({
      title: '🎂 Cumpleaños durante el retiro',
      description: `${walkerNames} ${birthdayText} durante las fechas del retiro`,
      duration: 0,
      variant: 'destructive'
    })
  }
}

onMounted(async () => {
  if (retreatStore.retreats.length === 0) await retreatStore.fetchRetreats()
  const id = retreatStore.selectedRetreatId || retreatStore.mostRecentRetreat?.id
  if (id) {
    participantStore.filters.retreatId = id
    try { await participantStore.fetchParticipants() } catch (e) { console.error(e) }
  }
  setTimeout(checkBirthdaysDuringRetreat, 500)
})
</script>

<template>
  <ParticipantList
    type="walker"
    :columns-to-show-in-table="walkerTableColumns"
    :columns-to-show-in-form="walkerFormShowColumns"
    :columns-to-edit-in-form="walkerFormEditColumns"
  >
    <template #extra-actions>
      <button
        v-if="retreatId"
        class="inline-flex items-center gap-1.5 text-sm font-medium border rounded-md px-3 h-9 hover:bg-muted transition-colors shrink-0"
        @click="goToReception"
        :title="t('sidebar.goToReception')"
      >
        <DoorOpen class="w-4 h-4" />
        {{ t('sidebar.goToReception') }}
      </button>
    </template>
  </ParticipantList>
</template>
