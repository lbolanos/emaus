<script setup lang="ts">
import { computed } from 'vue'
import { Input } from '@repo/ui'
import { Button } from '@repo/ui'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@repo/ui'
import { Trash2 } from 'lucide-vue-next'

type Block = {
  id?: string
  startTime: string | Date
  endTime: string | Date
}

const props = defineProps<{
  minDate?: string | Date | null
  maxDate?: string | Date | null
}>()

// Acepta `Block[]` o `undefined` desde el padre; internamente garantizamos un array.
const blocksModel = defineModel<Block[] | undefined>({ default: () => [] })
const blocks = computed<Block[]>({
  get: () => blocksModel.value ?? [],
  set: (v) => {
    blocksModel.value = v
  },
})

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function toLocalInput(value: string | Date | null | undefined): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(value: string): string {
  if (!value) return ''
  // datetime-local viene sin zona; lo interpretamos como hora local y guardamos ISO UTC
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

/**
 * Extrae el día calendario (YYYY-MM-DD) de un string ISO sin pasar por
 * `new Date()`, para evitar que `endDate = "2026-06-07T00:00:00Z"` se
 * interprete en UTC-6 como "06-jun-18:00 local" y bloquee slots del último
 * día del retiro. Espera input tipo "YYYY-MM-DD..." o Date local.
 */
function calendarDateOnly(value: string | Date | null | undefined): { y: number; m: number; d: number } | null {
  if (!value) return null
  const raw = value instanceof Date ? value.toISOString() : String(value)
  const datePart = raw.slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

function localAt(year: number, month: number, day: number, hour: number, minute = 0): string {
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`
}

const minLocal = computed(() => {
  const c = calendarDateOnly(props.minDate ?? null)
  return c ? localAt(c.y, c.m, c.d, 0, 0) : ''
})
const maxLocal = computed(() => {
  const c = calendarDateOnly(props.maxDate ?? null)
  return c ? localAt(c.y, c.m, c.d, 23, 59) : ''
})

function defaultStart(): string {
  const c = calendarDateOnly(props.minDate ?? null)
  if (c) {
    // Construir Date LOCAL con la fecha calendario del retiro a las 08:00.
    const local = new Date(c.y, c.m - 1, c.d, 8, 0, 0, 0)
    return local.toISOString()
  }
  const d = new Date()
  d.setMinutes(0, 0, 0)
  return d.toISOString()
}

function defaultEnd(start: string): string {
  const d = new Date(start)
  if (Number.isNaN(d.getTime())) return ''
  d.setHours(d.getHours() + 4)
  return d.toISOString()
}

function addBlock() {
  const s = defaultStart()
  const e = defaultEnd(s)
  blocks.value = [...blocks.value, { startTime: s, endTime: e }]
}

function removeBlock(idx: number) {
  blocks.value = blocks.value.filter((_, i) => i !== idx)
}

function updateStart(idx: number, value: string) {
  const next = [...blocks.value]
  next[idx] = { ...next[idx], startTime: fromLocalInput(value) }
  blocks.value = next
}

function updateEnd(idx: number, value: string) {
  const next = [...blocks.value]
  next[idx] = { ...next[idx], endTime: fromLocalInput(value) }
  blocks.value = next
}

function isInvalidRange(b: Block): boolean {
  const s = new Date(b.startTime)
  const e = new Date(b.endTime)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false
  return e <= s
}

const overlappingIndices = computed<Set<number>>(() => {
  const set = new Set<number>()
  const indexed = blocks.value
    .map((b, idx) => {
      const s = new Date(b.startTime).getTime()
      const e = new Date(b.endTime).getTime()
      return { idx, s, e }
    })
    .filter((x) => !Number.isNaN(x.s) && !Number.isNaN(x.e) && x.e > x.s)
    .sort((a, b) => a.s - b.s)
  for (let i = 1; i < indexed.length; i++) {
    if (indexed[i].s < indexed[i - 1].e) {
      set.add(indexed[i].idx)
      set.add(indexed[i - 1].idx)
    }
  }
  return set
})

function isOverlapping(idx: number): boolean {
  return overlappingIndices.value.has(idx)
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="blocks.length === 0" class="text-sm text-muted-foreground italic">
      {{ $t('serverRegistration.fields.angelitoAvailability.empty') }}
    </div>

    <div
      v-for="(block, idx) in blocks"
      :key="(block.id ?? '') + idx"
      class="relative rounded-lg border p-3 pr-10"
      :class="isOverlapping(idx) ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : 'bg-muted/20'"
    >
      <TooltipProvider :delay-duration="200">
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="absolute top-1 right-1 h-7 w-7 text-muted-foreground hover:text-red-600"
              @click="removeBlock(idx)"
            >
              <Trash2 class="h-4 w-4" />
              <span class="sr-only">{{ $t('common.delete') }}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ $t('common.delete') }}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="min-w-0">
          <label class="text-xs text-muted-foreground block mb-1">
            {{ $t('serverRegistration.fields.angelitoAvailability.start') }}
          </label>
          <Input
            type="datetime-local"
            class="w-full"
            :model-value="toLocalInput(block.startTime)"
            @update:model-value="(v: any) => updateStart(idx, String(v ?? ''))"
            :min="minLocal || undefined"
            :max="maxLocal || undefined"
          />
        </div>
        <div class="min-w-0">
          <label class="text-xs text-muted-foreground block mb-1">
            {{ $t('serverRegistration.fields.angelitoAvailability.end') }}
          </label>
          <Input
            type="datetime-local"
            class="w-full"
            :model-value="toLocalInput(block.endTime)"
            @update:model-value="(v: any) => updateEnd(idx, String(v ?? ''))"
            :min="minLocal || undefined"
            :max="maxLocal || undefined"
            :class="{ 'border-red-500': isInvalidRange(block) }"
          />
          <p v-if="isInvalidRange(block)" class="text-xs text-red-500 mt-1">
            {{ $t('serverRegistration.fields.angelitoAvailability.invalidRange') }}
          </p>
        </div>
      </div>
      <p v-if="isOverlapping(idx)" class="text-xs text-amber-700 mt-1">
        {{ $t('serverRegistration.fields.angelitoAvailability.overlap') }}
      </p>
    </div>

    <Button type="button" variant="outline" size="sm" @click="addBlock">
      + {{ $t('serverRegistration.fields.angelitoAvailability.addBlock') }}
    </Button>
  </div>
</template>
