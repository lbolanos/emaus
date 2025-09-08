<script setup lang="ts">
import { ref, computed } from 'vue'
import { Input } from '@repo/ui/components/ui/input'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { ScrollArea } from '@repo/ui/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, ChevronUp, ChevronDown, GripVertical, RotateCcw } from 'lucide-vue-next'

type Column = {
  key: string
  label: string
}

const props = defineProps<{
  allColumns: Column[]
  modelValue: string[]
  defaultColumns?: string[]
}>()

const emit = defineEmits(['update:modelValue'])

const hiddenSearch = ref('')
const visibleSearch = ref('')
const selectedHidden = ref<string[]>([])
const selectedVisible = ref<string[]>([])

const hiddenColumns = computed(() =>
  props.allColumns.filter(c => !props.modelValue.includes(c.key))
)

const visibleColumns = computed(() =>
  props.modelValue.map(key => props.allColumns.find(c => c.key === key)).filter((c): c is Column => c !== undefined)
)

const filteredHidden = computed(() =>
  hiddenColumns.value.filter(c =>
    c.label.toLowerCase().includes(hiddenSearch.value.toLowerCase())
  )
)

const filteredVisible = computed(() =>
  visibleColumns.value.filter(c =>
    c.label.toLowerCase().includes(visibleSearch.value.toLowerCase())
  )
)

const toggleSelection = (list: 'hidden' | 'visible', key: string) => {
  const selectedList = list === 'hidden' ? selectedHidden : selectedVisible

  if (list === 'visible') {
    // Single selection for visible columns (radio button behavior)
    selectedList.value = selectedList.value.includes(key) ? [] : [key]
  } else {
    // Multi-selection for hidden columns (checkbox behavior)
    const index = selectedList.value.indexOf(key)
    if (index > -1) {
      selectedList.value.splice(index, 1)
    } else {
      selectedList.value.push(key)
    }
  }
}

const moveToVisible = (key: string) => {
  if (!props.modelValue.includes(key)) {
    const newVisible = [...props.modelValue, key]
    emit('update:modelValue', newVisible)
  }
}

const moveToHidden = (key: string) => {
  if (props.modelValue.includes(key)) {
    const newVisible = props.modelValue.filter(k => k !== key)
    emit('update:modelValue', newVisible)
  }
}

const moveSelectedToVisible = () => {
  const newVisible = [...props.modelValue, ...selectedHidden.value]
  selectedHidden.value = []
  emit('update:modelValue', newVisible)
}

const moveSelectedToHidden = () => {
  const newVisible = props.modelValue.filter(key => !selectedVisible.value.includes(key))
  selectedVisible.value = []
  emit('update:modelValue', newVisible)
}

const moveAllToVisible = () => {
  const newVisible = props.allColumns.map(c => c.key)
  selectedHidden.value = []
  emit('update:modelValue', newVisible)
}

const moveAllToHidden = () => {
  selectedVisible.value = []
  emit('update:modelValue', [])
}

const moveSelectedUp = () => {
  if (selectedVisible.value.length === 0) return

  const newVisible = [...props.modelValue]
  selectedVisible.value.forEach(key => {
    const index = newVisible.indexOf(key)
    if (index > 0) {
      // Swap with previous item
      [newVisible[index], newVisible[index - 1]] = [newVisible[index - 1], newVisible[index]]
    }
  })
  emit('update:modelValue', newVisible)
}

const moveSelectedDown = () => {
  if (selectedVisible.value.length === 0) return

  const newVisible = [...props.modelValue]
  // Process in reverse order to avoid index shifting issues
  const reversedSelection = selectedVisible.value.slice().reverse()
  reversedSelection.forEach(key => {
    const index = newVisible.indexOf(key)
    if (index < newVisible.length - 1) {
      // Swap with next item
      const temp = newVisible[index]
      newVisible[index] = newVisible[index + 1]
      newVisible[index + 1] = temp
    }
  })
  emit('update:modelValue', newVisible)
}

const handleKeyDown = (event: KeyboardEvent, key: string) => {
  // Only handle keyboard events for visible columns
  if (!selectedVisible.value.includes(key)) {
    selectedVisible.value = [key]
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveSelectedUp()
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveSelectedDown()
  }
}

const resetToDefault = () => {
  if (props.defaultColumns && props.defaultColumns.length > 0) {
    selectedHidden.value = []
    selectedVisible.value = []
    emit('update:modelValue', [...props.defaultColumns])
  }
}
</script>

<template>
  <div class="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
    <!-- Hidden Columns -->
    <Card>
      <CardHeader>
        <CardTitle>Hidden Columns</CardTitle>
        <Input v-model="hiddenSearch" placeholder="Search..." />
      </CardHeader>
      <CardContent>
        <ScrollArea class="h-64">
          <ul class="space-y-1">
            <li
              v-for="column in filteredHidden"
              :key="column.key"
              @click="toggleSelection('hidden', column.key)"
              @dblclick="moveToVisible(column.key)"
              :class="['p-2 rounded cursor-pointer', { 'bg-muted': selectedHidden.includes(column.key) }]"
            >
              {{ column.label }}
            </li>
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>

    <!-- Controls -->
    <div class="flex flex-col gap-2">
      <!-- Move between hidden/visible -->
      <Button @click="moveAllToVisible" :disabled="hiddenColumns.length === 0" size="icon">
        <ChevronsRight class="h-4 w-4" />
      </Button>
      <Button @click="moveSelectedToVisible" :disabled="selectedHidden.length === 0" size="icon">
        <ChevronRight class="h-4 w-4" />
      </Button>
      <Button @click="moveSelectedToHidden" :disabled="selectedVisible.length === 0" size="icon">
        <ChevronLeft class="h-4 w-4" />
      </Button>
      <Button @click="moveAllToHidden" :disabled="visibleColumns.length === 0" size="icon">
        <ChevronsLeft class="h-4 w-4" />
      </Button>

      <!-- Separator -->
      <div class="border-t my-2"></div>

      <!-- Reorder visible columns -->
      <Button @click="moveSelectedUp" :disabled="selectedVisible.length === 0" size="icon">
        <ChevronUp class="h-4 w-4" />
      </Button>
      <Button @click="moveSelectedDown" :disabled="selectedVisible.length === 0" size="icon">
        <ChevronDown class="h-4 w-4" />
      </Button>

      <!-- Separator -->
      <div class="border-t my-2"></div>

      <!-- Reset to default -->
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button @click="resetToDefault" :disabled="!defaultColumns || defaultColumns.length === 0" size="icon" variant="outline">
              <RotateCcw class="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Reset to default columns</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <!-- Visible Columns -->
    <Card>
      <CardHeader>
        <CardTitle>Visible Columns</CardTitle>
        <div class="flex gap-2 items-center">
          <Input v-model="visibleSearch" placeholder="Search..." class="flex-1" />
          <span class="text-xs text-muted-foreground">Use ↑↓ to move</span>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea class="h-64">
          <ul class="space-y-1">
            <li
              v-for="(column, index) in filteredVisible"
              :key="column.key"
              @click="toggleSelection('visible', column.key)"
              @dblclick="moveToHidden(column.key)"
              @keydown="handleKeyDown($event, column.key)"
              :class="[
                'p-2 rounded cursor-pointer flex items-center gap-2 group transition-colors',
                { 'bg-muted': selectedVisible.includes(column.key) },
                { 'hover:bg-accent': !selectedVisible.includes(column.key) }
              ]"
              tabindex="0"
            >
              <GripVertical class="h-4 w-4 text-muted-foreground opacity-50 group-hover:opacity-100 cursor-grab" />
              <span class="flex-1">{{ column.label }}</span>
              <span class="text-xs text-muted-foreground">{{ index + 1 }}</span>
            </li>
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  </div>
</template>
