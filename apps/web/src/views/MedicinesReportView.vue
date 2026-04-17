<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRetreatStore } from '@/stores/retreatStore'
import { useParticipantStore } from '@/stores/participantStore'
import { storeToRefs } from 'pinia'
import ParticipantList from '@/components/ParticipantList.vue'
import { Pill, Printer } from 'lucide-vue-next'

const tableColumns = ['id_on_retreat','firstName', 'lastName', 'hasMedication', 'medicationDetails', 'medicationSchedule', 'disabilitySupport']
const formShowColumns = ['id_on_retreat','firstName', 'lastName', 'hasMedication', 'medicationDetails', 'medicationSchedule', 'disabilitySupport']
const nonEditableColumns = ['id_on_retreat','firstName', 'lastName', 'hasMedication', 'medicationDetails', 'medicationSchedule', 'disabilitySupport']
const formEditColumns = tableColumns.filter(c => !nonEditableColumns.includes(c))

const retreatStore = useRetreatStore()
const participantStore = useParticipantStore()
const { participants: allParticipants } = storeToRefs(participantStore)

const walkers = computed(() =>
  (allParticipants.value || []).filter((p: any) => p.type === 'walker')
)

const withMedication = computed(() =>
  walkers.value.filter((p: any) => p.hasMedication === true).length
)

const withDisabilitySupport = computed(() =>
  walkers.value.filter((p: any) => p.disabilitySupport && String(p.disabilitySupport).trim() !== '').length
)

function printReport() {
  window.print()
}

onMounted(async () => {
  if (retreatStore.retreats.length === 0) {
    await retreatStore.fetchRetreats()
  }

  const retreatId = retreatStore.selectedRetreatId || retreatStore.mostRecentRetreat?.id

  if (retreatId) {
    participantStore.filters.retreatId = retreatId

    try {
      await participantStore.fetchParticipants()
    } catch (error) {
      console.error('Error loading participants:', error)
    }
  }
})
</script>

<template>
  <div class="space-y-4">
    <div class="bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-200 rounded-xl shadow-sm overflow-hidden no-print">
      <div class="flex items-center justify-between px-4 py-3">
        <div class="flex items-center gap-3">
          <div class="flex items-center justify-center w-8 h-8 bg-rose-100 rounded-lg">
            <Pill class="w-4 h-4 text-rose-600" />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-rose-900">{{ $t('sidebar.medicinesReport') }}</h3>
            <p class="text-xs text-rose-600">
              {{ withMedication }} con medicamento · {{ withDisabilitySupport }} con apoyos
            </p>
          </div>
        </div>
        <button
          class="p-1 rounded-md text-rose-500 hover:text-rose-700 hover:bg-rose-100 transition-colors"
          @click="printReport"
          :title="$t('common.actions.print')"
        >
          <Printer class="w-4 h-4" />
        </button>
      </div>
    </div>

    <ParticipantList type="walker"
      :columns-to-show-in-table="tableColumns"
      :columns-to-show-in-form="formShowColumns"
      :columns-to-edit-in-form="formEditColumns"
    />
  </div>
</template>
