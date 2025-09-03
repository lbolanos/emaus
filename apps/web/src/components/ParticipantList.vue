<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useParticipantStore } from '@/stores/participantStore';
import { useRetreatStore } from '@/stores/retreatStore';
import * as XLSX from 'xlsx';

// Importa los componentes de UI necesarios
import { Button } from '@repo/ui/components/ui/button';
import { Input } from '@repo/ui/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from '@repo/ui/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/ui/dialog';
import ColumnSelector from './ColumnSelector.vue';
import EditParticipantForm from './EditParticipantForm.vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/ui/dropdown-menu';
import { ArrowUpDown, Trash2, Edit, FileUp, FileDown, Columns } from 'lucide-vue-next';
import { useToast } from '@repo/ui/components/ui/toast/use-toast';

// Traducción (simulada, usa tu sistema de i18n)
const $ct = (key: string) => key.split('.').pop()?.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()) || key;

const props = withDefaults(defineProps<{
    type: 'walker' | 'server',
    isCanceled?: boolean,
    columnsToShowInTable?: string[],
    columnsToShowInForm?: string[],
    columnsToEditInForm?: string[],
}>(), {
    isCanceled: false,
    columnsToShowInTable: () => ['firstName', 'lastName', 'email', 'cellPhone'],
    columnsToShowInForm: () => [],
    columnsToEditInForm: () => [],
});

const { toast } = useToast();

// Stores de Pinia
const participantStore = useParticipantStore();
const { participants, loading, error } = storeToRefs(participantStore);
const retreatStore = useRetreatStore();
const { selectedRetreatId, serverRegistrationLink, walkerRegistrationLink } = storeToRefs(retreatStore);

// --- ESTADO LOCAL DEL COMPONENTE ---
const searchQuery = ref('');
const sortKey = ref('lastName');
const sortOrder = ref<'asc' | 'desc'>('asc');
const isImportDialogOpen = ref(false);
const isDeleteDialogOpen = ref(false);
const participantToDelete = ref<any>(null);
const isEditDialogOpen = ref(false);
const participantToEdit = ref<any>(null);

// --- DEFINICIÓN Y VISIBILIDAD DE COLUMNAS ---
const allColumns = ref([
    { key: 'id_on_retreat', label: 'participants.id' },
    { key: 'type', label: 'participants.type' },
    { key: 'firstName', label: 'participants.firstName' },
    { key: 'lastName', label: 'participants.lastName' },
    { key: 'nickname', label: 'participants.nickname' },
    { key: 'birthDate', label: 'participants.birthDate' },
    { key: 'maritalStatus', label: 'participants.maritalStatus' },
    { key: 'street', label: 'participants.street' },
    { key: 'houseNumber', label: 'participants.houseNumber' },
    { key: 'postalCode', label: 'participants.postalCode' },
    { key: 'neighborhood', label: 'participants.neighborhood' },
    { key: 'city', label: 'participants.city' },
    { key: 'state', label: 'participants.state' },
    { key: 'country', label: 'participants.country' },
    { key: 'parish', label: 'participants.parish' },
    { key: 'homePhone', label: 'participants.homePhone' },
    { key: 'workPhone', label: 'participants.workPhone' },
    { key: 'cellPhone', label: 'participants.cellPhone' },
    { key: 'email', label: 'participants.email' },
    { key: 'occupation', label: 'participants.occupation' },
    { key: 'snores', label: 'participants.snores' },
    { key: 'hasMedication', label: 'participants.hasMedication' },
    { key: 'medicationDetails', label: 'participants.medicationDetails' },
    { key: 'medicationSchedule', label: 'participants.medicationSchedule' },
    { key: 'hasDietaryRestrictions', label: 'participants.hasDietaryRestrictions' },
    { key: 'dietaryRestrictionsDetails', label: 'participants.dietaryRestrictionsDetails' },
    { key: 'sacraments', label: 'participants.sacraments' },
    { key: 'emergencyContact1Name', label: 'participants.emergencyContact1Name' },
    { key: 'emergencyContact1Relation', label: 'participants.emergencyContact1Relation' },
    { key: 'emergencyContact1HomePhone', label: 'participants.emergencyContact1HomePhone' },
    { key: 'emergencyContact1WorkPhone', label: 'participants.emergencyContact1WorkPhone' },
    { key: 'emergencyContact1CellPhone', label: 'participants.emergencyContact1CellPhone' },
    { key: 'emergencyContact1Email', label: 'participants.emergencyContact1Email' },
    { key: 'emergencyContact2Name', label: 'participants.emergencyContact2Name' },
    { key: 'emergencyContact2Relation', label: 'participants.emergencyContact2Relation' },
    { key: 'emergencyContact2HomePhone', label: 'participants.emergencyContact2HomePhone' },
    { key: 'emergencyContact2WorkPhone', label: 'participants.emergencyContact2WorkPhone' },
    { key: 'emergencyContact2CellPhone', label: 'participants.emergencyContact2CellPhone' },
    { key: 'emergencyContact2Email', label: 'participants.emergencyContact2Email' },
    { key: 'tshirtSize', label: 'participants.tshirtSize' },
    { key: 'invitedBy', label: 'participants.invitedBy' },
    { key: 'isInvitedByEmausMember', label: 'participants.isInvitedByEmausMember' },
    { key: 'inviterHomePhone', label: 'participants.inviterHomePhone' },
    { key: 'inviterWorkPhone', label: 'participants.inviterWorkPhone' },
    { key: 'inviterCellPhone', label: 'participants.inviterCellPhone' },
    { key: 'inviterEmail', label: 'participants.inviterEmail' },
    { key: 'pickupLocation', label: 'participants.pickupLocation' },
    { key: 'arrivesOnOwn', label: 'participants.arrivesOnOwn' },
    { key: 'paymentDate', label: 'participants.paymentDate' },
    { key: 'paymentAmount', label: 'participants.paymentAmount' },
    { key: 'isScholarship', label: 'participants.isScholarship' },
    { key: 'palancasCoordinator', label: 'participants.palancasCoordinator' },
    { key: 'palancasRequested', label: 'participants.palancasRequested' },
    { key: 'palancasReceived', label: 'participants.palancasReceived' },
    { key: 'palancasNotes', label: 'participants.palancasNotes' },
    { key: 'requestsSingleRoom', label: 'participants.requestsSingleRoom' },
    { key: 'isCancelled', label: 'participants.isCancelled' },
    { key: 'notes', label: 'participants.notes' },
    { key: 'registrationDate', label: 'participants.registrationDate' },
    { key: 'lastUpdatedDate', label: 'participants.lastUpdatedDate' },
    { key: 'retreatId', label: 'participants.retreatId' },
    { key: 'tableId', label: 'participants.tableId' },
    { key: 'roomId', label: 'participants.roomId' },
]);

const visibleColumns = ref<string[]>(props.columnsToShowInTable);

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

    // 2. Ordenar
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

// Helper para obtener valores de propiedades anidadas (ej. 'table.name')
const getNestedProperty = (obj: any, path: string) => {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};


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

const handleUpdateParticipant = async (updatedParticipant: any) => {  
    console.log('Updating participant:', updatedParticipant);
    console.log('Participant ID:', updatedParticipant.id);
    await participantStore.updateParticipant(updatedParticipant.id, updatedParticipant);
    toast({
        title: 'Success',
        description: 'Participant updated successfully.',
    });
    isEditDialogOpen.value = false;
};

// --- IMPORTACIÓN / EXPORTACIÓN ---

const handleFileUpload = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);

            if (json.length > 0 && !('email' in json[0])) {
                 toast({ title: $t('participants.import.errorTitle'), description: $t('participants.import.errorNoEmail'), variant: 'destructive' });
                 return;
            }

            await participantStore.importParticipants(selectedRetreatId.value!, props.type,  json);
            isImportDialogOpen.value = false;
            toast({ title: $t('participants.import.successTitle'), description: `${json.length} ${$t('participants.import.successDesc')}` });
        } catch (err) {
            console.error('Error importing file:', err);
            toast({ title: $t('common.import.errorTitle'), description: $t('common.import.errorGeneric'), variant: 'destructive' });
        }
    };
    reader.readAsArrayBuffer(file);
};

const exportData = (format: 'csv' | 'xlsx') => {
    const dataToExport = filteredAndSortedParticipants.value.map(p => {
        const record: { [key: string]: any } = {};
        visibleColumns.value.forEach(colKey => {
            const col = allColumns.value.find(c => c.key === colKey);
            if (col) {
                 record[$ct(col.label)] = getNestedProperty(p, col.key);
            }
        });
        return record;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Participants');
    const filename = `participants_${props.type}_${new Date().toISOString().slice(0, 10)}.${format}`;
    XLSX.writeFile(workbook, filename);
};


// --- WATCHER PARA CARGAR DATOS ---
watch(selectedRetreatId, (newId) => {
    if (newId) {
        participantStore.fetchParticipants(newId, props.type);
    } else {
        participantStore.clearParticipants();
    }
}, { immediate: true });

</script>

<template>
    <div>
        <!-- Toolbar de Acciones -->
        <div class="flex flex-col sm:flex-row justify-between items-center gap-2 mb-4">
            <Input
                v-model="searchQuery"
                :placeholder="$t('common.searchPlaceholder')"
                class="max-w-sm"
            />
            <div class="flex gap-2">
                <!-- Selección de Columnas -->
                <Dialog>
                    <DialogTrigger as-child>
                        <Button variant="outline">
                            <Columns class="mr-2 h-4 w-4" />
                            {{ $t('common.columns') }}
                        </Button>
                    </DialogTrigger>
                    <DialogContent class="max-w-4xl">
                        <DialogHeader>
                            <DialogTitle>{{ $ct('participants.selectColumns') }}</DialogTitle>
                        </DialogHeader>
                        <ColumnSelector
                            :all-columns="allColumns.map(c => ({ ...c, label: $ct(c.label) }))"
                            v-model="visibleColumns"
                        />
                    </DialogContent>
                </Dialog>

                <!-- Importar / Exportar -->
                 <Dialog v-model:open="isImportDialogOpen">
                    <DialogTrigger as-child>
                         <Button variant="outline" size="icon"><FileUp class="h-4 w-4" /></Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{{ $t('participants.import.title') }}</DialogTitle>
                            <DialogDescription>{{ $t('participants.import.description') }}</DialogDescription>
                        </DialogHeader>
                        <Input type="file" @change="handleFileUpload" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" />
                    </DialogContent>
                </Dialog>
                                <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                        <Button variant="outline" size="icon"><FileDown class="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem @click="exportData('xlsx')">{{ $t('export.xlsx') }}</DropdownMenuItem>
                        <DropdownMenuItem @click="exportData('csv')">{{ $t('export.csv') }}</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <!-- Añadir Participante -->
                <Button @click="openRegistrationLink" :disabled="!selectedRetreatId">
                    {{ $t('participants.addParticipant') }}
                </Button>
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
                           {{ $ct(allColumns.find(c => c.key === colKey)?.label) }}
                           <ArrowUpDown v-if="sortKey === colKey" class="inline-block ml-2 h-4 w-4" />
                        </TableHead>
                        <TableHead>{{ $t('participants.actions') }}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow v-for="participant in filteredAndSortedParticipants" :key="participant.id">
                        <TableCell v-for="colKey in visibleColumns" :key="`${participant.id}-${colKey}`">
                            {{ getNestedProperty(participant, colKey) || 'N/A' }}
                        </TableCell>
                        <TableCell>
                            <div class="flex gap-2">
                                <Button variant="ghost" size="icon" @click="openEditDialog(participant)"><Edit class="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" class="text-red-500 hover:text-red-700" @click="openDeleteDialog(participant)"><Trash2 class="h-4 w-4" /></Button>
                            </div>
                        </TableCell>
                    </TableRow>
                </TableBody>
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
                    :all-columns="allColumns.map(c => ({ ...c, label: $ct(c.label) }))"
                    :columns-to-show="columnsToShowInForm.length > 0 ? columnsToShowInForm : allColumns.map(c => c.key)"
                    :columns-to-edit="columnsToEditInForm.length > 0 ? columnsToEditInForm : allColumns.map(c => c.key)"
                    @save="handleUpdateParticipant"
                    @cancel="isEditDialogOpen = false"
                />
            </DialogContent>
        </Dialog>
    </div>
</template>
