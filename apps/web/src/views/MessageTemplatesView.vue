<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useMessageTemplateStore } from '../stores/messageTemplateStore';
import { useParticipantStore } from '../stores/participantStore';
import { useRetreatStore } from '../stores/retreatStore';
import { storeToRefs } from 'pinia';
import { Button } from '@repo/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@repo/ui/components/ui/dialog';
import { Input } from '@repo/ui/components/ui/input';
import { Label } from '@repo/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select';
import { Badge } from '@repo/ui/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/components/ui/tabs';
import { ScrollArea } from '@repo/ui/components/ui/scroll-area';
import { Search, Eye, EyeOff, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { messageTemplateTypes, CreateMessageTemplateSchema } from '@repo/types';
import type { MessageTemplate, CreateMessageTemplate, UpdateMessageTemplate } from '@repo/types';

const { t } = useI18n();
const store = useMessageTemplateStore();
const { templates, loading, error } = storeToRefs(store);
const participantStore = useParticipantStore();
const { participants } = storeToRefs(participantStore);
const retreatStore = useRetreatStore();

const isDialogOpen = ref(false);
const isEditing = ref(false);
const currentTemplate = ref<Partial<MessageTemplate>>({});
const messageTextarea = ref<HTMLTextAreaElement | null>(null);
const showVariablesPanel = ref(false);
const draggedVariable = ref<string | null>(null);
const searchQuery = ref('');
const selectedCategory = ref('all');
const showPreview = ref<string>('false');
const selectedParticipant = ref('');

const participantVariables = computed(() => [
  { key: 'firstName', label: t('participants.fields.firstName') },
  { key: 'lastName', label: t('participants.fields.lastName') },
  { key: 'nickname', label: t('participants.fields.nickname') },
  { key: 'type', label: t('participants.fields.type') },
  { key: 'birthDate', label: t('participants.fields.birthDate') },
  { key: 'maritalStatus', label: t('participants.fields.maritalStatus') },
  { key: 'street', label: t('participants.fields.street') },
  { key: 'houseNumber', label: t('participants.fields.houseNumber') },
  { key: 'postalCode', label: t('participants.fields.postalCode') },
  { key: 'neighborhood', label: t('participants.fields.neighborhood') },
  { key: 'city', label: t('participants.fields.city') },
  { key: 'state', label: t('participants.fields.state') },
  { key: 'country', label: t('participants.fields.country') },
  { key: 'parish', label: t('participants.fields.parish') },
  { key: 'homePhone', label: t('participants.fields.homePhone') },
  { key: 'workPhone', label: t('participants.fields.workPhone') },
  { key: 'cellPhone', label: t('participants.fields.cellPhone') },
  { key: 'email', label: t('participants.fields.email') },
  { key: 'occupation', label: t('participants.fields.occupation') },
  { key: 'snores', label: t('participants.fields.snores') },
  { key: 'hasMedication', label: t('participants.fields.hasMedication') },
  { key: 'medicationDetails', label: t('participants.fields.medicationDetails') },
  { key: 'medicationSchedule', label: t('participants.fields.medicationSchedule') },
  { key: 'hasDietaryRestrictions', label: t('participants.fields.hasDietaryRestrictions') },
  { key: 'dietaryRestrictionsDetails', label: t('participants.fields.dietaryRestrictionsDetails') },
  { key: 'sacraments', label: t('participants.fields.sacraments') },
  { key: 'emergencyContact1Name', label: t('participants.fields.emergencyContact1Name') },
  { key: 'emergencyContact1Relation', label: t('participants.fields.emergencyContact1Relation') },
  { key: 'emergencyContact1HomePhone', label: t('participants.fields.emergencyContact1HomePhone') },
  { key: 'emergencyContact1WorkPhone', label: t('participants.fields.emergencyContact1WorkPhone') },
  { key: 'emergencyContact1CellPhone', label: t('participants.fields.emergencyContact1CellPhone') },
  { key: 'emergencyContact1Email', label: t('participants.fields.emergencyContact1Email') },
  { key: 'emergencyContact2Name', label: t('participants.fields.emergencyContact2Name') },
  { key: 'emergencyContact2Relation', label: t('participants.fields.emergencyContact2Relation') },
  { key: 'emergencyContact2HomePhone', label: t('participants.fields.emergencyContact2HomePhone') },
  { key: 'emergencyContact2WorkPhone', label: t('participants.fields.emergencyContact2WorkPhone') },
  { key: 'emergencyContact2CellPhone', label: t('participants.fields.emergencyContact2CellPhone') },
  { key: 'emergencyContact2Email', label: t('participants.fields.emergencyContact2Email') },
  { key: 'tshirtSize', label: t('participants.fields.tshirtSize') },
  { key: 'invitedBy', label: t('participants.fields.invitedBy') },
  { key: 'isInvitedByEmausMember', label: t('participants.fields.isInvitedByEmausMember') },
  { key: 'inviterHomePhone', label: t('participants.fields.inviterHomePhone') },
  { key: 'inviterWorkPhone', label: t('participants.fields.inviterWorkPhone') },
  { key: 'inviterCellPhone', label: t('participants.fields.inviterCellPhone') },
  { key: 'inviterEmail', label: t('participants.fields.inviterEmail') },
  { key: 'familyFriendColor', label: t('participants.fields.familyFriendColor') },
  { key: 'pickupLocation', label: t('participants.fields.pickupLocation') },
  { key: 'arrivesOnOwn', label: t('participants.fields.arrivesOnOwn') },
  { key: 'paymentDate', label: t('participants.fields.paymentDate') },
  { key: 'paymentAmount', label: t('participants.fields.paymentAmount') },
  { key: 'isScholarship', label: t('participants.fields.isScholarship') },
  { key: 'palancasCoordinator', label: t('participants.fields.palancasCoordinator') },
  { key: 'palancasRequested', label: t('participants.fields.palancasRequested') },
  { key: 'palancasReceived', label: t('participants.fields.palancasReceived') },
  { key: 'palancasNotes', label: t('participants.fields.palancasNotes') },
  { key: 'requestsSingleRoom', label: t('participants.fields.requestsSingleRoom') },
  { key: 'isCancelled', label: t('participants.fields.isCancelled') },
  { key: 'notes', label: t('participants.fields.notes') },
  { key: 'registrationDate', label: t('participants.fields.registrationDate') },
  { key: 'lastUpdatedDate', label: t('participants.fields.lastUpdatedDate') },
]);

const retreatVariables = computed(() => [
  { key: 'parish', label: t('messageTemplates.dialog.variables.retreatParish') },
  { key: 'startDate', label: t('messageTemplates.dialog.variables.retreatStartDate') },
  { key: 'endDate', label: t('messageTemplates.dialog.variables.retreatEndDate') },
  { key: 'openingNotes', label: t('messageTemplates.dialog.variables.retreatOpeningNotes') },
  { key: 'closingNotes', label: t('messageTemplates.dialog.variables.retreatClosingNotes') },
  { key: 'thingsToBringNotes', label: t('messageTemplates.dialog.variables.retreatThingsToBringNotes') },
  { key: 'cost', label: t('messageTemplates.dialog.variables.retreatCost') },
  { key: 'paymentInfo', label: t('messageTemplates.dialog.variables.retreatPaymentInfo') },
  { key: 'paymentMethods', label: t('messageTemplates.dialog.variables.retreatPaymentMethods') },
  { key: 'maxWalkers', label: t('messageTemplates.dialog.variables.retreatMaxWalkers') },
  { key: 'maxServers', label: t('messageTemplates.dialog.variables.retreatMaxServers') },
]);

const variableCategories = computed(() => [
  {
    id: 'participant',
    title: t('messageTemplates.dialog.categories.participant'),
    variables: participantVariables.value.map(v => ({
      value: `{participant.${v.key}}`,
      label: v.label,
      category: 'participant'
    }))
  },
  {
    id: 'retreat',
    title: t('messageTemplates.dialog.categories.retreat'),
    variables: retreatVariables.value.map(v => ({
      value: `{retreat.${v.key}}`,
      label: v.label,
      category: 'retreat'
    }))
  }
]);

const filteredCategories = computed(() => {
  if (!searchQuery.value && (selectedCategory.value === 'all')) {
    return variableCategories.value;
  }

  return variableCategories.value.map(category => {
    const filteredVariables = category.variables.filter(variable => {
      const matchesSearch = !searchQuery.value || 
        variable.label.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
        variable.value.toLowerCase().includes(searchQuery.value.toLowerCase());
      const matchesCategory = selectedCategory.value === 'all' || variable.category === selectedCategory.value;
      return matchesSearch && matchesCategory;
    });
    
    return {
      ...category,
      variables: filteredVariables
    };
  }).filter(category => category.variables.length > 0);
});

const mostUsedVariables = computed(() => [
  { value: '{participant.firstName}', label: t('participants.fields.firstName') },
  { value: '{participant.lastName}', label: t('participants.fields.lastName') },
  { value: '{participant.cellPhone}', label: t('participants.fields.cellPhone') },
  { value: '{participant.email}', label: t('participants.fields.email') },
  { value: '{retreat.startDate}', label: t('messageTemplates.dialog.variables.retreatStartDate') },
  { value: '{retreat.parish}', label: t('messageTemplates.dialog.variables.retreatParish') },
]);

const messageCharCount = computed(() => currentTemplate.value.message?.length || 0);

const usedVariables = computed(() => {
  const message = currentTemplate.value.message || '';
  const variablePattern = /\{([^}]+)\}/g;
  const used = new Set<string>();
  let match;
  
  while ((match = variablePattern.exec(message)) !== null) {
    used.add(match[0]);
  }
  
  return Array.from(used);
});

const isVariableUsed = (variable: string) => {
  return usedVariables.value.includes(variable);
};

// Format participants for preview dropdown
const formattedParticipants = computed(() => {
  return participants.value.map(participant => ({
    id: participant.id,
    name: `${participant.firstName} ${participant.lastName}`,
    type: participant.type || 'WALKER',
    firstName: participant.firstName,
    lastName: participant.lastName,
    nickname: participant.nickname || '',
    birthDate: participant.birthDate || '',
    maritalStatus: participant.maritalStatus || '',
    street: participant.street || '',
    houseNumber: participant.houseNumber || '',
    postalCode: participant.postalCode || '',
    neighborhood: participant.neighborhood || '',
    city: participant.city || '',
    state: participant.state || '',
    country: participant.country || '',
    parish: participant.parish || '',
    homePhone: participant.homePhone || '',
    workPhone: participant.workPhone || '',
    cellPhone: participant.cellPhone || '',
    email: participant.email || '',
    occupation: participant.occupation || '',
    snores: participant.snores,
    hasMedication: participant.hasMedication,
    medicationDetails: participant.medicationDetails || '',
    medicationSchedule: participant.medicationSchedule || '',
    hasDietaryRestrictions: participant.hasDietaryRestrictions,
    dietaryRestrictionsDetails: participant.dietaryRestrictionsDetails || '',
    sacraments: Array.isArray(participant.sacraments) ? participant.sacraments : [],
    emergencyContact1Name: participant.emergencyContact1Name || '',
    emergencyContact1Relation: participant.emergencyContact1Relation || '',
    emergencyContact1HomePhone: participant.emergencyContact1HomePhone || '',
    emergencyContact1WorkPhone: participant.emergencyContact1WorkPhone || '',
    emergencyContact1CellPhone: participant.emergencyContact1CellPhone || '',
    emergencyContact1Email: participant.emergencyContact1Email || '',
    emergencyContact2Name: participant.emergencyContact2Name || '',
    emergencyContact2Relation: participant.emergencyContact2Relation || '',
    emergencyContact2HomePhone: participant.emergencyContact2HomePhone || '',
    emergencyContact2WorkPhone: participant.emergencyContact2WorkPhone || '',
    emergencyContact2CellPhone: participant.emergencyContact2CellPhone || '',
    emergencyContact2Email: participant.emergencyContact2Email || '',
    tshirtSize: participant.tshirtSize || '',
    invitedBy: participant.invitedBy || '',
    isInvitedByEmausMember: participant.isInvitedByEmausMember,
    inviterHomePhone: participant.inviterHomePhone || '',
    inviterWorkPhone: participant.inviterWorkPhone || '',
    inviterCellPhone: participant.inviterCellPhone || '',
    inviterEmail: participant.inviterEmail || '',
    family_friend_color: participant.family_friend_color || '',
    pickupLocation: participant.pickupLocation || '',
    arrivesOnOwn: participant.arrivesOnOwn,
    paymentDate: participant.paymentDate || '',
    paymentAmount: participant.paymentAmount,
    isScholarship: participant.isScholarship,
    palancasCoordinator: participant.palancasCoordinator || '',
    palancasRequested: participant.palancasRequested,
    palancasReceived: participant.palancasReceived || '',
    palancasNotes: participant.palancasNotes || '',
    requestsSingleRoom: participant.requestsSingleRoom,
    isCancelled: participant.isCancelled,
    notes: participant.notes || '',
    registrationDate: participant.registrationDate || '',
    lastUpdatedDate: participant.lastUpdatedDate || '',
    table: participant.tableMesa?.name || '',
    roomNumber: participant.retreatBed?.roomNumber || '',
    bedNumber: participant.retreatBed?.bedNumber || ''
  }));
});

const walkers = computed(() => formattedParticipants.value.filter(p => p.type.toLowerCase() === 'walker'));
const servers = computed(() => formattedParticipants.value.filter(p => p.type.toLowerCase() === 'server'));

const selectedParticipantData = computed(() => {
  return formattedParticipants.value.find(p => p.id === selectedParticipant.value) || null;
});

const previewMessage = computed(() => {
  if (!currentTemplate.value.message || !selectedParticipantData.value) {
    return currentTemplate.value.message || '';
  }
  
  let message = currentTemplate.value.message;
  const participant = selectedParticipantData.value;
  
  // Replace all participant variables
  const participantReplacements = {
    'participant.firstName': participant.firstName,
    'participant.lastName': participant.lastName,
    'participant.nickname': participant.nickname || '',
    'participant.type': participant.type || '',
    'participant.birthDate': participant.birthDate || '',
    'participant.maritalStatus': participant.maritalStatus || '',
    'participant.street': participant.street || '',
    'participant.houseNumber': participant.houseNumber || '',
    'participant.postalCode': participant.postalCode || '',
    'participant.neighborhood': participant.neighborhood || '',
    'participant.city': participant.city || '',
    'participant.state': participant.state || '',
    'participant.country': participant.country || '',
    'participant.parish': participant.parish || '',
    'participant.homePhone': participant.homePhone || '',
    'participant.workPhone': participant.workPhone || '',
    'participant.cellPhone': participant.cellPhone || '',
    'participant.email': participant.email || '',
    'participant.occupation': participant.occupation || '',
    'participant.snores': participant.snores ? 'Sí' : 'No',
    'participant.hasMedication': participant.hasMedication ? 'Sí' : 'No',
    'participant.medicationDetails': participant.medicationDetails || '',
    'participant.medicationSchedule': participant.medicationSchedule || '',
    'participant.hasDietaryRestrictions': participant.hasDietaryRestrictions ? 'Sí' : 'No',
    'participant.dietaryRestrictionsDetails': participant.dietaryRestrictionsDetails || '',
    'participant.sacraments': Array.isArray(participant.sacraments) ? participant.sacraments.join(', ') : '',
    'participant.emergencyContact1Name': participant.emergencyContact1Name || '',
    'participant.emergencyContact1Relation': participant.emergencyContact1Relation || '',
    'participant.emergencyContact1HomePhone': participant.emergencyContact1HomePhone || '',
    'participant.emergencyContact1WorkPhone': participant.emergencyContact1WorkPhone || '',
    'participant.emergencyContact1CellPhone': participant.emergencyContact1CellPhone || '',
    'participant.emergencyContact1Email': participant.emergencyContact1Email || '',
    'participant.emergencyContact2Name': participant.emergencyContact2Name || '',
    'participant.emergencyContact2Relation': participant.emergencyContact2Relation || '',
    'participant.emergencyContact2HomePhone': participant.emergencyContact2HomePhone || '',
    'participant.emergencyContact2WorkPhone': participant.emergencyContact2WorkPhone || '',
    'participant.emergencyContact2CellPhone': participant.emergencyContact2CellPhone || '',
    'participant.emergencyContact2Email': participant.emergencyContact2Email || '',
    'participant.tshirtSize': participant.tshirtSize || '',
    'participant.invitedBy': participant.invitedBy || '',
    'participant.isInvitedByEmausMember': participant.isInvitedByEmausMember ? 'Sí' : 'No',
    'participant.inviterHomePhone': participant.inviterHomePhone || '',
    'participant.inviterWorkPhone': participant.inviterWorkPhone || '',
    'participant.inviterCellPhone': participant.inviterCellPhone || '',
    'participant.inviterEmail': participant.inviterEmail || '',
    'participant.family_friend_color': participant.family_friend_color || '',
    'participant.pickupLocation': participant.pickupLocation || '',
    'participant.arrivesOnOwn': participant.arrivesOnOwn ? 'Sí' : 'No',
    'participant.paymentDate': participant.paymentDate || '',
    'participant.paymentAmount': participant.paymentAmount?.toString() || '',
    'participant.isScholarship': participant.isScholarship ? 'Sí' : 'No',
    'participant.palancasCoordinator': participant.palancasCoordinator || '',
    'participant.palancasRequested': participant.palancasRequested ? 'Sí' : 'No',
    'participant.palancasReceived': participant.palancasReceived || '',
    'participant.palancasNotes': participant.palancasNotes || '',
    'participant.requestsSingleRoom': participant.requestsSingleRoom ? 'Sí' : 'No',
    'participant.isCancelled': participant.isCancelled ? 'Sí' : 'No',
    'participant.notes': participant.notes || '',
    'participant.registrationDate': participant.registrationDate || '',
    'participant.lastUpdatedDate': participant.lastUpdatedDate || '',
    'participant.table': participant.table || '',
    'participant.roomNumber': participant.roomNumber || '',
    'participant.bedNumber': participant.bedNumber || ''
  };
  
  // Apply all participant variable replacements
  Object.entries(participantReplacements).forEach(([key, value]) => {
    message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  });
  
  // Replace retreat variables with actual retreat data
  const retreat = retreatStore.selectedRetreat;
  const retreatReplacements = {
    'retreat.parish': retreat?.parish || '',
    'retreat.startDate': retreat?.startDate ? new Date(retreat.startDate).toLocaleDateString('es-ES', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }) : '',
    'retreat.endDate': retreat?.endDate ? new Date(retreat.endDate).toLocaleDateString('es-ES', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }) : '',
    'retreat.openingNotes': retreat?.openingNotes || '',
    'retreat.closingNotes': retreat?.closingNotes || '',
    'retreat.thingsToBringNotes': retreat?.thingsToBringNotes || '',
    'retreat.cost': retreat?.cost || '',
    'retreat.paymentInfo': retreat?.paymentInfo || '',
    'retreat.paymentMethods': retreat?.paymentMethods || '',
    'retreat.maxWalkers': retreat?.max_walkers?.toString() || '',
    'retreat.maxServers': retreat?.max_servers?.toString() || ''
  };
  
  // Apply all retreat variable replacements
  Object.entries(retreatReplacements).forEach(([key, value]) => {
    message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  });
  
  return message;
});

// Drag and drop functions
const handleDragStart = (variable: string) => {
  draggedVariable.value = variable;
};

const handleDragOver = (e: DragEvent) => {
  e.preventDefault();
};

const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  if (draggedVariable.value && messageTextarea.value) {
    const textarea = messageTextarea.value;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const text = currentTemplate.value.message || '';
    const newText = text.substring(0, start) + draggedVariable.value + text.substring(end);
    currentTemplate.value.message = newText;
    
    // Move cursor after inserted variable
    nextTick(() => {
      textarea.focus();
      if (draggedVariable.value) {
        textarea.setSelectionRange(start + draggedVariable.value.length, start + draggedVariable.value.length);
      }
    });
  }
  draggedVariable.value = null;
};

const insertVariable = (variable: string) => {
  if (messageTextarea.value) {
    const textarea = messageTextarea.value;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const text = currentTemplate.value.message || '';
    const newText = text.substring(0, start) + variable + text.substring(end);
    currentTemplate.value.message = newText;
    
    // Move cursor after inserted variable
    nextTick(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    });
  }
};

const copyToClipboard = async (text: string, event: MouseEvent) => {
  try {
    await navigator.clipboard.writeText(text);
    // Show temporary success feedback
    const button = event.currentTarget as HTMLElement;
    const originalHTML = button.innerHTML;
    button.innerHTML = '<Check class="w-4 h-4 text-green-500" />';
    setTimeout(() => {
      button.innerHTML = originalHTML;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy text: ', err);
  }
};

const templateTypes = messageTemplateTypes.options;

onMounted(async () => {
  await retreatStore.fetchRetreats();
  
  // Only fetch templates if a retreat is selected
  if (retreatStore.selectedRetreatId) {
    await store.fetchTemplates(retreatStore.selectedRetreatId);
    
    // Fetch participants for the selected retreat
    participantStore.filters.retreatId = retreatStore.selectedRetreatId;
    await participantStore.fetchParticipants();
  }
});

// Watch for retreat changes and update participants and templates
watch(() => retreatStore.selectedRetreatId, async (newRetreatId) => {
  if (newRetreatId) {
    participantStore.filters.retreatId = newRetreatId;
    await participantStore.fetchParticipants();
    await store.fetchTemplates(newRetreatId);
  } else {
    // Clear participants and templates if no retreat is selected
    participants.value = [];
    templates.value = [];
    selectedParticipant.value = '';
  }
});

// Watch for participants changes and auto-select first walker
watch(() => walkers.value, (newWalkers) => {
  if (newWalkers.length > 0 && !selectedParticipant.value) {
    selectedParticipant.value = newWalkers[0].id;
  }
}, { immediate: true });

const openNewDialog = () => {
  if (!retreatStore.selectedRetreatId) {
    alert('Por favor selecciona un retiro primero');
    return;
  }
  
  isEditing.value = false;
  currentTemplate.value = {
    name: '',
    type: undefined,
    message: '',
  };
  showVariablesPanel.value = false;
  searchQuery.value = '';
  selectedCategory.value = 'all';
  showPreview.value = 'false';
  
  // Auto-select first walker for preview
  const firstWalker = walkers.value[0];
  selectedParticipant.value = firstWalker ? firstWalker.id : '';
  
  isDialogOpen.value = true;
};

const openEditDialog = (template: MessageTemplate) => {
  isEditing.value = true;
  currentTemplate.value = { ...template };
  showVariablesPanel.value = true;
  searchQuery.value = '';
  selectedCategory.value = 'all';
  showPreview.value = 'false';
  
  // Auto-select first walker for preview
  const firstWalker = walkers.value[0];
  selectedParticipant.value = firstWalker ? firstWalker.id : '';
  
  isDialogOpen.value = true;
};

const handleDelete = async (id: string) => {
  if (confirm(t('messageTemplates.deleteConfirm'))) {
    await store.deleteTemplate(id);
  }
};

const handleSubmit = async () => {
  try {
    if (!retreatStore.selectedRetreatId) {
      alert('Por favor selecciona un retiro primero');
      return;
    }
    
    const templateData = {
      ...currentTemplate.value,
      retreatId: retreatStore.selectedRetreatId,
    };
    
    if (isEditing.value && currentTemplate.value.id) {
      const { id, createdAt, updatedAt, ...updateData } = templateData;
      await store.updateTemplate(id as string, updateData as UpdateMessageTemplate['body']);
    } else {
      await store.createTemplate(templateData as CreateMessageTemplate['body']);
    }
    isDialogOpen.value = false;
  } catch (e) {
    console.error('Failed to save template:', e);
    // Optionally, show an error message to the user
  }
};

</script>

<template>
  <div class="p-4 md:p-8">
    <Card>
      <CardHeader class="flex flex-row items-center justify-between">
        <CardTitle>{{ t('messageTemplates.title') }}</CardTitle>
        <Button 
          @click="openNewDialog" 
          :disabled="!retreatStore.selectedRetreatId"
          :title="!retreatStore.selectedRetreatId ? 'Selecciona un retiro primero' : ''"
        >
          {{ t('messageTemplates.addNew') }}
        </Button>
      </CardHeader>
      <CardContent>
        <div v-if="loading">{{ t('messageTemplates.loading') }}</div>
        <div v-else-if="error" class="text-red-500">{{ error }}</div>
        <div v-else-if="!retreatStore.selectedRetreatId" class="text-center py-8 text-muted-foreground">
          Por favor selecciona un retiro para ver y gestionar las plantillas de mensajes.
        </div>
        <Table v-else>
          <TableHeader>
            <TableRow>
              <TableHead>{{ t('messageTemplates.table.name') }}</TableHead>
              <TableHead>{{ t('messageTemplates.table.type') }}</TableHead>
              <TableHead>{{ t('messageTemplates.table.message') }}</TableHead>
              <TableHead class="text-right">{{ t('messageTemplates.table.actions') }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="template in templates" :key="template.id">
              <TableCell>{{ template.name }}</TableCell>
              <TableCell>{{ t(`messageTemplates.types.${template.type}`) }}</TableCell>
              <TableCell class="max-w-xs truncate">{{ template.message }}</TableCell>
              <TableCell class="text-right">
                <Button variant="ghost" size="sm" @click="openEditDialog(template)">{{ t('common.edit') }}</Button>
                <Button variant="ghost" size="sm" class="text-red-500" @click="handleDelete(template.id)">{{ t('common.delete') }}</Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Dialog v-model:open="isDialogOpen">
      <DialogContent class="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{{ isEditing ? t('messageTemplates.dialog.editTitle') : t('messageTemplates.dialog.newTitle') }}</DialogTitle>
        </DialogHeader>
        
        <form @submit.prevent="handleSubmit" class="flex flex-col" style="max-height: calc(90vh - 8rem);">
          <div class="flex flex-1 overflow-hidden" :class="{ 'lg:grid lg:grid-cols-12': showVariablesPanel }">
            <!-- Left Column: Form Fields -->
            <div class="flex-1 space-y-4 overflow-y-auto p-1" :class="{ 'lg:col-span-7': showVariablesPanel, 'lg:col-span-12': !showVariablesPanel }">
              <!-- Name Field -->
              <div class="space-y-2">
                <Label for="name">{{ t('messageTemplates.dialog.nameLabel') }}</Label>
                <Input id="name" v-model="currentTemplate.name" :placeholder="t('messageTemplates.dialog.nameLabel')" />
              </div>
              
              <!-- Type Field -->
              <div class="space-y-2">
                <Label for="type">{{ t('messageTemplates.dialog.typeLabel') }}</Label>
                <Select v-model="currentTemplate.type">
                  <SelectTrigger>
                    <SelectValue :placeholder="t('messageTemplates.dialog.typePlaceholder')" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="type in templateTypes" :key="type" :value="type">
                      {{ t(`messageTemplates.types.${type}`) }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
                
              <!-- Message Field with Tabs -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <Label>{{ t('messageTemplates.dialog.messageLabel') }}</Label>
                  <div class="flex items-center gap-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      @click="showVariablesPanel = !showVariablesPanel"
                      :class="{ 'bg-primary text-primary-foreground': showVariablesPanel }"
                    >
                      <ChevronRight v-if="!showVariablesPanel" class="w-4 h-4 mr-1" />
                      <ChevronLeft v-else class="w-4 h-4 mr-1" />
                      {{ showVariablesPanel ? t('common.actions.hide') : t('common.actions.show') }} Variables
                    </Button>
                  </div>
                </div>
                
                <Tabs v-model="showPreview" class="w-full">
                  <TabsList class="grid w-full grid-cols-2">
                    <TabsTrigger value="false">{{ t('common.edit') }}</TabsTrigger>
                    <TabsTrigger value="true">{{ t('messageTemplates.dialog.preview') }}</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="false" class="space-y-2">
                    <textarea
                      ref="messageTextarea"
                      v-model="currentTemplate.message"
                      class="w-full h-48 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none font-mono"
                      @dragover="handleDragOver"
                      @drop="handleDrop"
                      :placeholder="t('messageTemplates.dialog.messageLabel')"
                    />
                    <div class="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{{ t('messageTemplates.dialog.charCount', { count: messageCharCount }) }}</span>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="true" class="space-y-2">
                    <!-- Participant Selector for Preview -->
                    <div class="grid grid-cols-2 gap-4">
                      <!-- Walkers Selector -->
                      <div class="space-y-2">
                        <Label class="text-sm font-medium">{{ t('participants.title') }}</Label>
                        <Select v-model="selectedParticipant">
                          <SelectTrigger>
                            <SelectValue :placeholder="t('messageTemplates.dialog.participantPlaceholder')" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem v-for="participant in walkers" :key="participant.id" :value="participant.id">
                              {{ participant.name }}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <!-- Servers Selector -->
                      <div class="space-y-2">
                        <Label class="text-sm font-medium">{{ t('sidebar.servers') }}</Label>
                        <Select v-model="selectedParticipant">
                          <SelectTrigger>
                            <SelectValue :placeholder="t('messageTemplates.dialog.participantPlaceholder')" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem v-for="participant in servers" :key="participant.id" :value="participant.id">
                              {{ participant.name }}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div class="w-full h-40 rounded-md border border-input bg-muted/50 px-3 py-2 text-sm overflow-y-auto">
                      <div v-if="previewMessage" class="whitespace-pre-wrap">
                        {{ previewMessage }}
                      </div>
                      <div v-else-if="!selectedParticipant" class="text-muted-foreground italic text-center py-8">
                        {{ t('messageTemplates.dialog.selectParticipant') }}
                      </div>
                      <div v-else class="text-muted-foreground italic">
                        {{ t('messageTemplates.dialog.previewPlaceholder') }}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
            
            <!-- Right Column: Variables -->
            <div v-if="showVariablesPanel" class="hidden lg:block lg:col-span-5 border-l pl-6 ml-6">
              <div class="space-y-4 h-full flex flex-col">
                <div class="flex items-center justify-between">
                  <h3 class="text-lg font-semibold">{{ t('messageTemplates.dialog.variablesTitle') }}</h3>
                  <div class="text-xs text-muted-foreground">
                    {{ t('common.click') }} to insert
                  </div>
                </div>
                
                <div class="flex-1 overflow-hidden flex flex-col space-y-4" style="max-height: calc(100vh - 300px);">
                  <!-- Search and Filter -->
                  <div class="space-y-3">
                    <div class="relative">
                      <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                      <Input
                        v-model="searchQuery"
                        :placeholder="t('messageTemplates.dialog.searchPlaceholder')"
                        class="pl-10"
                      />
                    </div>
                    
                    <Select v-model="selectedCategory">
                      <SelectTrigger>
                        <SelectValue :placeholder="t('messageTemplates.dialog.categoryAll')" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{{ t('messageTemplates.dialog.categoryAll') }}</SelectItem>
                        <SelectItem value="mostUsed">{{ t('messageTemplates.dialog.mostUsed') }}</SelectItem>
                        <SelectItem value="participant">{{ t('messageTemplates.dialog.categories.participant') }}</SelectItem>
                        <SelectItem value="retreat">{{ t('messageTemplates.dialog.categories.retreat') }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <!-- Most Used Variables -->
                  <div v-if="!searchQuery && (selectedCategory === 'all' || selectedCategory === 'mostUsed')">
                    <h4 class="font-medium text-sm text-foreground mb-2">{{ t('messageTemplates.dialog.mostUsed') }}</h4>
                    <div class="grid grid-cols-1 gap-2">
                      <div
                        v-for="variable in mostUsedVariables"
                        :key="variable.value"
                        @click="insertVariable(variable.value)"
                        class="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all duration-200 border-2"
                        :class="[
                          isVariableUsed(variable.value) 
                            ? 'bg-green-50 border-green-200 hover:bg-green-100' 
                            : 'bg-primary/5 border-primary/20 hover:bg-primary/10'
                        ]"
                      >
                        <div class="flex-1">
                          <div class="font-medium text-sm">{{ variable.label }}</div>
                          <div class="text-xs text-muted-foreground font-mono">{{ variable.value }}</div>
                        </div>
                        <div class="flex items-center gap-1">
                          <div v-if="isVariableUsed(variable.value)" class="w-2 h-2 bg-green-500 rounded-full"></div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            @click.stop="copyToClipboard(variable.value, $event)"
                            class="h-6 w-6 p-0"
                            :title="t('messageTemplates.dialog.copyVariable')"
                          >
                            <Copy class="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <!-- All Variables -->
                  <ScrollArea class="flex-1 min-h-0">
                    <div v-if="filteredCategories.length === 0" class="text-center text-muted-foreground py-8">
                      {{ t('common.noResults') }}
                    </div>
                    
                    <div v-else class="space-y-4">
                      <div v-for="category in filteredCategories" :key="category.id" class="space-y-2">
                        <h4 class="font-medium text-sm text-foreground sticky top-0 bg-background py-1 z-10">
                          {{ category.title }}
                          <Badge variant="secondary" class="ml-2">{{ category.variables.length }}</Badge>
                        </h4>
                        
                        <div class="grid grid-cols-1 gap-1">
                          <div
                            v-for="variable in category.variables"
                            :key="variable.value"
                            @click="insertVariable(variable.value)"
                            class="flex items-center justify-between p-2 rounded cursor-pointer transition-all duration-200 border"
                            :class="[
                              isVariableUsed(variable.value) 
                                ? 'bg-green-50 border-green-200 hover:bg-green-100' 
                                : 'bg-background border-input hover:bg-accent hover:text-accent-foreground'
                            ]"
                          >
                            <div class="flex-1 min-w-0">
                              <div class="font-medium text-sm truncate">{{ variable.label }}</div>
                              <div class="text-xs text-muted-foreground font-mono truncate">{{ variable.value }}</div>
                            </div>
                            <div class="flex items-center gap-1">
                              <div v-if="isVariableUsed(variable.value)" class="w-2 h-2 bg-green-500 rounded-full"></div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                @click.stop="copyToClipboard(variable.value, $event)"
                                class="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                :title="t('messageTemplates.dialog.copyVariable')"
                              >
                                <Copy class="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter class="pt-4 border-t">
            <Button type="button" variant="secondary" @click="isDialogOpen = false">
              {{ t('common.actions.cancel') }}
            </Button>
            <Button type="submit">
              {{ t('messageTemplates.dialog.save') }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
