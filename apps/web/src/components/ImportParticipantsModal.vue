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
            <!-- STEP: Upload -->
            <template v-if="importStep === 'upload'">
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
            </template>

            <!-- STEP: Duplicates -->
            <template v-if="importStep === 'duplicates'">
              <div class="space-y-4">
                <div class="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle class="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 class="font-medium text-amber-800">{{ $t('participants.import.duplicates.title') }}</h4>
                    <p class="text-amber-700 text-sm mt-1">{{ $t('participants.import.duplicates.description', { count: duplicateGroups.length }) }}</p>
                  </div>
                </div>

                <!-- Duplicate group cards -->
                <div v-for="group in duplicateGroups" :key="group.email" class="border rounded-lg overflow-hidden">
                  <!-- Group header -->
                  <div class="flex items-center justify-between bg-gray-50 px-4 py-3 border-b">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-sm">{{ group.email }}</span>
                      <Badge variant="secondary">{{ group.rows.length }} filas</Badge>
                    </div>
                  </div>

                  <!-- Comparison table -->
                  <div class="overflow-x-auto max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader class="sticky top-0 bg-white">
                        <TableRow>
                          <TableHead class="w-40">{{ $t('participants.import.duplicates.field') }}</TableHead>
                          <TableHead v-for="row in group.rows" :key="row.originalIndex">
                            <div class="flex items-center gap-2">
                              <Checkbox
                                :model-value="duplicateResolutions[group.email]?.keptIndices.includes(row.originalIndex) ?? false"
                                :disabled="duplicateResolutions[group.email]?.keptIndices.includes(row.originalIndex) && duplicateResolutions[group.email]?.keptIndices.length === 1"
                                @update:model-value="toggleRowKept(group.email, row.originalIndex)"
                              />
                              <span>{{ $t('participants.import.duplicates.rowLabel', { n: row.originalIndex + 2 }) }}</span>
                            </div>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <!-- Differing fields + email when multiple kept -->
                        <TableRow
                          v-for="field in visibleFields(group)"
                          :key="field"
                          :class="isNameField(field) ? 'bg-blue-50' : group.differingFields.includes(field) ? 'bg-amber-50' : ''"
                        >
                          <TableCell class="font-medium text-sm">
                            <div class="flex items-center gap-2">
                              <span :class="isNameField(field) ? 'text-blue-800' : ''">{{ field }}</span>
                              <Badge
                                v-if="group.differingFields.includes(field)"
                                variant="outline"
                                :class="isNameField(field) ? 'text-blue-700 border-blue-300 text-xs' : 'text-amber-700 border-amber-300 text-xs'"
                              >
                                {{ $t('participants.import.duplicates.differs') }}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell
                            v-for="row in group.rows"
                            :key="row.originalIndex"
                            :class="{ 'opacity-30': !duplicateResolutions[group.email]?.keptIndices.includes(row.originalIndex) }"
                          >
                            <!-- Editable email for kept non-first rows -->
                            <template v-if="field.toLowerCase() === 'email' && row.originalIndex in (duplicateResolutions[group.email]?.modifiedEmails ?? {})">
                              <Input
                                :model-value="duplicateResolutions[group.email]?.modifiedEmails?.[row.originalIndex] || ''"
                                @update:model-value="(val: string) => setModifiedEmail(group.email, row.originalIndex, val)"
                                :class="['h-7 text-sm', !touchedEmails[`${group.email}:${row.originalIndex}`] ? 'ring-2 ring-red-400 focus:ring-red-500' : 'ring-1 ring-green-400']"
                                :disabled="!duplicateResolutions[group.email]?.keptIndices.includes(row.originalIndex)"
                              />
                            </template>
                            <template v-else>
                              <span class="text-sm">{{ truncateText(String(row.data[field] ?? ''), 40) }}</span>
                            </template>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </template>

            <!-- STEP: Preview -->
            <template v-if="importStep === 'preview'">
              <!-- Data Preview Section -->
              <div v-if="importData.length > 0" class="space-y-4">
                <div class="flex justify-between items-center">
                  <h3 class="text-lg font-semibold">{{ $t('participants.import.dataPreview') }}</h3>
                  <div class="text-sm text-gray-500">
                    {{ $t('participants.import.rowsToImport', { count: importData.length }) }}
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <Checkbox
                    id="ignoreRoom"
                    :model-value="ignoreRoomAssignment"
                    @update:model-value="(val: boolean) => { ignoreRoomAssignment = val }"
                  />
                  <Label for="ignoreRoom">{{ $t('participants.import.ignoreRoomAssignment') }}</Label>
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
            </template>

            <!-- Error Display (always visible) -->
            <div v-if="importError" class="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div class="flex items-start">
                <AlertTriangle class="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 class="font-medium text-red-800">{{ $t('participants.import.errorTitle') }}</h4>
                  <p class="text-red-600 mt-1">{{ importError }}</p>
                </div>
              </div>
            </div>

            <!-- Success Display (always visible) -->
            <div v-if="importSuccess" class="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div class="flex items-start">
                <CheckCircle class="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 class="font-medium text-green-800">{{ $t('participants.import.successTitle') }}</h4>
                  <p class="text-green-600 mt-1 whitespace-pre-line">{{ importSummary || $t('participants.import.successDesc', { count: importedCount }) }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-6 border-t space-y-2">
          <p v-if="importStep === 'duplicates' && !canContinueDuplicates" class="text-sm text-red-600 flex items-center gap-1.5">
            <AlertTriangle class="w-4 h-4 flex-shrink-0" />
            {{ $t('participants.import.duplicates.editEmailWarning', { count: untouchedEmailCount }) }}
          </p>
          <div class="flex justify-end gap-2">
          <Button variant="outline" @click="resetImport" :disabled="isImporting">
            {{ importSuccess ? $t('common.actions.close') : $t('common.actions.cancel') }}
          </Button>
          <Button
            v-if="importStep === 'duplicates'"
            @click="applyResolutions"
            :disabled="!canContinueDuplicates"
          >
            {{ $t('participants.import.duplicates.continue') }}
          </Button>
          <Button
            v-if="importStep === 'preview'"
            @click="confirmImport"
            :disabled="!selectedFile || isImporting || importData.length === 0"
          >
            <Loader2 v-if="isImporting" class="w-4 h-4 mr-2 animate-spin" />
            {{ $t('participants.import.confirmImport') }}
          </Button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import ExcelJS from 'exceljs';
import { useToast } from '@repo/ui';
import { useParticipantStore } from '@/stores/participantStore';
import { useRetreatStore } from '@/stores/retreatStore';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
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

interface DuplicateGroup {
  email: string;
  rows: Array<{ originalIndex: number; data: Record<string, any> }>;
  differingFields: string[];
}
interface DuplicateResolution {
  keptIndices: number[];
  modifiedEmails: Record<number, string>;
}

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  'update:isOpen': [value: boolean];
}>();

const { t: $t } = useI18n();
const { toast } = useToast();

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
const importSummary = ref('');
const importStep = ref<'upload' | 'duplicates' | 'preview'>('upload');
const duplicateGroups = ref<DuplicateGroup[]>([]);
const duplicateResolutions = ref<Record<string, DuplicateResolution>>({});
const touchedEmails = ref<Record<string, boolean>>({}); // tracks "email:originalIndex" keys
const ignoreRoomAssignment = ref(false);

const untouchedEmailCount = computed(() => {
  let count = 0;
  for (const [email, res] of Object.entries(duplicateResolutions.value)) {
    for (const idx of Object.keys(res.modifiedEmails).map(Number)) {
      if (!touchedEmails.value[`${email}:${idx}`]) count++;
    }
  }
  return count;
});

const canContinueDuplicates = computed(() => untouchedEmailCount.value === 0);

// Sync modalOpen with props.isOpen
watch(() => props.isOpen, (isOpen) => {
  modalOpen.value = isOpen;
}, { immediate: true });

watch(modalOpen, (isOpen) => {
  emit('update:isOpen', isOpen);
  if (!isOpen) {
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
    detectDuplicates();
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
          let skippedRows = 0;

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
            } else {
              skippedRows++;
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

const mostCompleteRow = (rows: Array<{ originalIndex: number; data: Record<string, any> }>): number => {
  let bestIdx = rows[0].originalIndex;
  let bestCount = 0;
  for (const row of rows) {
    const filled = Object.values(row.data).filter(v => v !== null && v !== undefined && String(v).trim() !== '').length;
    if (filled > bestCount) {
      bestCount = filled;
      bestIdx = row.originalIndex;
    }
  }
  return bestIdx;
};

const isNameField = (field: string): boolean => {
  const lower = field.toLowerCase();
  return ['firstname', 'lastname', 'nombre', 'apellido', 'name'].some(n => lower.includes(n));
};

const detectDuplicates = () => {
  const data = importData.value;
  if (data.length === 0) return;

  // Find the email key (case-insensitive)
  const firstRowKeys = Object.keys(data[0]);
  const emailKey = firstRowKeys.find(k => k.toLowerCase() === 'email');
  if (!emailKey) {
    importStep.value = 'preview';
    return;
  }

  // Group rows by normalized email
  const emailMap = new Map<string, Array<{ originalIndex: number; data: Record<string, any> }>>();
  data.forEach((row, index) => {
    const email = String(row[emailKey] || '').toLowerCase().trim();
    if (!email) return;
    if (!emailMap.has(email)) emailMap.set(email, []);
    emailMap.get(email)!.push({ originalIndex: index, data: row });
  });

  // Build duplicate groups
  const groups: DuplicateGroup[] = [];
  for (const [email, rows] of emailMap) {
    if (rows.length <= 1) continue;
    // Find differing fields and sort by priority
    const allKeys = firstRowKeys;
    const priorityFields = [
      'firstname', 'lastName', 'email', 'nombre', 'apellido',
      'notaspalancas', 'palancasNotes', 'montopago', 'totalPaid',
      'tipousuario', 'type', 'mesa', 'table', 'tableId',
      'habitacion', 'retreatBedId', 'room',
    ];
    const differingFields = allKeys
      .filter(key => {
        const values = rows.map(r => String(r.data[key] ?? ''));
        return new Set(values).size > 1;
      })
      .sort((a, b) => {
        const aIdx = priorityFields.findIndex(p => a.toLowerCase().includes(p.toLowerCase()));
        const bIdx = priorityFields.findIndex(p => b.toLowerCase().includes(p.toLowerCase()));
        const aPri = aIdx >= 0 ? aIdx : priorityFields.length;
        const bPri = bIdx >= 0 ? bIdx : priorityFields.length;
        return aPri - bPri;
      });
    groups.push({ email, rows, differingFields });
  }

  if (groups.length === 0) {
    importStep.value = 'preview';
    return;
  }

  duplicateGroups.value = groups;

  // Set default resolutions
  const nameFields = ['firstname', 'nombre', 'lastname', 'apellido', 'name'];
  const resolutions: Record<string, DuplicateResolution> = {};
  for (const group of groups) {
    const nameDiffers = group.differingFields.some(f =>
      nameFields.some(n => f.toLowerCase().includes(n))
    );
    const modifiedEmails: Record<number, string> = {};
    let keptIndices: number[];
    if (nameDiffers) {
      // Name differs → likely different people, keep all by default
      keptIndices = group.rows.map(r => r.originalIndex);
    } else {
      // Same name → keep only the most complete row
      keptIndices = [mostCompleteRow(group.rows)];
    }
    // Generate modified emails for non-first kept rows
    buildModifiedEmails(group, keptIndices, modifiedEmails);
    resolutions[group.email] = { keptIndices, modifiedEmails };
  }
  duplicateResolutions.value = resolutions;
  importStep.value = 'duplicates';
};

const visibleFields = (group: DuplicateGroup): string[] => {
  const res = duplicateResolutions.value[group.email];
  const multipleKept = res && res.keptIndices.length > 1;
  const fields = [...group.differingFields];
  // Always show email row when multiple rows are kept (so user can edit the duplicate email)
  if (multipleKept) {
    const emailKey = Object.keys(group.rows[0].data).find(k => k.toLowerCase() === 'email');
    if (emailKey && !fields.some(f => f.toLowerCase() === 'email')) {
      fields.unshift(emailKey);
    }
  }
  return fields;
};

const buildModifiedEmails = (
  group: DuplicateGroup,
  keptIndices: number[],
  modifiedEmails: Record<number, string>,
) => {
  const [user, domain] = group.email.split('@');
  let suffix = 1;
  let isFirst = true;
  for (const row of group.rows) {
    if (!keptIndices.includes(row.originalIndex)) continue;
    if (isFirst) {
      delete modifiedEmails[row.originalIndex];
      isFirst = false;
    } else {
      if (!(row.originalIndex in modifiedEmails)) {
        modifiedEmails[row.originalIndex] = `${user}+${suffix}@${domain}`;
      }
      suffix++;
    }
  }
  // Clean up emails for rows no longer kept
  for (const idx of Object.keys(modifiedEmails).map(Number)) {
    if (!keptIndices.includes(idx)) delete modifiedEmails[idx];
  }
};

const toggleRowKept = (email: string, originalIndex: number) => {
  const res = duplicateResolutions.value[email];
  const group = duplicateGroups.value.find(g => g.email === email);
  if (!res || !group) return;

  let keptIndices = [...res.keptIndices];
  if (keptIndices.includes(originalIndex)) {
    if (keptIndices.length <= 1) return;
    keptIndices = keptIndices.filter(i => i !== originalIndex);
  } else {
    keptIndices.push(originalIndex);
  }

  const modifiedEmails = { ...res.modifiedEmails };
  buildModifiedEmails(group, keptIndices, modifiedEmails);
  duplicateResolutions.value = { ...duplicateResolutions.value, [email]: { keptIndices, modifiedEmails } };
};

const setModifiedEmail = (email: string, originalIndex: number, newEmail: string) => {
  const res = duplicateResolutions.value[email];
  if (!res) return;
  res.modifiedEmails[originalIndex] = newEmail;
  touchedEmails.value = { ...touchedEmails.value, [`${email}:${originalIndex}`]: true };
  duplicateResolutions.value = { ...duplicateResolutions.value };
};

const applyResolutions = () => {
  const data = importData.value;
  const firstRowKeys = Object.keys(data[0] || {});
  const emailKey = firstRowKeys.find(k => k.toLowerCase() === 'email') || 'email';

  const indicesToRemove = new Set<number>();

  for (const [email, resolution] of Object.entries(duplicateResolutions.value)) {
    const group = duplicateGroups.value.find(g => g.email === email);
    if (!group) continue;

    // Remove unchecked rows
    for (const row of group.rows) {
      if (!resolution.keptIndices.includes(row.originalIndex)) {
        indicesToRemove.add(row.originalIndex);
      }
    }
    // Apply modified emails for kept non-first rows
    for (const [idx, newEmail] of Object.entries(resolution.modifiedEmails)) {
      if (data[Number(idx)]) {
        data[Number(idx)][emailKey] = newEmail;
      }
    }
  }

  // Remove discarded rows from highest index down
  const sortedIndices = Array.from(indicesToRemove).sort((a, b) => b - a);
  for (const idx of sortedIndices) {
    data.splice(idx, 1);
  }

  importData.value = data;
  importStep.value = 'preview';
};

const IMPORT_BATCH_SIZE = 50;

const confirmImport = async () => {
  if (!selectedFile.value || importData.value.length === 0) return;

  isImporting.value = true;
  importProgress.value = 0;
  importError.value = '';

  try {
    // Strip room assignment data if user opted out
    if (ignoreRoomAssignment.value && importData.value.length > 0) {
      const roomKey = Object.keys(importData.value[0]).find(
        k => k.toLowerCase() === 'habitacion'
      );
      if (roomKey) {
        for (const row of importData.value) {
          delete row[roomKey];
        }
      }
    }

    // Validate data has email field (case insensitive)
    if (importData.value.length > 0) {
      const firstRowKeys = Object.keys(importData.value[0]).map(key => key.toLowerCase());
      if (!firstRowKeys.includes('email')) {
        throw new Error($t('participants.import.error.emailRequired'));
      }
    }

    // Split data into batches to avoid server out-of-memory issues
    const batches: any[][] = [];
    for (let i = 0; i < importData.value.length; i += IMPORT_BATCH_SIZE) {
      batches.push(importData.value.slice(i, i + IMPORT_BATCH_SIZE));
    }

    let totalImported = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalTablesCreated = 0;
    let totalBedsCreated = 0;
    let totalPaymentsCreated = 0;
    let allSkippedDetails: Array<{ row: number; reason: string; name?: string }> = [];

    for (let i = 0; i < batches.length; i++) {
      const isLastBatch = i === batches.length - 1;
      const responseData = await participantStore.importParticipants(
        selectedRetreatId.value!,
        batches[i],
        !isLastBatch, // skipRefresh for all but last batch
      );

      totalImported += responseData.importedCount || 0;
      totalUpdated += responseData.updatedCount || 0;
      totalSkipped += responseData.skippedCount || 0;
      totalTablesCreated += responseData.tablesCreated || 0;
      totalBedsCreated += responseData.bedsCreated || 0;
      totalPaymentsCreated += responseData.paymentsCreated || 0;
      if (responseData.skippedDetails?.length) {
        allSkippedDetails = allSkippedDetails.concat(responseData.skippedDetails);
      }

      importProgress.value = Math.round(((i + 1) / batches.length) * 100);
    }

    // Create comprehensive summary message
    let summaryLines = [];
    if (totalImported > 0) summaryLines.push(`${totalImported} participants imported`);
    if (totalUpdated > 0) summaryLines.push(`${totalUpdated} updated`);
    if (totalSkipped > 0) summaryLines.push(`${totalSkipped} skipped`);

    // Add entity creation details
    const entityLines = [];
    if (totalTablesCreated > 0) entityLines.push(`${totalTablesCreated} table${totalTablesCreated === 1 ? '' : 's'} created`);
    if (totalBedsCreated > 0) entityLines.push(`${totalBedsCreated} bed${totalBedsCreated === 1 ? '' : 's'} created`);
    if (totalPaymentsCreated > 0) entityLines.push(`${totalPaymentsCreated} payment${totalPaymentsCreated === 1 ? '' : 's'} created`);

    let description = summaryLines.join(', ');
    if (entityLines.length > 0) {
      description += (description ? '. ' : '') + entityLines.join(', ');
    }

    // Append skipped details to summary if any
    if (allSkippedDetails.length > 0) {
      const skippedLines = allSkippedDetails.map(
        (d) => `Fila ${d.row}: ${d.reason}${d.name ? ` (${d.name})` : ''}`
      );
      description += (description ? '\n' : '') + 'Omitidos:\n' + skippedLines.join('\n');
    }

    importSummary.value = description || 'No changes made';

    // Show toast notification
    toast({
      title: 'Import Complete',
      description: importSummary.value,
    });

    importProgress.value = 100;
    importSuccess.value = true;
    importedCount.value = totalImported + totalUpdated; // Total participants processed
  } catch (error: any) {
    importError.value = error.message || $t('participants.import.error.generic');
    console.error('Import error:', error);
    importProgress.value = 0;
  } finally {
    isImporting.value = false;
  }
};

const resetImport = () => {
  selectedFile.value = null;
  importData.value = [];
  importError.value = '';
  importSuccess.value = false;
  importProgress.value = 0;
  isImporting.value = false;
  isDragging.value = false;
  dragCounter.value = 0;
  importSummary.value = '';
  importStep.value = 'upload';
  duplicateGroups.value = [];
  duplicateResolutions.value = {};
  touchedEmails.value = {};
  ignoreRoomAssignment.value = false;

  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }

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
