<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Button } from '@repo/ui';
import { Label } from '@repo/ui';
import { Input } from '@repo/ui';
import { Textarea } from '@repo/ui';
import { Switch } from '@repo/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';
import { useToast } from '@repo/ui';
import { useI18n } from 'vue-i18n';

interface Props {
  isOpen: boolean;
  participants: any[];
  allColumns: { key: string; label: string }[];
}

interface EditFields {
  [key: string]: any;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:isOpen': [value: boolean];
  save: [updatedParticipants: any[]];
}>();

const { toast } = useToast();
const { t: $t } = useI18n();

// Local state for form fields
const editFields = ref<EditFields>({});
const expandedSections = ref<Set<string>>(new Set(['core', 'health']));

// Field categories for better organization
const fieldCategories = {
  core: {
    label: $t('participants.bulkEdit.categories.core'),
    icon: '👤',
    fields: ['isCancelled', 'type', 'tshirtSize', 'notes']
  },
  health: {
    label: $t('participants.bulkEdit.categories.health'),
    icon: '🏥',
    fields: ['snores', 'hasMedication', 'hasDietaryRestrictions', 'medicationDetails', 'dietaryRestrictionsDetails']
  },
  logistics: {
    label: $t('participants.bulkEdit.categories.logistics'),
    icon: '🚗',
    fields: ['pickupLocation', 'arrivesOnOwn', 'requestsSingleRoom', 'tableMesa.name']
  },
  payment: {
    label: $t('participants.bulkEdit.categories.payment'),
    icon: '💰',
    fields: ['paymentDate', 'paymentAmount', 'isScholarship']
  },
  palancas: {
    label: $t('participants.bulkEdit.categories.palancas'),
    icon: '🙏',
    fields: ['palancasCoordinator', 'palancasRequested', 'palancasReceived', 'palancasNotes']
  }
};

// Get column label by key
const getColumnLabel = (key: string) => {
  const col = props.allColumns.find(c => c.key === key);
  return col ? $t(col.label) : key;
};

// Smart field type detection (reused from EditParticipantForm)
const getFieldType = (key: string) => {
  if (key === 'type') return 'select';
  if (key === 'tshirtSize') return 'select';
  if (key === 'tableMesa.name') return 'text';
  if (key.startsWith('is') || key.startsWith('has') || key.startsWith('requests') || key === 'arrivesOnOwn' || key === 'snores' || key === 'palancasRequested') return 'boolean';
  if (key.toLowerCase().includes('notes') || key.toLowerCase().includes('details')) return 'textarea';
  if (key.toLowerCase().includes('date')) return 'date';
  if (key.toLowerCase().includes('amount')) return 'number';
  return 'text';
};

// Get select options for specific fields
const getSelectOptions = (key: string) => {
  switch (key) {
    case 'type':
      return [
        { value: 'walker', label: $t('participants.types.walker') },
        { value: 'server', label: $t('participants.types.server') }
      ];
    case 'tshirtSize':
      return [
        { value: 'XS', label: 'XS' },
        { value: 'S', label: 'S' },
        { value: 'M', label: 'M' },
        { value: 'L', label: 'L' },
        { value: 'XL', label: 'XL' },
        { value: 'XXL', label: 'XXL' }
      ];
    default:
      return [];
  }
};

// Toggle section expansion
const toggleSection = (category: string) => {
  if (expandedSections.value.has(category)) {
    expandedSections.value.delete(category);
  } else {
    expandedSections.value.add(category);
  }
};

// Check if any field in a category has changes
const hasChangesInCategory = (category: string) => {
  const fields = fieldCategories[category as keyof typeof fieldCategories].fields;
  return fields.some(field => editFields.value[field] !== undefined && editFields.value[field] !== '');
};

// Get formatted value for display
const getFormattedValue = (value: any) => {
  if (value === true) return $t('common.yes');
  if (value === false) return $t('common.no');
  if (value === null || value === undefined || value === '') return $t('common.noChange');
  return value;
};

// Count of fields with changes
const changesCount = computed(() => {
  return Object.keys(editFields.value).filter(key =>
    editFields.value[key] !== undefined && editFields.value[key] !== ''
  ).length;
});

// Check if participant will be affected by changes
const getAffectedFields = (participant: any) => {
  const affected: string[] = [];
  Object.keys(editFields.value).forEach(key => {
    if (editFields.value[key] !== undefined && editFields.value[key] !== '') {
      const currentValue = getNestedProperty(participant, key);
      const newValue = editFields.value[key];
      if (currentValue !== newValue) {
        affected.push(key);
      }
    }
  });
  return affected;
};

// Helper to get nested property
const getNestedProperty = (obj: any, path: string) => {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

// Set nested property
const setNestedProperty = (obj: any, path: string, value: any) => {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  const target = keys.reduce((acc, key) => acc[key] = acc[key] || {}, obj);
  target[lastKey] = value;
};

// Save bulk changes
const saveBulkChanges = async () => {
  try {
    const updatedParticipants = props.participants.map(participant => {
      const updatedParticipant = { ...participant };

      // Apply all changes
      Object.keys(editFields.value).forEach(key => {
        if (editFields.value[key] !== undefined && editFields.value[key] !== '') {
          setNestedProperty(updatedParticipant, key, editFields.value[key]);
        }
      });

      // Clean up potentially problematic nested objects
      // If tableMesa is empty or null, don't send it to avoid validation errors
      if (!updatedParticipant.tableMesa || (updatedParticipant.tableMesa && Object.keys(updatedParticipant.tableMesa).length === 0)) {
        delete updatedParticipant.tableMesa;
      }

      return updatedParticipant;
    });

    emit('save', updatedParticipants);

    toast({
      title: $t('participants.bulkEdit.successTitle'),
      description: $t('participants.bulkEdit.successDesc', {
        participantCount: props.participants.length,
        changesCount: changesCount.value
      }),
    });

    // Reset form and close modal
    editFields.value = {};
    emit('update:isOpen', false);
  } catch (error) {
    toast({
      title: $t('participants.bulkEdit.errorTitle'),
      description: $t('participants.bulkEdit.errorDesc'),
      variant: 'destructive',
    });
  }
};

// Cancel and close
const cancelEdit = () => {
  editFields.value = {};
  emit('update:isOpen', false);
};

// Watch for modal open/close to reset form
watch(() => props.isOpen, (newValue) => {
  if (!newValue) {
    editFields.value = {};
  }
});
</script>

<style scoped>
/* Custom scrollbar styles for better appearance */
.scrollbar-thin::-webkit-scrollbar {
  width: 6px;
}

.scrollbar-thin::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.scrollbar-thin::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}

.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

/* Firefox scrollbar styles */
.scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: #d1d5db #f1f1f1;
}
</style>

<template>
  <Teleport to="body" v-if="isOpen">
    <div
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      @click.self="cancelEdit"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between p-6 border-b bg-gray-50">
          <div>
            <h2 class="text-xl font-semibold text-gray-900">
              {{ $t('participants.bulkEdit.title') }}
            </h2>
            <p class="text-gray-600 mt-1">
              {{ $t('participants.bulkEdit.description', { count: participants.length }) }}
            </p>
          </div>
          <Button variant="ghost" size="icon" @click="cancelEdit">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </Button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-hidden">
          <div class="flex h-full">
            <!-- Participants List (Left Sidebar) -->
            <div class="w-80 border-r bg-gray-50 overflow-hidden flex flex-col">
              <div class="p-4 border-b bg-white">
                <h3 class="font-medium text-gray-900">{{ $t('participants.bulkEdit.affectedParticipants') }}</h3>
                <p class="text-sm text-gray-600 mt-1">{{ $t('participants.bulkEdit.participantCount', { count: participants.length }) }}</p>
              </div>
              <div class="flex-1 overflow-y-auto p-4 max-h-[500px] scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                <div class="space-y-2">
                  <div
                    v-for="participant in participants"
                    :key="participant.id"
                    class="bg-white p-3 rounded border border-gray-200"
                  >
                    <div class="font-medium text-sm">
                      {{ participant.firstName }} {{ participant.lastName }}
                    </div>
                    <div class="text-xs text-gray-500 mt-1">
                      {{ participant.cellPhone || $t('participants.bulkEdit.noPhone') }}
                    </div>
                    <div class="mt-2">
                      <div class="text-xs font-medium text-blue-600">
                        {{ $t('participants.bulkEdit.fieldsToModify') }}: {{ getAffectedFields(participant).length }}
                      </div>
                      <div class="mt-1 space-y-1">
                        <div
                          v-for="field in getAffectedFields(participant).slice(0, 3)"
                          :key="field"
                          class="text-xs text-gray-600"
                        >
                          {{ getColumnLabel(field) }}
                        </div>
                        <div
                          v-if="getAffectedFields(participant).length > 3"
                          class="text-xs text-gray-400"
                        >
                          ... {{ $t('common.and') }} {{ getAffectedFields(participant).length - 3 }} {{ $t('common.more') }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Edit Fields (Main Content) -->
            <div class="flex-1 overflow-y-auto">
              <div class="p-6">
                <!-- Instructions -->
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <div class="flex items-start">
                    <svg class="w-5 h-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <div>
                      <h4 class="font-medium text-blue-900">{{ $t('participants.bulkEdit.instructions') }}</h4>
                      <p class="text-sm text-blue-700 mt-1">
                        {{ $t('participants.bulkEdit.instructionsText') }}
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Field Categories -->
                <div class="max-h-[400px] overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                  <div
                    v-for="(category, categoryKey) in fieldCategories"
                    :key="categoryKey"
                    class="border border-gray-200 rounded-lg overflow-hidden"
                  >
                    <!-- Category Header -->
                    <button
                      @click="toggleSection(categoryKey)"
                      class="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
                    >
                      <div class="flex items-center">
                        <span class="text-lg mr-2">{{ category.icon }}</span>
                        <span class="font-medium text-gray-900">{{ category.label }}</span>
                        <span
                          v-if="hasChangesInCategory(categoryKey)"
                          class="ml-2 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full"
                        >
                          {{ category.fields.filter(field => editFields[field] !== undefined && editFields[field] !== '').length }}
                        </span>
                      </div>
                      <svg
                        class="w-4 h-4 text-gray-500 transition-transform"
                        :class="{ 'rotate-180': expandedSections.has(categoryKey) }"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                      </svg>
                    </button>

                    <!-- Category Fields -->
                    <div
                      v-show="expandedSections.has(categoryKey)"
                      class="p-4 space-y-4 bg-white"
                    >
                      <div
                        v-for="field in category.fields"
                        :key="field"
                        class="space-y-2"
                      >
                        <Label :for="field" class="text-sm font-medium text-gray-700">
                          {{ getColumnLabel(field) }}
                        </Label>

                        <!-- Boolean fields -->
                        <div v-if="getFieldType(field) === 'boolean'" class="flex items-center space-x-4">
                          <label class="flex items-center">
                            <input
                              type="radio"
                              :name="field"
                              :value="true"
                              v-model="editFields[field]"
                              class="text-blue-600 focus:ring-blue-500"
                            />
                            <span class="ml-2 text-sm">{{ $t('common.yes') }}</span>
                          </label>
                          <label class="flex items-center">
                            <input
                              type="radio"
                              :name="field"
                              :value="false"
                              v-model="editFields[field]"
                              class="text-blue-600 focus:ring-blue-500"
                            />
                            <span class="ml-2 text-sm">{{ $t('common.no') }}</span>
                          </label>
                          <label class="flex items-center">
                            <input
                              type="radio"
                              :name="field"
                              :value="undefined"
                              v-model="editFields[field]"
                              class="text-blue-600 focus:ring-blue-500"
                            />
                            <span class="ml-2 text-sm text-gray-500">{{ $t('common.noChange') }}</span>
                          </label>
                        </div>

                        <!-- Select fields -->
                        <Select v-else-if="getFieldType(field) === 'select'" v-model="editFields[field]">
                          <SelectTrigger>
                            <SelectValue :placeholder="$t('common.noChange')" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem :value="undefined">{{ $t('common.noChange') }}</SelectItem>
                            <SelectItem
                              v-for="option in getSelectOptions(field)"
                              :key="option.value"
                              :value="option.value"
                            >
                              {{ option.label }}
                            </SelectItem>
                          </SelectContent>
                        </Select>

                        <!-- Textarea fields -->
                        <Textarea
                          v-else-if="getFieldType(field) === 'textarea'"
                          :id="field"
                          v-model="editFields[field]"
                          :placeholder="$t('common.noChange')"
                          rows="3"
                          class="text-sm"
                        />

                        <!-- Date fields -->
                        <Input
                          v-else-if="getFieldType(field) === 'date'"
                          :id="field"
                          type="date"
                          v-model="editFields[field]"
                          class="text-sm"
                        />

                        <!-- Number fields -->
                        <Input
                          v-else-if="getFieldType(field) === 'number'"
                          :id="field"
                          type="number"
                          v-model="editFields[field]"
                          :placeholder="$t('common.noChange')"
                          class="text-sm"
                        />

                        <!-- Text fields (default) -->
                        <Input
                          v-else
                          :id="field"
                          type="text"
                          v-model="editFields[field]"
                          :placeholder="$t('common.noChange')"
                          class="text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between p-6 border-t bg-gray-50">
          <div class="text-sm text-gray-600">
            <span v-if="changesCount > 0" class="font-medium text-blue-600">
              {{ $t('participants.bulkEdit.changesReady', { count: changesCount }) }}
            </span>
            <span v-else class="text-gray-500">
              {{ $t('participants.bulkEdit.noChanges') }}
            </span>
          </div>
          <div class="flex items-center space-x-3">
            <Button variant="outline" @click="cancelEdit">
              {{ $t('common.actions.cancel') }}
            </Button>
            <Button
              @click="saveBulkChanges"
              :disabled="changesCount === 0"
              class="min-w-[140px]"
            >
              {{ $t('participants.bulkEdit.saveChanges') }}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>