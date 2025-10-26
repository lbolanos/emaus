<script setup lang="ts">
import { onMounted } from 'vue'
import { useRetreatStore } from '@/stores/retreatStore'
import { useParticipantStore } from '@/stores/participantStore'
import ParticipantList from '@/components/ParticipantList.vue'

const tableColumns = ['id_on_retreat','firstName', 'lastName', 'hasMedication', 'medicationDetails', 'medicationSchedule'];
const formShowColumns = ['id_on_retreat','firstName', 'lastName', 'hasMedication', 'medicationDetails', 'medicationSchedule'];
const nonEditableColumns = ['id_on_retreat','firstName', 'lastName', 'hasMedication', 'medicationDetails', 'medicationSchedule'];
const formEditColumns = tableColumns.filter(c => !nonEditableColumns.includes(c));

const retreatStore = useRetreatStore()
const participantStore = useParticipantStore()

onMounted(async () => {
  // Ensure retreats are loaded first
  if (retreatStore.retreats.length === 0) {
    await retreatStore.fetchRetreats()
  }

  // Set retreat ID filter and fetch participants
  const retreatId = retreatStore.selectedRetreatId || retreatStore.mostRecentRetreat?.id

  if (retreatId) {
    participantStore.filters.retreatId = retreatId

    // Fetch participants
    try {
      await participantStore.fetchParticipants()
    } catch (error) {
      console.error('Error loading participants:', error)
    }
  }
})
</script>

<template>
  <ParticipantList type="walker"
    :columns-to-show-in-table="tableColumns"
    :columns-to-show-in-form="formShowColumns"
    :columns-to-edit-in-form="formEditColumns"
 />
</template>
