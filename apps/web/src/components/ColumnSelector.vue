<script setup lang="ts">
import { ref, computed } from 'vue'
import { Input } from '@repo/ui/components/ui/input'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { ScrollArea } from '@repo/ui/components/ui/scroll-area'
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-vue-next'

type Column = {
  key: string
  label: string
}

const props = defineProps<{
  allColumns: Column[]
  modelValue: string[]
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
  props.allColumns.filter(c => props.modelValue.includes(c.key))
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
  const index = selectedList.value.indexOf(key)
  if (index > -1) {
    selectedList.value.splice(index, 1)
  } else {
    selectedList.value.push(key)
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
    </div>

    <!-- Visible Columns -->
    <Card>
      <CardHeader>
        <CardTitle>Visible Columns</CardTitle>
        <Input v-model="visibleSearch" placeholder="Search..." />
      </CardHeader>
      <CardContent>
        <ScrollArea class="h-64">
          <ul class="space-y-1">
            <li
              v-for="column in filteredVisible"
              :key="column.key"
              @click="toggleSelection('visible', column.key)"
              @dblclick="moveToHidden(column.key)"
              :class="['p-2 rounded cursor-pointer', { 'bg-muted': selectedVisible.includes(column.key) }]"
            >
              {{ column.label }}
            </li>
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  </div>
</template>
