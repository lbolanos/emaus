<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Enviar Mensaje a {{ participant?.firstName }} {{ participant?.lastName }}</DialogTitle>
        <DialogDescription>
          Selecciona el método de envío y la plantilla de mensaje
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-6">
        <!-- Send Method Selection -->
        <div class="space-y-2">
          <Label class="text-sm font-medium">Método de Envío</Label>
          <div class="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              :class="{ 'bg-primary text-primary-foreground': sendMethod === 'whatsapp' }"
              @click="sendMethod = 'whatsapp'"
            >
              <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              WhatsApp
            </Button>
            <Button
              variant="outline"
              size="sm"
              :class="{ 'bg-primary text-primary-foreground': sendMethod === 'email' }"
              @click="sendMethod = 'email'"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
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
            <div class="flex items-center gap-2">
              <Label class="text-sm font-medium">Editar Mensaje</Label>
              <Badge variant="outline" class="text-xs">
                {{ sendMethod === 'whatsapp' ? 'Formato WhatsApp' : 'Formato Email' }}
              </Badge>
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
              <Textarea
                v-model="editedMessage"
                :rows="8"
                class="text-sm min-h-[260px]"
                :placeholder="sendMethod === 'whatsapp' ? 'Edita el mensaje para WhatsApp aquí...' : 'Edita el mensaje para Email aquí...'"
              />
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

      <DialogFooter>
        <Button variant="outline" @click="closeDialog">
          Cancelar
        </Button>
        <Button
          @click="sendMessage"
          :disabled="!selectedContact || !selectedTemplate"
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

// Show all available templates for sending messages
const relevantTemplates = computed(() => {
  if (!props.participant) return [];

  const allTemplates = allMessageTemplates.value || [];
  console.log('All templates details:', allTemplates.map(t => ({ id: t.id, name: t.name, type: t.type })));

  // Show all available templates - any template can be used for sending messages
  const templates = allTemplates;

  console.log('Available templates for sending:', {
    allTemplatesCount: allTemplates.length,
    templates: templates.map(t => ({ id: t.id, name: t.name, type: t.type }))
  });

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


// Send message function
const sendMessage = async () => {
  if (!selectedContact.value || !selectedTemplate.value || !props.participant) return;

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

    // Close dialog
    closeDialog();
  } catch (error) {
    console.error('Error sending message:', error);
    toast({
      title: 'Error',
      description: 'No se pudo enviar el mensaje. Por favor intenta de nuevo.',
      variant: 'destructive',
    });
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