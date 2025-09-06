<script setup lang="ts">
import { ref, watch } from 'vue';
import { Button } from '@repo/ui/components/ui/button';
import { Input } from '@repo/ui/components/ui/input';
import { Label } from '@repo/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select';
import { Switch } from '@repo/ui/components/ui/switch';
import { Textarea } from '@repo/ui/components/ui/textarea';

const props = defineProps<{
  participant: any;
  columnsToShow: string[];
  columnsToEdit: string[];
  allColumns: { key: string; label: string; type?: string }[];
}>();

const emit = defineEmits(['save', 'cancel']);

const localParticipant = ref<any>({});

watch(() => props.participant, (newVal) => {
  localParticipant.value = { ...newVal };
}, { immediate: true, deep: true });

const getColumnLabel = (key: string) => {
  const col = props.allColumns.find(c => c.key === key);
  return col ? col.label : key;
};

const getColumnType = (key: string) => {
    const col = props.allColumns.find(c => c.key === key);
    if (col && col.type) return col.type;
    if (key === 'palancasCoordinator') return 'select';
    if (key.startsWith('is') || key.startsWith('has') || key.startsWith('requests') || key === 'arrivesOnOwn' || key === 'snores' || key === 'palancasRequested') return 'boolean';
    if (key.toLowerCase().includes('notes') || key.toLowerCase().includes('details')) return 'textarea';
    if (key.toLowerCase().includes('date')) return 'date';
    return 'text';
}

const handleSave = () => {
  const participantToSave = { ...localParticipant.value };
  if (participantToSave.retreatBedId === null || participantToSave.retreatBedId === '') {
    delete participantToSave.retreatBedId;
  }
  if (participantToSave.tableId === null || participantToSave.tableId === '') {
    delete participantToSave.tableId;
  }

  for (const key in participantToSave) {
    if (getColumnType(key) === 'boolean' && participantToSave[key] === null) {
      participantToSave[key] = false;
    }
  }

  emit('save', participantToSave);
};

const handleCancel = () => {
  emit('cancel');
};
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto p-2">
    <div v-for="key in columnsToShow" :key="key" class="space-y-2">
      <Label :for="key">{{ getColumnLabel(key) }}</Label>
      <template v-if="columnsToEdit.includes(key)">
        <Input
          v-if="getColumnType(key) === 'text'"
          :id="key"
          v-model="localParticipant[key]"
          class="w-full"
        />
         <Input
          v-if="getColumnType(key) === 'date'"
          type="date"
          :id="key"
          v-model="localParticipant[key]"
          class="w-full"
        />
        <Textarea
            v-if="getColumnType(key) === 'textarea'"
            :id="key"
            v-model="localParticipant[key]"
            class="w-full"
        />
        <Switch
          v-if="getColumnType(key) === 'boolean'"
          :id="key"
          :model-value="localParticipant[key]"
          @update:model-value="(value: string) => localParticipant[key] = value"
        />
        <Select
          v-if="getColumnType(key) === 'select' && key === 'palancasCoordinator'"
          :model-value="localParticipant[key]"
          @update:model-value="(value: string) => localParticipant[key] = value"
        >
          <SelectTrigger class="w-full">
            <SelectValue placeholder="Select Palancas Coordinator" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Palancas 1">Palancas 1</SelectItem>
            <SelectItem value="Palancas 2">Palancas 2</SelectItem>
            <SelectItem value="Palancas 3">Palancas 3</SelectItem>
          </SelectContent>
        </Select>
      </template>
      <p v-else class="text-sm text-gray-500 pt-2">{{ participant[key] || 'N/A' }}</p>
    </div>
  </div>
  <div class="flex justify-end gap-2 mt-4">
    <Button variant="outline" @click="handleCancel">{{ 'Cancel' }}</Button>
    <Button @click="handleSave">{{ 'Save' }}</Button>
  </div>
</template>
