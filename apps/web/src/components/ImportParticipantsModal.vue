<template>
  <Teleport to="body" v-if="modalOpen">
    <!-- Backdrop -->
    <div
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      @click.self="resetImport"
    >
      <!-- Modal Content -->
      <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between p-6 border-b">
          <div>
            <h2 class="text-xl font-semibold">{{ $t('participants.import.title') }}</h2>
            <p class="text-gray-600 mt-1">{{ $t('participants.import.description') }}</p>
          </div>
          <Button variant="ghost" size="icon" @click="resetImport" :disabled="isImporting">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </Button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-6">
          <div class="space-y-6">
            <!-- File Upload Section -->
            <div class="space-y-4">
              <div
                @dragenter.prevent="handleDragEnter"
                @dragleave.prevent="handleDragLeave"
                @dragover.prevent="handleDragOver"
                @drop.prevent="handleDrop"
                :class="[
                  'relative border-2 border-dashed rounded-lg p-8 text-center transition-colors',
                  isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400',
                  selectedFile ? 'bg-green-50 border-green-300' : ''
                ]"
                @click="triggerFileInput"
              >
                <input
                  ref="fileInputRef"
                  type="file"
                  class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  accept=".csv,.xlsx,.xls"
                  @change="handleFileSelect"
                />

                <!-- Idle State -->
                <div v-if="!selectedFile && !isImporting" class="pointer-events-none">
                  <FileUp class="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p class="text-lg font-medium text-gray-700 mb-2">{{ $t('participants.import.dropZoneText') }}</p>
                  <p class="text-sm text-gray-500">{{ $t('participants.import.supportedFormats') }}</p>
                </div>

                <!-- File Selected -->
                <div v-else-if="selectedFile && !isImporting" class="pointer-events-none">
                  <FileCheck class="w-12 h-12 mx-auto text-green-500 mb-4" />
                  <p class="text-lg font-medium text-gray-700 mb-2">{{ selectedFile.name }}</p>
                  <p class="text-sm text-gray-500">{{ formatFileSize(selectedFile.size) }}</p>
                </div>

                <!-- Importing State -->
                <div v-else-if="isImporting" class="pointer-events-none">
                  <Loader2 class="w-12 h-12 mx-auto animate-spin text-blue-500 mb-4" />
                  <p class="text-lg font-medium text-gray-700 mb-2">{{ $t('participants.import.processing') }}</p>
                  <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div
                      class="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      :style="{ width: `${importProgress}%` }"
                    ></div>
                  </div>
                  <p class="text-sm text-gray-500">{{ importProgress }}%</p>
                </div>
              </div>

              <!-- Template Download -->
              <div class="text-center">
                <Button variant="outline" @click="downloadTemplate">
                  <Download class="w-4 h-4 mr-2" />
                  {{ $t('participants.import.downloadTemplate') }}
                </Button>
              </div>
            </div>

            <!-- Data Preview Section -->
            <div v-if="importData.length > 0" class="space-y-4">
              <div class="flex justify-between items-center">
                <h3 class="text-lg font-semibold">{{ $t('participants.import.dataPreview') }}</h3>
                <div class="text-sm text-gray-500">
                  {{ $t('participants.import.rowsToImport', { count: importData.length }) }}
                </div>
              </div>

              <div class="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader class="sticky top-0 bg-white">
                    <TableRow>
                      <TableHead v-for="header in Object.keys(importData[0])" :key="header">
                        {{ header }}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow v-for="(row, index) in importData.slice(0, 5)" :key="index">
                      <TableCell v-for="header in Object.keys(row)" :key="header">
                        {{ truncateText(String(row[header] || ''), 30) }}
                      </TableCell>
                    </TableRow>
                    <TableRow v-if="importData.length > 5">
                      <TableCell :colspan="Object.keys(importData[0]).length" class="text-center text-gray-500 italic">
                        ... {{ importData.length - 5 }} more rows
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            <!-- Error Display -->
            <div v-if="importError" class="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div class="flex items-start">
                <AlertTriangle class="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 class="font-medium text-red-800">{{ $t('participants.import.errorTitle') }}</h4>
                  <p class="text-red-600 mt-1">{{ importError }}</p>
                </div>
              </div>
            </div>

            <!-- Success Display -->
            <div v-if="importSuccess" class="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div class="flex items-start">
                <CheckCircle class="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 class="font-medium text-green-800">{{ $t('participants.import.successTitle') }}</h4>
                  <p class="text-green-600 mt-1">{{ $t('participants.import.successDesc', { count: importedCount }) }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex justify-end gap-2 p-6 border-t">
          <Button variant="outline" @click="resetImport" :disabled="isImporting">
            {{ importSuccess ? $t('common.actions.close') : $t('common.actions.cancel') }}
          </Button>
          <Button
            @click="confirmImport"
            :disabled="!selectedFile || isImporting || importData.length === 0"
          >
            <Loader2 v-if="isImporting" class="w-4 h-4 mr-2 animate-spin" />
            {{ $t('participants.import.confirmImport') }}
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import ExcelJS from 'exceljs';
import { useToast } from '@repo/ui';
import { useParticipantStore } from '@/stores/participantStore';
import { useRetreatStore } from '@/stores/retreatStore';
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
  FileUp,
  FileCheck,
  Loader2,
  Download,
  AlertTriangle,
  CheckCircle,
} from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  'update:isOpen': [value: boolean];
}>();

const { toast } = useToast();
const { t: $t } = useI18n();

const participantStore = useParticipantStore();
const retreatStore = useRetreatStore();
const { selectedRetreatId } = storeToRefs(retreatStore);

// Reactive state
const fileInputRef = ref<HTMLInputElement | null>(null);
const modalOpen = ref(false);
const selectedFile = ref<File | null>(null);
const isDragging = ref(false);
const dragCounter = ref(0);
const isImporting = ref(false);
const importProgress = ref(0);
const importData = ref<any[]>([]);
const importError = ref('');
const importSuccess = ref(false);
const importedCount = ref(0);

// Sync modalOpen with props.isOpen
watch(() => props.isOpen, (isOpen) => {
  console.log('[ImportModal] Parent prop isOpen changed:', isOpen);
  modalOpen.value = isOpen;
}, { immediate: true });

watch(modalOpen, (isOpen) => {
  console.log('[ImportModal] Modal internal state changed:', isOpen);
  emit('update:isOpen', isOpen);
  if (!isOpen) {
    console.log('[ImportModal] Modal closed, calling resetImport');
    resetImport();
  }
});

// Methods
const triggerFileInput = () => {
  fileInputRef.value?.click();
};

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    processFile(file);
  }
};

const handleDragEnter = (event: DragEvent) => {
  event.preventDefault();
  dragCounter.value++;
  isDragging.value = true;
};

const handleDragLeave = (event: DragEvent) => {
  event.preventDefault();
  dragCounter.value--;
  if (dragCounter.value === 0) {
    isDragging.value = false;
  }
};

const handleDragOver = (event: DragEvent) => {
  event.preventDefault();
};

const handleDrop = (event: DragEvent) => {
  event.preventDefault();
  dragCounter.value = 0;
  isDragging.value = false;
  const files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    const file = files[0];
    processFile(file);
  }
};

const processFile = async (file: File) => {
  // Validate file
  if (!isValidFile(file)) {
    importError.value = $t('participants.import.error.invalidFile');
    return;
  }

  if (file.size > 10 * 1024 * 1024) { // 10MB limit
    importError.value = $t('participants.import.error.fileTooLarge');
    return;
  }

  selectedFile.value = file;
  importError.value = '';
  importSuccess.value = false;

  try {
    const data = await readFile(file);
    importData.value = data;
  } catch (error) {
    importError.value = $t('participants.import.error.readFile');
    console.error('Error reading file:', error);
  }
};

const readFile = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    // Check if it's a CSV file
    if (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv') {
      // Handle CSV files
      reader.onload = (e) => {
        try {
          const csvText = e.target?.result as string;
          const json = parseCSV(csvText);
          resolve(json);
        } catch (error) {
          console.error('Error parsing CSV:', error);
          reject(error);
        }
      };
      reader.readAsText(file);
    } else {
      // Handle Excel files (.xlsx, .xls)
      reader.onload = async (e) => {
        try {
          const data = e.target?.result as ArrayBuffer;
          const workbook = new ExcelJS.Workbook();

          await workbook.xlsx.load(data);
          const worksheet = workbook.getWorksheet(1);

          if (!worksheet) {
            throw new Error('No worksheet found');
          }

          const json: any[] = [];
          const headers: string[] = [];

          // Read headers
          worksheet.getRow(1).eachCell((cell, colNumber) => {
            headers[colNumber - 1] = cell.text;
          });

          // Read data
          for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
            const row = worksheet.getRow(rowNumber);
            const rowData: any = {};

            headers.forEach((header, index) => {
              const cell = row.getCell(index + 1);
              rowData[header] = cell.value;
            });

            // Only add non-empty rows
            if (Object.values(rowData).some(value => value !== null && value !== undefined)) {
              json.push(rowData);
            }
          }

          resolve(json);
        } catch (error) {
          console.error('Error processing Excel file:', error);
          reject(error);
        }
      };
      reader.readAsArrayBuffer(file);
    }

    reader.onerror = (error) => {
      console.error('FileReader error:', error);
      reject(new Error('Failed to read file'));
    };
  });
};

const parseCSV = (csvText: string): any[] => {
  const lines = csvText.split('\n').filter(line => line.trim() !== '');
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  const headers = parseCSVLine(lines[0]);
  const json: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const rowData: any = {};
    headers.forEach((header, index) => {
      rowData[header] = values[index] || null;
    });

    // Only add non-empty rows
    if (Object.values(rowData).some(value => value !== null && value !== undefined && value !== '')) {
      json.push(rowData);
    }
  }

  return json;
};

const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i += 2;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }

  result.push(current);
  return result;
};

const isValidFile = (file: File): boolean => {
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'text/csv', // .csv
  ];
  return validTypes.includes(file.type) || file.name.toLowerCase().endsWith('.csv');
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

const downloadTemplate = () => {
  // Create template with headers
  const headers = [
    'firstName', 'lastName', 'nickname', 'email', 'cellPhone', 'birthDate',
    'maritalStatus', 'street', 'houseNumber', 'postalCode', 'city', 'state',
    'country', 'parish'
  ];

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Template');

  // Add headers
  worksheet.addRow(headers);

  // Style headers
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };

  // Generate file
  workbook.xlsx.writeBuffer().then(buffer => {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'participants_import_template.xlsx';
    a.click();
    window.URL.revokeObjectURL(url);
  });
};

const confirmImport = async () => {
  if (!selectedFile.value || importData.value.length === 0) return;

  isImporting.value = true;
  importProgress.value = 0;
  importError.value = '';

  try {
    // Validate data has email field (case insensitive)
    if (importData.value.length > 0) {
      const firstRowKeys = Object.keys(importData.value[0]).map(key => key.toLowerCase());
      if (!firstRowKeys.includes('email')) {
        throw new Error($t('participants.import.error.emailRequired'));
      }
    }

    // Simulate progress
    importProgress.value = 25;

    await participantStore.importParticipants(selectedRetreatId.value!, importData.value);

    importProgress.value = 100;
    importSuccess.value = true;
    importedCount.value = importData.value.length;

    toast({
      title: $t('participants.import.successTitle'),
      description: $t('participants.import.successDesc', { count: importedCount.value }),
    });
  } catch (error: any) {
    importError.value = error.message || $t('participants.import.error.generic');
    importProgress.value = 0;
  } finally {
    isImporting.value = false;
  }
};

const resetImport = () => {
  console.log('[ImportModal] resetImport called - Clearing all state');
  console.log('[ImportModal] Before reset - selectedFile:', selectedFile.value?.name, 'isDragging:', isDragging.value, 'dragCounter:', dragCounter.value);

  selectedFile.value = null;
  importData.value = [];
  importError.value = '';
  importSuccess.value = false;
  importProgress.value = 0;
  isImporting.value = false;
  isDragging.value = false;
  dragCounter.value = 0;

  if (fileInputRef.value) {
    console.log('[ImportModal] Clearing file input');
    fileInputRef.value.value = '';
  }

  console.log('[ImportModal] After reset - selectedFile:', selectedFile.value, 'isDragging:', isDragging.value, 'dragCounter:', dragCounter.value);

  modalOpen.value = false;
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
