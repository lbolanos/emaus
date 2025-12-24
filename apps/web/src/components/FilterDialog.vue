<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useParticipantStore } from '@/stores/participantStore';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  Label,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Input,
  Badge,
  Checkbox,
} from '@repo/ui';
import { useRoute } from 'vue-router';
import type { Tag } from '@repo/types';

const props = defineProps<{
  open: boolean;
  filters: Record<string, any>;
  defaultFilters: Record<string, any>;
  allColumns: { key: string; label: string; type?: string }[];
}>();

const emit = defineEmits(['update:open', 'update:filters']);

const { t } = useI18n();
const participantStore = useParticipantStore();
const { tags, loadingTags: isLoadingTags } = storeToRefs(participantStore);
const localFilters = ref<Record<string, any>>({});
const activeTab = ref('health');
const route = useRoute();

// Filter definitions organized by tab
const filterDefinitions = {
  health: [
    { key: 'snores', type: 'boolean' },
    { key: 'hasMedication', type: 'boolean' },
    { key: 'hasDietaryRestrictions', type: 'boolean' },
    { key: 'disabilitySupport', type: 'text' },
  ],
  logistics: [
    { key: 'tshirtSize', type: 'select', options: ['S', 'M', 'G', 'X', '2'] },
    { key: 'arrivesOnOwn', type: 'boolean' },
    { key: 'requestsSingleRoom', type: 'boolean' },
    { key: 'maritalStatus', type: 'select', options: ['single', 'married', 'separated_divorced', 'widowed', 'other'] },
    { key: 'tableMesa.name', type: 'select', options: ['unassigned'], dynamic: true },
    { key: 'retreatBed.roomNumber', type: 'select', options: ['unassigned'], dynamic: true },
  ],
  financial: [
    { key: 'paymentStatus', type: 'select', options: ['paid', 'partial', 'unpaid', 'overpaid'] },
    { key: 'isScholarship', type: 'boolean' },
  ],
  contact: [
    { key: 'city', type: 'text' },
    { key: 'parish', type: 'text' },
  ],
  registration: [
    { key: 'isInvitedByEmausMember', type: 'boolean' },
  ],
};

watch(() => props.open, (isOpen) => {
  if (isOpen) {    
    console.log('[Dialog] Open watch triggered');
    // Robust unwrapping for complex prop structures (Refs/Proxies)
    let currentFilters = props.filters || {};
    if (currentFilters && typeof currentFilters === 'object' && 'value' in currentFilters) {
      const proxyObj = currentFilters as any;
      if (proxyObj.value && typeof proxyObj.value === 'object') {
        const result = { ...proxyObj };
        delete result.value;
        currentFilters = { ...result, ...proxyObj.value };
      }
    }
    
    // Deep clone the unwrapped filters
    localFilters.value = JSON.parse(JSON.stringify(currentFilters));
    console.log('[Dialog] localFilters initialized:', localFilters.value);
    
    // Ensure tagIds is an array
    if (!localFilters.value.tagIds) {
      localFilters.value.tagIds = [];
    }    
    
    if (route.params.id) {
      participantStore.fetchTags(route.params.id as string);
    }
  }
});


const getColumnLabel = (key: string) => {
  const col = props.allColumns.find(c => c.key === key);
  return col ? t(col.label) : key;
};

const handleTagToggle = (tagId: string, checked: boolean) => {
  console.log('[Dialog] handleTagToggle:', { tagId, checked });
  const currentTags = [...(localFilters.value.tagIds || [])];
  if (checked) {
    if (!currentTags.includes(tagId)) {
      localFilters.value.tagIds = [...currentTags, tagId];
    }
  } else {
    localFilters.value.tagIds = currentTags.filter(id => id !== tagId);
  }
  console.log('[Dialog] localFilters.tagIds:', localFilters.value.tagIds);
};

const updateTextFilter = (key: string, value: string) => {
  localFilters.value = { ...localFilters.value, [key]: value };
};

const updateSelectFilter = (key: string, value: string) => {
  localFilters.value = { ...localFilters.value, [key]: value };
};

const applyFilters = () => {
  const currentFilters = localFilters.value || {};
  console.log('[Dialog] applyFilters - localFilters:', currentFilters);
  const plainFilters: Record<string, any> = {};
  Object.keys(currentFilters).forEach(key => {
    const value = currentFilters[key];
    if (value !== undefined && value !== null && value !== '') {
      if (Array.isArray(value) && value.length === 0) return;
      plainFilters[key] = value;
    }
  });
  console.log('[Dialog] applyFilters - emitting:', plainFilters);
  emit('update:filters', plainFilters);
  emit('update:open', false);
};

const resetFilters = () => {
  localFilters.value = JSON.parse(JSON.stringify(props.defaultFilters || {}));
  const currentFilters = localFilters.value || {};
  const plainFilters: Record<string, any> = {};
  Object.keys(currentFilters).forEach(key => {
    const value = currentFilters[key];
    if (value !== undefined && value !== null && value !== '') {
      if (Array.isArray(value) && value.length === 0) return;
      plainFilters[key] = value;
    }
  });
  emit('update:filters', plainFilters);
  emit('update:open', false);
};

const closeDialog = () => {
  emit('update:open', false);
};

const handleOpenChange = (value: boolean) => {
  emit('update:open', value);
};

// Helper to get select options
const getSelectOptions = (filter: any) => {
  if (filter.key === 'tableMesa.name' || filter.key === 'retreatBed.roomNumber') {
    return [
      { value: 'unassigned', label: t('participants.filters.options.unassigned') },
    ];
  }
  if (filter.key === 'paymentStatus') {
    return [
      { value: 'paid', label: t('participants.filters.options.paymentStatus.paid') },
      { value: 'partial', label: t('participants.filters.options.paymentStatus.partial') },
      { value: 'unpaid', label: t('participants.filters.options.paymentStatus.unpaid') },
      { value: 'overpaid', label: t('participants.filters.options.paymentStatus.overpaid') },
    ];
  }
  if (filter.key === 'maritalStatus') {
    return [
      { value: 'single', label: t('participants.filters.options.maritalStatus.single') },
      { value: 'married', label: t('participants.filters.options.maritalStatus.married') },
      { value: 'separated_divorced', label: t('participants.filters.options.maritalStatus.separated_divorced') },
      { value: 'widowed', label: t('participants.filters.options.maritalStatus.widowed') },
      { value: 'other', label: t('participants.filters.options.maritalStatus.other') },
    ];
  }
  return filter.options.map((opt: string) => ({
    value: opt,
    label: t(`walkerRegistration.fields.tshirtSize.options.${opt}`),
  }));
};

const getTextPlaceholder = (key: string) => {
  if (key === 'city') return t('participants.fields.city');
  if (key === 'parish') return t('participants.fields.parish');
  if (key === 'disabilitySupport') return t('participants.fields.disabilitySupport');
  return '';
};
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="max-w-2xl max-h-[90vh]">
      <DialogHeader>
        <DialogTitle>{{ t('participants.filters.title') }}</DialogTitle>
        <DialogDescription>
          Select criteria to filter the participant list.
        </DialogDescription>
      </DialogHeader>

      <Tabs v-model="activeTab" class="w-full">
        <TabsList class="grid w-full grid-cols-3 sm:grid-cols-6">
          <TabsTrigger value="health">{{ t('participants.filters.tabs.health') }}</TabsTrigger>
          <TabsTrigger value="logistics">{{ t('participants.filters.tabs.logistics') }}</TabsTrigger>
          <TabsTrigger value="financial">{{ t('participants.filters.tabs.financial') }}</TabsTrigger>
          <TabsTrigger value="contact">{{ t('participants.filters.tabs.contact') }}</TabsTrigger>
          <TabsTrigger value="registration">{{ t('participants.filters.tabs.registration') }}</TabsTrigger>
          <TabsTrigger value="tags">{{ t('participants.filters.tabs.tags') }}</TabsTrigger>
        </TabsList>

        <!-- Health Tab -->
        <TabsContent value="health" class="mt-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2 max-h-[40vh] overflow-y-auto">
            <div v-for="filter in filterDefinitions.health" :key="filter.key" class="flex items-center justify-between space-x-2">
              <Label :for="filter.key">{{ getColumnLabel(filter.key) }}</Label>
              <template v-if="filter.type === 'boolean'">
                <Switch
                  :id="filter.key"
                  v-model="localFilters[filter.key]"
                />
              </template>
              <template v-if="filter.type === 'text'">
                <Input
                  :id="filter.key"
                  :placeholder="getTextPlaceholder(filter.key)"
                  :model-value="localFilters[filter.key] || ''"
                  @update:model-value="(value: string) => updateTextFilter(filter.key, value)"
                  class="w-[180px]"
                />
              </template>
            </div>
          </div>
        </TabsContent>

        <!-- Logistics Tab -->
        <TabsContent value="logistics" class="mt-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2 max-h-[40vh] overflow-y-auto">
            <div v-for="filter in filterDefinitions.logistics" :key="filter.key" class="flex items-center justify-between space-x-2">
              <Label :for="filter.key">{{ getColumnLabel(filter.key) }}</Label>
              <template v-if="filter.type === 'boolean'">
                <Switch
                  :id="filter.key"
                  v-model="localFilters[filter.key]"
                />
              </template>
              <template v-if="filter.type === 'select'">
                <Select
                  :model-value="localFilters[filter.key] || ''"
                  @update:model-value="(value: string) => updateSelectFilter(filter.key, value)"
                >
                  <SelectTrigger class="w-[180px]">
                    <SelectValue :placeholder="t('participants.selectColumns')" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="option in getSelectOptions(filter)"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </template>
            </div>
          </div>
        </TabsContent>

        <!-- Financial Tab -->
        <TabsContent value="financial" class="mt-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2 max-h-[40vh] overflow-y-auto">
            <div v-for="filter in filterDefinitions.financial" :key="filter.key" class="flex items-center justify-between space-x-2">
              <Label :for="filter.key">{{ getColumnLabel(filter.key) }}</Label>
              <template v-if="filter.type === 'boolean'">
                <Switch
                  :id="filter.key"
                  v-model="localFilters[filter.key]"
                />
              </template>
              <template v-if="filter.type === 'select'">
                <Select
                  :model-value="localFilters[filter.key] || ''"
                  @update:model-value="(value: string) => updateSelectFilter(filter.key, value)"
                >
                  <SelectTrigger class="w-[180px]">
                    <SelectValue :placeholder="t('participants.filters.placeholder.selectPayment')" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="option in getSelectOptions(filter)"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </template>
            </div>
          </div>
        </TabsContent>

        <!-- Contact Tab -->
        <TabsContent value="contact" class="mt-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2 max-h-[40vh] overflow-y-auto">
            <div v-for="filter in filterDefinitions.contact" :key="filter.key" class="flex items-center justify-between space-x-2">
              <Label :for="filter.key">{{ getColumnLabel(filter.key) }}</Label>
              <Input
                :id="filter.key"
                :placeholder="getTextPlaceholder(filter.key)"
                :model-value="localFilters[filter.key] || ''"
                @update:model-value="(value: string) => updateTextFilter(filter.key, value)"
                class="w-[180px]"
              />
            </div>
          </div>
        </TabsContent>

        <!-- Registration Tab -->
        <TabsContent value="registration" class="mt-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2 max-h-[40vh] overflow-y-auto">
            <div v-for="filter in filterDefinitions.registration" :key="filter.key" class="flex items-center justify-between space-x-2">
              <Label :for="filter.key">{{ getColumnLabel(filter.key) }}</Label>
              <Switch
                :id="filter.key"
                v-model="localFilters[filter.key]"
              />
            </div>
          </div>
        </TabsContent>
        <!-- Tags Tab -->
        <TabsContent value="tags" class="mt-4">
          <div v-if="isLoadingTags" class="flex justify-center py-8">
            <span class="animate-spin mr-2">⏳</span>
            {{ t('common.loading') }}
          </div>
          <div v-else-if="tags.length === 0" class="text-center py-8 text-muted-foreground">
            {{ t('participants.filters.noTagsFound') }}
          </div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2 max-h-[40vh] overflow-y-auto">
            <div 
              v-for="tag in tags" 
              :key="tag.id" 
              class="flex items-center justify-between p-2 rounded-md hover:bg-accent/50 transition-colors"
            >
              <div class="flex items-center space-x-2">
                <div 
                  class="w-3 h-3 rounded-full" 
                  :style="{ backgroundColor: tag.color || '#94a3b8' }"
                ></div>
                <Label :for="`tag-${tag.id}`" class="cursor-pointer font-medium">
                  {{ tag.name }}
                </Label>
              </div>
              <Switch 
                :id="`tag-${tag.id}`"
                :checked="(localFilters.tagIds || []).includes(tag.id)"
                @update:checked="(checked: boolean) => handleTagToggle(tag.id, !!checked)"
                @update:modelValue="(checked: boolean) => handleTagToggle(tag.id, !!checked)"
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <Button variant="outline" @click="resetFilters">{{ t('common.filters.clearAll') }}</Button>
        <div class="flex-grow"></div>
        <Button variant="ghost" @click="closeDialog">{{ t('common.actions.cancel') }}</Button>
        <Button @click="applyFilters">{{ t('common.actions.submit') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
