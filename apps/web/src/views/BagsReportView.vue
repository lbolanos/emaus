<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRetreatStore } from '@/stores/retreatStore'
import { useParticipantStore } from '@/stores/participantStore'
import { storeToRefs } from 'pinia'
import ParticipantList from '@/components/ParticipantList.vue'
import { Checkbox } from '@repo/ui'
import {
  Droplets,
  Shirt,
  Smartphone,
  Gift,
  Mail,
  ChevronDown,
  ChevronUp,
  Printer,
} from 'lucide-vue-next'

const tableColumns = ['id_on_retreat', 'firstName', 'lastName', 'tableMesa.name', 'tshirtSize']
const formShowColumns = ['id_on_retreat', 'firstName', 'lastName', 'tableMesa.name', 'tshirtSize']
const nonEditableColumns = ['id_on_retreat', 'firstName', 'lastName', 'tableMesa.name', 'tshirtSize']
const formEditColumns = tableColumns.filter(c => !nonEditableColumns.includes(c))

const isMinimized = ref(false)

const checklistItems = [
  { id: 'agua', label: 'Agua bendita', icon: Droplets },
  { id: 'playera', label: 'Playera', icon: Shirt },
  { id: 'celulares', label: 'Celulares', icon: Smartphone },
  { id: 'palancas', label: 'Palancas', icon: Gift },
  { id: 'invitacion', label: 'Invitación para otro retiro', icon: Mail },
]

const checkedItems = ref<string[]>([])

function toggleItem(id: string) {
  const idx = checkedItems.value.indexOf(id)
  if (idx >= 0) {
    checkedItems.value.splice(idx, 1)
  } else {
    checkedItems.value.push(id)
  }
}

const retreatStore = useRetreatStore()
const participantStore = useParticipantStore()
const { participants: allParticipants } = storeToRefs(participantStore)

const walkers = computed(() =>
  (allParticipants.value || []).filter((p: any) => p.type === 'walker')
)

// T-shirt size summary
const sizeLabels: Record<string, string> = {
  S: 'S',
  M: 'M',
  G: 'L',
  X: 'XL',
  '2': 'XXL',
}

const sizeOrder = ['S', 'M', 'G', 'X', '2']

const sizeSummary = computed(() => {
  const counts: Record<string, number> = {}
  let noSize = 0
  for (const p of walkers.value) {
    const size = (p as any).tshirtSize
    if (size && sizeLabels[size]) {
      counts[size] = (counts[size] || 0) + 1
    } else {
      noSize++
    }
  }
  const result = sizeOrder
    .filter(s => counts[s])
    .map(s => ({ key: s, label: sizeLabels[s], count: counts[s] }))
  if (noSize > 0) {
    result.push({ key: 'none', label: 'Sin talla', count: noSize })
  }
  return result
})

const totalWalkers = computed(() => walkers.value.length)

const checklistProgress = computed(() => {
  return Math.round((checkedItems.value.length / checklistItems.length) * 100)
})

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
    <!-- Checklist Card -->
    <div class="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl shadow-sm overflow-hidden">
      <div
        class="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        @click="isMinimized = !isMinimized"
      >
        <div class="flex items-center gap-3">
          <div class="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-lg">
            <Gift class="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-blue-900">Checklist para las bolsas</h3>
            <p class="text-xs text-blue-600">
              {{ checkedItems.length }}/{{ checklistItems.length }} listos
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <!-- Progress bar -->
          <div class="hidden sm:flex items-center gap-2">
            <div class="w-24 h-1.5 bg-blue-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-blue-600 rounded-full transition-all duration-300"
                :style="{ width: checklistProgress + '%' }"
              />
            </div>
            <span class="text-xs font-medium text-blue-600 tabular-nums">{{ checklistProgress }}%</span>
          </div>
          <button
            class="p-1 rounded-md text-blue-500 hover:text-blue-700 hover:bg-blue-100 transition-colors"
            @click.stop="printReport"
            title="Imprimir"
          >
            <Printer class="w-4 h-4" />
          </button>
          <component
            :is="isMinimized ? ChevronDown : ChevronUp"
            class="w-4 h-4 text-blue-400"
          />
        </div>
      </div>

      <div v-if="!isMinimized" class="px-4 pb-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <label
            v-for="item in checklistItems"
            :key="item.id"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all cursor-pointer"
            :class="checkedItems.includes(item.id)
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50/50'"
          >
            <Checkbox
              :model-value="checkedItems.includes(item.id)"
              @update:model-value="toggleItem(item.id)"
              class="flex-shrink-0"
            />
            <component
              :is="item.icon"
              class="w-4 h-4 flex-shrink-0"
              :class="checkedItems.includes(item.id) ? 'text-green-500' : 'text-gray-400'"
            />
            <span
              class="text-sm font-medium"
              :class="checkedItems.includes(item.id) ? 'line-through text-green-600' : ''"
            >
              {{ item.label }}
            </span>
          </label>
        </div>
      </div>
    </div>

    <!-- Size Summary Cards -->
    <div v-if="sizeSummary.length > 0" class="flex flex-wrap gap-3">
      <div
        v-for="size in sizeSummary"
        :key="size.key"
        class="flex items-center gap-2.5 px-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm"
      >
        <div
          class="flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm"
          :class="size.key === 'none'
            ? 'bg-gray-100 text-gray-500'
            : 'bg-indigo-100 text-indigo-700'"
        >
          {{ size.label }}
        </div>
        <div class="flex flex-col">
          <span class="text-lg font-bold text-gray-900 leading-tight">{{ size.count }}</span>
          <span class="text-[10px] text-gray-500 uppercase tracking-wider">playeras</span>
        </div>
      </div>

      <!-- Total -->
      <div class="flex items-center gap-2.5 px-4 py-2.5 bg-indigo-600 text-white rounded-xl shadow-sm">
        <Shirt class="w-5 h-5 opacity-80" />
        <div class="flex flex-col">
          <span class="text-lg font-bold leading-tight">{{ totalWalkers }}</span>
          <span class="text-[10px] uppercase tracking-wider opacity-80">total</span>
        </div>
      </div>
    </div>

    <!-- Participant List -->
    <ParticipantList
      type="walker"
      :columns-to-show-in-table="tableColumns"
      :columns-to-show-in-form="formShowColumns"
      :columns-to-edit-in-form="formEditColumns"
      :default-filters="{}"
    />
  </div>
</template>
