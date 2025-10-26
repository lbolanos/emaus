<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRetreatStore } from '@/stores/retreatStore'
import { useParticipantStore } from '@/stores/participantStore'
import ParticipantList from '@/components/ParticipantList.vue'

const tableColumns = ['id_on_retreat', 'firstName', 'lastName', 'tableMesa.name', 'tshirtSize'];
const formShowColumns = ['id_on_retreat', 'firstName', 'lastName', 'tableMesa.name', 'tshirtSize'];
const nonEditableColumns = ['id_on_retreat', 'firstName', 'lastName', 'tableMesa.name', 'tshirtSize'];
const formEditColumns = tableColumns.filter(c => !nonEditableColumns.includes(c));

const isMinimized = ref(false)
const items = [
  'Agua bendita',
  'Playera',
  'Celulares',
  'Palancas',
  'Invitación para otro retiro'
]

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
  <div class="space-y-6">
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-base font-semibold text-blue-800">Recordatorio para la maleta</h3>
        <button
          @click="isMinimized = !isMinimized"
          class="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          {{ isMinimized ? 'Mostrar' : 'Minimizar' }}
        </button>
      </div>

      <div v-if="!isMinimized" class="grid grid-cols-2 md:grid-cols-3 gap-2">
        <div v-for="item in items" :key="item" class="flex items-center text-blue-700 text-sm">
          <span class="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2 flex-shrink-0"></span>
          {{ item }}
        </div>
      </div>
    </div>

    <ParticipantList type="walker"
      :columns-to-show-in-table="tableColumns"
      :columns-to-show-in-form="formShowColumns"
      :columns-to-edit-in-form="formEditColumns"
      :default-filters="{}"
    />
  </div>
</template>