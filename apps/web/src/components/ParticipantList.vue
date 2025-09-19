<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import { useParticipantStore } from '@/stores/participantStore';
import { useRetreatStore } from '@/stores/retreatStore';
import MessageDialog from './MessageDialog.vue';
import { useI18n } from 'vue-i18n';
import ExcelJS from 'exceljs';

// Importa los componentes de UI necesarios
import { Button } from '@repo/ui';
import { Input } from '@repo/ui';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
  TableFooter,
} from '@repo/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@repo/ui';
import ColumnSelector from './ColumnSelector.vue';
import EditParticipantForm from './EditParticipantForm.vue';
import FilterDialog from './FilterDialog.vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@repo/ui';


import { ArrowUpDown, Trash2, Edit, FileUp, FileDown, Columns, ListFilter, MoreVertical, Plus } from 'lucide-vue-next';
import { useToast } from '@repo/ui';

// Traducción (simulada, usa tu sistema de i18n)
//const $t = (key: string) => key.split('.').pop()?.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()) || key;

const props = withDefaults(defineProps<{
    type?: 'walker' | 'server' | 'waiting' | undefined,
    isCancelled?: boolean,
    columnsToShowInTable?: string[],
    columnsToShowInForm?: string[],
    columnsToEditInForm?: string[],
    defaultFilters?: Record<string, any>,
}>(), {
    isCancelled: false,
    columnsToShowInTable: () => ['id_on_retreat', 'firstName', 'lastName', 'email', 'cellPhone', 'tableMesa.name'],
    columnsToShowInForm: () => [],
    columnsToEditInForm: () => [],
    defaultFilters: () => ({}),
});

const { toast } = useToast();
const { t: $t } = useI18n();

// Get current route for view identification
const route = useRoute();
const currentViewName = computed(() => route.name as string || 'unknown');

// Stores de Pinia
const participantStore = useParticipantStore();
const { participants: allParticipants, loading, error } = storeToRefs(participantStore);
const retreatStore = useRetreatStore();
const { selectedRetreatId, serverRegistrationLink, walkerRegistrationLink } = storeToRefs(retreatStore);

const participants = computed(() => {
    if (props.type === undefined) {
        return allParticipants.value || [];
    }
    return (allParticipants.value || []).filter((p: any) => p.type === props.type);
});

// --- ESTADO LOCAL DEL COMPONENTE ---
const searchQuery = ref('');
const sortKey = ref('lastName');
const sortOrder = ref<'asc' | 'desc'>('asc');
const isColumnDialogOpen = ref(false);
const isImportDialogOpen = ref(false);
const isDeleteDialogOpen = ref(false);
const participantToDelete = ref<any>(null);
const isEditDialogOpen = ref(false);
const participantToEdit = ref<any>(null);
const isFilterDialogOpen = ref(false);
const isMessageDialogOpen = ref(false);
const messageParticipant = ref<any>(null);

// --- FILTERS ---
const filters = ref<Record<string, any>>({});
const filterStatus = ref<'active' | 'canceled'>(props.defaultFilters?.isCancelled ? 'canceled' : 'active');
const isCancelled = computed(() => {
  if (props.isCancelled) {
    return true;
  }
  return filterStatus.value === 'canceled';
});

// Watch for filter changes
watch(filters, (newFilters) => {
  // Filters updated
}, { deep: true });


// --- DEFINICIÓN Y VISIBILIDAD DE COLUMNAS ---
const allColumns = ref([
    { key: 'id_on_retreat', label: 'participants.fields.id' },
    { key: 'type', label: 'participants.fields.type' },
    { key: 'firstName', label: 'participants.fields.firstName' },
    { key: 'lastName', label: 'participants.fields.lastName' },
    { key: 'nickname', label: 'participants.fields.nickname' },
    { key: 'tableMesa.name', label: 'participants.fields.table' },
    { key: 'birthDate', label: 'participants.fields.birthDate' },
    { key: 'maritalStatus', label: 'participants.fields.maritalStatus' },
    { key: 'street', label: 'participants.fields.street' },
    { key: 'houseNumber', label: 'participants.fields.houseNumber' },
    { key: 'postalCode', label: 'participants.fields.postalCode' },
    { key: 'neighborhood', label: 'participants.fields.neighborhood' },
    { key: 'city', label: 'participants.fields.city' },
    { key: 'state', label: 'participants.fields.state' },
    { key: 'country', label: 'participants.fields.country' },
    { key: 'parish', label: 'participants.fields.parish' },
    { key: 'homePhone', label: 'participants.fields.homePhone' },
    { key: 'workPhone', label: 'participants.fields.workPhone' },
    { key: 'cellPhone', label: 'participants.fields.cellPhone' },
    { key: 'email', label: 'participants.fields.email' },
    { key: 'occupation', label: 'participants.fields.occupation' },
    { key: 'snores', label: 'participants.fields.snores' },
    { key: 'hasMedication', label: 'participants.fields.hasMedication' },
    { key: 'medicationDetails', label: 'participants.fields.medicationDetails' },
    { key: 'medicationSchedule', label: 'participants.fields.medicationSchedule' },
    { key: 'hasDietaryRestrictions', label: 'participants.fields.hasDietaryRestrictions' },
    { key: 'dietaryRestrictionsDetails', label: 'participants.fields.dietaryRestrictionsDetails' },
    { key: 'sacraments', label: 'participants.fields.sacraments' },
    { key: 'emergencyContact1Name', label: 'participants.fields.emergencyContact1Name' },
    { key: 'emergencyContact1Relation', label: 'participants.fields.emergencyContact1Relation' },
    { key: 'emergencyContact1HomePhone', label: 'participants.fields.emergencyContact1HomePhone' },
    { key: 'emergencyContact1WorkPhone', label: 'participants.fields.emergencyContact1WorkPhone' },
    { key: 'emergencyContact1CellPhone', label: 'participants.fields.emergencyContact1CellPhone' },
    { key: 'emergencyContact1Email', label: 'participants.fields.emergencyContact1Email' },
    { key: 'emergencyContact2Name', label: 'participants.fields.emergencyContact2Name' },
    { key: 'emergencyContact2Relation', label: 'participants.fields.emergencyContact2Relation' },
    { key: 'emergencyContact2HomePhone', label: 'participants.fields.emergencyContact2HomePhone' },
    { key: 'emergencyContact2WorkPhone', label: 'participants.fields.emergencyContact2WorkPhone' },
    { key: 'emergencyContact2CellPhone', label: 'participants.fields.emergencyContact2CellPhone' },
    { key: 'emergencyContact2Email', label: 'participants.fields.emergencyContact2Email' },
    { key: 'tshirtSize', label: 'participants.fields.tshirtSize' },
    { key: 'invitedBy', label: 'participants.fields.invitedBy' },
    { key: 'isInvitedByEmausMember', label: 'participants.fields.isInvitedByEmausMember' },
    { key: 'inviterHomePhone', label: 'participants.fields.inviterHomePhone' },
    { key: 'inviterWorkPhone', label: 'participants.fields.inviterWorkPhone' },
    { key: 'inviterCellPhone', label: 'participants.fields.inviterCellPhone' },
    { key: 'inviterEmail', label: 'participants.fields.inviterEmail' },
    { key: 'pickupLocation', label: 'participants.fields.pickupLocation' },
    { key: 'arrivesOnOwn', label: 'participants.fields.arrivesOnOwn' },
    { key: 'paymentDate', label: 'participants.fields.paymentDate' },
    { key: 'paymentAmount', label: 'participants.fields.paymentAmount' },
    { key: 'isScholarship', label: 'participants.fields.isScholarship' },
    { key: 'palancasCoordinator', label: 'participants.fields.palancasCoordinator' },
    { key: 'palancasRequested', label: 'participants.fields.palancasRequested' },
    { key: 'palancasReceived', label: 'participants.fields.palancasReceived' },
    { key: 'palancasNotes', label: 'participants.fields.palancasNotes' },
    { key: 'requestsSingleRoom', label: 'participants.fields.requestsSingleRoom' },
    { key: 'isCancelled', label: 'participants.fields.isCancelled' },
    { key: 'notes', label: 'participants.fields.notes' },
    { key: 'registrationDate', label: 'participants.fields.registrationDate' },
    { key: 'lastUpdatedDate', label: 'participants.fields.lastUpdatedDate' },
    { key: 'retreatId', label: 'participants.fields.retreatId' },
    { key: 'tableId', label: 'participants.fields.tableId' },
    { key: 'retreatBedId', label: 'participants.fields.retreatBedId' },
    { key: 'retreatBed.roomNumber', label: 'rooms.roomNumber' },
]);

// Initialize visible columns from store or props
const visibleColumns = ref<string[]>([]);

// Load saved columns on mount
onMounted(() => {
    const savedColumns = participantStore.getColumnSelection(currentViewName.value, props.columnsToShowInTable);
    visibleColumns.value = [...savedColumns];
    filters.value = { ...props.defaultFilters };
});

// Watch for column changes and save to store
watch(visibleColumns, (newColumns) => {
    if (newColumns && newColumns.length > 0) {
        participantStore.saveColumnSelection(currentViewName.value, newColumns);
    }
}, { deep: true });

const toggleColumn = (key: string) => {
    const index = visibleColumns.value.indexOf(key);
    if (index > -1) {
        visibleColumns.value.splice(index, 1);
    } else {
        visibleColumns.value.push(key);
    }
};

// --- COMPUTED: PARTICIPANTES FILTRADOS Y ORDENADOS ---
const filteredAndSortedParticipants = computed(() => {
    let result = [...participants.value];

    // 1. Filtrar por búsqueda
    if (searchQuery.value) {
        const lowerCaseQuery = searchQuery.value.toLowerCase();
        result = result.filter(p =>
            (p.firstName?.toLowerCase().includes(lowerCaseQuery)) ||
            (p.lastName?.toLowerCase().includes(lowerCaseQuery)) ||
            (p.email?.toLowerCase().includes(lowerCaseQuery)) ||
            (p.nickname?.toLowerCase().includes(lowerCaseQuery))
        );
    }

    // 2. Filtrar por filtros dinámicos
    const filtersObj = filters.value || {};

    // Extract actual filter values from Proxy objects
    const extractFilters = (obj: any): Record<string, any> => {
        if (obj && typeof obj === 'object') {
            // If it's a Proxy with a value property, extract it
            if (obj.value && typeof obj.value === 'object') {
                // Merge top-level properties with nested value properties
                const result = { ...obj };
                delete result.value; // Remove the value property
                return { ...result, ...obj.value }; // Merge with nested properties
            }
            // If it's already a plain object, return it
            return { ...obj };
        }
        return {};
    };

    const actualFilters = extractFilters(filtersObj);
    const activeFilters = Object.entries(actualFilters).filter(([, value]) => value !== undefined && value !== null && value !== '');

    if (activeFilters.length > 0) {
        result = result.filter(p => {
            const matches = activeFilters.every(([key, value]) => {
                const participantValue = getNestedProperty(p, key);
                if (typeof value === 'boolean') {
                    return participantValue === value;
                }
                return String(participantValue).toLowerCase() === String(value).toLowerCase();
            });
            return matches;
        });
    }

    // 3. Ordenar
    if (sortKey.value) {
        result.sort((a, b) => {
            const valA = getNestedProperty(a, sortKey.value);
            const valB = getNestedProperty(b, sortKey.value);
            if (valA < valB) return sortOrder.value === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder.value === 'asc' ? 1 : -1;
            return 0;
        });
    }

    return result;
});

// Helper para obtener valores de propiedades anidadas (ej. 'tableMesa.name')
const getNestedProperty = (obj: any, path: string) => {
    const result = path.split('.').reduce((acc, part) => acc && acc[part], obj);
    return result;
};

// Función para verificar si el cumpleaños del participante cae durante el retiro
const hasBirthdayDuringRetreat = (participant: any) => {
    if (!participant.birthDate) return false;

    const currentRetreat = retreatStore.selectedRetreat || retreatStore.mostRecentRetreat;
    if (!currentRetreat || !currentRetreat.startDate || !currentRetreat.endDate) return false;

    // Parsear la fecha de nacimiento directamente del string
    const birthDateStr = participant.birthDate;
    const [birthYear, birthMonth, birthDay] = birthDateStr.split('T')[0].split('-').map(Number);

    // Parsear fechas del retiro
    const retreatStart = new Date(currentRetreat.startDate);
    const retreatEnd = new Date(currentRetreat.endDate);

    // Verificar cada día del retiro
    const currentDate = new Date(retreatStart);
    const endDate = new Date(retreatEnd);

    while (currentDate <= endDate) {
        const currentMonth = currentDate.getMonth() + 1; // Convertir a 1-indexed
        const currentDay = currentDate.getDate();

        if (currentMonth === birthMonth && currentDay === birthDay) {
            return true;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return false;
};

const formatCell = (participant: any, colKey: string) => {
    const value = getNestedProperty(participant, colKey);
    if (['birthDate', 'registrationDate', 'lastUpdatedDate', 'paymentDate'].includes(colKey)) {
        if (!value) return 'N/A';
        const date = new Date(value);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    if (typeof value === 'boolean') {
        return value ? $t('common.yes') : $t('common.no');
    }
    return value || 'N/A';
};

const getCellContent = (participant: any, colKey: string) => {
    const value = getNestedProperty(participant, colKey);

    if (colKey === 'birthDate' && hasBirthdayDuringRetreat(participant)) {
        const formattedDate = formatCell(participant, colKey);
        return {
            value: formattedDate,
            hasBirthday: true
        };
    }

    if (colKey === 'firstName' && hasBirthdayDuringRetreat(participant)) {
        return {
            value: value || 'N/A',
            hasBirthday: true
        };
    }

    return {
        value: formatCell(participant, colKey),
        hasBirthday: false
    };
};

const formColumnsToShow = computed(() => {
    const combined = new Set([...props.columnsToShowInForm, ...visibleColumns.value]);
    return Array.from(combined);
});

const formColumnsToEdit = computed(() => {
    const combined = new Set([...props.columnsToEditInForm, ...visibleColumns.value]);
    const nonEditableSystemKeys = [
        'id', 'id_on_retreat', 'type', 'email', 'registrationDate', 
        'lastUpdatedDate', 'retreatId', 'tableId', 'retreatBedId'
    ];
    return Array.from(combined).filter(key => !nonEditableSystemKeys.includes(key));
});


// --- MANEJO DE ACCIONES ---

const handleSort = (key: string) => {
    if (sortKey.value === key) {
        sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortKey.value = key;
        sortOrder.value = 'asc';
    }
};

const openRegistrationLink = () => {
    const link = props.type === 'walker' ? walkerRegistrationLink.value : serverRegistrationLink.value;
    if (link) {
        window.open(link, '_blank');
    }
};

const openDeleteDialog = (participant: any) => {
    participantToDelete.value = participant;
    isDeleteDialogOpen.value = true;
};

const confirmDelete = async () => {
    if (participantToDelete.value) {
        await participantStore.deleteParticipant(participantToDelete.value.id);
        toast({
            title: $t('participants.delete.SuccessTitle'),
            description: `${participantToDelete.value.firstName} ${participantToDelete.value.lastName} ${$t('participants.delete.SuccessDesc')}`,
        });
    }
    isDeleteDialogOpen.value = false;
    participantToDelete.value = null;
};

const openEditDialog = (participant: any) => {
    participantToEdit.value = participant;
    isEditDialogOpen.value = true;
};

const openMessageDialog = (participant: any) => {
    messageParticipant.value = participant;
    isMessageDialogOpen.value = true;
};

const handleUpdateParticipant = async (updatedParticipant: any) => {
    await participantStore.updateParticipant(updatedParticipant.id, updatedParticipant);
    toast({
        title: 'Success',
        description: 'Participant updated successfully.',
    });
    isEditDialogOpen.value = false;
};

const toggleFilterStatus = () => {
  filterStatus.value = filterStatus.value === 'active' ? 'canceled' : 'active';
};

// --- IMPORTACIÓN / EXPORTACIÓN ---

const handleFileUpload = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = e.target?.result as ArrayBuffer;
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(data);
            const worksheet = workbook.getWorksheet(1);

            if (!worksheet) {
                throw new Error('No se encontró ninguna hoja de cálculo');
            }

            const json: any[] = [];
            const headers: string[] = [];

            // Leer encabezados
            worksheet.getRow(1).eachCell((cell, colNumber) => {
                headers[colNumber - 1] = cell.text;
            });

            // Leer datos
            for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
                const row = worksheet.getRow(rowNumber);
                const rowData: any = {};

                headers.forEach((header, index) => {
                    const cell = row.getCell(index + 1);
                    rowData[header] = cell.value;
                });

                json.push(rowData);
            }

            if (json.length > 0 && !('email' in (json[0] as any))) {
                 toast({ title: $t('participants.import.errorTitle'), description: $t('participants.import.errorNoEmail'), variant: 'destructive' });
                 return;
            }

            await participantStore.importParticipants(selectedRetreatId.value!, json);
            isImportDialogOpen.value = false;
            toast({ title: $t('participants.import.successTitle'), description: `${json.length} ${$t('participants.import.successDesc')}` });
        } catch (err) {
            console.error('Error importing file:', err);
            toast({ title: $t('common.import.errorTitle'), description: $t('common.import.errorGeneric'), variant: 'destructive' });
        }
    };
    reader.readAsArrayBuffer(file);
};

const exportData = async (format: 'csv' | 'xlsx') => {
    const dataToExport = filteredAndSortedParticipants.value.map(p => {
        const record: { [key: string]: any } = {};
        visibleColumns.value.forEach(colKey => {
            const col = allColumns.value.find(c => c.key === colKey);
            if (col) {
                 record[$t(col.label)] = getNestedProperty(p, col.key);
            }
        });
        return record;
    });

    if (format === 'xlsx') {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Participants');

        // Agregar encabezados
        if (dataToExport.length > 0) {
            const headers = Object.keys(dataToExport[0]);
            worksheet.addRow(headers);

            // Agregar datos
            dataToExport.forEach(row => {
                worksheet.addRow(Object.values(row));
            });
        }

        // Configurar estilo para encabezados
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // Generar archivo
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `participants_${props.type}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
    } else if (format === 'csv') {
        // Implementar exportación CSV si es necesario
        const headers = dataToExport.length > 0 ? Object.keys(dataToExport[0]) : [];
        const csvContent = [
            headers.join(','),
            ...dataToExport.map(row => headers.map(header => row[header]).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `participants_${props.type}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    }
};

const closeColumnDialog = () => {
    isColumnDialogOpen.value = false;
};


// --- WATCHER PARA CARGAR DATOS ---
watch([selectedRetreatId, filterStatus], ([newId]) => {
  if (newId) {
    participantStore.filters.retreatId = newId;
    participantStore.filters.isCancelled = isCancelled.value;
    participantStore.fetchParticipants();
  }
}, { immediate: true });

watch(() => props.defaultFilters, (newDefaults) => {
    filters.value = { ...newDefaults };
    filterStatus.value = newDefaults?.isCancelled ? 'canceled' : 'active';
}, { deep: true });

</script>

<style scoped>
.participant-row:last-child {
    border-width: 1px !important;
    border-left-width: 4px !important;
}

.bg-yellow-50 {
    background-color: rgba(254, 249, 195, 0.5) !important;
}
</style>

<template>
    <div>
        <!-- Toolbar de Acciones -->
        <div class="flex flex-col sm:flex-row justify-between items-center gap-2 mb-4">
            <div class="flex gap-2 items-center">
                <Input
                    v-model="searchQuery"
                    :placeholder="$t('common.searchPlaceholder')"
                    class="max-w-sm"
                />
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <Button variant="outline" size="icon" @click="isFilterDialogOpen = true">
                                <ListFilter class="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{{ $t('participants.filters.title') }}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
            <div class="flex gap-2">
                <!-- Add Participant -->
                <Button @click="openRegistrationLink" :disabled="!selectedRetreatId" :title="$t('participants.addParticipant')" size="icon" >
                    <Plus class="h-4 w-4" />
                </Button>
                <!-- Three dots menu with all actions -->
                <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                        <Button variant="outline" size="icon">
                            <MoreVertical class="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>{{ $t('participants.actions') }}</DropdownMenuLabel>
                        <DropdownMenuSeparator />

                        <!-- Toggle Filter Status -->
                        <DropdownMenuItem @click="toggleFilterStatus">
                            <ListFilter class="mr-2 h-4 w-4" />
                            <span>{{ filterStatus === 'active' ? 'Show Canceled' : 'Show Active' }}</span>
                        </DropdownMenuItem>

                        <!-- Column Selector -->
                        <DropdownMenuItem @click="isColumnDialogOpen = true">
                            <Columns class="mr-2 h-4 w-4" />
                            {{ $t('common.columns') }}
                        </DropdownMenuItem>

                        <!-- Import -->
                        <DropdownMenuItem @click="isImportDialogOpen = true">
                            <FileUp class="mr-2 h-4 w-4" />
                            {{ $t('participants.import.title') }}
                        </DropdownMenuItem>

                        <!-- Export -->
                        <DropdownMenuItem @click="exportData('xlsx')">
                            <FileDown class="h-4 w-4" />
                            {{ $t('export.xlsx') }}
                        </DropdownMenuItem>
                        <DropdownMenuItem @click="exportData('csv')">
                            <FileDown class="h-4 w-4" />
                            {{ $t('export.csv') }}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                    </DropdownMenuContent>
                </DropdownMenu>

            </div>
        </div>

        <!-- Mensajes de estado y Tabla -->
        <div v-if="loading">{{ $t('participants.loading') }}</div>
        <div v-else-if="error" class="text-red-500">{{ error }}</div>
        <div v-else-if="!selectedRetreatId" class="text-center text-gray-500 py-8">
            <p>{{ $t('participants.selectRetreatPrompt') }}</p>
        </div>
        <div v-else class="border rounded-md">
            <Table>
                <TableCaption v-if="filteredAndSortedParticipants.length === 0">{{ $t('participants.noParticipantsFound') }}</TableCaption>
                <TableHeader>
                    <TableRow>
                        <TableHead v-for="colKey in visibleColumns" :key="colKey" @click="handleSort(colKey)" class="cursor-pointer">
                           {{ $t(allColumns.find(c => c.key === colKey)?.label || '') }}
                           <ArrowUpDown v-if="sortKey === colKey" class="inline-block ml-2 h-4 w-4" />
                        </TableHead>
                        <TableHead>{{ $t('participants.actions') }}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow v-for="participant in filteredAndSortedParticipants" :key="participant.id" :class="[participant.family_friend_color ? 'border-l-4' : '', hasBirthdayDuringRetreat(participant) ? 'bg-yellow-50' : '']" :style="participant.family_friend_color ? { borderLeftColor: participant.family_friend_color } : {}" class="participant-row">
                        <TableCell v-for="colKey in visibleColumns" :key="`${participant.id}-${colKey}`">
                            <div class="flex items-center gap-1">
                                {{ getCellContent(participant, colKey).value }}
                                <span v-if="getCellContent(participant, colKey).hasBirthday" class="text-yellow-600" :title="$t('participants.birthdayDuringRetreat')">
                                    🎂
                                </span>
                            </div>
                        </TableCell>
                        <TableCell>
                            <div class="flex -space-x-3">
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger as-child>
                                            <Button variant="ghost" size="icon" @click="openEditDialog(participant)"><Edit class="h-4 w-4" /></Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Editar Participante</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger as-child>
                                            <Button variant="ghost" size="icon" @click="openMessageDialog(participant)">
                                                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                                                </svg>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Enviar Mensaje</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger as-child>
                                            <Button variant="ghost" size="icon" class="text-red-500 hover:text-red-700" @click="openDeleteDialog(participant)"><Trash2 class="h-4 w-4" /></Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Eliminar Participante</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        </TableCell>
                    </TableRow>
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell :colspan="visibleColumns.length + 1" class="text-right font-bold">
                      {{ $t('common.total') }}: {{ filteredAndSortedParticipants.length }}
                    </TableCell>
                  </TableRow>
                </TableFooter>
            </Table>
        </div>

         <!-- Diálogo de Confirmación de Eliminación -->
        <Dialog v-model:open="isDeleteDialogOpen">
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{{ $t('delete.confirmTitle') }}</DialogTitle>
                    <DialogDescription>
                        {{ $t('participants.delete.confirmMessage1') }} <strong>{{ participantToDelete?.firstName }} {{ participantToDelete?.lastName }}</strong>. {{ $t('participants.delete.confirmMessage2') }}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" @click="isDeleteDialogOpen = false">{{ $t('common.actions.cancel') }}</Button>
                    <Button variant="destructive" @click="confirmDelete">{{ $t('common.actions.delete') }}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <!-- Diálogo de Edición -->
        <Dialog v-model:open="isEditDialogOpen">
            <DialogContent class="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Edit Participant</DialogTitle>
                </DialogHeader>
                <EditParticipantForm
                    v-if="participantToEdit"
                    :participant="participantToEdit"
                    :all-columns="allColumns.map(c => ({ ...c, label: $t(c.label) }))"
                    :columns-to-show="formColumnsToShow"
                    :columns-to-edit="formColumnsToEdit"
                    @save="handleUpdateParticipant"
                    @cancel="isEditDialogOpen = false"
                />
            </DialogContent>
        </Dialog>

        <!-- Filter Dialog -->
        <FilterDialog
            :open="isFilterDialogOpen"
            :filters="filters"
            :default-filters="props.defaultFilters"
            :all-columns="allColumns"
            @update:open="isFilterDialogOpen = $event"
            @update:filters="filters = $event"
        />



        <!-- Column Selector Modal -->
        <div v-if="isColumnDialogOpen" class="fixed inset-0 z-50 flex items-center justify-center">
            <!-- Backdrop -->
            <div class="absolute inset-0 bg-black/50" @click="closeColumnDialog"></div>

            <!-- Modal Content -->
            <div class="relative bg-white rounded-lg shadow-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
                <div class="p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="text-lg font-semibold">{{ $t('participants.selectColumns') }}</h2>
                        <Button variant="ghost" size="icon" @click="closeColumnDialog">
                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </Button>
                    </div>
                    <ColumnSelector
                        :all-columns="allColumns.map(c => ({ ...c, label: $t(c.label) }))"
                        :default-columns="props.columnsToShowInTable"
                        v-model="visibleColumns"
                    />
                    <div class="flex justify-end mt-6">
                        <Button variant="outline" @click="closeColumnDialog">
                            {{ $t('common.actions.close') }}
                        </Button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Import Modal -->
        <div v-if="isImportDialogOpen" class="fixed inset-0 z-50 flex items-center justify-center">
            <!-- Backdrop -->
            <div class="absolute inset-0 bg-black/50" @click="isImportDialogOpen = false"></div>

            <!-- Modal Content -->
            <div class="relative bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
                <div class="p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="text-lg font-semibold">{{ $t('participants.import.title') }}</h2>
                        <Button variant="ghost" size="icon" @click="isImportDialogOpen = false">
                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </Button>
                    </div>
                    <p class="text-sm text-muted-foreground mb-4">{{ $t('participants.import.description') }}</p>
                    <Input type="file" @change="handleFileUpload" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" />
                    <div class="flex justify-end mt-6">
                        <Button variant="outline" @click="isImportDialogOpen = false">
                            {{ $t('common.actions.close') }}
                        </Button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Message Dialog -->
        <MessageDialog
            v-model:open="isMessageDialogOpen"
            :participant="messageParticipant"
        />
    </div>
</template>