<template>
  <Teleport to="body" v-if="modalOpen">
    <!-- Backdrop -->
    <div
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      @click.self="resetExport"
    >
      <!-- Modal Content -->
      <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between p-6 border-b">
          <div>
            <h2 class="text-xl font-semibold">{{ $t('participants.export.title') }}</h2>
            <p class="text-gray-600 mt-1">{{ $t('participants.export.description') }}</p>
          </div>
          <Button variant="ghost" size="icon" @click="resetExport" :disabled="isExporting">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </Button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-6">
          <div class="space-y-6">
            <!-- Export Options -->
            <div class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <!-- Export Scope -->
                <div class="space-y-3">
                  <label class="text-sm font-medium">{{ $t('participants.export.scope') }}</label>
                  <div class="space-y-2">
                    <label class="flex items-center space-x-2">
                      <input
                        type="radio"
                        v-model="exportScope"
                        value="all"
                        class="text-blue-600 focus:ring-blue-500"
                      />
                      <span class="text-sm">{{ $t('participants.export.allParticipants') }} ({{ totalParticipantsCount }})</span>
                    </label>
                    <label class="flex items-center space-x-2">
                      <input
                        type="radio"
                        v-model="exportScope"
                        value="selected"
                        :disabled="selectedParticipantsCount === 0"
                        class="text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                      />
                      <span class="text-sm">{{ $t('participants.export.selectedParticipants') }} ({{ selectedParticipantsCount }})</span>
                    </label>
                  </div>
                </div>

                <!-- Export Format -->
                <div class="space-y-3">
                  <label class="text-sm font-medium">{{ $t('participants.export.format') }}</label>
                  <div class="space-y-2">
                    <label class="flex items-center space-x-2">
                      <input
                        type="radio"
                        v-model="exportFormat"
                        value="xlsx"
                        class="text-blue-600 focus:ring-blue-500"
                      />
                      <span class="text-sm">{{ $t('participants.export.formatXlsx') }}</span>
                    </label>
                    <label class="flex items-center space-x-2">
                      <input
                        type="radio"
                        v-model="exportFormat"
                        value="csv"
                        class="text-blue-600 focus:ring-blue-500"
                      />
                      <span class="text-sm">{{ $t('participants.export.formatCsv') }}</span>
                    </label>
                  </div>
                </div>
              </div>

              <!-- Custom Filename -->
              <div class="space-y-2">
                <label for="filename" class="text-sm font-medium">{{ $t('participants.export.filename') }}</label>
                <Input
                  id="filename"
                  v-model="customFilename"
                  :placeholder="defaultFilename"
                  class="max-w-sm"
                />
              </div>
            </div>

            <!-- Column Selection -->
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <h3 class="text-lg font-semibold">{{ $t('participants.export.columns') }}</h3>
                <div class="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    @click="selectAllColumns"
                  >
                    {{ $t('participants.export.selectAll') }}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    @click="selectVisibleColumns"
                  >
                    {{ $t('participants.export.selectVisible') }}
                  </Button>
                </div>
              </div>

              <div class="border rounded-lg p-4 max-h-48 overflow-y-auto">
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  <label v-for="column in allColumns" :key="column.key" class="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      :checked="selectedColumns.includes(column.key)"
                      @change="toggleColumn(column.key)"
                      class="text-blue-600 focus:ring-blue-500 rounded"
                    />
                    <span class="text-sm">{{ $t(column.label) }}</span>
                  </label>
                </div>
              </div>
            </div>

            <!-- Data Preview -->
            <div v-if="previewData.length > 0" class="space-y-4">
              <div class="flex justify-between items-center">
                <h3 class="text-lg font-semibold">{{ $t('participants.export.preview') }}</h3>
                <div class="text-sm text-gray-500">
                  {{ $t('participants.export.previewRows', { count: previewData.length }) }}
                </div>
              </div>

              <div class="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader class="sticky top-0 bg-white">
                    <TableRow>
                      <TableHead v-for="header in previewHeaders" :key="header">
                        {{ header }}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow v-for="(row, index) in previewData" :key="index">
                      <TableCell v-for="header in previewHeaders" :key="header">
                        {{ truncateText(String(row[header] || ''), 20) }}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            <!-- Export Status -->
            <div v-if="isExporting" class="space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                  <Loader2 class="w-5 h-5 animate-spin text-blue-500" />
                  <span class="text-sm font-medium">{{ $t('participants.export.processing') }}</span>
                </div>
                <span class="text-sm text-gray-500">{{ exportProgress }}%</span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div
                  class="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  :style="{ width: `${exportProgress}%` }"
                ></div>
              </div>
            </div>

            <!-- Success Message -->
            <div v-if="exportComplete && !isExporting" class="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div class="flex items-start">
                <CheckCircle class="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 class="font-medium text-green-800">{{ $t('participants.export.successTitle') }}</h4>
                  <p class="text-green-600 mt-1">
                    {{ $t('participants.export.successDesc', {
                      count: exportedCount,
                      filename: finalFilename
                    }) }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex justify-end gap-2 p-6 border-t">
          <Button variant="outline" @click="resetExport" :disabled="isExporting">
            {{ exportComplete ? $t('common.actions.close') : $t('common.actions.cancel') }}
          </Button>
          <Button variant="outline" @click="updatePreview" :disabled="isExporting">
            {{ $t('participants.export.updatePreview') }}
          </Button>
          <Button
            @click="confirmExport"
            :disabled="selectedColumns.length === 0 || isExporting"
          >
            <Download class="w-4 h-4 mr-2" />
            {{ $t('participants.export.startExport') }}
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ExcelJS from 'exceljs';
import { useToast } from '@repo/ui';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';
import {
  Download,
  Loader2,
  CheckCircle,
} from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  allColumns: any[];
  visibleColumns: string[];
  selectedColumns: string[];
  allParticipants: any[];
  selectedParticipants: Set<string>;
  currentType?: string;
}>();

const emit = defineEmits<{
  'update:isOpen': [value: boolean];
  'update:selectedColumns': [columns: string[]];
  export: [data: any[], format: string, filename: string];
}>();

const { toast } = useToast();
const { t: $t } = useI18n();

// Reactive state
const modalOpen = ref(false);
const exportScope = ref<'all' | 'selected'>('all');
const exportFormat = ref<'xlsx' | 'csv'>('xlsx');
const customFilename = ref('');
const isExporting = ref(false);
const exportProgress = ref(0);
const exportComplete = ref(false);
const exportedCount = ref(0);
const finalFilename = ref('');

// Computed properties
const totalParticipantsCount = computed(() => props.allParticipants.length);
const selectedParticipantsCount = computed(() => props.selectedParticipants.size);
const previewData = ref<any[]>([]);
const previewHeaders = ref<string[]>([]);

const defaultFilename = computed(() => {
  const timestamp = new Date().toISOString().slice(0, 10);
  const scope = exportScope.value === 'selected' ? 'selected_' : '';
  const type = props.currentType || 'all';
  return `${scope}participants_${type}_${timestamp}`;
});

// Sync modalOpen with props.isOpen
watch(() => props.isOpen, (isOpen) => {
  modalOpen.value = isOpen;
}, { immediate: true });

watch(modalOpen, (isOpen) => {
  emit('update:isOpen', isOpen);
  if (!isOpen) {
    resetExport();
  }
});

// Watchers
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    // Initialize with visible columns
    emit('update:selectedColumns', [...props.visibleColumns]);
    updatePreview();
  }
});

watch(() => props.allParticipants, () => {
  updatePreview();
}, { deep: true });

watch([exportScope, () => props.selectedColumns], () => {
  updatePreview();
}, { deep: true });

// Methods
const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

const selectAllColumns = () => {
  emit('update:selectedColumns', props.allColumns.map(col => col.key));
};

const selectVisibleColumns = () => {
  emit('update:selectedColumns', [...props.visibleColumns]);
};

const toggleColumn = (columnKey: string) => {
  const currentSelected = [...props.selectedColumns];
  const index = currentSelected.indexOf(columnKey);

  if (index > -1) {
    currentSelected.splice(index, 1);
  } else {
    currentSelected.push(columnKey);
  }

  emit('update:selectedColumns', currentSelected);
};

const updatePreview = () => {
  const participantsToPreview = getParticipantsToExport();
  const previewSize = Math.min(5, participantsToPreview.length);

  if (previewSize > 0) {
    const previewParticipants = participantsToPreview.slice(0, previewSize);
    const previewRecord = createExportRecord(previewParticipants[0], props.selectedColumns);

    previewData.value = previewParticipants.map(p => createExportRecord(p, props.selectedColumns));
    previewHeaders.value = Object.keys(previewRecord);
  } else {
    previewData.value = [];
    previewHeaders.value = [];
  }
};

const createExportRecord = (participant: any, columns: string[]): Record<string, any> => {
  const record: Record<string, any> = {};

  columns.forEach(columnKey => {
    const column = props.allColumns.find(col => col.key === columnKey);
    if (column) {
      // Get nested property value
      const value = getNestedProperty(participant, columnKey);

      // Format based on column type
      if (['birthDate', 'registrationDate', 'lastUpdatedDate', 'lastPaymentDate'].includes(columnKey)) {
        if (value) {
          record[$t(column.label)] = new Date(value).toISOString().split('T')[0];
        } else {
          record[$t(column.label)] = '';
        }
      } else if (typeof value === 'boolean') {
        record[$t(column.label)] = value ? $t('common.yes') : $t('common.no');
      } else {
        record[$t(column.label)] = value || '';
      }
    }
  });

  return record;
};

const getNestedProperty = (obj: any, path: string) => {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

const getParticipantsToExport = (): any[] => {
  if (exportScope.value === 'selected') {
    const selectedIds = Array.from(props.selectedParticipants);
    return props.allParticipants.filter(p => selectedIds.includes(p.id));
  }
  return props.allParticipants;
};

const confirmExport = async () => {
  const participantsToExport = getParticipantsToExport();

  if (participantsToExport.length === 0) {
    toast({
      title: $t('participants.export.errorTitle'),
      description: $t('participants.export.errorNoData'),
      variant: 'destructive',
    });
    return;
  }

  isExporting.value = true;
  exportProgress.value = 0;
  exportComplete.value = false;

  try {
    // Simulate progress
    exportProgress.value = 25;

    const exportData = participantsToExport.map(p => createExportRecord(p, props.selectedColumns));
    const filename = customFilename.value.trim() || defaultFilename.value;

    exportProgress.value = 50;

    // Perform the actual export
    emit('export', exportData, exportFormat.value, filename);

    exportProgress.value = 100;
    exportComplete.value = true;
    exportedCount.value = participantsToExport.length;
    finalFilename.value = `${filename}.${exportFormat.value}`;

  } catch (error: any) {
    console.error('Export error:', error);
    toast({
      title: $t('participants.export.errorTitle'),
      description: $t('participants.export.errorGeneric'),
      variant: 'destructive',
    });
  } finally {
    isExporting.value = false;
  }
};

const resetExport = () => {
  exportScope.value = 'all';
  exportFormat.value = 'xlsx';
  customFilename.value = '';
  isExporting.value = false;
  exportProgress.value = 0;
  exportComplete.value = false;

  emit('update:isOpen', false);
};
</script>

<style scoped>
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
