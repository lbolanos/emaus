<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRetreatStore } from '@/stores/retreatStore'
import { useReceptionStore } from '@/stores/receptionStore'
import { getReceptionStats, checkInParticipant, type ReceptionParticipant } from '@/services/api'
import { useToast } from '@repo/ui'
import { CheckCircle, Clock, Users, Search, Loader2, RotateCcw, X, AlertCircle } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'

const route = useRoute()
const { t } = useI18n()
const retreatStore = useRetreatStore()
const { selectedRetreat } = storeToRefs(retreatStore)
const receptionStore = useReceptionStore()
const { toast } = useToast()

const retreatId = computed(() => {
  const id = route.params.id as string
  return id || selectedRetreat.value?.id || retreatStore.mostRecentRetreat?.id || ''
})

// ── Arrival time logic ─────────────────────────────────────────────────────

const now = ref(new Date())
let clockInterval: ReturnType<typeof setInterval> | null = null

/** Parse "HH:MM:SS" or "HH:MM" into { h, m } */
function parseTime(raw: string | null | undefined): { h: number; m: number } | null {
  if (!raw) return null
  const parts = String(raw).split(':').map(Number)
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null
  return { h: parts[0], m: parts[1] }
}

/** Return true if today (local) matches the retreat start date.
 *  Extracts YYYY-MM-DD from the stored value to avoid UTC-vs-local timezone mismatch. */
const isRetreatDay = computed(() => {
  const start = selectedRetreat.value?.startDate
  if (!start) return false
  // The date may arrive as "2026-04-22", "2026-04-22T00:00:00.000Z", or a Date object
  const iso = typeof start === 'string' ? start : new Date(start).toISOString()
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const t = now.value
  return y === t.getFullYear() && m === t.getMonth() + 1 && d === t.getDate()
})

/** Minutes elapsed since the expected arrival time (negative = still in the future) */
const minutesDelta = computed((): number | null => {
  if (!isRetreatDay.value) return null
  const parsed = parseTime(selectedRetreat.value?.walkerArrivalTime as any)
  if (!parsed) return null
  const arrivalMinutes = parsed.h * 60 + parsed.m
  const nowMinutes = now.value.getHours() * 60 + now.value.getMinutes()
  return nowMinutes - arrivalMinutes
})

/** Formatted "HH:MM" label for the expected arrival time */
const arrivalTimeLabel = computed(() => {
  const parsed = parseTime(selectedRetreat.value?.walkerArrivalTime as any)
  if (!parsed) return null
  return `${String(parsed.h).padStart(2, '0')}:${String(parsed.m).padStart(2, '0')}`
})

/** Color class for the elapsed badge */
const deltaClass = computed(() => {
  const d = minutesDelta.value
  if (d === null) return ''
  if (d < 0) return 'text-blue-600 dark:text-blue-400'   // not yet
  if (d <= 30) return 'text-amber-600 dark:text-amber-400' // just started
  return 'text-red-600 dark:text-red-400'                  // late
})

/** Human label for elapsed / remaining */
const deltaLabel = computed(() => {
  const d = minutesDelta.value
  if (d === null) return null
  if (d === 0) return 'ahora'
  if (d < 0) return `en ${Math.abs(d)} min`
  return `hace ${d} min`
})

// ── Stats ──────────────────────────────────────────────────────────────────

const loading = ref(true)
const total = ref(0)
const arrived = ref(0)
const pending = ref(0)
const pendingList = ref<ReceptionParticipant[]>([])
const arrivedList = ref<ReceptionParticipant[]>([])
const searchQuery = ref('')
const searchArrivedQuery = ref('')
const processingIds = ref<Set<string>>(new Set())
const showArrived = ref(false)

let unsubscribeRealtime: (() => void) | null = null

async function fetchStats() {
  if (!retreatId.value) return
  try {
    const stats = await getReceptionStats(retreatId.value)
    total.value = stats.total
    arrived.value = stats.arrived
    pending.value = stats.pending
    pendingList.value = stats.pendingList
    arrivedList.value = stats.arrivedList
    receptionStore.setPending(stats.pending)
  } catch {
    // silent on poll errors
  } finally {
    loading.value = false
  }
}

async function markArrived(participant: ReceptionParticipant, checkedIn: boolean) {
  if (!participant.participantId) return
  const key = participant.participantId
  processingIds.value = new Set([...processingIds.value, key])
  try {
    await checkInParticipant(participant.participantId, retreatId.value, checkedIn)
    await fetchStats()
    if (checkedIn) {
      toast({ title: t('reception.markedArrived', { name: `${participant.firstName} ${participant.lastName}` }) })
    }
  } catch {
    toast({ title: t('reception.updateError'), variant: 'destructive' })
  } finally {
    const next = new Set(processingIds.value)
    next.delete(key)
    processingIds.value = next
  }
}

// ── Filtering ──────────────────────────────────────────────────────────────

function matchesQuery(p: ReceptionParticipant, q: string): boolean {
  return (
    p.firstName.toLowerCase().includes(q) ||
    p.lastName.toLowerCase().includes(q) ||
    String(p.idOnRetreat ?? '').includes(q)
  )
}

const filteredPending = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  return q ? pendingList.value.filter(p => matchesQuery(p, q)) : pendingList.value
})

const filteredArrived = computed(() => {
  const q = searchArrivedQuery.value.toLowerCase().trim()
  return q ? arrivedList.value.filter(p => matchesQuery(p, q)) : arrivedList.value
})

const progressPercent = computed(() =>
  total.value > 0 ? Math.round((arrived.value / total.value) * 100) : 0,
)

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

async function loadForRetreat(id: string) {
  if (!id) return
  loading.value = true
  // Reset visible state so stale data from the previous retreat does not flash
  total.value = 0
  arrived.value = 0
  pending.value = 0
  pendingList.value = []
  arrivedList.value = []

  if (!selectedRetreat.value || selectedRetreat.value.id !== id || !selectedRetreat.value.walkerArrivalTime) {
    await retreatStore.fetchRetreat(id)
  }
  await fetchStats()

  if (unsubscribeRealtime) {
    unsubscribeRealtime()
    unsubscribeRealtime = null
  }
  unsubscribeRealtime = receptionStore.subscribeRealtime(id, {
    onCheckin: () => { fetchStats() },
    onBagMade: () => { fetchStats() },
  })
}

onMounted(async () => {
  await loadForRetreat(retreatId.value)
  clockInterval = setInterval(() => { now.value = new Date() }, 30_000)
})

watch(retreatId, async (id, prev) => {
  if (id && id !== prev) {
    await loadForRetreat(id)
  }
})

onUnmounted(() => {
  if (unsubscribeRealtime) unsubscribeRealtime()
  if (clockInterval) clearInterval(clockInterval)
})
</script>

<template>
  <div class="p-4 max-w-3xl mx-auto space-y-6">

    <!-- Header with expected arrival time -->
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <h1 class="text-2xl font-bold">{{ t('reception.title') }}</h1>

      <div v-if="arrivalTimeLabel" class="flex items-center gap-2 flex-wrap">
        <div class="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">
          <Clock class="w-4 h-4 shrink-0" />
          <span>{{ t('reception.expectedArrival') }}: <strong class="text-foreground">{{ arrivalTimeLabel }}</strong></span>
        </div>
        <!-- Elapsed / remaining badge — only on retreat day -->
        <div v-if="deltaLabel !== null" :class="['flex items-center gap-1 text-sm font-medium px-2.5 py-1.5 rounded-lg bg-muted', deltaClass]">
          <Clock class="w-3.5 h-3.5 shrink-0" />
          {{ deltaLabel }}
        </div>
      </div>
    </div>

    <!-- Dashboard cards -->
    <div class="grid grid-cols-3 gap-4">
      <div class="rounded-xl border bg-card p-4 text-center space-y-1">
        <div class="flex justify-center text-muted-foreground"><Users class="w-5 h-5" /></div>
        <p class="text-3xl font-bold">{{ total }}</p>
        <p class="text-sm text-muted-foreground">{{ t('reception.total') }}</p>
      </div>
      <div class="rounded-xl border bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 p-4 text-center space-y-1">
        <div class="flex justify-center text-green-600 dark:text-green-400"><CheckCircle class="w-5 h-5" /></div>
        <p class="text-3xl font-bold text-green-700 dark:text-green-300">{{ arrived }}</p>
        <p class="text-sm text-green-600 dark:text-green-400">{{ t('reception.arrived') }}</p>
      </div>
      <div class="rounded-xl border bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 p-4 text-center space-y-1">
        <div class="flex justify-center text-amber-600 dark:text-amber-400"><Clock class="w-5 h-5" /></div>
        <p class="text-3xl font-bold text-amber-700 dark:text-amber-300">{{ pending }}</p>
        <p class="text-sm text-amber-600 dark:text-amber-400">{{ t('reception.pending') }}</p>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="space-y-1">
      <div class="flex justify-between text-sm text-muted-foreground">
        <span>{{ t('reception.progressLabel') }}</span>
        <span>{{ progressPercent }}%</span>
      </div>
      <div class="w-full bg-muted rounded-full h-3">
        <div
          class="bg-green-500 h-3 rounded-full transition-all duration-500"
          :style="{ width: `${progressPercent}%` }"
        />
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="flex justify-center py-10">
      <Loader2 class="w-8 h-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <!-- Search pending -->
      <div class="relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="t('reception.searchPlaceholder')"
          class="w-full pl-9 pr-9 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          v-if="searchQuery"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          @click="searchQuery = ''"
          :aria-label="t('reception.clearSearch')"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Pending list -->
      <div>
        <h2 class="font-semibold text-lg mb-3 flex items-center gap-2">
          <Clock class="w-4 h-4 text-amber-500" />
          {{ t('reception.pendingSection') }}
          <span class="text-sm font-normal text-muted-foreground">({{ filteredPending.length }})</span>
        </h2>

        <div v-if="filteredPending.length === 0 && !searchQuery" class="text-center text-muted-foreground py-8">
          <CheckCircle class="w-10 h-10 mx-auto mb-2 text-green-500" />
          <p class="font-medium">{{ t('reception.allArrived') }}</p>
        </div>
        <div v-else-if="filteredPending.length === 0 && searchQuery" class="text-center text-muted-foreground py-6">
          <p class="text-sm">Sin resultados para "{{ searchQuery }}"</p>
        </div>

        <ul v-else class="divide-y rounded-lg border overflow-hidden">
          <li
            v-for="p in filteredPending"
            :key="p.retreatParticipantId"
            class="flex items-center justify-between gap-3 px-4 py-3 bg-card hover:bg-muted/50 transition-colors"
          >
            <div class="flex items-center gap-3 min-w-0">
              <span class="text-xs text-muted-foreground w-6 text-right shrink-0">{{ p.idOnRetreat ?? '—' }}</span>
              <span class="font-medium truncate">{{ p.firstName }} {{ p.lastName }}</span>
              <span v-if="p.cellPhone" class="text-xs text-muted-foreground hidden sm:inline">{{ p.cellPhone }}</span>
            </div>

            <!-- No participantId: warn instead of silently doing nothing -->
            <span
              v-if="!p.participantId"
              class="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs text-amber-600 border border-amber-300 rounded-lg bg-amber-50 dark:bg-amber-950/40"
              title="Este registro no tiene participante vinculado"
            >
              <AlertCircle class="w-3 h-3" />
              Sin vínculo
            </span>
            <button
              v-else
              class="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              :disabled="processingIds.has(p.participantId)"
              @click="markArrived(p, true)"
            >
              <Loader2 v-if="processingIds.has(p.participantId)" class="w-3 h-3 animate-spin" />
              <CheckCircle v-else class="w-3 h-3" />
              {{ t('reception.arrivedButton') }}
            </button>
          </li>
        </ul>
      </div>

      <!-- Arrived list (collapsible + searchable) -->
      <div v-if="arrivedList.length > 0">
        <button
          class="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2 w-full"
          @click="showArrived = !showArrived"
        >
          <CheckCircle class="w-4 h-4 text-green-500" />
          {{ t('reception.arrivedSection') }} ({{ arrivedList.length }})
          <span class="text-xs ml-auto">{{ showArrived ? '▲' : '▼' }}</span>
        </button>

        <template v-if="showArrived">
          <!-- Search inside arrived -->
          <div class="relative mb-2">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              v-model="searchArrivedQuery"
              type="text"
              :placeholder="t('reception.searchPlaceholder')"
              class="w-full pl-9 pr-9 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              v-if="searchArrivedQuery"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              @click="searchArrivedQuery = ''"
              :aria-label="t('reception.clearSearch')"
            >
              <X class="w-4 h-4" />
            </button>
          </div>

          <div v-if="filteredArrived.length === 0" class="text-center text-sm text-muted-foreground py-4">
            Sin resultados para "{{ searchArrivedQuery }}"
          </div>

          <ul v-else class="divide-y rounded-lg border overflow-hidden">
            <li
              v-for="p in filteredArrived"
              :key="p.retreatParticipantId"
              class="flex items-center justify-between gap-3 px-4 py-3 bg-green-50 dark:bg-green-950/30"
            >
              <div class="flex items-center gap-3 min-w-0">
                <span class="text-xs text-muted-foreground w-6 text-right shrink-0">{{ p.idOnRetreat ?? '—' }}</span>
                <CheckCircle class="w-4 h-4 text-green-500 shrink-0" />
                <span class="font-medium truncate">{{ p.firstName }} {{ p.lastName }}</span>
                <span v-if="p.checkedInAt" class="text-xs text-muted-foreground hidden sm:inline">
                  {{ formatTime(p.checkedInAt) }}
                </span>
              </div>
              <button
                class="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground border hover:border-foreground transition-colors disabled:opacity-50"
                :disabled="!p.participantId || processingIds.has(p.participantId ?? '')"
                @click="markArrived(p, false)"
                :title="t('reception.undoTitle')"
              >
                <RotateCcw class="w-3 h-3" />
                {{ t('reception.undoButton') }}
              </button>
            </li>
          </ul>
        </template>
      </div>
    </template>
  </div>
</template>
