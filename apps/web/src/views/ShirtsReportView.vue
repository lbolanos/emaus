<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRetreatStore } from '@/stores/retreatStore'
import { useParticipantStore } from '@/stores/participantStore'
import {
  Input,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  useToast,
} from '@repo/ui'
import { formatCurrency } from '@repo/utils'
import {
  getShirtReport,
  updateShirtOrderConfirmation,
  setShirtOrderEstimate,
} from '@/services/api'
import { buildWhatsAppChatLink } from '@/utils/phone'
import { useAuthPermissions } from '@/composables/useAuthPermissions'
import MessageDialog from '@/components/MessageDialog.vue'
import type {
  Participant,
  ShirtReportResponse,
  ShirtReportParticipant,
  ShirtReportShirtType,
  ShirtOrderEstimate,
} from '@repo/types'
import {
  Shirt,
  Printer,
  Search,
  X,
  Users,
  Sparkles,
  Package,
  PackageCheck,
  Wallet,
  MessageSquare,
  Send,
  Copy,
  Calculator,
} from 'lucide-vue-next'

const retreatStore = useRetreatStore()
const participantStore = useParticipantStore()
const { toast } = useToast()
const { can } = useAuthPermissions()

const loading = ref(false)
const report = ref<ShirtReportResponse | null>(null)
const searchQuery = ref('')
const onlyUnconfirmed = ref(false)
// Universo = todo el equipo servidor; este chip estrecha a quienes pidieron
// ≥1 prenda (la confirmación también aplica a quien responde "no necesito").
const onlyRequiring = ref(false)
const currentRetreatId = ref<string | null>(null)
// Guard anti doble-tap por participante (patrón toggleAttendance).
const savingStates = ref<Record<string, boolean>>({})
// Botón "enviar mensaje": guard anti doble-tap mientras se hidrata la ficha.
const sendingStates = ref<Record<string, boolean>>({})
const messageDialogOpen = ref(false)
const messageParticipant = ref<Participant | null>(null)
// Captured at click time: if the retreat changes while the participant list
// loads, the dialog must not open mixing the old retreat's participant with
// the new retreat's id.
const messageRetreatId = ref<string | null>(null)

const sortedShirtTypes = computed(() => report.value?.shirtTypes ?? [])

const filteredParticipants = computed<ShirtReportParticipant[]>(() => {
  const all = report.value?.participants ?? []
  const q = searchQuery.value.trim().toLowerCase()
  let list = all
  if (onlyRequiring.value) {
    list = list.filter((p) => p.shirts.length > 0)
  }
  if (onlyUnconfirmed.value) {
    list = list.filter((p) => !p.shirtOrderConfirmedAt)
  }
  if (!q) return list
  return list.filter((p) => {
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
  let confirmed = 0
  let requiring = 0
  for (const p of list) {
    if (p.type === 'partial_server') angelitos++
    else servers++
    garments += p.shirts.length
    if (p.shirtOrderConfirmedAt) confirmed++
    if (p.shirts.length > 0) requiring++
  }
  return { servers, angelitos, garments, confirmed, requiring, total: list.length }
})

const totalCharge = computed(() => report.value?.totalCharge ?? 0)

// ── Purchase summary (pedido al proveedor) ──────────────────────────────────
// Counts over the WHOLE team like the header cards — search and chips never
// move it: it is the list that gets bought.

// Same fallback the walker registration uses when a type has no sizes set.
const FALLBACK_SIZES = ['S', 'M', 'G', 'X', '2']

/** shirtTypeId → size → pieces */
type SizeCounts = Record<string, Record<string, number>>
type SummaryRow = {
  id: string
  name: string
  total: number
  sizes: { size: string; count: number }[]
}

function sizesOf(type: ShirtReportShirtType): string[] {
  return type.availableSizes?.length ? type.availableSizes : FALLBACK_SIZES
}

// A walker wears one garment: the type flagged requiredForWalkers. With none
// flagged it gets a row of its own instead of being merged into a server
// garment it may not be (the purchase would then be wrong without anyone
// noticing); flagging the type in Tipos de camiseta merges it.
const WALKER_SHIRT_ID = '__walker__'
const walkerGarmentFlagged = computed(() =>
  sortedShirtTypes.value.find((t) => t.requiredForWalkers),
)
const walkerGarment = computed<ShirtReportShirtType>(
  () =>
    walkerGarmentFlagged.value ?? {
      id: WALKER_SHIRT_ID,
      name: 'Camiseta de caminante',
      color: null,
      sortOrder: Number.MAX_SAFE_INTEGER,
      price: null,
      availableSizes: null,
      requiredForWalkers: true,
    },
)
const summaryTypes = computed(() =>
  walkerGarmentFlagged.value
    ? sortedShirtTypes.value
    : [...sortedShirtTypes.value, walkerGarment.value],
)

function addCount(acc: SizeCounts, typeId: string, size: string, pieces: number) {
  if (!pieces) return
  if (!acc[typeId]) acc[typeId] = {}
  acc[typeId][size] = (acc[typeId][size] ?? 0) + pieces
}

// One row per garment type (column order), sizes in the type's configured
// order — not in the order of whoever happened to order first.
function summarize(counts: SizeCounts): SummaryRow[] {
  return summaryTypes.value.flatMap((type) => {
    const bySize = counts[type.id]
    if (!bySize) return []
    const order = sizesOf(type)
    const rank = (size: string) => {
      const i = order.indexOf(size)
      return i === -1 ? order.length : i
    }
    const sizes = Object.entries(bySize)
      .filter(([, count]) => count > 0)
      .map(([size, count]) => ({ size, count }))
      .sort((a, b) => rank(a.size) - rank(b.size) || a.size.localeCompare(b.size))
    const total = sizes.reduce((sum, s) => sum + s.count, 0)
    return total > 0 ? [{ id: type.id, name: type.name, total, sizes }] : []
  })
}

const serverCounts = computed<SizeCounts>(() => {
  const acc: SizeCounts = {}
  for (const p of report.value?.participants ?? []) {
    for (const s of p.shirts) addCount(acc, s.shirtTypeId, s.size, 1)
  }
  return acc
})

const walkerCounts = computed<SizeCounts>(() => {
  const acc: SizeCounts = {}
  for (const w of report.value?.walkerShirts ?? []) {
    addCount(acc, walkerGarment.value.id, w.size, w.count)
  }
  return acc
})

const estimateCounts = computed<SizeCounts>(() => {
  const acc: SizeCounts = {}
  const bySize = report.value?.estimate?.estimatedShirts ?? {}
  for (const [size, pieces] of Object.entries(bySize)) {
    addCount(acc, walkerGarment.value.id, size, pieces)
  }
  return acc
})

const walkerCount = computed(() => report.value?.walkerCount ?? 0)
const expectedWalkers = computed(() => report.value?.estimate?.expectedWalkers ?? null)

function piecesLabel(n: number): string {
  return `${n} pieza${n === 1 ? '' : 's'}`
}

const orderSections = computed(() => {
  const servers = summarize(serverCounts.value)
  const walkers = summarize(walkerCounts.value)
  const estimate = summarize(estimateCounts.value)
  const missing =
    expectedWalkers.value != null ? Math.max(expectedWalkers.value - walkerCount.value, 0) : null
  const sections = [
    {
      key: 'servers',
      emoji: '👥',
      title: 'Equipo servidor',
      note: `${totals.value.requiring} de ${totals.value.total} personas`,
      rows: servers,
      visible: servers.length > 0,
    },
    {
      key: 'walkers',
      emoji: '🚶',
      title: 'Caminantes inscritos',
      note:
        `${walkerCount.value} inscritos` +
        (expectedWalkers.value != null ? `, se esperan ${expectedWalkers.value}` : ''),
      rows: walkers,
      visible: walkers.length > 0 || walkerCount.value > 0,
    },
    {
      key: 'estimate',
      emoji: '➕',
      title: 'Estimado de caminantes faltantes',
      note: missing != null ? `faltan ~${missing}` : '',
      rows: estimate,
      visible: estimate.length > 0 || expectedWalkers.value != null,
    },
  ]
  return sections.map((s) => ({ ...s, total: s.rows.reduce((sum, r) => sum + r.total, 0) }))
})

const visibleSections = computed(() => orderSections.value.filter((s) => s.visible))

// What actually gets bought: the three sections merged per type × size.
const orderTotalRows = computed(() => {
  const merged: SizeCounts = {}
  for (const counts of [serverCounts.value, walkerCounts.value, estimateCounts.value]) {
    for (const [typeId, bySize] of Object.entries(counts)) {
      for (const [size, pieces] of Object.entries(bySize)) addCount(merged, typeId, size, pieces)
    }
  }
  return summarize(merged)
})

const orderTotalPieces = computed(() => orderTotalRows.value.reduce((sum, r) => sum + r.total, 0))

// The merged block only adds information when more than one source has pieces.
const showMergedTotal = computed(
  () => orderSections.value.filter((s) => s.rows.length > 0).length > 1,
)

function summaryLine(row: SummaryRow): string {
  return `- ${row.name} (${row.total}): ${row.sizes.map((s) => `${s.size}×${s.count}`).join(', ')}`
}

// WhatsApp text for the supplier: single-asterisk bold, "-" bullets, no prices
// (the supplier is asked for pieces; prices are what servers get charged).
function buildOrderSummaryText(): string {
  const parish = retreatStore.retreats.find((r) => r.id === currentRetreatId.value)?.parish
  const lines = [`*Pedido de prendas — ${parish || 'retiro'}* 👕`]
  for (const section of orderSections.value) {
    if (section.rows.length === 0) continue
    lines.push('', `${section.emoji} *${section.title}* (${section.note || piecesLabel(section.total)})`)
    lines.push(...section.rows.map(summaryLine))
  }
  if (showMergedTotal.value) {
    lines.push('', '📦 *Total a pedir*', ...orderTotalRows.value.map(summaryLine))
  }
  lines.push('', `*Total: ${piecesLabel(orderTotalPieces.value)}*`)
  return lines.join('\n')
}

async function copyOrderSummary() {
  try {
    await navigator.clipboard.writeText(buildOrderSummaryText())
    toast({ title: 'Resumen copiado', description: 'Listo para pegar en WhatsApp' })
  } catch (e) {
    console.error('Error copying order summary:', e)
    toast({
      title: 'Error',
      description: 'No se pudo copiar el resumen',
      variant: 'destructive',
    })
  }
}

// ── Walker estimate dialog ──────────────────────────────────────────────────
// "10 registered, 40 expected": the coordinator estimates the missing walkers'
// sizes so the purchase covers them. Saved per retreat (survives reloads and
// shows up on the printed report).

const canEstimate = computed(() => can.update('retreat'))
const estimateDialogOpen = ref(false)
const savingEstimate = ref(false)
// Inputs hold strings while typing; parsed on save.
const estimateExpected = ref<string | number>('')
const estimateDraft = ref<Record<string, string | number>>({})

// The garment's sizes, plus any size already in use by registered walkers or a
// saved estimate (legacy imports can carry sizes the type does not list).
const estimateSizes = computed<string[]>(() => {
  const sizes = [...sizesOf(walkerGarment.value)]
  const seen = [
    ...Object.keys(walkerCounts.value[walkerGarment.value.id] ?? {}),
    ...Object.keys(report.value?.estimate?.estimatedShirts ?? {}),
  ]
  for (const size of seen) if (!sizes.includes(size)) sizes.push(size)
  return sizes
})

function toCount(value: string | number | null | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

const draftMissing = computed(() => {
  if (String(estimateExpected.value).trim() === '') return null
  return Math.max(toCount(estimateExpected.value) - walkerCount.value, 0)
})

const draftPieces = computed(() =>
  Object.values(estimateDraft.value).reduce<number>((sum, v) => sum + toCount(v), 0),
)

function openEstimateDialog() {
  const saved = report.value?.estimate
  estimateExpected.value = saved?.expectedWalkers ?? ''
  const draft: Record<string, string | number> = {}
  for (const size of estimateSizes.value) draft[size] = saved?.estimatedShirts?.[size] ?? ''
  estimateDraft.value = draft
  estimateDialogOpen.value = true
}

// Spreads the missing walkers over the sizes of those already registered
// (largest-remainder rounding, so the pieces add up exactly to the missing).
function distributeByRegistered() {
  const missing = draftMissing.value
  const base = walkerCounts.value[walkerGarment.value.id] ?? {}
  const sizes = estimateSizes.value
  const baseTotal = sizes.reduce((sum, size) => sum + (base[size] ?? 0), 0)
  if (!missing || baseTotal === 0) return
  const quotas = sizes.map((size) => {
    const exact = (missing * (base[size] ?? 0)) / baseTotal
    return { size, count: Math.floor(exact), rest: exact - Math.floor(exact) }
  })
  let left = missing - quotas.reduce((sum, q) => sum + q.count, 0)
  for (const q of [...quotas].sort((a, b) => b.rest - a.rest)) {
    if (left <= 0) break
    q.count++
    left--
  }
  for (const q of quotas) estimateDraft.value[q.size] = q.count || ''
}

const canDistribute = computed(
  () =>
    !!draftMissing.value &&
    Object.values(walkerCounts.value[walkerGarment.value.id] ?? {}).some((n) => n > 0),
)

async function persistEstimate(estimate: ShirtOrderEstimate | null) {
  const retreatId = currentRetreatId.value
  if (!retreatId || savingEstimate.value) return
  savingEstimate.value = true
  try {
    await setShirtOrderEstimate(retreatId, estimate)
    // The server stores exactly this payload: update in place, no refetch
    // (and no table skeleton flash). Skip if the retreat changed meanwhile.
    if (report.value && currentRetreatId.value === retreatId) report.value.estimate = estimate
    estimateDialogOpen.value = false
    toast({ title: estimate ? 'Estimado guardado' : 'Estimado eliminado' })
  } catch (e) {
    console.error('Error saving shirt order estimate:', e)
    toast({
      title: 'Error',
      description: 'No se pudo guardar el estimado',
      variant: 'destructive',
    })
  } finally {
    savingEstimate.value = false
  }
}

function saveEstimate() {
  const estimatedShirts: Record<string, number> = {}
  for (const [size, value] of Object.entries(estimateDraft.value)) {
    const pieces = toCount(value)
    if (pieces) estimatedShirts[size] = pieces
  }
  const expected =
    String(estimateExpected.value).trim() === '' ? null : toCount(estimateExpected.value)
  // Nothing typed at all: clearing beats storing an empty estimate.
  const isEmpty = expected == null && Object.keys(estimatedShirts).length === 0
  void persistEstimate(isEmpty ? null : { expectedWalkers: expected, estimatedShirts })
}

function clearEstimate() {
  void persistEstimate(null)
}

function clearSearch() {
  searchQuery.value = ''
}

function printReport() {
  window.print()
}

function getSize(participant: ShirtReportParticipant, shirtTypeId: string): string {
  return participant.shirts.find((s) => s.shirtTypeId === shirtTypeId)?.size ?? ''
}

function whatsappLink(participant: ShirtReportParticipant): string | null {
  return buildWhatsAppChatLink(participant.cellPhone, participant.country)
}

// Chulo optimista: flip local inmediato, rollback + toast al fallar, sin refetch
// (patrón CommunityAttendanceView.toggleAttendance).
async function toggleConfirmation(participant: ShirtReportParticipant) {
  if (!currentRetreatId.value || savingStates.value[participant.participantId]) return

  const previous = participant.shirtOrderConfirmedAt
  const confirmed = !previous

  savingStates.value[participant.participantId] = true
  participant.shirtOrderConfirmedAt = confirmed ? new Date().toISOString() : null

  try {
    await updateShirtOrderConfirmation(
      currentRetreatId.value,
      participant.participantId,
      confirmed,
    )
  } catch (e) {
    console.error('Error saving shirt order confirmation:', e)
    participant.shirtOrderConfirmedAt = previous
    toast({
      title: 'Error',
      description: `No se pudo guardar la confirmación de ${participant.firstName}`,
      variant: 'destructive',
    })
  } finally {
    savingStates.value[participant.participantId] = false
  }
}

// Abre el dialog central de mensajería con la plantilla de confirmación de
// prendas preseleccionada. La ficha se hidrata desde el listado del retiro
// (participantStore, includePayments) porque {participant.paymentRemaining}
// solo es correcto con payments/debts/shirtSizes cargados — el mismo objeto
// con el que ParticipantList abre este dialog. GET /participants/:id no carga
// shirtSizes y el saldo saldría sin el cargo de prendas.
async function openMessageDialog(participant: ShirtReportParticipant) {
  const retreatId = currentRetreatId.value
  if (!retreatId || sendingStates.value[participant.participantId]) return

  sendingStates.value[participant.participantId] = true
  try {
    // Clear filters inherited from other views (e.g. type='server' left by
    // the leader-assignment modal): they travel in the same query and would
    // exclude the participant. Same reset ParticipantList does before fetching.
    Object.keys(participantStore.filters).forEach((key) => {
      delete participantStore.filters[key]
    })
    participantStore.filters.retreatId = retreatId
    await participantStore.fetchParticipants()
    // The retreat may have changed while loading: opening here would mix the
    // old retreat's participant with the new retreat's id.
    if (currentRetreatId.value !== retreatId) return
    const found = participantStore.participants.find(
      (p) => p.id === participant.participantId,
    )
    if (!found) {
      toast({
        title: 'Error',
        description: `No se pudo cargar la ficha de ${participant.firstName}`,
        variant: 'destructive',
      })
      return
    }
    messageParticipant.value = found
    messageRetreatId.value = retreatId
    messageDialogOpen.value = true
  } catch (e) {
    console.error('Error loading participant for message dialog:', e)
  } finally {
    sendingStates.value[participant.participantId] = false
  }
}

async function loadReport(retreatId: string) {
  currentRetreatId.value = retreatId
  loading.value = true
  try {
    report.value = await getShirtReport(retreatId)
  } catch (e) {
    console.error('Error loading shirt report:', e)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (retreatStore.retreats.length === 0) await retreatStore.fetchRetreats()
  const retreatId =
    retreatStore.selectedRetreatId || retreatStore.mostRecentRetreat?.id
  if (!retreatId) return
  await loadReport(retreatId)
})

// Cambiar de retiro en el sidebar recarga el reporte; sin esto el toggle
// confirmaría contra currentRetreatId del montaje (el retiro anterior).
watch(
  () => retreatStore.selectedRetreatId,
  (retreatId) => {
    if (retreatId) void loadReport(retreatId)
  },
)
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
              Equipo servidor del retiro: pedido y confirmación de camisetas
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
          <div class="text-center px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center gap-2">
            <Wallet class="w-4 h-4 text-emerald-600" />
            <div class="leading-tight text-left">
              <div class="text-lg font-bold text-emerald-700">{{ formatCurrency(totalCharge) }}</div>
              <div class="text-[10px] text-emerald-600 uppercase tracking-wide">Valor total</div>
            </div>
          </div>
          <div class="text-center px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-100 flex items-center gap-2">
            <PackageCheck class="w-4 h-4 text-teal-600" />
            <div class="leading-tight text-left">
              <div class="text-lg font-bold text-teal-700">
                {{ totals.confirmed }}/{{ totals.total }}
              </div>
              <div class="text-[10px] text-teal-600 uppercase tracking-wide">Confirmados</div>
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
        <div class="flex items-center gap-3 flex-wrap">
          <div class="relative max-w-md flex-1 min-w-[12rem]">
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
          <!-- Chips (no inputs): los tests de búsqueda usan el primer input de la vista. -->
          <button
            type="button"
            class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium transition-colors"
            :class="onlyRequiring
              ? 'bg-indigo-600 border-indigo-600 text-white'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'"
            :title="onlyRequiring ? 'Mostrando solo quienes pidieron prendas' : 'Filtrar solo quienes requieren camiseta'"
            @click="onlyRequiring = !onlyRequiring"
          >
            Requieren camiseta
            <span
              class="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-bold"
              :class="onlyRequiring ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'"
            >
              {{ totals.requiring }}
            </span>
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium transition-colors"
            :class="onlyUnconfirmed
              ? 'bg-indigo-600 border-indigo-600 text-white'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'"
            :title="onlyUnconfirmed ? 'Mostrando solo servidores sin confirmar' : 'Filtrar solo sin confirmar'"
            @click="onlyUnconfirmed = !onlyUnconfirmed"
          >
            Solo sin confirmar
            <span
              class="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-bold"
              :class="onlyUnconfirmed ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'"
            >
              {{ totals.total - totals.confirmed }}
            </span>
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
            No hay servidores ni angelitos en este retiro.
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
              <th class="px-3 py-2.5 w-20 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Valor
              </th>
              <th class="no-print px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Confirmado
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
              <td class="px-3 py-2.5 text-right text-xs font-medium text-gray-700 tabular-nums">
                {{ formatCurrency(participant.shirtCharge) }}
              </td>
              <td class="no-print px-3 py-2.5">
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    :class="participant.shirtOrderConfirmedAt
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
                    :disabled="savingStates[participant.participantId]"
                    :title="participant.shirtOrderConfirmedAt
                      ? 'Confirmado — clic para quitar el chulo'
                      : 'Sin confirmar — clic cuando el servidor responda'"
                    @click="toggleConfirmation(participant)"
                  >
                    <!-- En pantallas angostas (celular) queda solo el glifo; la
                         leyenda completa aparece desde sm. -->
                    {{ participant.shirtOrderConfirmedAt ? '✓' : '●' }}
                    <span class="hidden sm:inline">
                      {{ participant.shirtOrderConfirmedAt ? 'Confirmado' : 'Sin confirmar' }}
                    </span>
                  </button>
                  <a
                    v-if="whatsappLink(participant)"
                    :href="whatsappLink(participant) ?? undefined"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center justify-center w-7 h-7 rounded-full text-emerald-600 hover:bg-emerald-50 transition-colors"
                    title="Ver conversación de WhatsApp"
                  >
                    <MessageSquare class="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    class="inline-flex items-center justify-center w-7 h-7 rounded-full text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="sendingStates[participant.participantId]"
                    title="Enviar mensaje de confirmación"
                    @click="openMessageDialog(participant)"
                  >
                    <Send class="w-4 h-4" />
                  </button>
                </div>
              </td>
              <td class="print-only px-3 py-2.5 text-center">
                <span
                  v-if="participant.shirtOrderConfirmedAt"
                  class="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-emerald-700"
                >
                  ✓
                </span>
                <span v-else class="inline-block w-5 h-5 border-2 border-gray-300 rounded" />
              </td>
            </tr>

            <tr v-if="filteredParticipants.length === 0">
              <td :colspan="4 + sortedShirtTypes.length" class="px-4 py-12 text-center">
                <!-- Sin búsqueda: quien vació la tabla fue un chip — ofrecer
                     desactivarlo, no "limpiar la búsqueda". -->
                <div
                  v-if="!searchQuery && onlyUnconfirmed && !onlyRequiring"
                  class="flex flex-col items-center gap-2 text-gray-400"
                >
                  <PackageCheck class="w-8 h-8 opacity-40" />
                  <p class="text-sm font-medium">
                    Todos los pedidos de este retiro están confirmados.
                  </p>
                  <button
                    class="text-xs text-indigo-500 hover:text-indigo-700 underline"
                    @click="onlyUnconfirmed = false"
                  >
                    Mostrar todos
                  </button>
                </div>
                <div
                  v-else-if="!searchQuery"
                  class="flex flex-col items-center gap-2 text-gray-400"
                >
                  <PackageCheck class="w-8 h-8 opacity-40" />
                  <p class="text-sm font-medium">
                    Nadie coincide con los filtros activos.
                  </p>
                  <button
                    class="text-xs text-indigo-500 hover:text-indigo-700 underline"
                    @click="onlyRequiring = false; onlyUnconfirmed = false"
                  >
                    Quitar filtros
                  </button>
                </div>
                <div v-else class="flex flex-col items-center gap-2 text-gray-400">
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

    <!-- ── Purchase summary ───────────────────────────────── -->
    <div
      v-if="!loading && report && sortedShirtTypes.length > 0"
      data-testid="order-summary"
      class="bg-white border border-gray-200 rounded-xl shadow-sm p-4"
    >
      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-100">
            <Package class="w-5 h-5 text-indigo-600" />
          </div>
          <div class="min-w-0">
            <h3 class="text-base font-semibold text-gray-900 leading-tight">Resumen de pedido</h3>
            <p class="text-xs text-gray-500 mt-0.5">
              Piezas por talla para el proveedor: equipo completo, caminantes y estimado
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2 sm:ml-auto flex-wrap no-print">
          <button
            v-if="canEstimate"
            type="button"
            class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium bg-white border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            title="Estimar las tallas de los caminantes que faltan por inscribirse"
            @click="openEstimateDialog"
          >
            <Calculator class="w-3.5 h-3.5" />
            Estimar caminantes
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium bg-white border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="orderTotalPieces === 0"
            title="Copiar el pedido listo para WhatsApp"
            @click="copyOrderSummary"
          >
            <Copy class="w-3.5 h-3.5" />
            Copiar resumen
          </button>
        </div>
      </div>

      <p v-if="visibleSections.length === 0" class="mt-4 text-sm text-gray-400">
        Aún no hay prendas pedidas en este retiro.
      </p>

      <div v-else class="mt-4 space-y-4">
        <section
          v-for="section in visibleSections"
          :key="section.key"
          :data-testid="`order-section-${section.key}`"
        >
          <div class="flex items-baseline justify-between gap-2 border-b border-gray-100 pb-1 mb-2">
            <h4 class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              {{ section.title }}
              <span v-if="section.note" class="normal-case font-normal text-gray-400">· {{ section.note }}</span>
            </h4>
            <span class="text-xs font-medium text-gray-500 tabular-nums whitespace-nowrap">
              {{ piecesLabel(section.total) }}
            </span>
          </div>
          <p v-if="section.rows.length === 0" class="text-xs text-gray-400">
            Sin tallas registradas todavía.
          </p>
          <p
            v-if="section.key === 'walkers' && !walkerGarmentFlagged"
            class="text-xs text-gray-400 mb-1 no-print"
          >
            Ninguna prenda está marcada para caminantes en Tipos de camiseta: su camiseta se cuenta aparte.
          </p>
          <div
            v-for="row in section.rows"
            :key="row.id"
            data-testid="order-row"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 py-1"
          >
            <span class="text-sm font-medium text-gray-800 w-44 shrink-0">{{ row.name }}</span>
            <span class="text-xs text-gray-500 tabular-nums w-16">{{ piecesLabel(row.total) }}</span>
            <span class="flex flex-wrap gap-1.5">
              <span
                v-for="s in row.sizes"
                :key="s.size"
                class="inline-flex items-center gap-1 text-xs text-gray-700"
              >
                <span class="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 rounded text-xs font-bold bg-indigo-100 text-indigo-700">{{ s.size }}</span>
                <span class="font-semibold tabular-nums">×{{ s.count }}</span>
              </span>
            </span>
          </div>
        </section>

        <section v-if="showMergedTotal" data-testid="order-section-total">
          <div class="flex items-baseline justify-between gap-2 border-b border-gray-200 pb-1 mb-2">
            <h4 class="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Total a pedir</h4>
          </div>
          <div
            v-for="row in orderTotalRows"
            :key="row.id"
            data-testid="order-row"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 py-1"
          >
            <span class="text-sm font-semibold text-gray-900 w-44 shrink-0">{{ row.name }}</span>
            <span class="text-xs text-gray-500 tabular-nums w-16">{{ piecesLabel(row.total) }}</span>
            <span class="flex flex-wrap gap-1.5">
              <span
                v-for="s in row.sizes"
                :key="s.size"
                class="inline-flex items-center gap-1 text-xs text-gray-700"
              >
                <span class="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700">{{ s.size }}</span>
                <span class="font-semibold tabular-nums">×{{ s.count }}</span>
              </span>
            </span>
          </div>
        </section>

        <div
          class="flex items-center justify-end border-t border-gray-200 pt-2 text-sm font-semibold text-gray-900"
          data-testid="order-total"
        >
          Total del pedido: {{ piecesLabel(orderTotalPieces) }}
        </div>
      </div>
    </div>

    <!-- Walker estimate. Mounted from the start, opened through its ref. -->
    <Dialog v-model:open="estimateDialogOpen">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Estimar caminantes faltantes</DialogTitle>
          <DialogDescription>
            Piezas extra a pedir por talla, para los caminantes que aún no se inscriben.
            Hay {{ walkerCount }} inscritos.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-1">
          <div>
            <label class="text-sm font-medium text-gray-700" for="estimate-expected">
              Caminantes esperados en total
            </label>
            <Input
              id="estimate-expected"
              v-model="estimateExpected"
              type="number"
              min="0"
              step="1"
              placeholder="Ej. 40"
              data-testid="estimate-expected"
            />
            <p v-if="draftMissing != null" class="text-xs text-gray-500 mt-1">
              Faltan ~{{ draftMissing }} por inscribirse.
            </p>
          </div>

          <div class="space-y-2">
            <div class="flex items-baseline justify-between">
              <span class="text-sm font-medium text-gray-700">{{ walkerGarment.name }}</span>
              <span class="text-xs text-gray-500 tabular-nums">{{ piecesLabel(draftPieces) }}</span>
            </div>
            <div class="grid grid-cols-5 gap-2">
              <div v-for="size in estimateSizes" :key="size" class="text-center">
                <div class="text-xs font-bold text-indigo-700 mb-1">{{ size }}</div>
                <Input
                  v-model="estimateDraft[size]"
                  type="number"
                  min="0"
                  step="1"
                  class="h-8 text-center px-1"
                  :data-testid="`estimate-size-${size}`"
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            class="text-xs text-indigo-600 hover:text-indigo-800 underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
            :disabled="!canDistribute"
            title="Reparte los faltantes con la misma proporción de tallas que los inscritos"
            @click="distributeByRegistered"
          >
            Repartir los faltantes como los inscritos
          </button>
        </div>
        <DialogFooter class="gap-2">
          <Button
            v-if="report?.estimate"
            variant="outline"
            :disabled="savingEstimate"
            @click="clearEstimate"
          >
            Quitar estimado
          </Button>
          <Button variant="outline" @click="estimateDialogOpen = false">Cancelar</Button>
          <Button :disabled="savingEstimate" @click="saveEstimate">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Dialog central de mensajería. Montado desde el arranque (sin v-if):
         el watcher de forceTemplateType solo dispara si ya está montado
         cuando se abre (patrón CommunityDashboardView). -->
    <MessageDialog
      v-model:open="messageDialogOpen"
      context="retreat"
      :retreat-id="messageRetreatId ?? undefined"
      :participant="messageParticipant"
      force-template-type="SERVER_SHIRT_CONFIRMATION"
    />
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
