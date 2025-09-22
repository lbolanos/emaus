<template>
  <Dialog v-model:open="isOpen" @keydown.esc="handleEscape" @keydown.ctrl.s.prevent="sendMessage" @keydown.ctrl.enter.prevent="sendMessage">
    <DialogContent :class="showHistory ? 'max-w-5xl' : 'max-w-2xl'" class="focus:outline-none">
      <DialogHeader>
        <div class="flex items-center justify-between">
          <div>
            <DialogTitle>Enviar Mensaje a {{ participant?.firstName }} {{ participant?.lastName }}</DialogTitle>
            <DialogDescription>
              Selecciona el método de envío y la plantilla de mensaje
            </DialogDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            @click="toggleHistory"
            :class="{ 'bg-primary text-primary-foreground': showHistory }"
            :disabled="!props.participant?.id || !retreatStore.selectedRetreatId"
            :title="!props.participant?.id || !retreatStore.selectedRetreatId ? 'Selecciona un participante y retiro' : 'Ver historial de mensajes (Ctrl+H)'"
            accesskey="h"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Historial
          </Button>
        </div>
      </DialogHeader>
      <div class="flex gap-6">
        <!-- Main Content -->
        <div class="flex-1 space-y-6">
          <!-- Send Method Selection -->
          <div class="space-y-2">
            <Label class="text-sm font-medium">Método de Envío</Label>
            <div class="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                :class="{ 'bg-primary text-primary-foreground': sendMethod === 'whatsapp' }"
                @click="sendMethod = 'whatsapp'"
                title="Enviar por WhatsApp"
              >
                <span class="w-4 h-4 mr-2">📱</span>
                WhatsApp
              </Button>
              <Button
                variant="outline"
                size="sm"
                :class="{ 'bg-primary text-primary-foreground': sendMethod === 'email' }"
                @click="sendMethod = 'email'"
                title="Enviar por Email"
              >
                <span class="w-4 h-4 mr-2">📧</span>
                Email
              </Button>
            </div>
          </div>

          <!-- Contact Selection -->
          <div class="space-y-2">
            <Label class="text-sm font-medium">
              {{ sendMethod === 'whatsapp' ? 'Número de Teléfono' : 'Correo Electrónico' }}
            </Label>
            <Select v-model="selectedContact">
              <SelectTrigger>
                <SelectValue :placeholder="sendMethod === 'whatsapp' ? 'Selecciona un número de teléfono' : 'Selecciona un correo electrónico'" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="option in contactOptions" :key="option.value" :value="option.value">
                  <div class="flex flex-col">
                    <span class="font-medium">{{ option.label }}</span>
                    <span class="text-xs text-muted-foreground">{{ option.description }}</span>
                  </div>
                </SelectItem>
                <SelectItem v-if="contactOptions.length === 0" disabled value="no-contacts">
                  No hay {{ sendMethod === 'whatsapp' ? 'números de teléfono' : 'correos electrónicos' }} disponibles
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Template Selection -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <Label class="text-sm font-medium">Plantilla de Mensaje</Label>
              <div class="flex items-center gap-2">
                <input
                  v-model="templateSearch"
                  type="text"
                  placeholder="Buscar plantilla..."
                  class="px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  @input="filterTemplates"
                />
                <Select v-model="templateTypeFilter" @update:model-value="filterTemplates">
                  <SelectTrigger class="w-32 h-8">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="WALKER">Caminantes</SelectItem>
                    <SelectItem value="SERVER">Servidores</SelectItem>
                    <SelectItem value="GENERAL">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
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
              <div class="flex items-center gap-2">
                <Label class="text-sm font-medium">Editar Mensaje</Label>
                <Badge variant="outline" class="text-xs">
                  {{ sendMethod === 'whatsapp' ? 'Formato WhatsApp' : 'Formato Email' }}
                </Badge>
                <div v-if="isAutoSaving" class="flex items-center gap-1 text-xs text-muted-foreground">
                  <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span>Guardando...</span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                @click="copyToClipboard"
                class="text-xs"
              >
                {{ sendMethod === 'email' && activeTab === 'preview' ? 'Copiar HTML' : 'Copiar' }}
              </Button>
            </div>

            <!-- Tabs for Edit and Preview -->
            <Tabs v-model="activeTab" class="w-full">
              <TabsList class="grid w-full grid-cols-2">
                <TabsTrigger value="edit">Editar</TabsTrigger>
                <TabsTrigger value="preview" v-if="sendMethod === 'email'">Vista Previa</TabsTrigger>
              </TabsList>

              <TabsContent value="edit" class="space-y-2">
                <div class="relative">
                  <Textarea
                    v-model="editedMessage"
                    :rows="8"
                    class="text-sm min-h-[260px]"
                    :class="{ 'border-red-500': showValidationErrors && validateMessage().length > 0 }"
                    :placeholder="sendMethod === 'whatsapp' ? 'Edita el mensaje para WhatsApp aquí...' : 'Edita el mensaje para Email aquí...'"
                  />
                  <div v-if="showValidationErrors" class="mt-1">
                    <div v-for="error in validateMessage()" :key="error" class="text-xs text-red-600">
                      • {{ error }}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" v-if="sendMethod === 'email'" class="space-y-2">
                <div class="w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm overflow-y-auto min-h-[300px] max-h-[500px]">
                  <div v-if="emailPreviewHtml" class="email-preview-content" v-html="emailPreviewHtml">
                  </div>
                  <div v-else class="text-muted-foreground italic text-center py-8">
                    Selecciona una plantilla para generar la vista previa del email
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <!-- History Sidebar -->
        <div v-if="showHistory" class="w-80 border-l pl-6">
          <ParticipantMessageHistory
            :participant-id="props.participant?.id"
            :retreat-id="retreatStore.selectedRetreatId || undefined"
            :visible="showHistory"
            :auto-load="true"
            @message-click="handleMessageClick"
            @copy-message="handleCopyMessage"
            @loading-changed="handleHistoryLoadingChanged"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="closeDialog" title="Cerrar diálogo (Esc)">
          Cancelar
        </Button>
        <Button
          @click="sendMessage"
          :disabled="!selectedContact || !selectedTemplate || isSending"
          title="Enviar mensaje (Ctrl+S o Ctrl+Enter)"
        >
          <span v-if="isSending" class="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          <span v-else-if="sendMethod === 'whatsapp'">📱</span>
          <span v-else>📧</span>
          {{ isSending ? 'Enviando...' : 'Enviar Mensaje' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRetreatStore } from '@/stores/retreatStore';
import { useMessageTemplateStore } from '@/stores/messageTemplateStore';
import { useToast } from '@repo/ui';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui';
import { Button } from '@repo/ui';
import { Label } from '@repo/ui';
import { Textarea } from '@repo/ui';
import { Badge } from '@repo/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui';
import { convertHtmlToWhatsApp, convertHtmlToEmail, replaceAllVariables, ParticipantData, RetreatData } from '@/utils/message';
import { useParticipantCommunicationStore } from '@/stores/participantCommunicationStore';
import ParticipantMessageHistory from './ParticipantMessageHistory.vue';

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

const sendMethod = ref<'whatsapp' | 'email'>('whatsapp');
const selectedContact = ref<string | undefined>(undefined);
const selectedTemplate = ref('');
const messagePreview = ref('');
const editedMessage = ref('');
const emailPreviewHtml = ref('');
const activeTab = ref('edit');
const showHistory = ref(false);
const templateSearch = ref('');
const templateTypeFilter = ref('all');
const filteredTemplates = ref<any[]>([]);
const isSending = ref(false);
const isAutoSaving = ref(false);
const showValidationErrors = ref(false);
const historyComponentLoading = ref(false);
let ariaHiddenObserver: MutationObserver | null = null;

// Contact options computed property - handles both phones and emails
const contactOptions = computed(() => {
  if (!props.participant) return [];

  const participant = props.participant;
  const options = [];
  const usedValues = new Set();

  if (sendMethod.value === 'whatsapp') {
    // Phone options
    if (participant.cellPhone && !usedValues.has(participant.cellPhone)) {
      options.push({
        value: participant.cellPhone,
        label: 'Teléfono Móvil',
        description: 'Teléfono móvil principal'
      });
      usedValues.add(participant.cellPhone);
    }

    if (participant.homePhone && !usedValues.has(participant.homePhone)) {
      options.push({
        value: participant.homePhone,
        label: 'Teléfono Casa',
        description: 'Teléfono de casa'
      });
      usedValues.add(participant.homePhone);
    }

    if (participant.workPhone && !usedValues.has(participant.workPhone)) {
      options.push({
        value: participant.workPhone,
        label: 'Teléfono Trabajo',
        description: 'Teléfono del trabajo'
      });
      usedValues.add(participant.workPhone);
    }

    if (participant.emergencyContact1CellPhone && !usedValues.has(participant.emergencyContact1CellPhone)) {
      options.push({
        value: participant.emergencyContact1CellPhone,
        label: 'Contacto Emergencia 1',
        description: `Teléfono de ${participant.emergencyContact1Name || 'Contacto de emergencia 1'}`
      });
      usedValues.add(participant.emergencyContact1CellPhone);
    }

    if (participant.emergencyContact1HomePhone && !usedValues.has(participant.emergencyContact1HomePhone)) {
      options.push({
        value: participant.emergencyContact1HomePhone,
        label: 'Contacto Emergencia 1 (Casa)',
        description: `Teléfono de casa de ${participant.emergencyContact1Name || 'Contacto de emergencia 1'}`
      });
      usedValues.add(participant.emergencyContact1HomePhone);
    }

    if (participant.emergencyContact1WorkPhone && !usedValues.has(participant.emergencyContact1WorkPhone)) {
      options.push({
        value: participant.emergencyContact1WorkPhone,
        label: 'Contacto Emergencia 1 (Trabajo)',
        description: `Teléfono de trabajo de ${participant.emergencyContact1Name || 'Contacto de emergencia 1'}`
      });
      usedValues.add(participant.emergencyContact1WorkPhone);
    }

    if (participant.emergencyContact2CellPhone && !usedValues.has(participant.emergencyContact2CellPhone)) {
      options.push({
        value: participant.emergencyContact2CellPhone,
        label: 'Contacto Emergencia 2',
        description: `Teléfono de ${participant.emergencyContact2Name || 'Contacto de emergencia 2'}`
      });
      usedValues.add(participant.emergencyContact2CellPhone);
    }

    if (participant.emergencyContact2HomePhone && !usedValues.has(participant.emergencyContact2HomePhone)) {
      options.push({
        value: participant.emergencyContact2HomePhone,
        label: 'Contacto Emergencia 2 (Casa)',
        description: `Teléfono de casa de ${participant.emergencyContact2Name || 'Contacto de emergencia 2'}`
      });
      usedValues.add(participant.emergencyContact2HomePhone);
    }

    if (participant.emergencyContact2WorkPhone && !usedValues.has(participant.emergencyContact2WorkPhone)) {
      options.push({
        value: participant.emergencyContact2WorkPhone,
        label: 'Contacto Emergencia 2 (Trabajo)',
        description: `Teléfono de trabajo de ${participant.emergencyContact2Name || 'Contacto de emergencia 2'}`
      });
      usedValues.add(participant.emergencyContact2WorkPhone);
    }

    if (participant.inviterCellPhone && !usedValues.has(participant.inviterCellPhone)) {
      options.push({
        value: participant.inviterCellPhone,
        label: 'Teléfono Invitador',
        description: `Teléfono de quien invitó: ${participant.invitedBy || 'Invitador'}`
      });
      usedValues.add(participant.inviterCellPhone);
    }

    if (participant.inviterHomePhone && !usedValues.has(participant.inviterHomePhone)) {
      options.push({
        value: participant.inviterHomePhone,
        label: 'Teléfono Invitador (Casa)',
        description: `Teléfono de casa de quien invitó: ${participant.invitedBy || 'Invitador'}`
      });
      usedValues.add(participant.inviterHomePhone);
    }

    if (participant.inviterWorkPhone && !usedValues.has(participant.inviterWorkPhone)) {
      options.push({
        value: participant.inviterWorkPhone,
        label: 'Teléfono Invitador (Trabajo)',
        description: `Teléfono de trabajo de quien invitó: ${participant.invitedBy || 'Invitador'}`
      });
      usedValues.add(participant.inviterWorkPhone);
    }
  } else {
    // Email options
    if (participant.email && !usedValues.has(participant.email)) {
      options.push({
        value: participant.email,
        label: 'Correo Principal',
        description: 'Correo electrónico principal'
      });
      usedValues.add(participant.email);
    }

    if (participant.workEmail && !usedValues.has(participant.workEmail)) {
      options.push({
        value: participant.workEmail,
        label: 'Correo Trabajo',
        description: 'Correo electrónico del trabajo'
      });
      usedValues.add(participant.workEmail);
    }

    if (participant.emergencyContact1Email && !usedValues.has(participant.emergencyContact1Email)) {
      options.push({
        value: participant.emergencyContact1Email,
        label: 'Correo Contacto Emergencia 1',
        description: `Correo de ${participant.emergencyContact1Name || 'Contacto de emergencia 1'}`
      });
      usedValues.add(participant.emergencyContact1Email);
    }

    if (participant.emergencyContact2Email && !usedValues.has(participant.emergencyContact2Email)) {
      options.push({
        value: participant.emergencyContact2Email,
        label: 'Correo Contacto Emergencia 2',
        description: `Correo de ${participant.emergencyContact2Name || 'Contacto de emergencia 2'}`
      });
      usedValues.add(participant.emergencyContact2Email);
    }

    if (participant.inviterEmail && !usedValues.has(participant.inviterEmail)) {
      options.push({
        value: participant.inviterEmail,
        label: 'Correo Invitador',
        description: `Correo de quien invitó: ${participant.invitedBy || 'Invitador'}`
      });
      usedValues.add(participant.inviterEmail);
    }
  }

  return options;
});

// Phone options computed property (for backward compatibility)
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
    selectedContact: selectedContact.value,
    sendMethod: sendMethod.value,
    contactOptionsCount: contactOptions.value.length,
    phoneOptionsCount: phoneOptions.value.length,
    firstContactOption: contactOptions.value[0]?.value,
    participantCellPhone: props.participant?.cellPhone,
    participantEmail: props.participant?.email,
    allPhones,
    uniquePhones: Array.from(uniquePhones),
    hasDuplicates
  };
});

// Template filtering functionality

// Update message preview function
const updateMessagePreview = () => {
  if (!selectedTemplate.value || !props.participant) {
    messagePreview.value = '';
    editedMessage.value = '';
    return;
  }
  
  const template = allMessageTemplates.value.find((t: any) => t.id === selectedTemplate.value);
  if (!template) return;
  
  // Replace all variables using the utility function
  let message = replaceAllVariables(
    template.message,
    props.participant as ParticipantData,
    selectedRetreat.value as RetreatData
  );
  
  messagePreview.value = message;

  // Update editable message based on send method
  if (sendMethod.value === 'whatsapp') {
    // Show WhatsApp-friendly format in the text area
    editedMessage.value = convertHtmlToWhatsApp(message);
  } else {
    // Show email preview format in the text area
    editedMessage.value = convertHtmlToEmail(message, props.participant);

    // Generate email preview HTML
    emailPreviewHtml.value = convertHtmlToEmail(message, {
      format: 'enhanced',
      includeJavaScript: true,
      preserveStyles: true
    });
  }
};

// Keyboard shortcuts and utility functions
const handleEscape = () => {
  if (showHistory.value) {
    showHistory.value = false;
  } else {
    closeDialog();
  }
};

const filterTemplates = () => {
  const templates = allMessageTemplates.value || [];
  const search = templateSearch.value.toLowerCase();
  const typeFilter = templateTypeFilter.value;

  filteredTemplates.value = templates.filter(template => {
    const matchesSearch = !search ||
      template.name.toLowerCase().includes(search) ||
      template.message.toLowerCase().includes(search);

    const matchesType = typeFilter === 'all' || template.type === typeFilter;

    return matchesSearch && matchesType;
  });
};

// Enhanced relevantTemplates computed property with filtering
const relevantTemplates = computed(() => {
  if (templateSearch.value || templateTypeFilter.value !== 'all') {
    return filteredTemplates.value;
  }

  // Show all available templates - any template can be used for sending messages
  const templates = allMessageTemplates.value || [];
  console.log('Available templates for sending:', {
    allTemplatesCount: templates.length,
    templates: templates.map(t => ({ id: t.id, name: t.name, type: t.type }))
  });

  return templates;
});

// Copy to clipboard function
const copyToClipboard = async () => {
  if (!editedMessage.value) return;

  try {
    let contentToCopy = editedMessage.value;
    let description = 'El mensaje ha sido copiado al portapapeles exitosamente.';

    // If in email preview tab, copy the email HTML
    if (sendMethod.value === 'email' && activeTab.value === 'preview' && emailPreviewHtml.value) {
      contentToCopy = emailPreviewHtml.value;
      description = 'El contenido HTML del email ha sido copiado al portapapeles.';
    }

    await navigator.clipboard.writeText(contentToCopy);
    toast({
      title: 'Copiado al portapapeles',
      description: description,
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

// Auto-save functionality
const autoSaveMessage = () => {
  if (!editedMessage.value || !selectedTemplate.value) return;

  isAutoSaving.value = true;

  const draftKey = `message-draft-${props.participant?.id}-${selectedTemplate.value}`;
  const draftData = {
    message: editedMessage.value,
    sendMethod: sendMethod.value,
    selectedContact: selectedContact.value,
    timestamp: new Date().toISOString()
  };

  localStorage.setItem(draftKey, JSON.stringify(draftData));

  // Show auto-save indicator briefly
  setTimeout(() => {
    isAutoSaving.value = false;
  }, 1000);
};

// Load draft functionality
const loadDraft = () => {
  if (!props.participant || !selectedTemplate.value) return;

  const draftKey = `message-draft-${props.participant.id}-${selectedTemplate.value}`;
  const draftData = localStorage.getItem(draftKey);

  if (draftData) {
    try {
      const draft = JSON.parse(draftData);
      // Only load if draft is less than 24 hours old
      const draftAge = new Date().getTime() - new Date(draft.timestamp).getTime();
      if (draftAge < 24 * 60 * 60 * 1000) {
        editedMessage.value = draft.message;
        if (draft.sendMethod) sendMethod.value = draft.sendMethod;
        if (draft.selectedContact) selectedContact.value = draft.selectedContact;

        toast({
          title: 'Borrador recuperado',
          description: 'Se ha restaurado un borrador guardado previamente.',
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('Error loading draft:', error);
    }
  }
};

// Clean up drafts when component unmounts or message is sent
const cleanupDrafts = () => {
  if (props.participant && selectedTemplate.value) {
    const draftKey = `message-draft-${props.participant.id}-${selectedTemplate.value}`;
    localStorage.removeItem(draftKey);
  }
};

onUnmounted(() => {
  cleanupDrafts();
});

// Message validation
const validateMessage = () => {
  const errors = [];

  if (!selectedContact.value) {
    errors.push('Selecciona un contacto');
  }

  if (!selectedTemplate.value) {
    errors.push('Selecciona una plantilla');
  }

  if (!editedMessage.value.trim()) {
    errors.push('El mensaje no puede estar vacío');
  }

  // Validate email format if sending via email
  if (sendMethod.value === 'email' && selectedContact.value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(selectedContact.value)) {
      errors.push('El correo electrónico no tiene un formato válido');
    }
  }

  // Validate phone format if sending via WhatsApp
  if (sendMethod.value === 'whatsapp' && selectedContact.value) {
    const phoneRegex = /^\+?[\d\s\-()]+$/;
    if (!phoneRegex.test(selectedContact.value) || selectedContact.value.length < 8) {
      errors.push('El número de teléfono no tiene un formato válido');
    }
  }

  return errors;
};

// Clear draft
const clearDraft = () => {
  if (!props.participant || !selectedTemplate.value) return;

  const draftKey = `message-draft-${props.participant.id}-${selectedTemplate.value}`;
  localStorage.removeItem(draftKey);
};

// Send message function
const sendMessage = async () => {
  if (!selectedContact.value || !selectedTemplate.value || !props.participant) return;

  // Validate message before sending
  const validationErrors = validateMessage();
  if (validationErrors.length > 0) {
    showValidationErrors.value = true;
    toast({
      title: 'Error de validación',
      description: validationErrors.join('. '),
      variant: 'destructive',
    });
    return;
  }

  isSending.value = true;

  // Clear draft when sending message
  clearDraft();

  try {
    if (sendMethod.value === 'whatsapp') {
      // WhatsApp sending - convert HTML to WhatsApp-friendly text format
      const messageToSend = convertHtmlToWhatsApp(editedMessage.value);

      // Copy the converted message to clipboard
      await navigator.clipboard.writeText(messageToSend);

      toast({
        title: 'Mensaje copiado al portapapeles',
        description: 'El mensaje ha sido convertido y copiado. Pégalo en WhatsApp.',
      });

      // Using WhatsApp's send endpoint with phone number and message
      const encodedMessage = encodeURIComponent(messageToSend);
      const phoneToUse = selectedContact.value;
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${phoneToUse}&text=${encodedMessage}`;
      

      console.log('WhatsApp URL:', whatsappUrl);
      console.log('WhatsApp text:', messageToSend);

      // Try different approaches in order of preference
      const tryOpenUrl = (url: string, fallback?: () => void) => {
        try {
          const newWindow = window.open(url, '_blank', 'width=800,height=600');
          if (newWindow) {
            // Check if the window was blocked
            setTimeout(() => {
              if (newWindow.closed || newWindow.document.readyState === 'complete') {
                console.log('WhatsApp window opened successfully');
              }
            }, 1000);
          } else {
            console.log('Popup blocked, trying fallback');
            fallback?.();
          }
        } catch (error) {
          console.error('Error opening WhatsApp:', error);
          fallback?.();
        }
      };

      // Try opening WhatsApp URL
      tryOpenUrl(whatsappUrl, () => {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(messageToSend).then(() => {
          toast({
            title: 'Mensaje copiado al portapapeles',
            description: 'Por favor, abre WhatsApp manualmente y pega el mensaje.',
          });
        }).catch(() => {
          toast({
            title: 'Error',
            description: 'No se pudo abrir WhatsApp. Por favor, copia el mensaje manualmente.',
            variant: 'destructive',
          });
        });
      });
    } else {
      // Email sending
      const emailHtml = convertHtmlToEmail(editedMessage.value, props.participant);

      // Create email content and store it
      const subject = `Mensaje para ${props.participant.firstName} ${props.participant.lastName}`;
      const emailContent = {
        to: selectedContact.value,
        subject: subject,
        html: emailHtml,
        text: editedMessage.value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      };

      // Store email content in localStorage for the email client
      localStorage.setItem('emaus_email_to_send', JSON.stringify(emailContent));

      // Copy the email HTML to clipboard
      await copyRichTextToClipboard();

      // Open default email client
      const emailUrl = `mailto:${encodeURIComponent(selectedContact.value)}?subject=${encodeURIComponent(subject)}`;
      window.open(emailUrl, '_blank');
    }

    // Save communication to history
    try {
      const template = allMessageTemplates.value.find((t: any) => t.id === selectedTemplate.value);
      const communicationStore = useParticipantCommunicationStore();
      await communicationStore.createCommunication({
        participantId: props.participant.id,
        retreatId: retreatStore.selectedRetreatId!,
        messageType: sendMethod.value,
        recipientContact: selectedContact.value,
        messageContent: editedMessage.value,
        templateId: selectedTemplate.value,
        templateName: template?.name,
        subject: sendMethod.value === 'email' ? `Mensaje para ${props.participant.firstName} ${props.participant.lastName}` : undefined
      });
    } catch (historyError) {
      console.error('Error saving communication history:', historyError);
      // Don't block the sending process if history saving fails
      toast({
        title: 'Advertencia',
        description: 'El mensaje se envió pero no se pudo guardar en el historial.',
        variant: 'warning',
      });
    }

    // Close dialog
    closeDialog();
  } catch (error) {
    console.error('Error sending message:', error);
    toast({
      title: 'Error',
      description: 'No se pudo enviar el mensaje. Por favor intenta de nuevo.',
      variant: 'destructive',
    });
  } finally {
    isSending.value = false;
    showValidationErrors.value = false;
  }
};

// Copy rich text to clipboard function
const copyRichTextToClipboard = async () => {
  const emailHtml = editedMessage.value;

  if (!emailHtml) {
    throw new Error('No se encontró el contenido del email');
  }

  try {
    const htmlContent = emailHtml;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const clipboardItem = new ClipboardItem({ 'text/html': blob });

    await navigator.clipboard.write([clipboardItem]);

    toast({
      title: 'Email copiado al portapapeles',
      description: 'El contenido del email ha sido copiado en formato HTML. Pégalo en tu cliente de correo.',
    });
  } catch (err) {
    console.error('HTML clipboard failed:', err);

    // Fallback to plain text
    try {
      const plainText = emailHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      await navigator.clipboard.writeText(plainText);

      toast({
        title: 'Texto copiado al portapapeles',
        description: 'El contenido del email ha sido copiado como texto plano.',
      });
    } catch (textErr) {
      console.error('Text fallback failed:', textErr);
      throw new Error('No se pudo copiar al portapapeles');
    }
  }
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
    sendMethod.value = 'whatsapp';
    selectedContact.value = props.participant.cellPhone || props.participant.email || undefined;
    selectedTemplate.value = '';
    messagePreview.value = '';
    editedMessage.value = '';
    emailPreviewHtml.value = '';
    activeTab.value = 'edit';
    showHistory.value = false;

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


watch(() => props.participant, () => {
  updateMessagePreview();
});

// Watch for template selection to auto-switch to preview for email
watch(selectedTemplate, (newValue: string) => {
  console.log('Selected template changed:', newValue);
  updateMessagePreview();

  // Auto-switch to preview tab when email is selected and template is chosen
  if (newValue && sendMethod.value === 'email') {
    setTimeout(() => {
      activeTab.value = 'preview';
    }, 100);
  }

  // Load draft when template is selected
  if (newValue) {
    loadDraft();
  }
});

// Watch for send method changes to update selected contact and message format
watch(sendMethod, (newValue: 'whatsapp' | 'email') => {
  if (!props.participant) return;

  // Update selected contact based on the new method
  if (newValue === 'whatsapp') {
    selectedContact.value = props.participant.cellPhone ||
                           (contactOptions.value.length > 0 ? contactOptions.value[0].value : undefined);
  } else {
    selectedContact.value = props.participant.email ||
                           (contactOptions.value.length > 0 ? contactOptions.value[0].value : undefined);
  }

  // Update message format when send method changes
  if (messagePreview.value) {
    if (newValue === 'whatsapp') {
      editedMessage.value = convertHtmlToWhatsApp(messagePreview.value);
      emailPreviewHtml.value = '';
    } else {
      editedMessage.value = convertHtmlToEmail(messagePreview.value, props.participant);
      // Generate email preview HTML
      emailPreviewHtml.value = convertHtmlToEmail(messagePreview.value, {
        format: 'enhanced',
        includeJavaScript: true,
        preserveStyles: true
      });
    }
  }

  console.log('Send method changed to:', newValue, 'Selected contact:', selectedContact.value);

  // Reset active tab to edit when switching send methods
  activeTab.value = 'edit';
});

// Watch for edited message changes to ensure proper formatting
watch(editedMessage, (newValue: string) => {
  if (!newValue || !messagePreview.value) return;

  // Ensure the edited message shows the correct format based on send method
  if (sendMethod.value === 'email') {
    // For email, ensure we show the email-formatted version
    const emailFormatted = convertHtmlToEmail(messagePreview.value, props.participant);
    if (newValue !== emailFormatted && newValue !== convertHtmlToWhatsApp(messagePreview.value)) {
      // Only update if the user hasn't manually edited the content
      editedMessage.value = emailFormatted;
    }
  }
}, { deep: true });


// Debug watch
watch(phoneOptionsDebug, (debug: any) => {
  console.log('Contact Options Debug:', debug);
}, { immediate: true });

// Auto-save functionality
watch([editedMessage, sendMethod, selectedContact], () => {
  autoSaveMessage();
}, { deep: true });

// Watch templates loading state
watch(() => [templatesLoading.value, allMessageTemplates.value], ([loading, templates]) => {
  console.log('Templates state changed:', {
    loading,
    templatesCount: Array.isArray(templates) ? templates.length : 0,
    templates: Array.isArray(templates) ? templates.map((t: any) => ({ id: t.id, name: t.name, type: t.type })) : []
  });
}, { immediate: true });

// Toggle history function
const toggleHistory = () => {
  showHistory.value = !showHistory.value;
};

// Handle message click from history component
const handleMessageClick = (message: any) => {
  console.log('Message clicked:', message);
  // You can implement actions like reusing the message template
};

// Handle copy message from history component
const handleCopyMessage = async (message: any) => {
  try {
    await navigator.clipboard.writeText(message.messageContent);
    toast({
      title: 'Mensaje copiado',
      description: 'El contenido del mensaje ha sido copiado al portapapeles.',
    });
  } catch (error) {
    console.error('Error copying message:', error);
    toast({
      title: 'Error',
      description: 'No se pudo copiar el mensaje.',
      variant: 'destructive',
    });
  }
};

// Handle history loading state changes
const handleHistoryLoadingChanged = (loading: boolean) => {
  historyComponentLoading.value = loading;
};

// Cleanup on component unmount
onBeforeUnmount(() => {
  cleanupAriaHiddenObserver();
});
</script>

<style scoped>
.email-preview-content {
  font-family: Arial, sans-serif;
  line-height: 1.6;
  margin: 0;
  padding: 20px;
  background-color: #f5f5f5;
}

.email-preview-content :deep(.email-container) {
  max-width: 600px;
  margin: 0 auto;
  background-color: white;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.email-preview-content :deep(.email-body) {
  margin-bottom: 30px;
}

.email-preview-content :deep(.email-footer) {
  text-align: center;
  color: #666;
  font-size: 12px;
  border-top: 1px solid #e0e0e0;
  padding-top: 20px;
}
</style>