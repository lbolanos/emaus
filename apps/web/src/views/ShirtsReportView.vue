<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRetreatStore } from '@/stores/retreatStore'
import { Input } from '@repo/ui'
import { getShirtReport } from '@/services/api'
import type { ShirtReportResponse, ShirtReportParticipant } from '@repo/types'
import { Shirt, Printer, Search, X, Users, Sparkles, Package } from 'lucide-vue-next'

const retreatStore = useRetreatStore()

const loading = ref(false)
const report = ref<ShirtReportResponse | null>(null)
const searchQuery = ref('')

const sortedShirtTypes = computed(() => report.value?.shirtTypes ?? [])

const filteredParticipants = computed<ShirtReportParticipant[]>(() => {
  const all = report.value?.participants ?? []
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return all
  return all.filter((p) => {
    const name = `${p.firstName} ${p.lastName}`.toLowerCase()
    const num = String(p.idOnRetreat ?? '')
    const sizes = p.shirts.map((s) => s.size.toLowerCase()).join(' ')
    return name.includes(q) || num.includes(q) || sizes.includes(q)
  })
})

const totals = computed(() => {
  const list = report.value?.participants ?? []
  let servers = 0
  let angelitos = 0
  let garments = 0
  for (const p of list) {
    if (p.type === 'partial_server') angelitos++
    else servers++
    garments += p.shirts.length
  }
  return { servers, angelitos, garments, total: list.length }
})

function clearSearch() {
  searchQuery.value = ''
}

function printReport() {
  window.print()
}

function getSize(participant: ShirtReportParticipant, shirtTypeId: string): string {
  return participant.shirts.find((s) => s.shirtTypeId === shirtTypeId)?.size ?? ''
}

onMounted(async () => {
  if (retreatStore.retreats.length === 0) await retreatStore.fetchRetreats()
  const retreatId =
    retreatStore.selectedRetreatId || retreatStore.mostRecentRetreat?.id
  if (!retreatId) return
  loading.value = true
  try {
    report.value = await getShirtReport(retreatId)
  } catch (e) {
    console.error('Error loading shirt report:', e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-4">
    <!-- ── Header ──────────────────────────────────────────── -->
    <div class="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
      <div class="flex flex-col sm:flex-row sm:items-center gap-4">
        <div class="flex items-center gap-3 min-w-0">
          <div class="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-100">
            <Shirt class="w-5 h-5 text-indigo-600" />
          </div>
          <div class="min-w-0">
            <h2 class="text-base font-semibold text-gray-900 leading-tight">Reporte de camisetas</h2>
            <p class="text-xs text-gray-500 mt-0.5">
              Servidores y angelitos con prendas solicitadas
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 sm:ml-auto flex-wrap">
          <div class="text-center px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100 flex items-center gap-2">
            <Users class="w-4 h-4 text-blue-500" />
            <div class="leading-tight text-left">
              <div class="text-lg font-bold text-blue-700">{{ totals.servers }}</div>
              <div class="text-[10px] text-blue-500 uppercase tracking-wide">Servidores</div>
            </div>
          </div>
          <div class="text-center px-3 py-1.5 rounded-lg bg-pink-50 border border-pink-100 flex items-center gap-2">
            <Sparkles class="w-4 h-4 text-pink-500" />
            <div class="leading-tight text-left">
              <div class="text-lg font-bold text-pink-700">{{ totals.angelitos }}</div>
              <div class="text-[10px] text-pink-500 uppercase tracking-wide">Angelitos</div>
            </div>
          </div>
          <div class="text-center px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center gap-2">
            <Package class="w-4 h-4 text-indigo-500" />
            <div class="leading-tight text-left">
              <div class="text-lg font-bold text-indigo-700">{{ totals.garments }}</div>
              <div class="text-[10px] text-indigo-500 uppercase tracking-wide">Prendas</div>
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
    </div>

    <!-- ── Table card ──────────────────────────────────────── -->
    <div class="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <!-- Toolbar -->
      <div class="px-4 py-3 border-b border-gray-100 no-print">
        <div class="relative max-w-md">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <Input
            v-model="searchQuery"
            placeholder="Buscar por nombre, número o talla..."
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
      </div>

      <!-- Loading skeleton -->
      <div v-if="loading" class="divide-y divide-gray-100">
        <div v-for="i in 6" :key="i" class="px-4 py-3 flex items-center gap-4 animate-pulse">
          <div class="w-6 h-3 bg-gray-200 rounded" />
          <div class="flex-1 h-3 bg-gray-200 rounded" />
          <div class="w-16 h-3 bg-gray-200 rounded" />
          <div class="w-8 h-6 bg-gray-200 rounded" />
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-else-if="!loading && (report?.participants.length ?? 0) === 0"
        class="px-4 py-12 text-center"
      >
        <div class="flex flex-col items-center gap-2 text-gray-400">
          <Shirt class="w-8 h-8 opacity-40" />
          <p class="text-sm font-medium">
            Ningún servidor o angelito ha pedido prendas en este retiro.
          </p>
        </div>
      </div>

      <!-- Table -->
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm shirt-report-table">
          <thead>
            <tr class="bg-gray-50/80 border-b border-gray-200 text-left">
              <th class="px-3 py-2.5 w-10 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
              <th class="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
              <th
                v-for="t in sortedShirtTypes"
                :key="t.id"
                class="px-3 py-2.5 w-24 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide"
              >
                {{ t.name }}
              </th>
              <th class="print-only px-3 py-2.5 w-12 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                ✓
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr
              v-for="participant in filteredParticipants"
              :key="participant.participantId"
              class="hover:bg-gray-50 transition-colors duration-100"
            >
              <td class="px-3 py-2.5 text-xs text-gray-400 tabular-nums font-mono">
                {{ participant.idOnRetreat ?? '—' }}
              </td>
              <td class="px-3 py-2.5">
                <span class="font-medium text-gray-900">
                  {{ participant.firstName }} {{ participant.lastName }}
                </span>
              </td>
              <td
                v-for="t in sortedShirtTypes"
                :key="t.id"
                class="px-3 py-2.5 text-center"
              >
                <span
                  v-if="getSize(participant, t.id)"
                  class="inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded text-xs font-bold bg-indigo-100 text-indigo-700"
                >
                  {{ getSize(participant, t.id) }}
                </span>
                <span v-else class="text-gray-300 text-xs">—</span>
              </td>
              <td class="print-only px-3 py-2.5 text-center">
                <span class="inline-block w-5 h-5 border-2 border-gray-300 rounded" />
              </td>
            </tr>

            <tr v-if="filteredParticipants.length === 0">
              <td :colspan="2 + sortedShirtTypes.length" class="px-4 py-12 text-center">
                <div class="flex flex-col items-center gap-2 text-gray-400">
                  <Search class="w-8 h-8 opacity-40" />
                  <p class="text-sm font-medium">Sin resultados para tu búsqueda.</p>
                  <button
                    class="text-xs text-indigo-500 hover:text-indigo-700 underline"
                    @click="clearSearch"
                  >
                    Limpiar búsqueda
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="!loading && filteredParticipants.length > 0"
        class="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between no-print"
      >
        <span class="text-xs text-gray-400">
          Mostrando {{ filteredParticipants.length }}
          <template v-if="filteredParticipants.length !== totals.total">
            de {{ totals.total }}
          </template>
          persona{{ filteredParticipants.length !== 1 ? 's' : '' }}
        </span>
        <span class="text-xs font-medium text-gray-500">
          {{ totals.garments }} prendas pedidas
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Print-only: hidden on screen, visible (table-cell/inline) only during print. */
.print-only {
  display: none;
}

@media print {
  .no-print {
    display: none !important;
  }
  .print-only {
    display: table-cell !important;
  }
  .shirt-report-table {
    font-size: 11px;
  }
  .shirt-report-table th,
  .shirt-report-table td {
    border: 1px solid #d1d5db;
    padding: 4px 6px;
  }
}
</style>
