<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Enviar Mensaje a {{ participant?.firstName }} {{ participant?.lastName }}</DialogTitle>
        <DialogDescription>
          Selecciona el número de teléfono y la plantilla de mensaje a enviar
        </DialogDescription>
      </DialogHeader>
      
      <div class="space-y-6">
        <!-- Phone Selection -->
        <div class="space-y-2">
          <Label class="text-sm font-medium">Número de Teléfono</Label>
          <Select v-model="selectedPhone">
            <SelectTrigger>
              <SelectValue placeholder="Selecciona un número de teléfono" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="option in phoneOptions" :key="option.value" :value="option.value">
                <div class="flex flex-col">
                  <span class="font-medium">{{ option.label }}</span>
                  <span class="text-xs text-muted-foreground">{{ option.description }}</span>
                </div>
              </SelectItem>
              <SelectItem v-if="phoneOptions.length === 0" disabled value="no-phones">
                No hay números de teléfono disponibles
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Template Selection -->
        <div class="space-y-2">
          <Label class="text-sm font-medium">Plantilla de Mensaje</Label>
          <Select v-model="selectedTemplate" :disabled="templatesLoading" @open="() => console.log('Template select opened, loading:', templatesLoading)" @close="() => console.log('Template select closed')">
            <SelectTrigger @click="() => console.log('Select trigger clicked, loading:', templatesLoading, 'disabled:', templatesLoading)">
              <SelectValue :placeholder="templatesLoading ? 'Cargando plantillas...' : 'Selecciona una plantilla'" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="template in relevantTemplates" :key="template.id" :value="template.id">
                {{ template.name }}
              </SelectItem>
              <SelectItem v-if="templatesLoading" disabled value="loading">
                Cargando plantillas...
              </SelectItem>
              <SelectItem v-else-if="!relevantTemplates.length" disabled value="no-templates">
                No hay plantillas disponibles
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Message Editing -->
        <div v-if="selectedTemplate" class="space-y-2">
          <div class="flex items-center justify-between">
            <Label class="text-sm font-medium">Editar Mensaje</Label>
            <Button 
              variant="outline" 
              size="sm"
              @click="copyToClipboard"
              class="text-xs"
            >
              Copiar
            </Button>
          </div>
          
          <!-- Editable message -->
          <Textarea 
            v-model="editedMessage"
            :rows="6"
            class="text-sm min-h-[260px]"
            placeholder="Edita el mensaje aquí..."
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="closeDialog">
          Cancelar
        </Button>
        <Button 
          @click="sendMessage" 
          :disabled="!selectedPhone || !selectedTemplate"
        >
          Enviar Mensaje
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useRetreatStore } from '@/stores/retreatStore';
import { useMessageTemplateStore } from '@/stores/messageTemplateStore';
import { useToast } from '@repo/ui/components/ui/toast/use-toast';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/ui/dialog';
import { Button } from '@repo/ui/components/ui/button';
import { Label } from '@repo/ui/components/ui/label';
import { Textarea } from '@repo/ui/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';

interface Props {
  open: boolean;
  participant: any;
}

interface Emits {
  (e: 'update:open', value: boolean): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { toast } = useToast();
const retreatStore = useRetreatStore();
const { selectedRetreat } = storeToRefs(retreatStore);
const messageTemplateStore = useMessageTemplateStore();
const { templates: allMessageTemplates, loading: templatesLoading } = storeToRefs(messageTemplateStore);

// Reactive state
const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value)
});

const selectedPhone = ref<string | undefined>(undefined);
const selectedTemplate = ref('');
const messagePreview = ref('');
const editedMessage = ref('');
let ariaHiddenObserver: MutationObserver | null = null;

// Phone options computed property
const phoneOptions = computed(() => {
  if (!props.participant) return [];
  
  const participant = props.participant;
  const options = [];
  const usedPhoneNumbers = new Set();
  
  if (participant.cellPhone && !usedPhoneNumbers.has(participant.cellPhone)) {
    options.push({
      value: participant.cellPhone,
      label: 'Teléfono Móvil',
      description: 'Teléfono móvil principal'
    });
    usedPhoneNumbers.add(participant.cellPhone);
  }
  
  if (participant.homePhone && !usedPhoneNumbers.has(participant.homePhone)) {
    options.push({
      value: participant.homePhone,
      label: 'Teléfono Casa',
      description: 'Teléfono de casa'
    });
    usedPhoneNumbers.add(participant.homePhone);
  }
  
  if (participant.workPhone && !usedPhoneNumbers.has(participant.workPhone)) {
    options.push({
      value: participant.workPhone,
      label: 'Teléfono Trabajo',
      description: 'Teléfono del trabajo'
    });
    usedPhoneNumbers.add(participant.workPhone);
  }
  
  if (participant.emergencyContact1CellPhone && !usedPhoneNumbers.has(participant.emergencyContact1CellPhone)) {
    options.push({
      value: participant.emergencyContact1CellPhone,
      label: 'Contacto Emergencia 1',
      description: `Teléfono de ${participant.emergencyContact1Name || 'Contacto de emergencia 1'}`
    });
    usedPhoneNumbers.add(participant.emergencyContact1CellPhone);
  }
  
  if (participant.emergencyContact1HomePhone && !usedPhoneNumbers.has(participant.emergencyContact1HomePhone)) {
    options.push({
      value: participant.emergencyContact1HomePhone,
      label: 'Contacto Emergencia 1 (Casa)',
      description: `Teléfono de casa de ${participant.emergencyContact1Name || 'Contacto de emergencia 1'}`
    });
    usedPhoneNumbers.add(participant.emergencyContact1HomePhone);
  }
  
  if (participant.emergencyContact1WorkPhone && !usedPhoneNumbers.has(participant.emergencyContact1WorkPhone)) {
    options.push({
      value: participant.emergencyContact1WorkPhone,
      label: 'Contacto Emergencia 1 (Trabajo)',
      description: `Teléfono de trabajo de ${participant.emergencyContact1Name || 'Contacto de emergencia 1'}`
    });
    usedPhoneNumbers.add(participant.emergencyContact1WorkPhone);
  }
  
  if (participant.emergencyContact2CellPhone && !usedPhoneNumbers.has(participant.emergencyContact2CellPhone)) {
    options.push({
      value: participant.emergencyContact2CellPhone,
      label: 'Contacto Emergencia 2',
      description: `Teléfono de ${participant.emergencyContact2Name || 'Contacto de emergencia 2'}`
    });
    usedPhoneNumbers.add(participant.emergencyContact2CellPhone);
  }
  
  if (participant.emergencyContact2HomePhone && !usedPhoneNumbers.has(participant.emergencyContact2HomePhone)) {
    options.push({
      value: participant.emergencyContact2HomePhone,
      label: 'Contacto Emergencia 2 (Casa)',
      description: `Teléfono de casa de ${participant.emergencyContact2Name || 'Contacto de emergencia 2'}`
    });
    usedPhoneNumbers.add(participant.emergencyContact2HomePhone);
  }
  
  if (participant.emergencyContact2WorkPhone && !usedPhoneNumbers.has(participant.emergencyContact2WorkPhone)) {
    options.push({
      value: participant.emergencyContact2WorkPhone,
      label: 'Contacto Emergencia 2 (Trabajo)',
      description: `Teléfono de trabajo de ${participant.emergencyContact2Name || 'Contacto de emergencia 2'}`
    });
    usedPhoneNumbers.add(participant.emergencyContact2WorkPhone);
  }
  
  if (participant.inviterCellPhone && !usedPhoneNumbers.has(participant.inviterCellPhone)) {
    options.push({
      value: participant.inviterCellPhone,
      label: 'Teléfono Invitador',
      description: `Teléfono de quien invitó: ${participant.invitedBy || 'Invitador'}`
    });
    usedPhoneNumbers.add(participant.inviterCellPhone);
  }
  
  if (participant.inviterHomePhone && !usedPhoneNumbers.has(participant.inviterHomePhone)) {
    options.push({
      value: participant.inviterHomePhone,
      label: 'Teléfono Invitador (Casa)',
      description: `Teléfono de casa de quien invitó: ${participant.invitedBy || 'Invitador'}`
    });
    usedPhoneNumbers.add(participant.inviterHomePhone);
  }
  
  if (participant.inviterWorkPhone && !usedPhoneNumbers.has(participant.inviterWorkPhone)) {
    options.push({
      value: participant.inviterWorkPhone,
      label: 'Teléfono Invitador (Trabajo)',
      description: `Teléfono de trabajo de quien invitó: ${participant.invitedBy || 'Invitador'}`
    });
    usedPhoneNumbers.add(participant.inviterWorkPhone);
  }
  
  return options;
});

// Debug computed property to check phone options
const phoneOptionsDebug = computed(() => {
  const participant = props.participant;
  const allPhones = [
    participant?.cellPhone,
    participant?.homePhone,
    participant?.workPhone,
    participant?.emergencyContact1CellPhone,
    participant?.emergencyContact1HomePhone,
    participant?.emergencyContact1WorkPhone,
    participant?.emergencyContact2CellPhone,
    participant?.emergencyContact2HomePhone,
    participant?.emergencyContact2WorkPhone,
    participant?.inviterCellPhone,
    participant?.inviterHomePhone,
    participant?.inviterWorkPhone
  ].filter(Boolean);
  
  const uniquePhones = new Set(allPhones);
  const hasDuplicates = allPhones.length !== uniquePhones.size;
  
  return {
    selectedPhone: selectedPhone.value,
    optionsCount: phoneOptions.value.length,
    firstOption: phoneOptions.value[0]?.value,
    participantCellPhone: props.participant?.cellPhone,
    allPhones,
    uniquePhones: Array.from(uniquePhones),
    hasDuplicates
  };
});

// Relevant templates based on participant type
const relevantTemplates = computed(() => {
  if (!props.participant) return [];
  
  const participantType = props.participant.type;
  if (!participantType) return allMessageTemplates.value || [];
  
  const allTemplates = allMessageTemplates.value || [];
  console.log('All templates details:', allTemplates.map(t => ({ id: t.id, name: t.name, type: t.type })));
  
  const templates = allTemplates.filter((template: any) => {
    // Template doesn't have targetAudience property, use type instead
    const templateType = template.type || '';
    return templateType.includes('WALKER') || 
           templateType.includes('SERVER') ||
           templateType === 'GENERAL' ||
           !templateType;
  });
  
  console.log('Relevant templates:', {
    participantType,
    allTemplatesCount: allTemplates.length,
    relevantTemplatesCount: templates.length,
    templates: templates.map(t => ({ id: t.id, name: t.name, type: t.type }))
  });
  
  // If no templates match the filter, show all templates as a fallback
  if (templates.length === 0 && allTemplates.length > 0) {
    console.log('No relevant templates found, showing all templates as fallback');
    return allTemplates;
  }
  
  return templates;
});

// Update message preview function
const updateMessagePreview = () => {
  if (!selectedTemplate.value || !props.participant) {
    messagePreview.value = '';
    editedMessage.value = '';
    return;
  }
  
  const template = allMessageTemplates.value.find((t: any) => t.id === selectedTemplate.value);
  if (!template) return;
  
  let message = template.message;
  
  // Replace all participant variables
  const participantReplacements = {
    'participant.firstName': props.participant.firstName || '',
    'participant.lastName': props.participant.lastName || '',
    'participant.nickname': props.participant.nickname || '',
    'participant.type': props.participant.type || '',
    'participant.birthDate': props.participant.birthDate || '',
    'participant.maritalStatus': props.participant.maritalStatus || '',
    'participant.street': props.participant.street || '',
    'participant.houseNumber': props.participant.houseNumber || '',
    'participant.postalCode': props.participant.postalCode || '',
    'participant.neighborhood': props.participant.neighborhood || '',
    'participant.city': props.participant.city || '',
    'participant.state': props.participant.state || '',
    'participant.country': props.participant.country || '',
    'participant.parish': props.participant.parish || '',
    'participant.homePhone': props.participant.homePhone || '',
    'participant.workPhone': props.participant.workPhone || '',
    'participant.cellPhone': props.participant.cellPhone || '',
    'participant.email': props.participant.email || '',
    'participant.occupation': props.participant.occupation || '',
    'participant.snores': props.participant.snores ? 'Sí' : 'No',
    'participant.hasMedication': props.participant.hasMedication ? 'Sí' : 'No',
    'participant.medicationDetails': props.participant.medicationDetails || '',
    'participant.medicationSchedule': props.participant.medicationSchedule || '',
    'participant.hasDietaryRestrictions': props.participant.hasDietaryRestrictions ? 'Sí' : 'No',
    'participant.dietaryRestrictionsDetails': props.participant.dietaryRestrictionsDetails || '',
    'participant.sacraments': Array.isArray(props.participant.sacraments) ? props.participant.sacraments.join(', ') : '',
    'participant.emergencyContact1Name': props.participant.emergencyContact1Name || '',
    'participant.emergencyContact1Relation': props.participant.emergencyContact1Relation || '',
    'participant.emergencyContact1HomePhone': props.participant.emergencyContact1HomePhone || '',
    'participant.emergencyContact1WorkPhone': props.participant.emergencyContact1WorkPhone || '',
    'participant.emergencyContact1CellPhone': props.participant.emergencyContact1CellPhone || '',
    'participant.emergencyContact1Email': props.participant.emergencyContact1Email || '',
    'participant.emergencyContact2Name': props.participant.emergencyContact2Name || '',
    'participant.emergencyContact2Relation': props.participant.emergencyContact2Relation || '',
    'participant.emergencyContact2HomePhone': props.participant.emergencyContact2HomePhone || '',
    'participant.emergencyContact2WorkPhone': props.participant.emergencyContact2WorkPhone || '',
    'participant.emergencyContact2CellPhone': props.participant.emergencyContact2CellPhone || '',
    'participant.emergencyContact2Email': props.participant.emergencyContact2Email || '',
    'participant.tshirtSize': props.participant.tshirtSize || '',
    'participant.invitedBy': props.participant.invitedBy || '',
    'participant.isInvitedByEmausMember': props.participant.isInvitedByEmausMember ? 'Sí' : 'No',
    'participant.inviterHomePhone': props.participant.inviterHomePhone || '',
    'participant.inviterWorkPhone': props.participant.inviterWorkPhone || '',
    'participant.inviterCellPhone': props.participant.inviterCellPhone || '',
    'participant.inviterEmail': props.participant.inviterEmail || '',
    'participant.family_friend_color': props.participant.family_friend_color || '',
    'participant.pickupLocation': props.participant.pickupLocation || '',
    'participant.arrivesOnOwn': props.participant.arrivesOnOwn ? 'Sí' : 'No',
    'participant.paymentDate': props.participant.paymentDate || '',
    'participant.paymentAmount': props.participant.paymentAmount?.toString() || '',
    'participant.isScholarship': props.participant.isScholarship ? 'Sí' : 'No',
    'participant.palancasCoordinator': props.participant.palancasCoordinator || '',
    'participant.palancasRequested': props.participant.palancasRequested ? 'Sí' : 'No',
    'participant.palancasReceived': props.participant.palancasReceived || '',
    'participant.palancasNotes': props.participant.palancasNotes || '',
    'participant.requestsSingleRoom': props.participant.requestsSingleRoom ? 'Sí' : 'No',
    'participant.isCancelled': props.participant.isCancelled ? 'Sí' : 'No',
    'participant.notes': props.participant.notes || '',
    'participant.registrationDate': props.participant.registrationDate || '',
    'participant.lastUpdatedDate': props.participant.lastUpdatedDate || '',
    'participant.table': props.participant.tableMesa?.name || '',
    'participant.roomNumber': props.participant.retreatBed?.roomNumber || '',
    'participant.bedNumber': props.participant.retreatBed?.bedNumber || ''
  };
  
  // Apply all participant variable replacements
  Object.entries(participantReplacements).forEach(([key, value]) => {
    message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  });
  
  // Replace retreat variables with actual retreat data
  const retreat = selectedRetreat.value;
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
  
  messagePreview.value = message;
  editedMessage.value = message; // Always update the editable message
};

// Copy to clipboard function
const copyToClipboard = async () => {
  if (!editedMessage.value) return;
  
  try {
    await navigator.clipboard.writeText(editedMessage.value);
    toast({
      title: 'Copiado al portapapeles',
      description: 'El mensaje ha sido copiado al portapapeles exitosamente.',
    });
  } catch (err) {
    console.error('Error copying to clipboard:', err);
    toast({
      title: 'Error',
      description: 'No se pudo copiar el mensaje al portapapeles.',
      variant: 'destructive',
    });
  }
};


// Send message function
const sendMessage = () => {
  if (!selectedPhone.value || !props.participant) return;
  
  // Use the edited message
  const messageToSend = editedMessage.value;
  copyToClipboard();
  
  // Open WhatsApp with the message
  const phoneToUse = selectedPhone.value;
  const whatsappUrl = `https://wa.me/${phoneToUse}?text=${encodeURIComponent(messageToSend)}`;
  window.open(whatsappUrl, '_blank');
  
  // Close dialog
  closeDialog();
};

// Setup aria-hidden observer function
const setupAriaHiddenObserver = () => {
  // Clean up existing observer
  if (ariaHiddenObserver) {
    ariaHiddenObserver.disconnect();
    ariaHiddenObserver = null;
  }
  
  // Create observer to watch for aria-hidden attribute changes on all elements
  ariaHiddenObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'aria-hidden') {
        const target = mutation.target as HTMLElement;
        
        // Check if this is a dialog element that shouldn't have aria-hidden
        if (target.classList.contains('max-w-2xl') || 
            target.closest('.fixed')?.classList.contains('max-w-2xl') ||
            (target.getAttribute('role') === 'dialog' || target.closest('[role="dialog"]'))) {
          
          // Check if there's a focused element within this dialog
          const activeElement = document.activeElement;
          if (activeElement && target.contains(activeElement)) {
            console.log('Removing aria-hidden from:', target);
            target.removeAttribute('aria-hidden');
          }
        }
      }
    });
  });
  
  // Start observing the entire document for aria-hidden changes
  ariaHiddenObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['aria-hidden'],
    subtree: true
  });
  
  // Also check immediately for existing problematic aria-hidden attributes
  const dialogElements = document.querySelectorAll('.max-w-2xl, [role="dialog"]');
  dialogElements.forEach((element) => {
    const activeElement = document.activeElement;
    if (activeElement && element.contains(activeElement) && element.getAttribute('aria-hidden') === 'true') {
      element.removeAttribute('aria-hidden');
    }
  });
};

// Cleanup observer function
const cleanupAriaHiddenObserver = () => {
  if (ariaHiddenObserver) {
    ariaHiddenObserver.disconnect();
    ariaHiddenObserver = null;
  }
};

// Close dialog function
const closeDialog = () => {
  cleanupAriaHiddenObserver();
  isOpen.value = false;
};

// Watchers
watch(() => props.open, (newValue: boolean) => {
  if (newValue && props.participant) {
    // Initialize dialog when opened
    selectedPhone.value = props.participant.cellPhone || undefined;
    selectedTemplate.value = '';
    messagePreview.value = '';
    editedMessage.value = '';
    
    // Load templates for the selected retreat
    if (retreatStore.selectedRetreatId) {
      console.log('Fetching templates for retreat:', retreatStore.selectedRetreatId);
      messageTemplateStore.fetchTemplates(retreatStore.selectedRetreatId);
    } else {
      console.log('No retreat ID selected, cannot fetch templates');
    }
    
    // Setup aria-hidden observer to handle the accessibility issue
    setupAriaHiddenObserver();
    
    // Delay focus management to avoid aria-hidden conflict
    setTimeout(() => {
      // Find and blur any focused select triggers that might cause issues
      const focusedElement = document.activeElement as HTMLElement;
      if (focusedElement && focusedElement.getAttribute('role') === 'combobox') {
        focusedElement.blur();
      }
    }, 50);
  }
});

watch(selectedTemplate, (newValue: string) => {
  console.log('Selected template changed:', newValue);
  updateMessagePreview();
});

watch(() => props.participant, () => {
  updateMessagePreview();
});


// Debug watch
watch(phoneOptionsDebug, (debug: any) => {
  console.log('Phone Options Debug:', debug);
}, { immediate: true });

// Watch templates loading state
watch(() => [templatesLoading.value, allMessageTemplates.value], ([loading, templates]) => {
  console.log('Templates state changed:', {
    loading,
    templatesCount: Array.isArray(templates) ? templates.length : 0,
    templates: Array.isArray(templates) ? templates.map((t: any) => ({ id: t.id, name: t.name, type: t.type })) : []
  });
}, { immediate: true });

// Cleanup on component unmount
onBeforeUnmount(() => {
  cleanupAriaHiddenObserver();
});
</script>