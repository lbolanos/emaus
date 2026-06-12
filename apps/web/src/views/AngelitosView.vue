<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { CheckCircle2, Loader2 } from 'lucide-vue-next'
import ParticipantList from '@/components/ParticipantList.vue'
import AngelitoAvailabilityEditor from '@/components/AngelitoAvailabilityEditor.vue'
import { useRetreatStore } from '@/stores/retreatStore'
import { santisimoApi, getParticipantsByRetreat } from '@/services/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Badge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from '@repo/ui'

const { t } = useI18n()
const retreatStore = useRetreatStore()
const { toast } = useToast()

const tableColumns = ['id_on_retreat','firstName', 'lastName', 'email', 'cellPhone', 'parish', 'paymentRemaining'];
const formShowColumns = ['id_on_retreat','firstName', 'lastName', 'cellPhone', 'parish', 'paymentRemaining', 'email'];
const nonEditableColumns = ['email'];
const formEditColumns = tableColumns.filter(c => !nonEditableColumns.includes(c));

type AvailabilityStatus = {
  participantId: string
  name: string
  blocks: number
}

type AssignedSlot = {
  signupId: string
  slotId: string
  startTime: string
  endTime: string
  mealWindow: boolean
  autoAssigned: boolean
}

type Block = {
  id?: string
  startTime: string | Date
  endTime: string | Date
}

const statuses = ref<AvailabilityStatus[]>([])
const loading = ref(false)

// Editor state
const editingAngelito = ref<{ id: string; name: string } | null>(null)
const editBlocks = ref<Block[] | undefined>(undefined)
const assignedSlots = ref<AssignedSlot[]>([])
const editPanel = ref<'availability' | 'slots'>('availability')
const editLoading = ref(false)
const editSaving = ref(false)

async function loadStatuses() {
  const retreatId = retreatStore.selectedRetreatId
  if (!retreatId) return
  loading.value = true
  try {
    const list = await getParticipantsByRetreat(retreatId, 'partial_server')
    const angelitos = (list as any[]).filter((p) => !p.isCancelled)
    const results = await Promise.all(
      angelitos.map(async (p) => {
        try {
          const blocks = await santisimoApi.getParticipantAvailability(retreatId, p.id)
          return {
            participantId: p.id,
            name: `${p.firstName} ${p.lastName}`.trim(),
            blocks: blocks.length,
          }
        } catch {
          return { participantId: p.id, name: `${p.firstName} ${p.lastName}`.trim(), blocks: 0 }
        }
      }),
    )
    statuses.value = results
  } finally {
    loading.value = false
  }
}

async function openEditor(status: AvailabilityStatus) {
  editingAngelito.value = { id: status.participantId, name: status.name }
  editBlocks.value = undefined
  assignedSlots.value = []
  editPanel.value = 'availability'
  editLoading.value = true
  const retreatId = retreatStore.selectedRetreatId!
  try {
    const [blocks, slots] = await Promise.all([
      santisimoApi.getParticipantAvailability(retreatId, status.participantId),
      santisimoApi.getParticipantAssignedSlots(retreatId, status.participantId).catch(() => [] as AssignedSlot[]),
    ])
    editBlocks.value = blocks.map(b => ({ id: b.id, startTime: b.startTime, endTime: b.endTime }))
    assignedSlots.value = slots
  } finally {
    editLoading.value = false
  }
}

async function saveAvailability() {
  if (!editingAngelito.value) return
  editSaving.value = true
  try {
    const retreatId = retreatStore.selectedRetreatId!
    await santisimoApi.setParticipantAvailability(
      retreatId,
      editingAngelito.value.id,
      (editBlocks.value ?? []).map(b => ({
        startTime: b.startTime instanceof Date ? b.startTime.toISOString() : b.startTime,
        endTime: b.endTime instanceof Date ? b.endTime.toISOString() : b.endTime,
      })),
    )
    // update local status count
    const s = statuses.value.find(s => s.participantId === editingAngelito.value!.id)
    if (s) s.blocks = (editBlocks.value ?? []).length
    toast({ title: t('angelitos.availabilityStatus.angelitoAvailabilitySaved') })
    editingAngelito.value = null
  } catch {
    toast({ title: t('angelitos.availabilityStatus.angelitoAvailabilitySaveError'), variant: 'destructive' })
  } finally {
    editSaving.value = false
  }
}

function formatSlotTime(isoStr: string): string {
  const d = new Date(isoStr)
  if (Number.isNaN(d.getTime())) return isoStr
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const withAvailability = computed(() => statuses.value.filter((s) => s.blocks > 0))

// retreat dates for editor bounds
const retreatMinDate = computed(() => retreatStore.selectedRetreat?.startDate ?? null)
const retreatMaxDate = computed(() => retreatStore.selectedRetreat?.endDate ?? null)

watch(() => retreatStore.selectedRetreatId, () => loadStatuses())
onMounted(() => loadStatuses())
</script>

<template>
  <div class="space-y-4">
    <!-- Angelitos table panel -->
    <div
      v-if="!loading && statuses.length > 0"
      class="rounded-lg border bg-white shadow-sm overflow-x-auto"
    >
      <div class="flex items-center justify-between gap-3 flex-wrap px-3 pt-3 pb-2">
        <div class="flex items-center gap-2">
          <h2 class="text-base font-semibold">{{ t('angelitos.availabilityStatus.title') }}</h2>
          <span class="text-xs text-muted-foreground">
            {{ t('angelitos.availabilityStatus.summary', { configured: withAvailability.length, total: statuses.length }) }}
          </span>
        </div>
        <div v-if="withAvailability.length === statuses.length" class="flex items-center gap-1 text-green-700 text-xs">
          <CheckCircle2 class="h-3.5 w-3.5" />
          <span>{{ t('angelitos.availabilityStatus.allConfigured') }}</span>
        </div>
      </div>

      <table class="w-full text-sm">
        <thead class="border-b bg-muted/30">
          <tr>
            <th class="text-left p-2 pl-3 font-medium text-muted-foreground">{{ t('angelitos.availabilityStatus.columnName') }}</th>
            <th class="text-left p-2 font-medium text-muted-foreground">{{ t('angelitos.availabilityStatus.columnBlocks') }}</th>
            <th class="text-left p-2 font-medium text-muted-foreground">{{ t('angelitos.availabilityStatus.columnSlots') }}</th>
            <th class="text-right p-2 pr-3 font-medium text-muted-foreground"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in statuses"
            :key="s.participantId"
            class="border-b last:border-0 hover:bg-muted/10"
          >
            <td class="p-2 pl-3 font-medium">{{ s.name }}</td>
            <td class="p-2">
              <Badge v-if="s.blocks === 0" variant="outline" class="border-amber-400 text-amber-700 bg-amber-50 text-xs">
                Sin horario
              </Badge>
              <span v-else class="text-xs text-muted-foreground">{{ s.blocks }} bloque(s)</span>
            </td>
            <td class="p-2">
              <span class="text-xs text-muted-foreground">—</span>
            </td>
            <td class="p-2 pr-3 text-right">
              <Button
                size="sm"
                :variant="s.blocks === 0 ? 'default' : 'outline'"
                @click="openEditor(s)"
              >
                {{ s.blocks === 0 ? t('angelitos.availabilityStatus.openEditor') : t('angelitos.availabilityStatus.editEditor') }}
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="rounded-lg border bg-white p-4 shadow-sm flex items-center gap-2 text-muted-foreground text-sm">
      <Loader2 class="h-4 w-4 animate-spin" />
      <span>Cargando...</span>
    </div>

    <!-- Editor dialog -->
    <Dialog :open="editingAngelito !== null" @update:open="(v: boolean) => { if (!v) editingAngelito = null }">
      <DialogContent class="max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle>{{ editingAngelito?.name }}</DialogTitle>
        </DialogHeader>

        <div v-if="editLoading" class="flex items-center justify-center py-10 gap-2 text-muted-foreground">
          <Loader2 class="h-5 w-5 animate-spin" />
          <span>Cargando...</span>
        </div>

        <Tabs v-else :default-value="editPanel" @update:model-value="(v: string | number) => { editPanel = v as 'availability' | 'slots' }">
          <TabsList class="mb-4">
            <TabsTrigger value="availability">{{ t('angelitos.availabilityStatus.availability') }}</TabsTrigger>
            <TabsTrigger value="slots">{{ t('angelitos.availabilityStatus.assignedSlots') }}</TabsTrigger>
          </TabsList>

          <!-- Tab: Availability editor -->
          <TabsContent value="availability">
            <AngelitoAvailabilityEditor
              v-model="editBlocks"
              :min-date="retreatMinDate"
              :max-date="retreatMaxDate"
            />
            <div class="mt-4 flex justify-end">
              <Button :disabled="editSaving" @click="saveAvailability">
                <Loader2 v-if="editSaving" class="h-4 w-4 mr-2 animate-spin" />
                {{ editSaving ? t('angelitos.availabilityStatus.savingAvailability') : t('angelitos.availabilityStatus.saveAvailability') }}
              </Button>
            </div>
          </TabsContent>

          <!-- Tab: Assigned slots -->
          <TabsContent value="slots">
            <div v-if="assignedSlots.length === 0" class="py-8 text-center text-muted-foreground text-sm">
              {{ t('angelitos.availabilityStatus.noAssignedSlots') }}
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="slot in assignedSlots"
                :key="slot.signupId"
                class="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div class="flex flex-col gap-0.5">
                  <span class="font-medium">{{ formatSlotTime(slot.startTime) }}</span>
                  <span class="text-xs text-muted-foreground">hasta {{ formatSlotTime(slot.endTime) }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <Badge v-if="slot.mealWindow" variant="outline" class="border-amber-400 text-amber-700 bg-amber-50 text-xs">
                    {{ t('angelitos.availabilityStatus.mealWindowBadge') }}
                  </Badge>
                  <Badge v-if="slot.autoAssigned" variant="outline" class="text-xs text-muted-foreground">Auto</Badge>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>

    <ParticipantList type="partial_server"
      :columns-to-show-in-table="tableColumns"
      :columns-to-show-in-form="formShowColumns"
      :columns-to-edit-in-form="formEditColumns"
      :default-filters="{}"
    />
  </div>
</template>
