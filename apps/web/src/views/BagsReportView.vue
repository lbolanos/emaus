<script setup lang="ts">
import { ref, computed, onMounted, watch, watchEffect } from 'vue'
import { useRetreatStore } from '@/stores/retreatStore'
import { useParticipantStore } from '@/stores/participantStore'
import { storeToRefs } from 'pinia'
import { Checkbox, Input, Progress } from '@repo/ui'
import { updateBagMade } from '@/services/api'
import {
  Droplets,
  Shirt,
  Smartphone,
  Gift,
  Mail,
  ChevronDown,
  ChevronUp,
  Printer,
  Package,
  Search,
  X,
  CheckCircle2,
  Circle,
  ListFilter,
} from 'lucide-vue-next'

// ── Checklist ────────────────────────────────────────────────
const checklistItems = [
  { id: 'agua', label: 'Agua bendita', icon: Droplets },
  { id: 'playera', label: 'Playera', icon: Shirt },
  { id: 'celulares', label: 'Celulares', icon: Smartphone },
  { id: 'palancas', label: 'Palancas', icon: Gift },
  { id: 'invitacion', label: 'Invitación para otro retiro', icon: Mail },
]

// key is per-retreat so each retreat gets its own checklist state
const currentRetreatId = ref<string | null>(null)
const checklistKey = computed(() => `bags-checklist-v1:${currentRetreatId.value ?? 'unknown'}`)

function loadChecklist(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
}

const checkedItems = ref<string[]>([])
const isAllDone = computed(() => checkedItems.value.length === checklistItems.length)
const isMinimized = ref(false)

// reload checklist when retreat changes
watch(checklistKey, key => {
  checkedItems.value = loadChecklist(key)
  isMinimized.value = false
}, { immediate: true })

// persist on every change
watchEffect(() => {
  if (currentRetreatId.value) {
    localStorage.setItem(checklistKey.value, JSON.stringify(checkedItems.value))
  }
})

// auto-collapse when all items are checked
watch(isAllDone, done => {
  if (done) isMinimized.value = true
})

function toggleItem(id: string) {
  const idx = checkedItems.value.indexOf(id)
  if (idx >= 0) checkedItems.value.splice(idx, 1)
  else checkedItems.value.push(id)
}

const checklistProgress = computed(() =>
  Math.round((checkedItems.value.length / checklistItems.length) * 100)
)

// ── Stores ────────────────────────────────────────────────────
const retreatStore = useRetreatStore()
const participantStore = useParticipantStore()
const { participants: allParticipants } = storeToRefs(participantStore)
const loading = ref(false)

const walkers = computed(() =>
  (allParticipants.value || [])
    .filter((p: any) => p.type === 'walker')
    .sort((a: any, b: any) => (a.id_on_retreat ?? 0) - (b.id_on_retreat ?? 0))
)

// ── Stats ─────────────────────────────────────────────────────
const sizeLabels: Record<string, string> = { S: 'S', M: 'M', G: 'L', X: 'XL', '2': 'XXL' }
const sizeOrder = ['S', 'M', 'G', 'X', '2']

const sizeSummary = computed(() => {
  const counts: Record<string, number> = {}
  let noSize = 0
  for (const p of walkers.value) {
    const size = (p as any).tshirtSize
    if (size && sizeLabels[size]) counts[size] = (counts[size] || 0) + 1
    else noSize++
  }
  const result = sizeOrder
    .filter(s => counts[s])
    .map(s => ({ key: s, label: sizeLabels[s], count: counts[s] }))
  if (noSize > 0) result.push({ key: 'none', label: 'Sin talla', count: noSize })
  return result
})

const totalWalkers = computed(() => walkers.value.length)
const bagsCompleted = computed(() => walkers.value.filter((p: any) => p.bagMade).length)
const bagsPending = computed(() => totalWalkers.value - bagsCompleted.value)
const bagsProgress = computed(() =>
  totalWalkers.value > 0 ? Math.round((bagsCompleted.value / totalWalkers.value) * 100) : 0
)

// ── Search & filter ───────────────────────────────────────────
const searchQuery = ref('')
type FilterTab = 'all' | 'pending' | 'done'
const activeFilter = ref<FilterTab>('all')

const filterTabs: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'done', label: 'Realizadas' },
]

const filteredWalkers = computed(() => {
  let list = walkers.value as any[]

  if (activeFilter.value === 'pending') list = list.filter(p => !p.bagMade)
  else if (activeFilter.value === 'done') list = list.filter(p => p.bagMade)

  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(p => {
      const name = `${p.firstName} ${p.lastName}`.toLowerCase()
      const mesa = (p.tableMesa?.name ?? '').toLowerCase()
      const num = String(p.id_on_retreat ?? '')
      return name.includes(q) || mesa.includes(q) || num.includes(q)
    })
  }

  return list
})

function clearSearch() {
  searchQuery.value = ''
}

// ── Bag toggle ────────────────────────────────────────────────
const updatingBag = ref<Set<string>>(new Set())

async function toggleBagMade(participant: any) {
  if (updatingBag.value.has(participant.id)) return
  const retreatId = retreatStore.selectedRetreatId || retreatStore.mostRecentRetreat?.id
  if (!retreatId) return

  updatingBag.value = new Set([...updatingBag.value, participant.id])
  const newValue = !participant.bagMade
  participant.bagMade = newValue
  try {
    await updateBagMade(retreatId, participant.id, newValue)
  } catch {
    participant.bagMade = !newValue
  } finally {
    const next = new Set(updatingBag.value)
    next.delete(participant.id)
    updatingBag.value = next
  }
}

function printReport() {
  window.print()
}

// ── Load ──────────────────────────────────────────────────────
onMounted(async () => {
  if (retreatStore.retreats.length === 0) await retreatStore.fetchRetreats()

  const retreatId = retreatStore.selectedRetreatId || retreatStore.mostRecentRetreat?.id
  if (retreatId) {
    currentRetreatId.value = retreatId
    participantStore.filters.retreatId = retreatId
    loading.value = true
    try {
      await participantStore.fetchParticipants()
    } catch (error) {
      console.error('Error loading participants:', error)
    } finally {
      loading.value = false
    }
  }
})
</script>

<template>
  <div class="space-y-4">

    <!-- ── Progress hero ───────────────────────────────────── -->
    <div class="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
      <div class="flex flex-col sm:flex-row sm:items-center gap-4">
        <!-- Left: icon + title + fraction -->
        <div class="flex items-center gap-3 min-w-0">
          <div
            class="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl"
            :class="bagsProgress === 100 ? 'bg-green-100' : 'bg-indigo-100'"
          >
            <Package class="w-5 h-5" :class="bagsProgress === 100 ? 'text-green-600' : 'text-indigo-600'" />
          </div>
          <div class="min-w-0">
            <h2 class="text-base font-semibold text-gray-900 leading-tight">Reporte de bolsas</h2>
            <p class="text-xs text-gray-500 mt-0.5">
              <span class="font-medium" :class="bagsProgress === 100 ? 'text-green-600' : 'text-indigo-600'">
                {{ bagsCompleted }}
              </span>
              <span> de {{ totalWalkers }} bolsas realizadas</span>
            </p>
          </div>
        </div>

        <!-- Right: big stats + print -->
        <div class="flex items-center gap-3 sm:ml-auto">
          <div class="flex gap-2">
            <div class="text-center px-3 py-1.5 rounded-lg bg-green-50 border border-green-100">
              <div class="text-lg font-bold text-green-700 leading-tight">{{ bagsCompleted }}</div>
              <div class="text-[10px] text-green-500 uppercase tracking-wide">listas</div>
            </div>
            <div class="text-center px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-100">
              <div class="text-lg font-bold text-amber-700 leading-tight">{{ bagsPending }}</div>
              <div class="text-[10px] text-amber-500 uppercase tracking-wide">faltan</div>
            </div>
          </div>

          <!-- Size badges -->
          <div class="hidden md:flex flex-wrap gap-1.5">
            <div
              v-for="size in sizeSummary"
              :key="size.key"
              class="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold"
              :class="size.key === 'none'
                ? 'bg-gray-100 text-gray-500'
                : 'bg-indigo-100 text-indigo-700'"
            >
              <Shirt class="w-3 h-3" />
              {{ size.label }} <span class="font-bold ml-0.5">{{ size.count }}</span>
            </div>
          </div>

          <button
            class="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors no-print"
            @click="printReport"
            title="Imprimir reporte"
          >
            <Printer class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="mt-3">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs text-gray-500">Progreso general</span>
          <span
            class="text-xs font-semibold tabular-nums"
            :class="bagsProgress === 100 ? 'text-green-600' : 'text-indigo-600'"
          >{{ bagsProgress }}%</span>
        </div>
        <Progress :model-value="bagsProgress" class="h-2" />
      </div>
    </div>

    <!-- ── Checklist card ─────────────────────────────────── -->

    <!-- Compact chip when all done and collapsed -->
    <div v-if="isAllDone && isMinimized" class="flex">
      <button
        class="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
        @click="isMinimized = false"
      >
        <CheckCircle2 class="w-3.5 h-3.5 text-green-500" />
        Contenido listo
        <ChevronDown class="w-3 h-3 text-green-400 ml-0.5" />
      </button>
    </div>

    <!-- Full checklist card -->
    <div v-else class="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl shadow-sm overflow-hidden">
      <div
        class="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        @click="isMinimized = !isMinimized"
      >
        <div class="flex items-center gap-3">
          <div class="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-lg">
            <Gift class="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-blue-900">Checklist de contenido</h3>
            <p class="text-xs text-blue-600">{{ checkedItems.length }}/{{ checklistItems.length }} listos</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="hidden sm:flex items-center gap-2">
            <div class="w-24 h-1.5 bg-blue-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-blue-600 rounded-full transition-all duration-300"
                :style="{ width: checklistProgress + '%' }"
              />
            </div>
            <span class="text-xs font-medium text-blue-600 tabular-nums">{{ checklistProgress }}%</span>
          </div>
          <component :is="isMinimized ? ChevronDown : ChevronUp" class="w-4 h-4 text-blue-400" />
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
            >{{ item.label }}</span>
          </label>
        </div>
      </div>
    </div>

    <!-- ── Table card ─────────────────────────────────────── -->
    <div class="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">

      <!-- Table toolbar -->
      <div class="px-4 py-3 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
        <!-- Search -->
        <div class="relative flex-1 min-w-0">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <Input
            v-model="searchQuery"
            placeholder="Buscar por nombre, mesa o número..."
            class="pl-8 pr-8 h-8 text-sm"
          />
          <button
            v-if="searchQuery"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            @click="clearSearch"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Filter tabs -->
        <div class="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
          <button
            v-for="tab in filterTabs"
            :key="tab.id"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            :class="activeFilter === tab.id
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'"
            @click="activeFilter = tab.id"
          >
            <CheckCircle2 v-if="tab.id === 'done'" class="w-3 h-3 text-green-500" />
            <Circle v-else-if="tab.id === 'pending'" class="w-3 h-3 text-amber-500" />
            <ListFilter v-else class="w-3 h-3" />
            {{ tab.label }}
            <span
              class="ml-0.5 tabular-nums text-[10px] rounded-full px-1.5 py-0.5"
              :class="activeFilter === tab.id ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-500'"
            >
              {{ tab.id === 'all' ? totalWalkers : tab.id === 'done' ? bagsCompleted : bagsPending }}
            </span>
          </button>
        </div>
      </div>

      <!-- Loading skeleton -->
      <div v-if="loading" class="divide-y divide-gray-100">
        <div v-for="i in 6" :key="i" class="px-4 py-3 flex items-center gap-4 animate-pulse">
          <div class="w-6 h-3 bg-gray-200 rounded" />
          <div class="flex-1 h-3 bg-gray-200 rounded" />
          <div class="w-20 h-3 bg-gray-200 rounded" />
          <div class="w-8 h-6 bg-gray-200 rounded" />
          <div class="w-7 h-7 bg-gray-200 rounded-md" />
        </div>
      </div>

      <!-- Table -->
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50/80 border-b border-gray-200 text-left">
              <th class="px-4 py-2.5 w-10 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
              <th class="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
              <th class="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Mesa</th>
              <th class="px-4 py-2.5 w-16 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Talla</th>
              <th class="px-4 py-2.5 w-32 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Bolsa</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr
              v-for="participant in filteredWalkers"
              :key="participant.id"
              class="transition-colors duration-100 group"
              :class="participant.bagMade
                ? 'bg-green-50/60 hover:bg-green-50'
                : 'hover:bg-gray-50'"
            >
              <td class="px-4 py-2.5 text-xs text-gray-400 tabular-nums font-mono">
                {{ participant.id_on_retreat ?? '—' }}
              </td>
              <td class="px-4 py-2.5">
                <div class="flex items-center gap-2">
                  <div
                    class="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    :class="participant.bagMade
                      ? 'bg-green-200 text-green-700'
                      : 'bg-gray-100 text-gray-500'"
                  >
                    {{ participant.firstName?.[0] }}{{ participant.lastName?.[0] }}
                  </div>
                  <span
                    class="font-medium leading-tight"
                    :class="participant.bagMade ? 'text-green-800' : 'text-gray-900'"
                  >
                    {{ participant.firstName }} {{ participant.lastName }}
                  </span>
                </div>
              </td>
              <td class="px-4 py-2.5 text-gray-500 text-xs">
                {{ participant.tableMesa?.name ?? '—' }}
              </td>
              <td class="px-4 py-2.5 text-center">
                <span
                  v-if="participant.tshirtSize"
                  class="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold"
                  :class="participant.bagMade
                    ? 'bg-green-100 text-green-700'
                    : 'bg-indigo-100 text-indigo-700'"
                >
                  {{ sizeLabels[participant.tshirtSize] ?? participant.tshirtSize }}
                </span>
                <span v-else class="text-gray-300 text-xs">—</span>
              </td>
              <td class="px-4 py-2.5 text-center">
                <button
                  class="inline-flex items-center justify-center w-8 h-8 rounded-lg border-2 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1"
                  :class="[
                    participant.bagMade
                      ? 'bg-green-500 border-green-500 text-white hover:bg-green-600 hover:border-green-600 focus:ring-green-400'
                      : 'bg-white border-gray-200 text-gray-300 hover:border-green-300 hover:bg-green-50 focus:ring-green-300 group-hover:border-gray-300',
                    updatingBag.has(participant.id) ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                  ]"
                  :disabled="updatingBag.has(participant.id)"
                  :title="participant.bagMade ? 'Desmarcar' : 'Marcar como realizada'"
                  @click="toggleBagMade(participant)"
                >
                  <!-- Spinner while updating -->
                  <svg
                    v-if="updatingBag.has(participant.id)"
                    class="w-4 h-4 animate-spin"
                    :class="participant.bagMade ? 'text-white' : 'text-gray-400'"
                    fill="none" viewBox="0 0 24 24"
                  >
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <!-- Checkmark -->
                  <svg
                    v-else-if="participant.bagMade"
                    class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                  </svg>
                </button>
              </td>
            </tr>

            <!-- No results from search/filter -->
            <tr v-if="filteredWalkers.length === 0 && !loading">
              <td colspan="5" class="px-4 py-12 text-center">
                <div class="flex flex-col items-center gap-2 text-gray-400">
                  <Search class="w-8 h-8 opacity-40" />
                  <p class="text-sm font-medium">
                    {{ searchQuery ? 'Sin resultados para tu búsqueda' : 'No hay caminantes en este filtro' }}
                  </p>
                  <button
                    v-if="searchQuery || activeFilter !== 'all'"
                    class="text-xs text-indigo-500 hover:text-indigo-700 underline"
                    @click="searchQuery = ''; activeFilter = 'all'"
                  >
                    Limpiar filtros
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Table footer -->
      <div
        v-if="!loading && filteredWalkers.length > 0"
        class="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between"
      >
        <span class="text-xs text-gray-400">
          Mostrando {{ filteredWalkers.length }}
          <template v-if="filteredWalkers.length !== totalWalkers"> de {{ totalWalkers }}</template>
          caminante{{ filteredWalkers.length !== 1 ? 's' : '' }}
        </span>
        <span class="text-xs font-medium" :class="bagsProgress === 100 ? 'text-green-600' : 'text-gray-500'">
          {{ bagsCompleted }}/{{ totalWalkers }} bolsas · {{ bagsProgress }}%
        </span>
      </div>
    </div>

  </div>
</template>
