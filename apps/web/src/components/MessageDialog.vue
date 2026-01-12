<template>
  <Dialog v-model:open="isOpen" @keydown.esc="handleEscape" @keydown.ctrl.s.prevent="sendMessage" @keydown.ctrl.enter.prevent="sendMessage">
    <DialogContent :class="showHistory ? 'max-w-5xl' : 'max-w-2xl'" class="focus:outline-none">
      <DialogHeader>
        <div class="flex items-center justify-between">
          <div>
            <DialogTitle>Enviar Mensaje a {{ displayName }}</DialogTitle>
            <DialogDescription>
              Selecciona el método de envío y la plantilla de mensaje
            </DialogDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            @click="toggleHistory"
            :class="{ 'bg-primary text-primary-foreground': showHistory }"
            :disabled="!canShowHistory"
            :title="!canShowHistory ? 'Selecciona un destinatario' : 'Ver historial de mensajes (Ctrl+H)'"
            accesskey="h"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Historial
            <Badge v-if="historyMessageCount > 0" variant="secondary" class="ml-2 text-xs">
              {{ historyMessageCount }}
            </Badge>
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

          <!-- Email Send Method Selection (only show when email is selected) -->
          <div v-if="sendMethod === 'email'" class="space-y-2">
            <div class="flex items-center justify-between">
              <Label class="text-sm font-medium">Método de Envío de Email</Label>
              <div v-if="!emailServerConfigStatus.configured" class="flex items-center gap-1 text-xs text-yellow-600">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>
                <span>Servidor de correo no configurado</span>
              </div>
              <div v-else class="flex items-center gap-1 text-xs text-green-600">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                </svg>
                <span>Servidor de correo configurado</span>
              </div>
            </div>
            <div class="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                :class="{ 'bg-primary text-primary-foreground': emailSendMethod === 'user' }"
                @click="emailSendMethod = 'user'"
                title="Abrir cliente de correo del usuario"
                :disabled="!emailServerConfigStatus.configured"
              >
                <span class="w-4 h-4 mr-2">📧</span>
                Mi correo
              </Button>
              <Button
                variant="outline"
                size="sm"
                :class="{ 'bg-primary text-primary-foreground': emailSendMethod === 'backend' }"
                @click="emailSendMethod = 'backend'"
                title="Enviar automáticamente desde el sistema"
                :disabled="!emailServerConfigStatus.configured"
              >
                <span class="w-4 h-4 mr-2">🖥️</span>
                Enviar automático
              </Button>
            </div>
            <p v-if="emailSendMethod === 'user'" class="text-xs text-muted-foreground">
              Abre tu programa de correo (Gmail, Outlook, etc.) y envía el mensaje tú mismo.
            </p>
            <p v-else-if="emailSendMethod === 'backend'" class="text-xs text-muted-foreground">
              El sistema enviará el correo automáticamente sin que tengas que hacer nada.
            </p>
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
            <Select v-model="selectedTemplate" :disabled="templatesLoading">
              <SelectTrigger>
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
                    @input="handleUserEdit"
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
            v-if="canShowHistory && props.context === 'retreat'"
            :participant-id="recipientId"
            :retreat-id="contextId"
            :visible="showHistory"
            :auto-load="true"
            @message-click="handleMessageClick"
            @copy-message="handleCopyMessage"
            @loading-changed="handleHistoryLoadingChanged"
            @count-changed="handleHistoryCountChanged"
          />
          <CommunityMessageHistory
            v-if="canShowHistory && props.context === 'community'"
            :member-id="recipientId"
            :community-id="contextId"
            :visible="showHistory"
            :auto-load="true"
            @message-click="handleMessageClick"
            @copy-message="handleCopyMessage"
            @loading-changed="handleHistoryLoadingChanged"
            @count-changed="handleHistoryCountChanged"
          />
        </div>

        <!-- Hidden component to load count even when history is not visible -->
        <ParticipantMessageHistory
          v-if="canShowHistory && props.context === 'retreat' && !showHistory"
          :participant-id="recipientId"
          :retreat-id="contextId"
          :visible="false"
          :auto-load="true"
          @count-changed="handleHistoryCountChanged"
          style="display: none;"
        />
        <CommunityMessageHistory
          v-if="canShowHistory && props.context === 'community' && !showHistory"
          :member-id="recipientId"
          :community-id="contextId"
          :visible="false"
          :auto-load="true"
          @count-changed="handleHistoryCountChanged"
          style="display: none;"
        />
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
import { ref, computed, watch, onBeforeUnmount, onUnmounted, markRaw } from 'vue';
import { storeToRefs } from 'pinia';
import { useRetreatStore } from '@/stores/retreatStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useMessageTemplateStore } from '@/stores/messageTemplateStore';
import { useCommunityMessageTemplateStore } from '@/stores/communityMessageTemplateStore';
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
import { useParticipantCommunicationStore, type ParticipantCommunication } from '@/stores/participantCommunicationStore';
import { useCommunityCommunicationStore, type CommunityCommunication } from '@/stores/communityCommunicationStore';
import { getSmtpConfig, sendEmailViaBackend, sendCommunityEmailViaBackend } from '@/services/api';
import ParticipantMessageHistory from './ParticipantMessageHistory.vue';
import CommunityMessageHistory from './CommunityMessageHistory.vue';
import type { Participant, CommunityMember } from '@repo/types';

// Constants
const DRAFT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

interface Props {
	open: boolean;
	context: 'retreat' | 'community';
	participant?: Participant | CommunityMember | null;
	retreatId?: string;
	communityId?: string;
}

interface Emits {
	(e: 'update:open', value: boolean): void;
}

const props = withDefaults(defineProps<Props>(), {
	participant: null,
	retreatId: '',
	communityId: '',
});

const emit = defineEmits<Emits>();

const { toast } = useToast();
const retreatStore = useRetreatStore();
const communityStore = useCommunityStore();
const messageTemplateStore = useMessageTemplateStore();
const communityMessageTemplateStore = useCommunityMessageTemplateStore();
const participantCommunicationStore = useParticipantCommunicationStore();
const communityCommunicationStore = useCommunityCommunicationStore();

const { selectedRetreat } = storeToRefs(retreatStore);
const { currentCommunity } = storeToRefs(communityStore);
const { templates: allMessageTemplates, loading: templatesLoading } = storeToRefs(
	props.context === 'community' ? communityMessageTemplateStore : messageTemplateStore
);

// Reactive state
const isOpen = computed({
	get: () => props.open,
	set: (value) => emit('update:open', value)
});

const sendMethod = ref<'whatsapp' | 'email'>('whatsapp');
const emailSendMethod = ref<'user' | 'backend'>('user');
const emailServerConfigStatus = ref({ configured: false, host: null, user: null });
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
const historyMessageCount = ref(0);
const isUserEditing = ref(false);
let ariaHiddenObserver: MutationObserver | null = null;

// Computed properties
const contextId = computed(() => props.context === 'retreat' ? props.retreatId : props.communityId);
const recipientId = computed(() => {
	if (!props.participant) return '';
	// For community members, use the member ID
	if (props.context === 'community') {
		return (props.participant as CommunityMember).id;
	}
	// For retreat participants, use participant ID
	return (props.participant as Participant).id;
});

const canShowHistory = computed(() => !!recipientId.value && !!contextId.value);

const displayName = computed(() => {
	if (!props.participant) return '';
	const p = props.participant;
	if ('participant' in p && p.participant) {
		// CommunityMember with participant relation
		return `${p.participant.firstName} ${p.participant.lastName}`;
	}
	// Participant or CommunityMember without relation
	if ('firstName' in p) {
		return `${p.firstName} ${p.lastName}`;
	}
	return '';
});

// Contact options computed property
const contactOptions = computed(() => {
	if (!props.participant) return [];

	const p = props.participant;
	const options = [];
	const usedValues = new Set();

	// Get contact data from participant relation if available
	const participantData = 'participant' in p && p.participant ? p.participant : p;

	if (sendMethod.value === 'whatsapp') {
		// Phone options
		const phoneFields = [
			{ key: 'cellPhone', label: 'Teléfono Móvil', desc: 'Teléfono móvil principal' },
			{ key: 'homePhone', label: 'Teléfono Casa', desc: 'Teléfono de casa' },
			{ key: 'workPhone', label: 'Teléfono Trabajo', desc: 'Teléfono del trabajo' },
			{ key: 'emergencyContact1CellPhone', label: 'Contacto Emergencia 1', desc: `Teléfono de ${participantData.emergencyContact1Name || 'Contacto de emergencia 1'}` },
			{ key: 'emergencyContact1HomePhone', label: 'Contacto Emergencia 1 (Casa)', desc: `Teléfono de casa de ${participantData.emergencyContact1Name || 'Contacto de emergencia 1'}` },
			{ key: 'emergencyContact1WorkPhone', label: 'Contacto Emergencia 1 (Trabajo)', desc: `Teléfono de trabajo de ${participantData.emergencyContact1Name || 'Contacto de emergencia 1'}` },
			{ key: 'emergencyContact2CellPhone', label: 'Contacto Emergencia 2', desc: `Teléfono de ${participantData.emergencyContact2Name || 'Contacto de emergencia 2'}` },
			{ key: 'emergencyContact2HomePhone', label: 'Contacto Emergencia 2 (Casa)', desc: `Teléfono de casa de ${participantData.emergencyContact2Name || 'Contacto de emergencia 2'}` },
			{ key: 'emergencyContact2WorkPhone', label: 'Contacto Emergencia 2 (Trabajo)', desc: `Teléfono de trabajo de ${participantData.emergencyContact2Name || 'Contacto de emergencia 2'}` },
			{ key: 'inviterCellPhone', label: 'Teléfono Invitador', desc: `Teléfono de quien invitó: ${participantData.invitedBy || 'Invitador'}` },
			{ key: 'inviterHomePhone', label: 'Teléfono Invitador (Casa)', desc: `Teléfono de casa de quien invitó: ${participantData.invitedBy || 'Invitador'}` },
			{ key: 'inviterWorkPhone', label: 'Teléfono Invitador (Trabajo)', desc: `Teléfono de trabajo de quien invitó: ${participantData.invitedBy || 'Invitador'}` },
		];

		for (const field of phoneFields) {
			const value = (participantData as any)[field.key];
			if (value && !usedValues.has(value)) {
				options.push({ value, label: field.label, description: field.desc });
				usedValues.add(value);
			}
		}
	} else {
		// Email options
		const emailFields = [
			{ key: 'email', label: 'Correo Principal', desc: 'Correo electrónico principal' },
			{ key: 'workEmail', label: 'Correo Trabajo', desc: 'Correo electrónico del trabajo' },
			{ key: 'emergencyContact1Email', label: 'Correo Contacto Emergencia 1', desc: `Correo de ${participantData.emergencyContact1Name || 'Contacto de emergencia 1'}` },
			{ key: 'emergencyContact2Email', label: 'Correo Contacto Emergencia 2', desc: `Correo de ${participantData.emergencyContact2Name || 'Contacto de emergencia 2'}` },
			{ key: 'inviterEmail', label: 'Correo Invitador', desc: `Correo de quien invitó: ${participantData.invitedBy || 'Invitador'}` },
		];

		for (const field of emailFields) {
			const value = (participantData as any)[field.key];
			if (value && !usedValues.has(value)) {
				options.push({ value, label: field.label, description: field.desc });
				usedValues.add(value);
			}
		}
	}

	return options;
});

// Template filtering
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

const relevantTemplates = computed(() => {
	if (templateSearch.value || templateTypeFilter.value !== 'all') {
		return filteredTemplates.value;
	}
	return allMessageTemplates.value || [];
});

// Message preview
const updateMessagePreview = () => {
	if (!selectedTemplate.value || !props.participant) {
		messagePreview.value = '';
		editedMessage.value = '';
		return;
	}

	const template = allMessageTemplates.value.find((t: any) => t.id === selectedTemplate.value);
	if (!template) return;

	// Get participant data
	let participantData: ParticipantData;
	if ('participant' in props.participant && props.participant.participant) {
		participantData = props.participant.participant as ParticipantData;
	} else {
		participantData = props.participant as ParticipantData;
	}

	// Get retreat/community data for variables
	const contextData = props.context === 'retreat'
		? (selectedRetreat.value as RetreatData)
		: {
				name: currentCommunity.value?.name || '',
				parish: currentCommunity.value?.name || '',
				startDate: new Date().toISOString(),
				endDate: new Date().toISOString(),
		  };

	let message = replaceAllVariables(template.message, participantData, contextData);
	messagePreview.value = message;

	// Update editable message based on send method
	isUserEditing.value = false; // Reset edit flag when template changes
	if (sendMethod.value === 'whatsapp') {
		editedMessage.value = convertHtmlToWhatsApp(message);
	} else {
		editedMessage.value = convertHtmlToEmail(message, { format: 'enhanced', skipTemplate: false });
		emailPreviewHtml.value = convertHtmlToEmail(message, {
			format: 'enhanced',
			skipTemplate: false
		});
	}
};

// Functions
const handleEscape = () => {
	if (showHistory.value) {
		showHistory.value = false;
	} else {
		closeDialog();
	}
};

const copyToClipboard = async () => {
	if (!editedMessage.value) return;

	try {
		let contentToCopy = editedMessage.value;
		let description = 'El mensaje ha sido copiado al portapapeles exitosamente.';

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
		toast({
			title: 'Error',
			description: 'No se pudo copiar el mensaje al portapapeles.',
			variant: 'destructive',
		});
	}
};

const handleUserEdit = () => {
	isUserEditing.value = true;
};

const autoSaveMessage = () => {
	if (!editedMessage.value || !selectedTemplate.value || isUserEditing.value) return;

	isAutoSaving.value = true;

	const draftKey = `message-draft-${props.context}-${recipientId.value}-${selectedTemplate.value}`;
	const draftData = {
		message: editedMessage.value,
		sendMethod: sendMethod.value,
		emailSendMethod: emailSendMethod.value,
		selectedContact: selectedContact.value,
		timestamp: new Date().toISOString()
	};

	localStorage.setItem(draftKey, JSON.stringify(draftData));

	setTimeout(() => {
		isAutoSaving.value = false;
	}, 1000);
};

const loadDraft = () => {
	if (!recipientId.value || !selectedTemplate.value) return;

	const draftKey = `message-draft-${props.context}-${recipientId.value}-${selectedTemplate.value}`;
	const draftData = localStorage.getItem(draftKey);

	if (draftData) {
		try {
			const draft = JSON.parse(draftData);
			const draftAge = new Date().getTime() - new Date(draft.timestamp).getTime();
			if (draftAge < DRAFT_EXPIRY_MS) {
				isUserEditing.value = true; // Don't overwrite user's restored draft
				editedMessage.value = draft.message;
				if (draft.sendMethod) sendMethod.value = draft.sendMethod;
				if (draft.emailSendMethod) emailSendMethod.value = draft.emailSendMethod;
				if (draft.selectedContact) selectedContact.value = draft.selectedContact;

				toast({
					title: 'Borrador recuperado',
					description: 'Se ha restaurado un borrador guardado previamente.',
				});
			}
		} catch (error) {
			// Silently fail on draft load errors
		}
	}
};

const checkEmailServerConfig = async (retryCount = 0) => {
	try {
		const config = await getSmtpConfig();
		emailServerConfigStatus.value = config;

		if (config.configured && sendMethod.value === 'whatsapp' && props.open) {
			sendMethod.value = 'email';
			emailSendMethod.value = 'backend';
			if (props.participant) {
				const participantData = 'participant' in props.participant && props.participant.participant
					? props.participant.participant
					: props.participant;
				selectedContact.value = (participantData as any).email || (participantData as any).cellPhone || undefined;
			}
		}
	} catch (error) {
		emailServerConfigStatus.value = { configured: false, host: null, user: null };

		if (retryCount < MAX_RETRY_ATTEMPTS) {
			setTimeout(() => checkEmailServerConfig(retryCount + 1), RETRY_DELAY_MS);
		}
	}
};

const cleanupDrafts = () => {
	if (recipientId.value && selectedTemplate.value) {
		const draftKey = `message-draft-${props.context}-${recipientId.value}-${selectedTemplate.value}`;
		localStorage.removeItem(draftKey);
	}
};

const clearDraft = () => {
	if (!recipientId.value || !selectedTemplate.value) return;

	const draftKey = `message-draft-${props.context}-${recipientId.value}-${selectedTemplate.value}`;
	localStorage.removeItem(draftKey);
};

const validateMessage = () => {
	const errors: string[] = [];

	if (!selectedContact.value) {
		errors.push('Selecciona un contacto');
	}

	if (!selectedTemplate.value) {
		errors.push('Selecciona una plantilla');
	}

	if (!editedMessage.value.trim()) {
		errors.push('El mensaje no puede estar vacío');
	}

	if (sendMethod.value === 'email' && selectedContact.value) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(selectedContact.value)) {
			errors.push('El correo electrónico no tiene un formato válido');
		}
	}

	if (sendMethod.value === 'whatsapp' && selectedContact.value) {
		const phoneRegex = /^\+?[\d\s\-()]+$/;
		if (!phoneRegex.test(selectedContact.value) || selectedContact.value.length < 8) {
			errors.push('El número de teléfono no tiene un formato válido');
		}
	}

	return errors;
};

const copyRichTextToClipboard = async () => {
	if (!editedMessage.value) {
		throw new Error('No se encontró el contenido del email');
	}

	try {
		const htmlContent = editedMessage.value;
		const blob = new Blob([htmlContent], { type: 'text/html' });
		const clipboardItem = new ClipboardItem({ 'text/html': blob });

		await navigator.clipboard.write([clipboardItem]);

		toast({
			title: 'Email copiado al portapapeles',
			description: 'El contenido del email ha sido copiado en formato HTML.',
		});
	} catch (err) {
		// Fallback to plain text
		try {
			const plainText = editedMessage.value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
			await navigator.clipboard.writeText(plainText);

			toast({
				title: 'Texto copiado al portapapeles',
				description: 'El contenido del email ha sido copiado como texto plano.',
			});
		} catch {
			throw new Error('No se pudo copiar al portapapeles');
		}
	}
};

const saveCommunicationToHistory = async (): Promise<void> => {
	try {
		const template = allMessageTemplates.value.find((t: any) => t.id === selectedTemplate.value);
		if (!props.participant) return;
		const participantData = 'participant' in props.participant && props.participant.participant
			? props.participant.participant
			: props.participant;

		if (props.context === 'community') {
			await communityCommunicationStore.createCommunication({
				communityMemberId: recipientId.value,
				communityId: props.communityId!,
				messageType: sendMethod.value,
				recipientContact: selectedContact.value!,
				messageContent: editedMessage.value,
				templateId: selectedTemplate.value,
				templateName: template?.name,
				subject: sendMethod.value === 'email' ? `Mensaje para ${displayName.value}` : undefined
			});
		} else {
			await participantCommunicationStore.createCommunication({
				participantId: (participantData as any).id || recipientId.value,
				retreatId: props.retreatId!,
				messageType: sendMethod.value,
				recipientContact: selectedContact.value!,
				messageContent: editedMessage.value,
				templateId: selectedTemplate.value,
				templateName: template?.name,
				subject: sendMethod.value === 'email' ? `Mensaje para ${displayName.value}` : undefined
			});
		}
	} catch (historyError) {
		// Don't block sending if history save fails
		toast({
			title: 'Advertencia',
			description: 'El mensaje se envió pero no se pudo guardar en el historial.',
			variant: 'warning',
		});
	}
};

const sendMessage = async () => {
	if (!selectedContact.value || !selectedTemplate.value || !props.participant) return;

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
	clearDraft();

	try {
		if (sendMethod.value === 'whatsapp') {
			const messageToSend = convertHtmlToWhatsApp(editedMessage.value);
			await navigator.clipboard.writeText(messageToSend);

			toast({
				title: 'Mensaje copiado al portapapeles',
				description: 'El mensaje ha sido convertido y copiado. Pégalo en WhatsApp.',
			});

			const encodedMessage = encodeURIComponent(messageToSend);
			const whatsappUrl = `https://api.whatsapp.com/send?phone=${selectedContact.value}&text=${encodedMessage}`;

			const tryOpenUrl = (url: string, fallback?: () => void) => {
				try {
					const newWindow = window.open(url, '_blank', 'width=800,height=600');
					if (!newWindow) {
						fallback?.();
					}
				} catch {
					fallback?.();
				}
			};

			tryOpenUrl(whatsappUrl, () => {
				navigator.clipboard.writeText(messageToSend).then(() => {
					toast({
						title: 'Mensaje copiado al portapapeles',
						description: 'Por favor, abre WhatsApp manualmente y pega el mensaje.',
					});
				});
			});

			// Save to history
			await saveCommunicationToHistory();
		} else {
			// Email sending
			const participantData = 'participant' in props.participant && props.participant.participant
				? props.participant.participant
				: props.participant;

			const emailHtml = convertHtmlToEmail(editedMessage.value, participantData);
			const subject = `Mensaje para ${displayName.value}`;
			const textContent = editedMessage.value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

			if (emailSendMethod.value === 'user') {
				const emailContent = {
					to: selectedContact.value,
					subject: subject,
					html: emailHtml,
					text: textContent
				};

				localStorage.setItem('emaus_email_to_send', JSON.stringify(emailContent));
				await copyRichTextToClipboard();

				const emailUrl = `mailto:${encodeURIComponent(selectedContact.value)}?subject=${encodeURIComponent(subject)}`;
				window.open(emailUrl, '_blank');

				// Save to history
				await saveCommunicationToHistory();
			} else {
				// Backend sending
				if (!contextId.value) {
					toast({
						title: 'Error',
						description: `No se ha seleccionado un ${props.context === 'retreat' ? 'retiro' : 'comunidad'}.`,
						variant: 'destructive',
					});
					return;
				}

				if (props.context === 'community') {
					await sendCommunityEmailViaBackend({
						to: selectedContact.value,
						subject: subject,
						html: emailHtml,
						text: textContent,
						communityMemberId: recipientId.value,
						communityId: props.communityId!,
						templateId: selectedTemplate.value,
						templateName: allMessageTemplates.value.find((t: any) => t.id === selectedTemplate.value)?.name
					});
				} else {
					await sendEmailViaBackend({
						to: selectedContact.value,
						subject: subject,
						html: emailHtml,
						text: textContent,
						participantId: (participantData as any).id,
						retreatId: props.retreatId!,
						templateId: selectedTemplate.value,
						templateName: allMessageTemplates.value.find((t: any) => t.id === selectedTemplate.value)?.name
					});
				}

				toast({
					title: 'Email enviado exitosamente',
					description: 'El correo electrónico ha sido enviado automáticamente desde el sistema.',
				});
				// Backend saves history automatically
			}
		}

		closeDialog();
	} catch (error) {
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

const setupAriaHiddenObserver = () => {
	if (ariaHiddenObserver) {
		ariaHiddenObserver.disconnect();
	}

	ariaHiddenObserver = new MutationObserver((mutations) => {
		mutations.forEach((mutation) => {
			if (mutation.type === 'attributes' && mutation.attributeName === 'aria-hidden') {
				const target = mutation.target as HTMLElement;

				if (target.classList.contains('max-w-2xl') ||
						target.closest('.fixed')?.classList.contains('max-w-2xl') ||
						(target.getAttribute('role') === 'dialog' || target.closest('[role="dialog"]'))) {

					const activeElement = document.activeElement;
					if (activeElement && target.contains(activeElement)) {
						target.removeAttribute('aria-hidden');
					}
				}
			}
		});
	});

	ariaHiddenObserver.observe(document.body, {
		attributes: true,
		attributeFilter: ['aria-hidden'],
		subtree: true
	});

	const dialogElements = document.querySelectorAll('.max-w-2xl, [role="dialog"]');
	dialogElements.forEach((element) => {
		const activeElement = document.activeElement;
		if (activeElement && element.contains(activeElement) && element.getAttribute('aria-hidden') === 'true') {
			element.removeAttribute('aria-hidden');
		}
	});
};

const cleanupAriaHiddenObserver = () => {
	if (ariaHiddenObserver) {
		ariaHiddenObserver.disconnect();
		ariaHiddenObserver = null;
	}
};

const closeDialog = () => {
	cleanupAriaHiddenObserver();
	isOpen.value = false;
};

const toggleHistory = () => {
	showHistory.value = !showHistory.value;
};

const handleMessageClick = (message: ParticipantCommunication | CommunityCommunication) => {
	// Future: implement message reuse
};

const handleCopyMessage = async (message: ParticipantCommunication | CommunityCommunication) => {
	try {
		await navigator.clipboard.writeText(message.messageContent);
		toast({
			title: 'Mensaje copiado',
			description: 'El contenido del mensaje ha sido copiado al portapapeles.',
		});
	} catch {
		toast({
			title: 'Error',
			description: 'No se pudo copiar el mensaje.',
			variant: 'destructive',
		});
	}
};

const handleHistoryLoadingChanged = (loading: boolean) => {
	historyComponentLoading.value = loading;
};

const handleHistoryCountChanged = (count: number) => {
	historyMessageCount.value = count;
};

const loadMessageCount = async () => {
	if (recipientId.value && contextId.value) {
		try {
			if (props.context === 'community') {
				await communityCommunicationStore.fetchMemberCommunications(
					recipientId.value,
					{ communityId: contextId.value, limit: 1 }
				);
				historyMessageCount.value = communityCommunicationStore.total;
			} else {
				await participantCommunicationStore.fetchParticipantCommunications(
					recipientId.value,
					{ retreatId: contextId.value, limit: 1 }
				);
				historyMessageCount.value = participantCommunicationStore.total;
			}
		} catch {
			// Silently fail
		}
	}
};

// Watchers
watch(() => props.open, (newValue: boolean) => {
	if (newValue && props.participant) {
		if (emailServerConfigStatus.value.configured) {
			sendMethod.value = 'email';
			emailSendMethod.value = 'backend';
			const participantData = 'participant' in props.participant && props.participant.participant
				? props.participant.participant
				: props.participant;
			selectedContact.value = (participantData as any).email || (participantData as any).cellPhone || undefined;
		} else {
			sendMethod.value = 'whatsapp';
			const participantData = 'participant' in props.participant && props.participant.participant
				? props.participant.participant
				: props.participant;
			selectedContact.value = (participantData as any).cellPhone || (participantData as any).email || undefined;
		}

		selectedTemplate.value = '';
		messagePreview.value = '';
		editedMessage.value = '';
		emailPreviewHtml.value = '';
		activeTab.value = 'edit';
		showHistory.value = false;
		isUserEditing.value = false;

		// Load templates based on context
		if (props.context === 'community' && props.communityId) {
			communityMessageTemplateStore.fetchTemplates(props.communityId);
		} else if (props.context === 'retreat' && props.retreatId) {
			messageTemplateStore.fetchTemplates(props.retreatId);
		}

		checkEmailServerConfig();
		setupAriaHiddenObserver();
		loadMessageCount();

		setTimeout(() => {
			const focusedElement = document.activeElement as HTMLElement;
			if (focusedElement && focusedElement.getAttribute('role') === 'combobox') {
				focusedElement.blur();
			}
		}, 50);
	}
});

watch(selectedTemplate, (newValue: string) => {
	updateMessagePreview();

	if (newValue && sendMethod.value === 'email') {
		setTimeout(() => {
			activeTab.value = 'preview';
		}, 100);
	}

	if (newValue) {
		loadDraft();
	}
});

watch(sendMethod, (newValue: 'whatsapp' | 'email') => {
	if (!props.participant) return;

	const participantData = 'participant' in props.participant && props.participant.participant
		? props.participant.participant
		: props.participant;

	if (newValue === 'whatsapp') {
		selectedContact.value = (participantData as any).cellPhone ||
														(contactOptions.value.length > 0 ? contactOptions.value[0].value : undefined);
	} else {
		selectedContact.value = (participantData as any).email ||
														(contactOptions.value.length > 0 ? contactOptions.value[0].value : undefined);
		checkEmailServerConfig();
	}

	if (messagePreview.value && !isUserEditing.value) {
		if (newValue === 'whatsapp') {
			editedMessage.value = convertHtmlToWhatsApp(messagePreview.value);
			emailPreviewHtml.value = '';
		} else {
			editedMessage.value = convertHtmlToEmail(messagePreview.value, participantData);
			emailPreviewHtml.value = convertHtmlToEmail(messagePreview.value, {
				format: 'enhanced',
				skipTemplate: true
			});
		}
	}

	activeTab.value = 'edit';
});

watch([editedMessage, sendMethod, selectedContact], () => {
	autoSaveMessage();
}, { deep: true });

onUnmounted(() => {
	cleanupDrafts();
});

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
