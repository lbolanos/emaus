<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRetreatStore } from '@/stores/retreatStore'
import { useAuthPermissions } from '@/composables/useAuthPermissions'
import { useToast } from '@repo/ui'
import { Button } from '@repo/ui'
import { Input } from '@repo/ui'
import { Label } from '@repo/ui'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui'
import {
  listShirtTypes,
  createShirtType,
  updateShirtType,
  deleteShirtType,
  type ShirtTypeDTO,
} from '@/services/api'

const retreatStore = useRetreatStore()
const { hasPermission } = useAuthPermissions()
const canManage = computed(() => hasPermission('shirtType:manage'))
const { toast } = useToast()
const items = ref<(ShirtTypeDTO & { _newSize?: string })[]>([])
const loading = ref(false)

const retreatId = computed(() => retreatStore.selectedRetreatId)

const SIZE_PRESETS: Record<string, string[]> = {
  México: ['S', 'M', 'G', 'X', '2'],
  Colombia: ['S', 'M', 'L', 'XL', 'XXL'],
  Internacional: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
}

const draft = ref<Partial<ShirtTypeDTO> & { _newSize?: string }>({
  name: '',
  color: '#ffffff',
  requiredForWalkers: false,
  optionalForServers: true,
  sortOrder: 0,
  availableSizes: ['S', 'M', 'G', 'X', '2'],
  _newSize: '',
})

// --- color helpers (keep legacy named-color compatibility) ---
const NAMED_COLORS: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  red: '#ef4444',
  blue: '#3b82f6',
  navy: '#1e3a8a',
  green: '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  pink: '#ec4899',
  purple: '#a855f7',
  gray: '#9ca3af',
  grey: '#9ca3af',
  brown: '#92400e',
}
function toHexColor(input?: string | null): string {
  if (!input) return '#cccccc'
  const trimmed = input.trim().toLowerCase()
  if (/^#([0-9a-f]{3}){1,2}$/i.test(trimmed)) return trimmed
  return NAMED_COLORS[trimmed] ?? '#cccccc'
}

// --- size chip helpers ---
function addSize(target: { availableSizes?: string[] | null; _newSize?: string }) {
  const raw = (target._newSize || '').trim().toUpperCase()
  if (!raw) return
  const list = target.availableSizes && target.availableSizes.length > 0 ? [...target.availableSizes] : []
  if (!list.includes(raw)) list.push(raw)
  target.availableSizes = list
  target._newSize = ''
}
function removeSize(target: { availableSizes?: string[] | null }, size: string) {
  const list = target.availableSizes || []
  target.availableSizes = list.filter((s) => s !== size)
}
function applyPreset(target: { availableSizes?: string[] | null }, presetKey: string) {
  target.availableSizes = [...(SIZE_PRESETS[presetKey] || [])]
}
function isPresetActive(target: { availableSizes?: string[] | null }, presetKey: string): boolean {
  const preset = SIZE_PRESETS[presetKey]
  const current = target.availableSizes || []
  if (!preset || preset.length !== current.length) return false
  return preset.every((s, i) => s === current[i])
}

async function load() {
  if (!retreatId.value) return
  loading.value = true
  try {
    const fetched = await listShirtTypes(retreatId.value)
    // Default to México preset when an existing type has no sizes configured.
    items.value = fetched.map((t) => ({
      ...t,
      availableSizes:
        t.availableSizes && t.availableSizes.length > 0
          ? t.availableSizes
          : [...SIZE_PRESETS['México']],
      _newSize: '',
    }))
  } catch (e: any) {
    toast({ title: 'Error', description: e?.response?.data?.message || 'Error al cargar', variant: 'destructive' })
  } finally {
    loading.value = false
  }
}

async function add() {
  if (!retreatId.value || !draft.value.name) return
  try {
    const { _newSize, ...payload } = draft.value
    await createShirtType(retreatId.value, payload)
    const carriedSizes = [...(draft.value.availableSizes || [])]
    draft.value = {
      name: '',
      color: '#ffffff',
      requiredForWalkers: false,
      optionalForServers: true,
      sortOrder: items.value.length + 1,
      availableSizes: carriedSizes,
      _newSize: '',
    }
    await load()
    toast({ title: 'Tipo de playera agregado' })
  } catch (e: any) {
    toast({ title: 'Error', description: e?.response?.data?.message || 'Error', variant: 'destructive' })
  }
}

async function save(item: ShirtTypeDTO & { _newSize?: string }) {
  try {
    // Flush any pending text in the chip input before saving.
    if (item._newSize && item._newSize.trim().length > 0) addSize(item)
    const { _newSize, ...payload } = item
    const updated = await updateShirtType(item.id, payload)
    // Reflect server response back into the local row so the UI matches DB exactly.
    Object.assign(item, updated, { _newSize: '' })
    const sizes = (updated.availableSizes || []).join(', ') || '(sin tallas)'
    toast({ title: 'Guardado', description: `${item.name} · Tallas: ${sizes}` })
  } catch (e: any) {
    toast({ title: 'Error', description: e?.response?.data?.message || 'Error', variant: 'destructive' })
  }
}

async function remove(item: ShirtTypeDTO) {
  if (!confirm(`¿Eliminar "${item.name}"? Esta acción es irreversible.`)) return
  try {
    await deleteShirtType(item.id)
    await load()
    toast({ title: 'Eliminado' })
  } catch (e: any) {
    toast({ title: 'Error', description: e?.response?.data?.message || 'Error', variant: 'destructive' })
  }
}

onMounted(load)
// Reload when the user switches retreats from the sidebar.
watch(retreatId, (newId, oldId) => {
  if (newId && newId !== oldId) load()
})
</script>

<template>
  <div class="container mx-auto p-4 space-y-6">
    <div>
      <h1 class="text-2xl font-bold">Tipos de playera del retiro</h1>
      <p class="text-muted-foreground text-sm">
        Configura las playeras que se ofrecerán a servidores y caminantes en este retiro.
      </p>
    </div>

    <!-- Read-only banner -->
    <div v-if="!canManage" class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      Tu rol solo permite <strong>ver</strong> la configuración de tipos de playera. Los botones de edición están ocultos.
    </div>

    <!-- Add new (manage only) -->
    <Card v-if="canManage">
      <CardHeader><CardTitle>Agregar tipo</CardTitle></CardHeader>
      <CardContent class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="md:col-span-2">
            <Label>Nombre</Label>
            <Input v-model="draft.name" placeholder="Ej. Blanca con rosa" />
          </div>
          <div>
            <Label>Color</Label>
            <div class="flex items-center gap-2">
              <input
                type="color"
                :value="toHexColor(draft.color)"
                @input="(e) => (draft.color = (e.target as HTMLInputElement).value)"
                class="h-10 w-14 cursor-pointer rounded border bg-background p-1"
              />
              <span class="text-xs text-muted-foreground font-mono">{{ toHexColor(draft.color) }}</span>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Orden</Label>
            <Input type="number" v-model.number="draft.sortOrder" />
          </div>
          <button
            type="button"
            class="flex items-center gap-2 rounded-md border p-2 text-left transition-colors"
            :class="draft.requiredForWalkers ? 'border-primary bg-primary/5' : 'border-input bg-background hover:bg-accent/50'"
            @click="draft.requiredForWalkers = !draft.requiredForWalkers"
          >
            <span class="flex h-5 w-5 items-center justify-center rounded border-2"
              :class="draft.requiredForWalkers ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 bg-background'">
              <svg v-if="draft.requiredForWalkers" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <span class="text-sm">Requerido para caminantes</span>
          </button>
          <button
            type="button"
            class="flex items-center gap-2 rounded-md border p-2 text-left transition-colors"
            :class="draft.optionalForServers ? 'border-primary bg-primary/5' : 'border-input bg-background hover:bg-accent/50'"
            @click="draft.optionalForServers = !draft.optionalForServers"
          >
            <span class="flex h-5 w-5 items-center justify-center rounded border-2"
              :class="draft.optionalForServers ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 bg-background'">
              <svg v-if="draft.optionalForServers" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <span class="text-sm">Opcional para servidores</span>
          </button>
        </div>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <Label>Tallas disponibles</Label>
            <div class="flex gap-1">
              <button
                v-for="(_, key) in SIZE_PRESETS"
                :key="key"
                type="button"
                class="text-xs rounded-full border px-2.5 py-0.5 transition-colors"
                :class="isPresetActive(draft, key) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'"
                @click="applyPreset(draft, key)"
              >{{ key }}</button>
            </div>
          </div>
          <div class="flex flex-wrap gap-1.5 items-center rounded-md border bg-background p-2 min-h-[2.75rem] focus-within:ring-1 focus-within:ring-ring">
            <span
              v-for="s in (draft.availableSizes || [])"
              :key="s"
              class="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs font-semibold px-2.5 py-1"
            >
              {{ s }}
              <button type="button" class="rounded-full hover:bg-primary/20 leading-none" @click="removeSize(draft, s)" aria-label="Quitar">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
            <input
              v-model="draft._newSize"
              @keydown.enter.prevent="addSize(draft)"
              @keydown.,.prevent="addSize(draft)"
              @blur="addSize(draft)"
              placeholder="Agregar talla y Enter…"
              class="flex-1 min-w-[120px] outline-none bg-transparent text-sm px-1"
            />
          </div>
          <p class="text-xs text-muted-foreground mt-1">Enter o coma para agregar.</p>
        </div>

        <div>
          <Button @click="add" :disabled="!draft.name">Agregar</Button>
        </div>
      </CardContent>
    </Card>

    <!-- List -->
    <Card>
      <CardHeader><CardTitle>Tipos configurados ({{ items.length }})</CardTitle></CardHeader>
      <CardContent>
        <div v-if="loading" class="text-muted-foreground">Cargando...</div>
        <div v-else-if="items.length === 0" class="text-muted-foreground">
          No hay tipos. Agrega uno arriba.
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="item in items"
            :key="item.id"
            class="rounded-lg border p-4 space-y-4"
            :class="{ 'pointer-events-none opacity-70 select-none': !canManage }"
            :aria-disabled="!canManage"
          >
            <!-- Header: color swatch + name + sortOrder + delete -->
            <div class="flex items-center gap-3">
              <div
                class="h-8 w-8 shrink-0 rounded-full border"
                :style="{ backgroundColor: toHexColor(item.color) }"
                :title="item.color || ''"
              />
              <div class="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div class="md:col-span-2">
                  <Label class="text-xs">Nombre</Label>
                  <Input v-model="item.name" />
                </div>
                <div>
                  <Label class="text-xs">Color</Label>
                  <div class="flex items-center gap-2">
                    <input
                      type="color"
                      :value="toHexColor(item.color)"
                      @input="(e) => (item.color = (e.target as HTMLInputElement).value)"
                      class="h-9 w-12 cursor-pointer rounded border bg-background p-1"
                    />
                    <span class="text-xs text-muted-foreground font-mono">{{ toHexColor(item.color) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label class="text-xs">Orden</Label>
                <Input type="number" v-model.number="item.sortOrder" />
              </div>
              <button
                type="button"
                class="flex items-center gap-2 rounded-md border p-2 text-left transition-colors"
                :class="item.requiredForWalkers ? 'border-primary bg-primary/5' : 'border-input bg-background hover:bg-accent/50'"
                @click="item.requiredForWalkers = !item.requiredForWalkers"
              >
                <span class="flex h-5 w-5 items-center justify-center rounded border-2"
                  :class="item.requiredForWalkers ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 bg-background'">
                  <svg v-if="item.requiredForWalkers" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span class="text-sm">Requerido para caminantes</span>
              </button>
              <button
                type="button"
                class="flex items-center gap-2 rounded-md border p-2 text-left transition-colors"
                :class="item.optionalForServers ? 'border-primary bg-primary/5' : 'border-input bg-background hover:bg-accent/50'"
                @click="item.optionalForServers = !item.optionalForServers"
              >
                <span class="flex h-5 w-5 items-center justify-center rounded border-2"
                  :class="item.optionalForServers ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 bg-background'">
                  <svg v-if="item.optionalForServers" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span class="text-sm">Opcional para servidores</span>
              </button>
            </div>

            <div>
              <div class="flex items-center justify-between mb-1.5">
                <Label class="text-xs">Tallas disponibles</Label>
                <div class="flex gap-1">
                  <button
                    v-for="(_, key) in SIZE_PRESETS"
                    :key="key"
                    type="button"
                    class="text-xs rounded-full border px-2.5 py-0.5 transition-colors"
                    :class="isPresetActive(item, key) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'"
                    @click="applyPreset(item, key)"
                  >{{ key }}</button>
                </div>
              </div>
              <div class="flex flex-wrap gap-1.5 items-center rounded-md border bg-background p-2 min-h-[2.75rem] focus-within:ring-1 focus-within:ring-ring">
                <span
                  v-for="s in (item.availableSizes || [])"
                  :key="s"
                  class="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs font-semibold px-2.5 py-1"
                >
                  {{ s }}
                  <button type="button" class="rounded-full hover:bg-primary/20 leading-none" @click="removeSize(item, s)" aria-label="Quitar">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
                <input
                  v-model="item._newSize"
                  @keydown.enter.prevent="addSize(item)"
                  @keydown.,.prevent="addSize(item)"
                  @blur="addSize(item)"
                  placeholder="Agregar talla…"
                  class="flex-1 min-w-[120px] outline-none bg-transparent text-sm px-1"
                />
              </div>
            </div>

            <div v-if="canManage" class="flex gap-2">
              <Button size="sm" @click="save(item)">Guardar</Button>
              <Button size="sm" variant="outline" class="text-red-600 hover:bg-red-50" @click="remove(item)">Eliminar</Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
