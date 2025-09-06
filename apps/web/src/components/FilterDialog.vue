<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@repo/ui/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@repo/ui/components/ui/dialog';
import { Label } from '@repo/ui/components/ui/label';
import { Switch } from '@repo/ui/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select';

const props = defineProps<{
  open: boolean;
  filters: Record<string, any>;
  defaultFilters: Record<string, any>;
  allColumns: { key: string; label: string; type?: string }[];
}>();

const emit = defineEmits(['update:open', 'update:filters']);

const { t } = useI18n();
const localFilters = ref<Record<string, any>>({});

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    // When dialog opens, clone the current filters to local state
    localFilters.value = JSON.parse(JSON.stringify(props.filters));
  }
});

const filterableColumns = [
  { key: 'snores', type: 'boolean' },
  { key: 'hasMedication', type: 'boolean' },
  { key: 'hasDietaryRestrictions', type: 'boolean' },
  { key: 'isScholarship', type: 'boolean' },
  { key: 'requestsSingleRoom', type: 'boolean' },
  { key: 'arrivesOnOwn', type: 'boolean' },
  { key: 'tshirtSize', type: 'select', options: ['s', 'm', 'l', 'xl', 'xxl'] },
];

const getColumnLabel = (key: string) => {
  const col = props.allColumns.find(c => c.key === key);
  return col ? t(col.label) : key;
};

const applyFilters = () => {
  emit('update:filters', localFilters.value);
  emit('update:open', false);
};

const resetFilters = () => {
  localFilters.value = JSON.parse(JSON.stringify(props.defaultFilters));
  emit('update:filters', localFilters.value);
  emit('update:open', false);
};

const closeDialog = () => {
  emit('update:open', false);
};

const handleOpenChange = (value: boolean) => {
  emit('update:open', value);
};
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Filter Participants</DialogTitle>
        <DialogDescription>
          Select criteria to filter the participant list.
        </DialogDescription>
      </DialogHeader>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 max-h-[60vh] overflow-y-auto p-2">
        <div v-for="col in filterableColumns" :key="col.key" class="flex items-center justify-between space-x-2">
          <Label :for="col.key">{{ getColumnLabel(col.key) }}</Label>
          <template v-if="col.type === 'boolean'">
            <Switch
              :id="col.key"
              :checked="localFilters[col.key]"
              @update:checked="(value) => localFilters[col.key] = value"
            />
          </template>
          <template v-if="col.type === 'select'">
             <Select v-model="localFilters[col.key]">
              <SelectTrigger class="w-[180px]">
                <SelectValue :placeholder="`Select ${getColumnLabel(col.key)}`" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="option in col.options" :key="option" :value="option">
                  {{ t(`walkerRegistration.fields.tshirtSize.options.${option}`) }}
                </SelectItem>
              </SelectContent>
            </Select>
          </template>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="resetFilters">Reset to Default</Button>
        <div class="flex-grow"></div>
        <Button variant="ghost" @click="closeDialog">Cancel</Button>
        <Button @click="applyFilters">Apply Filters</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
