<template>
  <Card class="flex flex-col">
    <CardHeader>
      <CardTitle class="flex items-center justify-between">
        {{ table.name }}
        <span class="text-sm font-normal text-gray-500 dark:text-gray-400">
          {{ table.walkers?.length || 0 }} / 7
        </span>
      </CardTitle>
    </CardHeader>
    <CardContent class="flex-grow">
      <div class="space-y-4">
        <div
          @drop="onDrop($event, 'lider')"
          @dragover.prevent="onDragOver($event, 'server')"
          @dragleave.prevent="onDragLeave($event, 'server')"
          class="p-2 border-2 border-dashed rounded-md transition-colors"
          :class="{ 'border-primary bg-primary/10': isOverServer && dragOverRole === 'lider' }"
        >
          <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ $t('tables.leader') }}</h4>
          <div class="mt-1 min-h-[24px]">
            <span v-if="table.lider">{{ table.lider.firstName }} {{ table.lider.lastName }}</span>
            <span v-else class="text-gray-400">{{ $t('tables.unassigned') }}</span>
          </div>
        </div>
        <div
          @drop="onDrop($event, 'colider1')"
          @dragover.prevent="onDragOver($event, 'server')"
          @dragleave.prevent="onDragLeave($event, 'server')"
          class="p-2 border-2 border-dashed rounded-md transition-colors"
          :class="{ 'border-primary bg-primary/10': isOverServer && dragOverRole === 'colider1' }"
        >
          <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ $t('tables.coLeader1') }}</h4>
          <div class="mt-1 min-h-[24px]">
            <span v-if="table.colider1">{{ table.colider1.firstName }} {{ table.colider1.lastName }}</span>
            <span v-else class="text-gray-400">{{ $t('tables.unassigned') }}</span>
          </div>
        </div>
        <div
          @drop="onDrop($event, 'colider2')"
          @dragover.prevent="onDragOver($event, 'server')"
          @dragleave.prevent="onDragLeave($event, 'server')"
          class="p-2 border-2 border-dashed rounded-md transition-colors"
          :class="{ 'border-primary bg-primary/10': isOverServer && dragOverRole === 'colider2' }"
        >
          <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ $t('tables.coLeader2') }}</h4>
          <div class="mt-1 min-h-[24px]">
            <span v-if="table.colider2">{{ table.colider2.firstName }} {{ table.colider2.lastName }}</span>
            <span v-else class="text-gray-400">{{ $t('tables.unassigned') }}</span>
          </div>
        </div>
        <div
          @drop="onDrop($event, 'walkers')"
          @dragover.prevent="onDragOver($event, 'walker')"
          @dragleave.prevent="onDragLeave($event, 'walker')"
          class="p-2 border-2 border-dashed rounded-md transition-colors min-h-[100px]"
          :class="{ 'border-primary bg-primary/10': isOverWalker }"
        >
          <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ $t('tables.walkers') }} ({{ table.walkers?.length || 0 }})</h4>
          <ul class="mt-1 list-disc list-inside text-sm">
            <li v-for="walker in table.walkers" :key="walker.id">
              {{ walker.firstName }} {{ walker.lastName }}
            </li>
            <li v-if="!table.walkers || table.walkers.length === 0" class="text-gray-400 list-none">
              {{ $t('tables.unassigned') }}
            </li>
          </ul>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { PropType } from 'vue';
import type { Participant, TableMesa } from '@repo/types';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card';
import { useTableMesaStore } from '@/stores/tableMesaStore';

const props = defineProps({
  table: {
    type: Object as PropType<TableMesa>,
    required: true,
  },
});

const tableMesaStore = useTableMesaStore();

const isOverServer = ref(false);
const isOverWalker = ref(false);
const dragOverRole = ref<'lider' | 'colider1' | 'colider2' | null>(null);

const onDrop = (event: DragEvent, role: 'lider' | 'colider1' | 'colider2' | 'walkers') => {
  isOverServer.value = false;
  isOverWalker.value = false;
  dragOverRole.value = null;
  const participantData = event.dataTransfer?.getData('application/json');
  if (!participantData) return;

  const participant: Participant = JSON.parse(participantData);

  if (role === 'walkers' && participant.type === 'walker') {
    tableMesaStore.assignWalkerToTable(props.table.id, participant.id);
  } else if (['lider', 'colider1', 'colider2'].includes(role) && participant.type === 'server') {
    tableMesaStore.assignLeader(props.table.id, participant.id, role as 'lider' | 'colider1' | 'colider2');
  }
};

const onDragOver = (event: DragEvent, type: 'server' | 'walker') => {
  if (type === 'server') {
    isOverServer.value = true;
    const target = event.currentTarget as HTMLElement;
    const role = target.querySelector('h4')?.textContent?.toLowerCase().includes('leader') ? (target.querySelector('h4')?.textContent?.toLowerCase().includes('co-leader 1') ? 'colider1' : (target.querySelector('h4')?.textContent?.toLowerCase().includes('co-leader 2') ? 'colider2' : 'lider')) : null;
    if (role) dragOverRole.value = role;
  } else {
    isOverWalker.value = true;
  }
};

const onDragLeave = (event: DragEvent, type: 'server' | 'walker') => {
  if (type === 'server') {
    isOverServer.value = false;
    dragOverRole.value = null;
  } else {
    isOverWalker.value = false;
  }
};
</script>