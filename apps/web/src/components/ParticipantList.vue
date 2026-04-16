<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import { useParticipantStore } from '@/stores/participantStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { getPalanqueroOptions, sendEmailViaBackend, getSmtpConfig } from '@/services/api';
import { useMessageTemplateStore } from '@/stores/messageTemplateStore';
import { convertHtmlToEmail, replaceAllVariables } from '@/utils/message';
import type { ParticipantData, RetreatData } from '@/utils/message';
import MessageDialog from './MessageDialog.vue';
import BulkEditParticipantsModal from './BulkEditParticipantsModal.vue';
import { useI18n } from 'vue-i18n';
import ExcelJS from 'exceljs';
import { createLocaleComparator } from '@/utils/sort';

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
import ImportParticipantsModal from './ImportParticipantsModal.vue';
import ExportParticipantsModal from './ExportParticipantsModal.vue';
import TagBadge from './TagBadge.vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@repo/ui';


import { ArrowUpDown, Trash2, Edit, FileUp, FileDown, Columns, ListFilter, MoreVertical, Plus, X, Printer, RefreshCw, Search, Users, MessageSquare, RotateCcw } from 'lucide-vue-next';
import { useToast } from '@repo/ui';

// Traducción (simulada, usa tu sistema de i18n)
//const $t = (key: string) => key.split('.').pop()?.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()) || key;

const props = withDefaults(defineProps<{
    type?: 'walker' | 'server' | 'waiting' | 'partial_server' | undefined,
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
const { tags } = storeToRefs(participantStore);
const messageTemplateStore = useMessageTemplateStore();
const { templates: allMessageTemplates } = storeToRefs(messageTemplateStore);

const palanqueroDisplayMap = ref<Record<string, string>>({});

// Bulk email computed properties
const participantsWithEmail = computed(() =>
    bulkMessageParticipants.value.filter((p: any) => p.email && p.email.trim() !== '')
);
const participantsWithoutEmail = computed(() =>
    bulkMessageParticipants.value.filter((p: any) => !p.email || p.email.trim() === '')
);

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
const searchTimeoutId = ref<NodeJS.Timeout | null>(null);
const isColumnDialogOpen = ref(false);
const isImportDialogOpen = ref(false);
const isDeleteDialogOpen = ref(false);
const participantToDelete = ref<any>(null);
const isEditDialogOpen = ref(false);
const participantToEdit = ref<any>(null);
const isFilterDialogOpen = ref(false);
const isMessageDialogOpen = ref(false);
const messageParticipant = ref<any>(null);
const isBulkMessageDialogOpen = ref(false);
const bulkMessageParticipants = ref<any[]>([]);

// Bulk email sending state
const bulkEmailTemplate = ref('');
const bulkEmailMessage = ref('');
const bulkEmailSubject = ref('');
const bulkEmailSending = ref(false);
const bulkEmailProgress = ref(0);
const bulkEmailTotal = ref(0);
const bulkEmailResults = ref<{ success: number; failed: number; errors: string[] }>({ success: 0, failed: 0, errors: [] });
const bulkEmailPhase = ref<'compose' | 'sending' | 'results'>('compose');
const smtpConfigured = ref(false);
const isBulkEditDialogOpen = ref(false);
const bulkEditParticipants = ref<any[]>([]);

// --- BULK SELECTION ---
const selectedParticipants = ref<Set<string>>(new Set());
const isBulkDeleteDialogOpen = ref(false);

// --- EXPORT ---
const isExportDialogOpen = ref(false);
const exportSelectedColumns = ref<string[]>([]);

// Computed properties for bulk selection
const isAllSelected = computed(() =>
    filteredAndSortedParticipants.value.length > 0 &&
    selectedParticipants.value.size === filteredAndSortedParticipants.value.length
);

const isSomeSelected = computed(() =>
    selectedParticipants.value.size > 0 &&
    selectedParticipants.value.size < filteredAndSortedParticipants.value.length
);

const selectedCount = computed(() => selectedParticipants.value.size);

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
  console.log('[Component] ParticipantList - Filters changed:', newFilters);
  // Sync local filters with store filters for API calls
  const actualFilters = extractFilters(newFilters);
  console.log('[Component] ParticipantList - Extracted filters:', actualFilters);
  
  // Merge retreatId which is mandatory
  if (selectedRetreatId.value) {
    actualFilters.retreatId = selectedRetreatId.value;
  }
  
  // Update store filters
  Object.keys(participantStore.filters).forEach(key => {
    delete participantStore.filters[key];
  });
  Object.assign(participantStore.filters, actualFilters);
  
  // Trigger API fetch for server-side filtering
  participantStore.fetchParticipants();
}, { deep: true });

// --- FILTER LOGIC HELPERS ---
const extractFilters = (obj: any): Record<string, any> => {
    if (!obj || typeof obj !== 'object') return {};
    
    // Deep clone to avoid mutating the original
    const result: Record<string, any> = {};
    
    Object.entries(obj).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            // Skip empty arrays (e.g., tagIds: [])
            if (Array.isArray(value) && value.length === 0) return;
            result[key] = value;
        }
    });
    
    return result;
};

const activeDynamicFiltersCount = computed(() => {
    const actualFilters = extractFilters(filters.value);
    return Object.values(actualFilters).filter(v => v !== undefined && v !== null && v !== '').length;
});

const activeFiltersList = computed(() => {
    const list: { key: string; label: string; value: any; type: 'search' | 'status' | 'dynamic' }[] = [];
    
    if (searchQuery.value) {
        list.push({ 
            key: 'search', 
            label: $t('common.searchPlaceholder'), 
            value: searchQuery.value, 
            type: 'search' 
        });
    }
    
    if (filterStatus.value === 'canceled') {
        list.push({ 
            key: 'status', 
            label: $t('participants.status.title'), 
            value: $t('participants.status.canceled'), 
            type: 'status' 
        });
    }
    
    const actualFilters = extractFilters(filters.value);
    Object.entries(actualFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            const col = allColumns.value.find(c => c.key === key);
            const label = col ? $t(col.label) : key;
            let displayValue = value;

            // Handle boolean filters
            if (typeof value === 'boolean') {
                displayValue = value ? $t('common.yes') : $t('common.no');
            }
            // Handle tshirtSize filter
            else if (key === 'tshirtSize') {
                displayValue = $t(`walkerRegistration.fields.tshirtSize.options.${value}`);
            }
            // Handle paymentStatus filter
            else if (key === 'paymentStatus') {
                displayValue = $t(`participants.filters.options.paymentStatus.${value}`);
            }
            // Handle maritalStatus filter
            else if (key === 'maritalStatus') {
                displayValue = $t(`participants.filters.options.maritalStatus.${value}`);
            }
            // Handle unassigned value
            else if (value === 'unassigned') {
                displayValue = $t('participants.filters.options.unassigned');
            }
            // Handle tagIds filter
            else if (key === 'tagIds' && Array.isArray(value) && value.length > 0) {
                const tagNames = value.map(id => {
                    const tag = tags.value.find(t => t.id === id);
                    return tag ? tag.name : id;
                });
                displayValue = tagNames.join(', ');
            }

            list.push({ key, label, value: displayValue, type: 'dynamic' });
        }
    });
    
    return list;
});

const removeFilter = (filterKey: string, type: 'search' | 'status' | 'dynamic') => {
    if (type === 'search') {
        searchQuery.value = '';
    } else if (type === 'status') {
        filterStatus.value = 'active';
    } else {
        const newFilters = { ...filters.value };
        delete newFilters[filterKey];
        filters.value = newFilters;
    }
};

const clearAllFilters = () => {
    searchQuery.value = '';
    filterStatus.value = 'active';
    filters.value = { ...props.defaultFilters };
    
    // Also clear store filters to trigger a fresh fetch
    Object.keys(participantStore.filters).forEach(key => {
        delete participantStore.filters[key];
    });
    if (selectedRetreatId.value) {
        participantStore.filters.retreatId = selectedRetreatId.value;
    }
    participantStore.fetchParticipants();
};


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
    { key: 'disabilitySupport', label: 'participants.fields.disabilitySupport' },
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
    { key: 'lastPaymentDate', label: 'participants.fields.lastPaymentDate' },
    { key: 'totalPaid', label: 'participants.fields.totalPaid' },
    { key: 'paymentStatus', label: 'participants.fields.paymentStatus' },
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
    { key: 'tags', label: 'participants.fields.tags' },
    { key: 'retreatBed.roomNumber', label: 'rooms.roomNumber' },
    { key: 'messageCount', label: 'participants.fields.messageCount' },
]);

const longTextColumns = new Set([
    'notes', 'palancasNotes', 'medicationDetails',
    'dietaryRestrictionsDetails', 'disabilitySupport', 'medicationSchedule',
    'pickupLocation'
]);

// Initialize visible columns from store or props
const visibleColumns = ref<string[]>([]);

// Load saved columns and initialize state on mount
onMounted(() => {
    console.log('[Component] ParticipantList - Mounted');
    const savedColumns = participantStore.getColumnSelection(currentViewName.value, props.columnsToShowInTable);
    visibleColumns.value = [...savedColumns];
    filters.value = { ...props.defaultFilters };
    
    if (selectedRetreatId.value) {
        participantStore.fetchTags(selectedRetreatId.value);
    }
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
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
// Watch for retreat changes to fetch tags and palanquero options
watch(selectedRetreatId, async (newId) => {
    if (newId) {
        participantStore.fetchTags(newId);
        try {
            const options = await getPalanqueroOptions(newId);
            const map: Record<string, string> = {};
            for (const opt of options) {
                map[opt.value] = opt.label;
            }
            palanqueroDisplayMap.value = map;
        } catch (e) {
            console.error('Error loading palanquero options:', e);
        }
    }
}, { immediate: true });

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

    const actualFilters = extractFilters(filters.value);
    const activeFilters = Object.entries(actualFilters).filter(([, value]) => value !== undefined && value !== null && value !== '');

    if (activeFilters.length > 0) {
        result = result.filter(p => {
            const matches = activeFilters.every(([key, value]) => {
                // Handle tagIds filter
                if (key === 'tagIds' && Array.isArray(value) && value.length > 0) {
                    if (!p.tags || !Array.isArray(p.tags)) return false;
                    const pTags = p.tags as any[];
                    return value.some(tagId => pTags.some((pt: any) => pt.tagId === tagId));
                }

                const participantValue = getNestedProperty(p, key);

                // Handle boolean filters (exact match)
                if (typeof value === 'boolean') {
                    return participantValue === value;
                }

                // Handle "unassigned" special value for relational fields
                if (value === 'unassigned') {
                    if (key === 'tableMesa.name') {
                        return !p.tableMesa || !p.tableMesa.name;
                    }
                    if (key === 'retreatBed.roomNumber') {
                        return !p.retreatBed || !p.retreatBed.roomNumber;
                    }
                    // For other fields, treat null/undefined as unassigned
                    return participantValue === null || participantValue === undefined || participantValue === '';
                }

                // Handle text partial matching for city, parish, disabilitySupport
                if (key === 'city' || key === 'parish' || key === 'disabilitySupport') {
                    const filterValue = String(value).toLowerCase();
                    const participantStr = String(participantValue || '').toLowerCase();
                    return participantStr.includes(filterValue);
                }

                // Handle exact match for other fields (tshirtSize, maritalStatus, paymentStatus, etc.)
                return String(participantValue).toLowerCase() === String(value).toLowerCase();
            });
            return matches;
        });
    }

    // 3. Ordenar
    if (sortKey.value) {
        const compare = createLocaleComparator('es', sortOrder.value);
        const key = sortKey.value;
        result.sort((a, b) => {
            let valA = getNestedProperty(a, key);
            let valB = getNestedProperty(b, key);

            // Ordenar palancasCoordinator por su label mostrado, no por el id crudo
            if (key === 'palancasCoordinator') {
                valA = valA ? (palanqueroDisplayMap.value[valA] || valA) : valA;
                valB = valB ? (palanqueroDisplayMap.value[valB] || valB) : valB;
            }
            return compare(valA, valB);
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

    // Parsear fechas del retiro evitando desplazamiento de zona horaria
    const parseLocalDate = (s: string | Date) => {
        if (s instanceof Date) return s;
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
    };
    const retreatStart = parseLocalDate(currentRetreat.startDate);
    const retreatEnd = parseLocalDate(currentRetreat.endDate);

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

    // Handle tags array - return as comma-separated list for text display
    if (colKey === 'tags') {
        if (!value || !Array.isArray(value) || value.length === 0) return 'N/A';
        return value.map((t: any) => t.tag?.name || t.name || '').filter(Boolean).join(', ');
    }

    // Handle date formatting
    if (['birthDate', 'registrationDate', 'lastUpdatedDate'].includes(colKey)) {
        if (!value) return 'N/A';
        const date = new Date(value);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Handle lastPaymentDate field - use computed property from API
    if (colKey === 'lastPaymentDate') {
        const paymentDate = participant.lastPaymentDate;
        if (!paymentDate) return 'N/A';
        // Use existing date formatting logic for consistency
        const date = new Date(paymentDate);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Handle totalPaid field - use calculated totalPaid from API
    if (colKey === 'totalPaid') {
        const totalPaid = participant.totalPaid || 0;
        if (totalPaid === 0) return '$0.00';
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(totalPaid);
    }

    // Handle paymentStatus field - use computed property from API
    if (colKey === 'paymentStatus') {
        const status = participant.paymentStatus || 'unpaid';
        const statusMap: Record<string, string> = {
            'paid': 'Pagado',
            'partial': 'Parcial',
            'unpaid': 'No pagado',
            'overpaid': 'Sobre-pagado'
        };
        return statusMap[status] || status;
    }

    // Handle boolean values
    if (typeof value === 'boolean') {
        return value ? $t('common.yes') : $t('common.no');
    }

    return value != null && value !== '' ? value : 'N/A';
};

const getCellContent = (participant: any, colKey: string) => {
    const value = getNestedProperty(participant, colKey);

    if (colKey === 'birthDate' && hasBirthdayDuringRetreat(participant)) {
        const formattedDate = formatCell(participant, colKey);
        return {
            value: formattedDate,
            hasBirthday: true,
            hasPaymentStatus: false
        };
    }

    if (colKey === 'firstName' && hasBirthdayDuringRetreat(participant)) {
        return {
            value: value || 'N/A',
            hasBirthday: true,
            hasPaymentStatus: false
        };
    }

    // Add payment status indicator for totalPaid amounts
    if (colKey === 'totalPaid') {
        const paymentStatus = participant.paymentStatus || 'unpaid';
        const formattedAmount = formatCell(participant, colKey);

        return {
            value: formattedAmount,
            hasBirthday: false,
            hasPaymentStatus: true,
            paymentStatus
        };
    }

    // Add payment status indicator for paymentStatus column
    if (colKey === 'paymentStatus') {
        const formattedStatus = formatCell(participant, colKey);
        const paymentStatus = participant.paymentStatus || 'unpaid';

        return {
            value: formattedStatus,
            hasBirthday: false,
            hasPaymentStatus: true,
            paymentStatus
        };
    }

    if (colKey === 'palancasCoordinator' && value) {
        return {
            value: palanqueroDisplayMap.value[value] || value,
            hasBirthday: false,
            hasPaymentStatus: false
        };
    }

    return {
        value: formatCell(participant, colKey),
        hasBirthday: false,
        hasPaymentStatus: false
    };
};

const formColumnsToShow = computed(() => {
    const combined = new Set([...props.columnsToShowInForm, ...visibleColumns.value]);
    return Array.from(combined);
});

const formColumnsToEdit = computed(() => {
    const combined = new Set([...props.columnsToEditInForm, ...visibleColumns.value]);
    const nonEditableSystemKeys = [
        'id', 'id_on_retreat', 'email', 'registrationDate',
        'lastUpdatedDate', 'retreatId', 'tableId'
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

const handlePrint = () => {
    window.print();
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

const reactivateParticipant = async (participant: any) => {
    try {
        await participantStore.updateParticipant(participant.id, { ...participant, isCancelled: false });
        toast({
            title: $t('participants.reactivate.successTitle'),
            description: `${participant.firstName} ${participant.lastName} ${$t('participants.reactivate.successDesc')}`,
        });
    } catch (error) {
        // toast already shown by store
    }
};

const openEditDialog = (participant: any) => {
    participantToEdit.value = participant;
    isEditDialogOpen.value = true;
};

const openMessageDialog = (participant: any) => {
    messageParticipant.value = participant;
    isMessageDialogOpen.value = true;
};

const bulkMessageSelected = async () => {
    const selectedIds = Array.from(selectedParticipants.value);
    const selectedData = filteredAndSortedParticipants.value.filter((p: any) =>
        selectedIds.includes(p.id)
    );
    bulkMessageParticipants.value = selectedData;

    // Reset state
    bulkEmailPhase.value = 'compose';
    bulkEmailTemplate.value = '';
    bulkEmailMessage.value = '';
    bulkEmailSubject.value = '';
    bulkEmailProgress.value = 0;
    bulkEmailTotal.value = 0;
    bulkEmailResults.value = { success: 0, failed: 0, errors: [] };
    bulkEmailSending.value = false;

    // Check SMTP config
    try {
        const config = await getSmtpConfig();
        smtpConfigured.value = config?.configured ?? false;
    } catch {
        smtpConfigured.value = false;
    }

    // Load templates
    if (selectedRetreatId.value) {
        messageTemplateStore.fetchTemplates(selectedRetreatId.value);
    }

    isBulkMessageDialogOpen.value = true;
};

const bulkEditSelected = () => {
    const selectedIds = Array.from(selectedParticipants.value);
    const selectedData = filteredAndSortedParticipants.value.filter((p: any) =>
        selectedIds.includes(p.id)
    );
    bulkEditParticipants.value = selectedData;
    isBulkEditDialogOpen.value = true;
};

const handleUpdateParticipant = async (updatedParticipant: any) => {
    await participantStore.updateParticipant(updatedParticipant.id, updatedParticipant);
    toast({
        title: $t('participants.update.successTitle'),
        description: $t('participants.update.successDesc'),
    });
    isEditDialogOpen.value = false;
};

const toggleFilterStatus = () => {
  filterStatus.value = filterStatus.value === 'active' ? 'canceled' : 'active';
};

// --- IMPORTACIÓN / EXPORTACIÓN ---

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

// Bulk selection methods
const toggleParticipantSelection = (participantId: string | number) => {
    const id = String(participantId); // Ensure it's a string
    if (selectedParticipants.value.has(id)) {
        selectedParticipants.value.delete(id);
    } else {
        selectedParticipants.value.add(id);
    }
};

const toggleAllParticipantsSelection = () => {
    if (isAllSelected.value) {
        selectedParticipants.value.clear();
    } else {
        selectedParticipants.value.clear();
        filteredAndSortedParticipants.value.forEach(p => {
            selectedParticipants.value.add(p.id);
        });
    }
};

const bulkDeleteSelected = async () => {
    if (selectedParticipants.value.size === 0) return;

    isBulkDeleteDialogOpen.value = true;
};

const confirmBulkDelete = async () => {
    const participantIds = Array.from(selectedParticipants.value);

    try {
        // Delete participants in parallel
        const deletePromises = participantIds.map(id =>
            participantStore.deleteParticipant(id)
        );
        await Promise.all(deletePromises);

        toast({
            title: $t('participants.bulkDelete.successTitle'),
            description: $t('participants.bulkDelete.successDesc', { count: participantIds.length }),
        });

        selectedParticipants.value.clear();
        isBulkDeleteDialogOpen.value = false;
    } catch (error) {
        toast({
            title: $t('participants.bulkDelete.errorTitle'),
            description: $t('participants.bulkDelete.errorGeneric'),
            variant: 'destructive',
        });
    }
};

const onBulkTemplateSelect = (templateId: string) => {
    bulkEmailTemplate.value = templateId;
    const template = allMessageTemplates.value.find((t: any) => t.id === templateId);
    if (template) {
        bulkEmailMessage.value = template.message || '';
        bulkEmailSubject.value = template.name || 'Mensaje';
    }
};

const sendBulkEmail = async () => {
    if (!smtpConfigured.value) {
        toast({
            title: $t('participants.bulkMessage.errorTitle'),
            description: $t('participants.bulkMessage.smtpNotConfigured'),
            variant: 'destructive',
        });
        return;
    }

    const recipients = participantsWithEmail.value;
    if (recipients.length === 0) {
        toast({
            title: $t('participants.bulkMessage.errorTitle'),
            description: $t('participants.bulkMessage.noEmailRecipients'),
            variant: 'destructive',
        });
        return;
    }

    bulkEmailPhase.value = 'sending';
    bulkEmailSending.value = true;
    bulkEmailTotal.value = recipients.length;
    bulkEmailProgress.value = 0;
    bulkEmailResults.value = { success: 0, failed: 0, errors: [] };

    const retreatData = retreatStore.selectedRetreat as RetreatData;

    for (const participant of recipients) {
        try {
            const participantData = participant as unknown as ParticipantData;
            const personalizedHtml = replaceAllVariables(
                bulkEmailMessage.value,
                participantData,
                retreatData
            );
            const emailHtml = convertHtmlToEmail(personalizedHtml, { format: 'enhanced' });
            const textContent = personalizedHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            const subject = replaceAllVariables(
                bulkEmailSubject.value,
                participantData,
                retreatData
            ).replace(/<[^>]*>/g, '');

            await sendEmailViaBackend({
                to: participant.email,
                subject,
                html: emailHtml,
                text: textContent,
                participantId: participant.id,
                retreatId: selectedRetreatId.value!,
                templateId: bulkEmailTemplate.value || undefined,
                templateName: allMessageTemplates.value.find(
                    (t: any) => t.id === bulkEmailTemplate.value
                )?.name,
            });

            bulkEmailResults.value.success++;
        } catch (err: any) {
            bulkEmailResults.value.failed++;
            const name = `${participant.firstName} ${participant.lastName}`;
            const msg = err?.response?.data?.message || err?.message || 'Error desconocido';
            bulkEmailResults.value.errors.push(`${name}: ${msg}`);
        }
        bulkEmailProgress.value++;
    }

    bulkEmailSending.value = false;
    bulkEmailPhase.value = 'results';
};

const handleBulkEditSave = async (updatedParticipants: any[]) => {
    try {
        // Update participants in parallel
        const updatePromises = updatedParticipants.map(participant =>
            participantStore.updateParticipant(participant.id, participant)
        );
        await Promise.all(updatePromises);

        toast({
            title: $t('participants.bulkEdit.successTitle'),
            description: $t('participants.bulkEdit.successDesc', { count: updatedParticipants.length }),
        });

        selectedParticipants.value.clear();
    } catch (error: any) {
        console.error('Bulk edit error:', error);

        // Enhanced error handling for validation errors
        let errorMessage = $t('participants.bulkEdit.errorDesc');
        if (error.response?.data?.message) {
            errorMessage = error.response.data.message;
        }

        // Handle specific validation errors
        if (error.response?.data?.errors) {
            const validationErrors = error.response.data.errors;
            if (Array.isArray(validationErrors) && validationErrors.length > 0) {
                const firstError = validationErrors[0];
                if (firstError.path && firstError.message) {
                    errorMessage = `Validation error for ${firstError.path.join('.')}: ${firstError.message}`;
                }
            }
        }

        toast({
            title: $t('participants.bulkEdit.errorTitle'),
            description: errorMessage,
            variant: 'destructive',
        });
    }
};

const exportSelectedParticipants = async (format: 'csv' | 'xlsx') => {
    const selectedIds = Array.from(selectedParticipants.value);
    const selectedParticipantsData = filteredAndSortedParticipants.value.filter((p: any) =>
        selectedIds.includes(p.id)
    );

    if (selectedParticipantsData.length === 0) return;

    const dataToExport = selectedParticipantsData.map(p => {
        const record: { [key: string]: any } = {};
        visibleColumns.value.forEach(colKey => {
            const col = allColumns.value.find(c => c.key === colKey);
            if (col) {
                record[$t(col.label)] = getNestedProperty(p, col.key);
            }
        });
        return record;
    });

    // Export logic similar to exportData function...
    exportAsFile(dataToExport, format, `selected_participants_${new Date().toISOString().slice(0, 10)}`);
};

const exportAsFile = async (data: any[], format: 'csv' | 'xlsx', filename: string) => {
    if (format === 'xlsx') {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Selected Participants');

        if (data.length > 0) {
            const headers = Object.keys(data[0]);
            worksheet.addRow(headers);
            data.forEach(row => worksheet.addRow(Object.values(row)));
            const headerRow = worksheet.getRow(1);
            headerRow.font = { bold: true };
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
    } else {
        const headers = data.length > 0 ? Object.keys(data[0]) : [];
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    }
};

const handleExport = async (data: any[], format: string, filename: string) => {
    // Use the existing exportAsFile function
    await exportAsFile(data, format as 'csv' | 'xlsx', filename);
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

// Watch for search query with debouncing (300ms delay)
watch(searchQuery, (newQuery) => {
    if (searchTimeoutId.value) {
        clearTimeout(searchTimeoutId.value);
    }
    searchTimeoutId.value = setTimeout(() => {
        // Debounced search logic can be implemented here if needed
        // Currently, the search is already handled in the computed property
    }, 300);
});

// Keyboard shortcuts for selection management
const handleKeyboardShortcuts = (event: KeyboardEvent) => {
    // Ctrl+A or Cmd+A: Select all visible participants
    if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
        event.preventDefault();
        if (filteredAndSortedParticipants.value.length > 0) {
            toggleAllParticipantsSelection();
        }
    }

    // Escape: Clear selection
    if (event.key === 'Escape' && selectedParticipants.value.size > 0) {
        event.preventDefault();
        selectedParticipants.value.clear();
        toast({
            title: $t('participants.selectionCleared'),
            description: $t('participants.selectionClearedDesc'),
        });
    }

    // Delete key: Bulk delete (if items selected)
    if (event.key === 'Delete' && selectedParticipants.value.size > 0) {
        event.preventDefault();
        bulkDeleteSelected();
    }
};


// Cleanup keyboard event listener
// Note: In Vue 3, we could use onUnmounted, but since this is a script setup component,
// we'll add the cleanup logic when the component is unmounted naturally

</script>

<style scoped>
.participant-row:last-child {
    border-width: 1px !important;
    border-left-width: 4px !important;
}

.bg-yellow-50 {
    background-color: rgba(254, 249, 195, 0.5) !important;
}

@media print {
    /* Scoped print styles for the table */
    .print-only-header {
        display: block !important;
        margin-bottom: 20px !important;
        text-align: center !important;
    }

    .participant-row {
        page-break-inside: avoid !important;
    }
}
</style>

<style>
/* Global print styles */
.print-only-header {
    display: none;
}

@media print {
    @page {
        margin: 1cm;
    }

    /* Hide elements marked with no-print class */
    .no-print {
        display: none !important;
    }

    /* Show print-only elements */
    .print-only-header {
        display: block !important;
        margin-bottom: 20px !important;
        text-align: center !important;
    }

    /* Remove border from table wrapper */
    .border.rounded-md {
        border: none !important;
    }

    /* Table styling */
    table {
        width: 100% !important;
        border-collapse: collapse !important;
        table-layout: auto !important;
        margin: 0 !important;
    }

    th, td {
        border: 1px solid #ddd !important;
        padding: 4px 8px !important;
        font-size: 8pt !important;
        text-align: left !important;
    }

    thead {
        display: table-header-group !important;
    }

    /* Avoid page breaks inside rows */
    .participant-row {
        page-break-inside: avoid !important;
    }
}
</style>



<template>
    <div class="p-0 sm:p-4">
        <!-- Print Container - wraps content that should be visible when printing -->
        <div class="print-container">
            <!-- Print Header (only visible when printing) -->
            <div class="print-only-header">
                <h1 class="text-2xl font-bold">{{ retreatStore.selectedRetreat?.parish }}</h1>
                <h2 class="text-xl">
                {{ props.type ? $t(`sidebar.${props.type}s`) : $t('participants.all') }}
            </h2>
                <p class="text-sm text-gray-500">{{ new Date().toLocaleDateString() }}</p>
            </div>
        <!-- End of Print Header -->

        <!-- Toolbar de Acciones -->
        <div class="flex flex-col sm:flex-row justify-between items-center gap-3 mb-4 no-print">
            <div class="flex gap-2 items-center w-full sm:w-auto">
                <div class="relative flex-1 sm:flex-none sm:w-72">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    <Input
                        v-model="searchQuery"
                        :placeholder="$t('common.searchPlaceholder')"
                        class="pl-9 pr-8"
                    />
                    <button
                        v-if="searchQuery"
                        @click="searchQuery = ''"
                        class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X class="h-4 w-4" />
                    </button>
                </div>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <Button
                                variant="outline"
                                size="icon"
                                @click="isFilterDialogOpen = true"
                                :class="{ 'border-blue-500 bg-blue-50 text-blue-600': activeDynamicFiltersCount > 0 }"
                                class="relative shrink-0"
                            >
                                <ListFilter class="h-4 w-4" />
                                <span
                                    v-if="activeDynamicFiltersCount > 0"
                                    class="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-600 text-white text-[10px] rounded-full flex items-center justify-center font-bold shadow-sm"
                                >
                                    {{ activeDynamicFiltersCount }}
                                </span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{{ $t('participants.filters.title') }}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>

            <!-- Selection Status Bar -->
            <div v-if="selectedCount > 0" class="flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg shadow-sm">
                <span class="text-sm text-blue-700 font-semibold">
                    {{ selectedCount }}
                </span>
                <span class="text-sm text-blue-600">{{ $t('participants.selectedCount', { count: selectedCount }) }}</span>
                <div class="flex items-center gap-0.5 ml-2 border-l border-blue-200 pl-2">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger as-child>
                                <Button variant="ghost" size="icon" class="h-7 w-7 text-blue-600 hover:text-blue-800 hover:bg-blue-100" @click="bulkMessageSelected">
                                    <MessageSquare class="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{{ $t('participants.bulkActions.sendMessage') }}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger as-child>
                                <Button variant="ghost" size="icon" class="h-7 w-7 text-blue-600 hover:text-blue-800 hover:bg-blue-100" @click="bulkEditSelected">
                                    <Edit class="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{{ $t('participants.bulkActions.editSelected') }}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger as-child>
                                <Button variant="ghost" size="icon" class="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" @click="bulkDeleteSelected">
                                    <Trash2 class="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{{ $t('participants.bulkActions.deleteSelected') }}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
                <button @click="selectedParticipants.clear()" class="ml-1 text-blue-400 hover:text-blue-700 transition-colors">
                    <X class="h-4 w-4" />
                </button>
            </div>
            <div class="flex gap-1.5">
                <!-- Refresh -->
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <Button variant="outline" size="icon" :disabled="loading" @click="participantStore.fetchParticipants()" class="shrink-0">
                                <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{{ $t('participants.refresh') }}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <!-- Add Participant -->
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <Button @click="openRegistrationLink" :disabled="!selectedRetreatId" size="icon" class="shrink-0">
                                <Plus class="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{{ $t('participants.addParticipant') }}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <!-- Three dots menu with all actions -->
                <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                        <Button variant="outline" size="icon" class="shrink-0">
                            <MoreVertical class="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>{{ $t('participants.actions') }}</DropdownMenuLabel>
                        <DropdownMenuSeparator />

                        <!-- Bulk Actions (only show when participants are selected) -->
                        <template v-if="selectedCount > 0">
                            <DropdownMenuLabel class="text-xs text-gray-500">
                                {{ $t('participants.bulkActions.label', { count: selectedCount }) }}
                            </DropdownMenuLabel>

                            <!-- Bulk Message -->
                            <DropdownMenuItem @click="bulkMessageSelected">
                                <svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                                </svg>
                                {{ $t('participants.bulkActions.sendMessage') }}
                            </DropdownMenuItem>

                            <!-- Bulk Edit -->
                            <DropdownMenuItem @click="bulkEditSelected">
                                <Edit class="mr-2 h-4 w-4" />
                                {{ $t('participants.bulkActions.editSelected') }}
                            </DropdownMenuItem>

                            <!-- Bulk Delete -->
                            <DropdownMenuItem @click="bulkDeleteSelected" class="text-red-600">
                                <Trash2 class="mr-2 h-4 w-4" />
                                {{ $t('participants.bulkActions.deleteSelected') }}
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />
                        </template>

                        <!-- Toggle Filter Status -->
                        <DropdownMenuItem @click="toggleFilterStatus">
                            <ListFilter class="mr-2 h-4 w-4" />
                            <span>{{ filterStatus === 'active' ? $t('participants.showCanceled') : $t('participants.showActive') }}</span>
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
                        <DropdownMenuItem @click="isExportDialogOpen = true">
                            <FileDown class="h-4 w-4 mr-2" />
                            {{ $t('participants.export.title') }}
                        </DropdownMenuItem>
                        
                        <!-- Print -->
                        <DropdownMenuItem @click="handlePrint">
                            <Printer class="h-4 w-4 mr-2" />
                            {{ $t('common.actions.print') || 'Print' }}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                    </DropdownMenuContent>
                </DropdownMenu>

            </div>
        </div>

        <!-- Active Filters Chips -->
        <div v-if="activeFiltersList.length > 0" class="flex flex-wrap items-center gap-1.5 mb-3 no-print">
            <ListFilter class="h-3.5 w-3.5 text-gray-400 mr-0.5" />
            <div
                v-for="filter in activeFiltersList"
                :key="`${filter.type}-${filter.key}`"
                class="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md text-xs text-blue-700"
            >
                <span class="text-blue-500">{{ filter.label }}:</span>
                <span class="font-medium">{{ filter.value }}</span>
                <button
                    @click="removeFilter(filter.key, filter.type)"
                    class="ml-0.5 text-blue-400 hover:text-red-500 transition-colors"
                >
                    <X class="h-3 w-3" />
                </button>
            </div>
            <button
                @click="clearAllFilters"
                class="text-xs text-gray-400 hover:text-red-500 transition-colors ml-1"
            >
                {{ $t('common.filters.clearAll') }}
            </button>
        </div>

        <!-- Mensajes de estado y Tabla -->
        <div v-if="loading" class="flex items-center justify-center py-16 text-gray-400">
            <RefreshCw class="h-5 w-5 animate-spin mr-2" />
            <span>{{ $t('participants.loading') }}</span>
        </div>
            <div v-else-if="error" class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-600 text-sm">{{ error }}</div>
            <div v-else-if="!selectedRetreatId" class="text-center text-gray-400 py-16 space-y-2">
                <Users class="h-10 w-10 mx-auto text-gray-300" />
                <p>{{ $t('participants.selectRetreatPrompt') }}</p>
            </div>
            <div v-else class="border rounded-lg overflow-x-auto shadow-sm">
            <Table class="text-xs sm:text-sm min-w-[600px]">
                <TableCaption v-if="filteredAndSortedParticipants.length === 0">
                    <div class="py-12 flex flex-col items-center gap-3">
                        <Users class="h-10 w-10 text-gray-300" />
                        <p class="text-gray-500 text-sm">
                            {{ activeFiltersList.length > 0 ? $t('participants.noParticipantsMatch') : $t('participants.noParticipantsFound') }}
                        </p>
                        <Button
                            v-if="activeFiltersList.length > 0"
                            variant="outline"
                            size="sm"
                            @click="clearAllFilters"
                        >
                            {{ $t('common.filters.clearAll') }}
                        </Button>
                    </div>
                </TableCaption>
                <TableHeader class="sticky top-0 z-10">
                    <TableRow class="bg-gray-50/95 backdrop-blur-sm border-b-2 border-gray-200">
                        <!-- Bulk Selection Column -->
                        <TableHead class="w-10 no-print">
                            <input
                                type="checkbox"
                                :checked="isAllSelected"
                                :indeterminate="isSomeSelected"
                                @change="toggleAllParticipantsSelection"
                                class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                            />
                        </TableHead>
                        <!-- Data Columns -->
                        <TableHead v-for="colKey in visibleColumns" :key="colKey" @click="handleSort(colKey)" class="cursor-pointer select-none text-xs font-semibold text-gray-600 uppercase tracking-wide hover:text-gray-900 transition-colors whitespace-nowrap">
                           {{ $t(allColumns.find(c => c.key === colKey)?.label || '') }}
                           <ArrowUpDown v-if="sortKey === colKey" class="inline-block ml-1 h-3 w-3 text-blue-500" />
                        </TableHead>
                        <TableHead class="no-print text-xs font-semibold text-gray-600 uppercase tracking-wide">{{ $t('participants.actions') }}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow v-for="(participant, idx) in filteredAndSortedParticipants" :key="participant.id" :class="[participant.family_friend_color ? 'border-l-4' : '', hasBirthdayDuringRetreat(participant) ? 'bg-amber-50/60' : '', selectedParticipants.has(String(participant.id)) ? 'bg-blue-50/80 hover:bg-blue-100/80' : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'), 'hover:bg-gray-100/70']" :style="participant.family_friend_color ? { borderLeftColor: participant.family_friend_color } : {}" class="participant-row transition-colors duration-100 group">
                        <!-- Bulk Selection Column -->
                        <TableCell class="w-10 no-print">
                            <input
                                type="checkbox"
                                :checked="selectedParticipants.has(String(participant.id))"
                                @change="toggleParticipantSelection(participant.id)"
                                class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                            />
                        </TableCell>
                        <!-- Data Columns -->
                        <TableCell v-for="colKey in visibleColumns" :key="`${participant.id}-${colKey}`">
                            <!-- Special handling for tags column - display as badges -->
                            <div v-if="colKey === 'tags'" class="flex flex-wrap gap-1">
                                <TagBadge
                                    v-for="pt in getNestedProperty(participant, colKey)"
                                    :key="pt.tag?.id || pt.id"
                                    :tag="pt.tag || pt"
                                    :removable="false"
                                />
                                <span v-if="!getNestedProperty(participant, colKey) || getNestedProperty(participant, colKey)?.length === 0">
                                    N/A
                                </span>
                            </div>
                            <!-- Long text columns with truncation + tooltip -->
                            <div v-else-if="longTextColumns.has(colKey)" class="max-w-[200px]">
                                <TooltipProvider v-if="getCellContent(participant, colKey).value && getCellContent(participant, colKey).value !== 'N/A'">
                                    <Tooltip>
                                        <TooltipTrigger as-child>
                                            <span class="block truncate cursor-help">
                                                {{ getCellContent(participant, colKey).value }}
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" class="max-w-[400px] whitespace-pre-wrap">
                                            {{ getCellContent(participant, colKey).value }}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <span v-else>{{ getCellContent(participant, colKey).value }}</span>
                            </div>
                            <!-- Default cell rendering for other columns -->
                            <div v-else class="flex items-center gap-1">
                                {{ getCellContent(participant, colKey).value }}
                                <span v-if="getCellContent(participant, colKey).hasBirthday" class="text-yellow-600" :title="$t('participants.birthdayDuringRetreat')">
                                    🎂
                                </span>
                                <span v-if="getCellContent(participant, colKey).hasPaymentStatus"
                                      :class="{
                                        'text-green-600': getCellContent(participant, colKey).paymentStatus === 'paid',
                                        'text-yellow-600': getCellContent(participant, colKey).paymentStatus === 'partial',
                                        'text-red-600': getCellContent(participant, colKey).paymentStatus === 'unpaid',
                                        'text-purple-600': getCellContent(participant, colKey).paymentStatus === 'overpaid'
                                      }"
                                      :title="`Estado: ${getCellContent(participant, colKey).paymentStatus}`">
                                    <span v-if="getCellContent(participant, colKey).paymentStatus === 'paid'">✅</span>
                                    <span v-else-if="getCellContent(participant, colKey).paymentStatus === 'partial'">⚠️</span>
                                    <span v-else-if="getCellContent(participant, colKey).paymentStatus === 'unpaid'">❌</span>
                                    <span v-else-if="getCellContent(participant, colKey).paymentStatus === 'overpaid'">💰</span>
                                </span>
                            </div>
                        </TableCell>
                        <TableCell class="no-print">
                            <div class="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger as-child>
                                            <Button variant="ghost" size="icon" class="h-7 w-7 text-gray-500 hover:text-blue-600 hover:bg-blue-50" @click="openEditDialog(participant)"><Edit class="h-3.5 w-3.5" /></Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{{ $t('participants.editParticipant') }}</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger as-child>
                                            <Button variant="ghost" size="icon" class="h-7 w-7 text-gray-500 hover:text-green-600 hover:bg-green-50" @click="openMessageDialog(participant)">
                                                <MessageSquare class="h-3.5 w-3.5" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{{ $t('participants.sendMessage') }}</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider v-if="props.isCancelled">
                                    <Tooltip>
                                        <TooltipTrigger as-child>
                                            <Button variant="ghost" size="icon" class="h-7 w-7 text-green-600 hover:text-green-800 hover:bg-green-50" @click="reactivateParticipant(participant)"><RotateCcw class="h-3.5 w-3.5" /></Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{{ $t('participants.reactivate.button') }}</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider v-if="!props.isCancelled">
                                    <Tooltip>
                                        <TooltipTrigger as-child>
                                            <Button variant="ghost" size="icon" class="h-7 w-7 text-gray-400 hover:text-red-600 hover:bg-red-50" @click="openDeleteDialog(participant)"><Trash2 class="h-3.5 w-3.5" /></Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{{ $t('participants.deleteParticipant') }}</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        </TableCell>
                    </TableRow>
                </TableBody>
                <TableFooter>
                  <TableRow class="bg-gray-50/80">
                    <TableCell :colspan="visibleColumns.length + 2" class="text-right">
                      <span class="text-xs text-gray-500">{{ $t('common.total') }}:</span>
                      <span class="ml-1 text-sm font-bold text-gray-700">{{ filteredAndSortedParticipants.length }}</span>
                      <span v-if="searchQuery || activeFiltersList.length > 0" class="ml-1 text-xs text-gray-400">
                        / {{ participants.length }}
                      </span>
                    </TableCell>
                  </TableRow>
                </TableFooter>
            </Table>
        </div>
        </div>
        <!-- End Print Container -->

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
                    <DialogTitle>{{ formColumnsToShow.includes('palancasCoordinator') ? 'Palancas' : 'Editar Participante' }}</DialogTitle>
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
        <ImportParticipantsModal
            v-model:isOpen="isImportDialogOpen"
        />

        <!-- Export Modal -->
        <ExportParticipantsModal
            v-model:isOpen="isExportDialogOpen"
            :all-columns="allColumns"
            :visible-columns="visibleColumns"
            :selected-columns="exportSelectedColumns"
            :all-participants="filteredAndSortedParticipants"
            :selected-participants="selectedParticipants"
            :current-type="props.type"
            @update:selectedColumns="exportSelectedColumns = $event"
            @export="handleExport"
        />

        <!-- Message Dialog -->
        <MessageDialog
            v-model:open="isMessageDialogOpen"
            context="retreat"
            :retreat-id="selectedRetreatId ?? undefined"
            :participant="messageParticipant"
        />

        <!-- Bulk Email Dialog -->
        <Teleport to="body" v-if="isBulkMessageDialogOpen">
            <div
                class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
                @click.self="!bulkEmailSending && (isBulkMessageDialogOpen = false)"
            >
                <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
                    <!-- Header -->
                    <div class="flex items-center justify-between p-6 border-b">
                        <div>
                            <h2 class="text-xl font-semibold">{{ $t('participants.bulkMessage.title') }}</h2>
                            <p class="text-gray-600 mt-1">{{ $t('participants.bulkMessage.description', { count: bulkMessageParticipants.length }) }}</p>
                        </div>
                        <Button v-if="!bulkEmailSending" variant="ghost" size="icon" @click="isBulkMessageDialogOpen = false">
                            <X class="w-5 h-5" />
                        </Button>
                    </div>

                    <!-- Phase: Compose -->
                    <template v-if="bulkEmailPhase === 'compose'">
                        <div class="p-6 overflow-y-auto max-h-[60vh]">
                            <div class="space-y-4">
                                <!-- SMTP Warning -->
                                <div v-if="!smtpConfigured" class="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
                                    {{ $t('participants.bulkMessage.smtpNotConfigured') }}
                                </div>

                                <!-- Participants with email -->
                                <div>
                                    <div class="text-sm font-medium mb-2">
                                        {{ $t('participants.bulkMessage.participantsWithEmail', { count: participantsWithEmail.length }) }}
                                    </div>
                                    <div class="max-h-32 overflow-y-auto border rounded-md p-2">
                                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                                            <div v-for="participant in participantsWithEmail" :key="participant.id"
                                                 class="flex items-center gap-1">
                                                <span class="font-medium">{{ participant.firstName }} {{ participant.lastName }}</span>
                                                <span class="text-gray-500 truncate">({{ participant.email }})</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Participants without email warning -->
                                <div v-if="participantsWithoutEmail.length > 0" class="bg-orange-50 border border-orange-200 rounded-md p-3">
                                    <div class="text-sm font-medium text-orange-800 mb-1">
                                        {{ $t('participants.bulkMessage.participantsWithoutEmail', { count: participantsWithoutEmail.length }) }}
                                    </div>
                                    <div class="text-xs text-orange-700">
                                        {{ $t('participants.bulkMessage.noEmailWarning') }}
                                    </div>
                                    <div class="mt-1 text-xs text-orange-600">
                                        <span v-for="(p, i) in participantsWithoutEmail" :key="p.id">
                                            {{ p.firstName }} {{ p.lastName }}<span v-if="i < participantsWithoutEmail.length - 1">, </span>
                                        </span>
                                    </div>
                                </div>

                                <!-- Template selector -->
                                <div>
                                    <label class="text-sm font-medium">{{ $t('participants.bulkMessage.template') }}:</label>
                                    <select
                                        class="w-full mt-1 p-2 border rounded-md text-sm"
                                        :value="bulkEmailTemplate"
                                        @change="onBulkTemplateSelect(($event.target as HTMLSelectElement).value)"
                                    >
                                        <option value="">{{ $t('participants.bulkMessage.selectTemplate') }}</option>
                                        <option v-for="template in allMessageTemplates" :key="template.id" :value="template.id">
                                            {{ template.name }}
                                        </option>
                                    </select>
                                </div>

                                <!-- Subject -->
                                <div>
                                    <label class="text-sm font-medium">{{ $t('participants.bulkMessage.subject') }}:</label>
                                    <input
                                        v-model="bulkEmailSubject"
                                        type="text"
                                        class="w-full mt-1 p-2 border rounded-md text-sm"
                                        :placeholder="$t('participants.bulkMessage.subjectPlaceholder')"
                                    />
                                </div>

                                <!-- Message -->
                                <div>
                                    <label class="text-sm font-medium">{{ $t('participants.bulkMessage.message') }}:</label>
                                    <textarea
                                        v-model="bulkEmailMessage"
                                        class="w-full mt-1 p-2 border rounded-md text-sm font-mono"
                                        rows="6"
                                        :placeholder="$t('participants.bulkMessage.messagePlaceholder')"
                                    ></textarea>
                                    <p class="text-xs text-gray-500 mt-1">{{ $t('participants.bulkMessage.variablesNote') }}</p>
                                </div>
                            </div>
                        </div>

                        <!-- Footer: Compose -->
                        <div class="flex items-center justify-end gap-2 p-6 border-t bg-gray-50">
                            <Button variant="outline" @click="isBulkMessageDialogOpen = false">
                                {{ $t('common.actions.cancel') }}
                            </Button>
                            <Button
                                @click="sendBulkEmail"
                                :disabled="!smtpConfigured || participantsWithEmail.length === 0 || !bulkEmailMessage.trim()"
                            >
                                {{ $t('participants.bulkMessage.sendButton', { count: participantsWithEmail.length }) }}
                            </Button>
                        </div>
                    </template>

                    <!-- Phase: Sending -->
                    <template v-else-if="bulkEmailPhase === 'sending'">
                        <div class="p-6 flex flex-col items-center justify-center min-h-[200px] space-y-4">
                            <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                            <p class="text-lg font-medium">
                                {{ $t('participants.bulkMessage.sending', { progress: bulkEmailProgress, total: bulkEmailTotal }) }}
                            </p>
                            <div class="w-full max-w-md bg-gray-200 rounded-full h-2.5">
                                <div
                                    class="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                                    :style="{ width: `${(bulkEmailProgress / bulkEmailTotal) * 100}%` }"
                                ></div>
                            </div>
                            <p class="text-sm text-gray-500">
                                {{ bulkEmailResults.success }} ok, {{ bulkEmailResults.failed }} {{ $t('participants.bulkMessage.failedCount', { count: bulkEmailResults.failed }).toLowerCase() }}
                            </p>
                        </div>
                    </template>

                    <!-- Phase: Results -->
                    <template v-else-if="bulkEmailPhase === 'results'">
                        <div class="p-6 space-y-4">
                            <h3 class="text-lg font-semibold">{{ $t('participants.bulkMessage.resultsTitle') }}</h3>

                            <div v-if="bulkEmailResults.success > 0" class="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-800">
                                {{ $t('participants.bulkMessage.successCount', { count: bulkEmailResults.success }) }}
                            </div>

                            <div v-if="bulkEmailResults.failed > 0" class="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
                                <div class="font-medium mb-1">{{ $t('participants.bulkMessage.failedCount', { count: bulkEmailResults.failed }) }}</div>
                                <details>
                                    <summary class="cursor-pointer text-xs underline">{{ $t('participants.bulkMessage.errorDetails') }}</summary>
                                    <ul class="mt-2 space-y-1 text-xs">
                                        <li v-for="(err, i) in bulkEmailResults.errors" :key="i">{{ err }}</li>
                                    </ul>
                                </details>
                            </div>
                        </div>

                        <!-- Footer: Results -->
                        <div class="flex items-center justify-end gap-2 p-6 border-t bg-gray-50">
                            <Button @click="isBulkMessageDialogOpen = false; selectedParticipants.clear()">
                                {{ $t('participants.bulkMessage.close') }}
                            </Button>
                        </div>
                    </template>
                </div>
            </div>
        </Teleport>

        <!-- Bulk Edit Participants Modal -->
        <BulkEditParticipantsModal
          v-model:isOpen="isBulkEditDialogOpen"
          :participants="bulkEditParticipants"
          :all-columns="allColumns"
          @save="handleBulkEditSave"
        />

        <!-- Bulk Delete Dialog -->
        <Dialog v-model:open="isBulkDeleteDialogOpen">
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{{ $t('participants.bulkDelete.title') }}</DialogTitle>
                    <DialogDescription>
                        {{ $t('participants.bulkDelete.confirmMessage', { count: selectedCount }) }}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" @click="isBulkDeleteDialogOpen = false">{{ $t('common.actions.cancel') }}</Button>
                    <Button variant="destructive" @click="confirmBulkDelete">{{ $t('common.actions.delete') }}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
