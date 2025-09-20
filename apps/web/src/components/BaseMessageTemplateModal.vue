<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="max-w-6xl max-h-[90vh] overflow-hidden">
      <DialogHeader>
        <DialogTitle>{{ isEditing ? (t ? t('messageTemplates.dialog.editTitle') : 'Editar Plantilla') : (t ? t('messageTemplates.dialog.newTitle') : 'Nueva Plantilla') }}</DialogTitle>
        <DialogDescription>
          {{ isEditing ? (t ? t('messageTemplates.dialog.editDescription') : 'Edita una plantilla de mensaje existente') : (t ? t('messageTemplates.dialog.createDescription') : 'Crea una nueva plantilla de mensaje') }}
        </DialogDescription>
      </DialogHeader>

      <form @submit.prevent="handleSubmit" class="flex flex-col" style="max-height: calc(90vh - 8rem);">
        <div class="flex flex-1 overflow-hidden" :class="{ 'lg:grid lg:grid-cols-12': showVariablesPanel }">
          <!-- Left Column: Form Fields -->
          <div class="flex-1 space-y-4 overflow-y-auto p-1" :class="{ 'lg:col-span-7': showVariablesPanel, 'lg:col-span-12': !showVariablesPanel }">
            <!-- Name Field -->
            <div class="space-y-2">
              <Label for="name">{{ t ? t('messageTemplates.dialog.nameLabel') : 'Nombre de la Plantilla' }}</Label>
              <Input id="name" v-model="formData.name" :placeholder="t ? t('messageTemplates.dialog.nameLabel') : 'Nombre de la Plantilla'" />
            </div>

            <!-- Type Field -->
            <div class="space-y-2">
              <Label for="type">{{ t ? t('messageTemplates.dialog.typeLabel') : 'Tipo de Mensaje' }}</Label>
              <Select v-model="formData.type">
                <SelectTrigger>
                  <SelectValue :placeholder="t ? t('messageTemplates.dialog.typePlaceholder') : 'Selecciona un tipo'" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="type in availableTypes" :key="type" :value="type">
                    {{ getTypeLabel(type) }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- Active Status (only for global templates and when editing) -->
            <div v-if="isGlobal && isEditing" class="space-y-2">
              <div class="flex items-center space-x-2">
                <input
                  id="isActive"
                  v-model="formData.isActive"
                  type="checkbox"
                  class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
                <Label for="isActive">Plantilla activa</Label>
              </div>
            </div>

            <!-- Message Field with Tabs -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <Label>{{ t ? t('messageTemplates.dialog.messageLabel') : 'Mensaje' }}</Label>
                <div class="flex items-center gap-2">
                  <!-- Export Buttons -->
                  <div class="flex items-center gap-1">
                    <!-- Format Button - only visible in HTML tab -->
                    <Button
                      v-if="activeTab === 'html'"
                      type="button"
                      variant="outline"
                      size="sm"
                      @click="formData.message = beautifyHtml(formData.message)"
                      title="Formatear HTML"
                      class="text-xs"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
                      </svg>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      @click="exportToWhatsApp"
                      title="Exportar para WhatsApp"
                    >
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413"/>
                      </svg>
                    </Button>
                    <Select v-model="emailFormat">
                      <SelectTrigger class="w-32">
                        <SelectValue placeholder="Formato Email" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basic">Básico</SelectItem>
                        <SelectItem value="enhanced">Mejorado</SelectItem>
                        <SelectItem value="outlook">Outlook</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      @click="downloadHtmlFile"
                      title="Descargar HTML"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                      </svg>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      @click="exportToEmail"
                      title="Exportar para Email"
                    >
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2m0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                      </svg>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      @click="handleCopyRichTextToClipboard"
                      title="Copiar al portapapeles"
                    >
                      <Copy class="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      @click="showEmailPreview = !showEmailPreview; generateEmailPreview()"
                      :class="{ 'bg-primary text-primary-foreground': showEmailPreview }"
                      title="Vista Previa Email"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                      </svg>
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    @click="showVariablesPanel = !showVariablesPanel"
                    :class="{ 'bg-primary text-primary-foreground': showVariablesPanel }"
                  >
                    <ChevronRight v-if="!showVariablesPanel" class="w-4 h-4 mr-1" />
                    <ChevronLeft v-else class="w-4 h-4 mr-1" />
                    {{ showVariablesPanel ? (t ? t('common.actions.hide') : 'Ocultar') : (t ? t('common.actions.show') : 'Mostrar') }} Variables
                  </Button>
                </div>
              </div>

              <Tabs v-model="activeTab" class="w-full">
                <TabsList :class="['grid w-full', showEmailPreview ? 'grid-cols-4' : 'grid-cols-3']">
                  <TabsTrigger value="edit">{{ t ? t('common.edit') : 'Editar' }}</TabsTrigger>
                  <TabsTrigger value="html">HTML</TabsTrigger>
                  <TabsTrigger value="preview">{{ t ? t('messageTemplates.dialog.preview') : 'Vista Previa' }}</TabsTrigger>
                  <TabsTrigger value="email-preview" v-if="showEmailPreview">Email Preview</TabsTrigger>
                </TabsList>

                <TabsContent value="edit" class="space-y-2">
                  <!-- Rich Text Editor (always HTML) -->
                  <div>
                    <RichTextEditor
                      ref="richTextEditorRef"
                      v-model="formData.message"
                      :placeholder="t ? t('messageTemplates.dialog.messageLabel') : 'Escribe el mensaje aquí. Puedes usar variables como {participant.nickname}, {retreat.startDate}, etc.'"
                      :t="t"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="html" class="space-y-2">
                  <!-- HTML Source Editor -->
                  <div>
                    <Textarea
                      v-model="formData.message"
                      :placeholder="t ? t('messageTemplates.dialog.htmlPlaceholder') : 'Escribe el código HTML aquí...'"
                      class="w-full resize-y rounded-md border border-input bg-muted/50 px-3 py-2 text-sm overflow-y-auto min-h-[300px] max-h-[600px]"
                      @input="syncFromHtmlEditor"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="preview" class="space-y-2">
                  <!-- Participant Selector for Preview (retreat-specific) -->
                  <div v-if="!isGlobal && (participants?.length || 0) > 0" class="grid grid-cols-2 gap-4">
                    <!-- Walkers Selector -->
                    <div class="space-y-2">
                      <Label class="text-sm font-medium">{{ t ? t('participants.title') : 'Participantes' }}</Label>
                      <Select v-model="selectedParticipant">
                        <SelectTrigger>
                          <SelectValue :placeholder="t ? t('messageTemplates.dialog.participantPlaceholder') : 'Selecciona un participante'" />
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
                      <Label class="text-sm font-medium">{{ t ? t('sidebar.servers') : 'Servidores' }}</Label>
                      <Select v-model="selectedParticipant">
                        <SelectTrigger>
                          <SelectValue :placeholder="t ? t('messageTemplates.dialog.participantPlaceholder') : 'Selecciona un servidor'" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem v-for="participant in servers" :key="participant.id" :value="participant.id">
                            {{ participant.name }}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div class="w-full resize-y rounded-md border border-input bg-muted/50 px-3 py-2 text-sm overflow-y-auto min-h-[300px] max-h-[600px]" style="height: 160px;">
                    <div v-if="previewMessage" class="preview-content" v-html="previewMessage">
                    </div>
                    <div v-else-if="!isGlobal && !selectedParticipant" class="text-muted-foreground italic text-center py-8">
                      {{ t ? t('messageTemplates.dialog.selectParticipant') : 'Selecciona un participante para ver la vista previa' }}
                    </div>
                    <div v-else class="text-muted-foreground italic">
                      {{ t ? t('messageTemplates.dialog.previewPlaceholder') : 'Escribe un mensaje para ver la vista previa' }}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="email-preview" v-if="showEmailPreview" class="space-y-2">
                  <div class="space-y-2">
                    <div class="flex items-center justify-between">
                      <Label class="text-sm font-medium">Formato: {{ emailFormat === 'basic' ? 'Básico' : emailFormat === 'enhanced' ? 'Mejorado' : 'Outlook' }}</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        @click="generateEmailPreview"
                      >
                        Actualizar Preview
                      </Button>
                    </div>
                    <div class="w-full resize-y rounded-md border border-input bg-muted/50 px-3 py-2 text-sm overflow-y-auto min-h-[300px] max-h-[600px]" style="height: 400px;">
                      <div v-if="emailPreviewHtml" class="email-preview-content" v-html="emailPreviewHtml">
                      </div>
                      <div v-else class="text-muted-foreground italic text-center py-8">
                        Haz clic en "Actualizar Preview" para generar la vista previa del email
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <!-- Right Column: Variables -->
          <div v-if="showVariablesPanel" class="lg:block lg:col-span-5 border-l pl-6 ml-6">
            <div class="space-y-4 h-full flex flex-col">
              <div class="flex items-center justify-between">
                <h3 class="text-lg font-semibold">{{ t ? t('messageTemplates.dialog.variablesTitle') : 'Variables' }}</h3>
                <div class="text-xs text-muted-foreground">
                  {{ t ? t('common.click') : 'Haz clic' }} para insertar
                </div>
              </div>

              <div class="flex-1 overflow-hidden flex flex-col space-y-4" style="max-height: calc(100vh - 300px);">
                <!-- Search and Filter -->
                <div class="space-y-3">
                  <div class="relative">
                    <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      v-model="searchQuery"
                      :placeholder="t ? t('messageTemplates.dialog.searchPlaceholder') : 'Buscar variables...'"
                      class="pl-10"
                    />
                  </div>

                  <Select v-model="selectedCategory">
                    <SelectTrigger>
                      <SelectValue :placeholder="t ? t('messageTemplates.dialog.categoryAll') : 'Todas las categorías'" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{{ t ? t('messageTemplates.dialog.categoryAll') : 'Todas las categorías' }}</SelectItem>
                      <SelectItem value="mostUsed">{{ t ? t('messageTemplates.dialog.mostUsed') : 'Más usadas' }}</SelectItem>
                      <SelectItem value="participant">{{ t ? t('messageTemplates.dialog.categories.participant') : 'Participante' }}</SelectItem>
                      <SelectItem value="retreat">{{ t ? t('messageTemplates.dialog.categories.retreat') : 'Retiro' }}</SelectItem>
                      <SelectItem value="user">{{ t ? t('messageTemplates.dialog.categories.user') : 'Usuario' }}</SelectItem>
                      <SelectItem value="custom">{{ t ? t('messageTemplates.dialog.categories.custom') : 'Personalizadas' }}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <!-- Most Used Variables -->
                <div v-if="!searchQuery && (selectedCategory === 'all' || selectedCategory === 'mostUsed')">
                  <h4 class="font-medium text-sm text-foreground mb-2">{{ t ? t('messageTemplates.dialog.mostUsed') : 'Más usadas' }}</h4>
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
                          @click.stop="copyVariableToClipboard(variable.value, $event)"
                          class="h-6 w-6 p-0"
                          :title="t ? t('messageTemplates.dialog.copyVariable') : 'Copiar variable'"
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
                    {{ t ? t('common.noResults') : 'No se encontraron variables' }}
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
                              @click.stop="copyVariableToClipboard(variable.value, $event)"
                              class="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              :title="t ? t('messageTemplates.dialog.copyVariable') : 'Copiar variable'"
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
          <Button type="button" variant="secondary" @click="close">
            {{ t ? t('common.actions.cancel') : 'Cancelar' }}
          </Button>
          <Button type="submit" :disabled="loading || !isFormValid">
            {{ loading ? 'Guardando...' : (isEditing ? (t ? t('common.update') : 'Actualizar') : (t ? t('common.save') : 'Crear')) }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@repo/ui';
import { Button } from '@repo/ui';
import { Input } from '@repo/ui';
import { Label } from '@repo/ui';
import { Textarea } from '@repo/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';
import { Badge } from '@repo/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui';
import { ScrollArea } from '@repo/ui';
import { Search, Copy, ChevronLeft, ChevronRight, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, RemoveFormatting } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useGlobalMessageTemplateStore } from '@/stores/globalMessageTemplateStore';
import { useMessageTemplateStore } from '@/stores/messageTemplateStore';
import { useRetreatStore } from '@/stores/retreatStore';
import RichTextEditor from './RichTextEditor.vue';
import { messageTemplateTypes } from '@repo/types';
import { convertHtmlToWhatsApp, convertHtmlToEmail, detectEmailClient, copyRichTextToClipboard, testEmojiConversion, beautifyHtml } from '@/utils/message';

interface Props {
  open: boolean;
  template?: {
    id?: string;
    name?: string;
    type?: string;
    message?: string;
    isActive?: boolean;
    [key: string]: any;
  } | null;
  isGlobal?: boolean;
  participants?: Array<{
    id: string;
    name: string;
    type: string;
    // Add other participant fields as needed
  }>;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:open': [value: boolean];
  saved: [];
}>();

const { t } = useI18n();
const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value)
});

const globalMessageTemplateStore = useGlobalMessageTemplateStore();
const messageTemplateStore = useMessageTemplateStore();
const retreatStore = useRetreatStore();

const loading = ref(false);
const showVariablesPanel = ref(true);
const searchQuery = ref('');
const selectedCategory = ref('all');
const activeTab = ref('edit');
const emailFormat = ref<'basic' | 'enhanced' | 'outlook'>('enhanced');

// Auto-detect email client on component mount
const detectAndSetEmailFormat = () => {
  const detectedFormat = detectEmailClient();
  if (detectedFormat === 'basic' || detectedFormat === 'enhanced' || detectedFormat === 'outlook') {
    emailFormat.value = detectedFormat;
  }
};
const showEmailPreview = ref(false);
const emailPreviewHtml = ref('');
const richTextEditorRef = ref<InstanceType<typeof RichTextEditor> | null>(null);
const selectedParticipant = ref('');

const formData = ref({
  name: '',
  type: '',
  message: '',
  isActive: true,
});

// Available types based on template type
const availableTypes = computed(() => {
  if (props.isGlobal) {
    return [
      'WALKER_WELCOME',
      'SERVER_WELCOME',
      'EMERGENCY_CONTACT_VALIDATION',
      'PALANCA_REQUEST',
      'PALANCA_REMINDER',
      'GENERAL',
      'PRE_RETREAT_REMINDER',
      'PAYMENT_REMINDER',
      'POST_RETREAT_MESSAGE',
      'CANCELLATION_CONFIRMATION',
      'USER_INVITATION',
      'PASSWORD_RESET',
      'RETREAT_SHARED_NOTIFICATION',
      'BIRTHDAY_MESSAGE',
    ];
  } else {
    return messageTemplateTypes.options;
  }
});

// Type labels based on template type
const typeLabels = computed(() => {
  if (props.isGlobal) {
    return {
      WALKER_WELCOME: 'Bienvenida Caminante',
      SERVER_WELCOME: 'Bienvenida Servidor',
      EMERGENCY_CONTACT_VALIDATION: 'Validación Contacto de Emergencia',
      PALANCA_REQUEST: 'Solicitud de Palanca',
      PALANCA_REMINDER: 'Recordatorio de Palanca',
      GENERAL: 'Mensaje General',
      PRE_RETREAT_REMINDER: 'Recordatorio Pre-Retiro',
      PAYMENT_REMINDER: 'Recordatorio de Pago',
      POST_RETREAT_MESSAGE: 'Mensaje Post-Retiro',
      CANCELLATION_CONFIRMATION: 'Confirmación de Cancelación',
      USER_INVITATION: 'Invitación de Usuario',
      PASSWORD_RESET: 'Restablecimiento de Contraseña',
      RETREAT_SHARED_NOTIFICATION: 'Notificación de Retiro Compartido',
      BIRTHDAY_MESSAGE: 'Mensaje de Cumpleaños',
    };
  } else {
    const labels: Record<string, string> = {};
    messageTemplateTypes.options.forEach(type => {
      labels[type] = t ? t(`messageTemplates.types.${type}`) : type;
    });
    return labels;
  }
});

const isEditing = computed(() => !!props.template);

const isFormValid = computed(() => {
  const hasName = formData.value.name.trim();
  const hasType = formData.value.type;
  const hasMessage = formData.value.message.trim();

  return hasName && hasType && hasMessage;
});

const messageCharCount = computed(() => formData.value.message?.length || 0);

const usedVariables = computed(() => {
  const message = formData.value.message || '';
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

// Participant variables with i18n support
const participantVariables = computed(() => [
  { key: 'nickname', label: t ? t('participants.fields.nickname') : 'Apodo' },
  { key: 'firstName', label: t ? t('participants.fields.firstName') : 'Nombre' },
  { key: 'lastName', label: t ? t('participants.fields.lastName') : 'Apellido' },
  { key: 'hora_llegada', label: 'Hora de llegada' },
  { key: 'type', label: t ? t('participants.fields.type') : 'Tipo' },
  { key: 'cellPhone', label: t ? t('participants.fields.cellPhone') : 'Teléfono' },
  { key: 'email', label: t ? t('participants.fields.email') : 'Email' },
]);

const retreatVariables = computed(() => [
  { key: 'startDate', label: t ? t('messageTemplates.dialog.variables.retreatStartDate') : 'Fecha de inicio' },
  { key: 'endDate', label: t ? t('messageTemplates.dialog.variables.retreatEndDate') : 'Fecha de fin' },
  { key: 'name', label: t ? t('messageTemplates.dialog.variables.retreatParish') : 'Nombre del retiro' },
  { key: 'cost', label: t ? t('messageTemplates.dialog.variables.retreatCost') : 'Costo' },
  { key: 'paymentInfo', label: t ? t('messageTemplates.dialog.variables.retreatPaymentInfo') : 'Información de pago' },
  { key: 'thingsToBringNotes', label: t ? t('messageTemplates.dialog.variables.retreatThingsToBringNotes') : 'Cosas para traer' },
  { key: 'fecha_limite_palanca', label: 'Fecha límite de palanca' },
  { key: 'next_meeting_date', label: 'Próxima reunión' },
]);

const userVariables = computed(() => [
  { key: 'name', label: t ? t('messageTemplates.dialog.categories.user') : 'Nombre de usuario' },
]);

const customVariables = computed(() => [
  { key: 'custom_message', label: 'Mensaje personalizado' },
  { key: 'inviterName', label: 'Nombre del invitador' },
  { key: 'shareLink', label: 'Enlace para compartir' },
  { key: 'resetToken', label: 'Token de restablecimiento' },
]);

const mostUsedVariables = computed(() => [
  { value: '{participant.nickname}', label: t ? t('participants.fields.nickname') : 'Apodo' },
  { value: '{participant.firstName}', label: t ? t('participants.fields.firstName') : 'Nombre' },
  { value: '{retreat.startDate}', label: t ? t('messageTemplates.dialog.variables.retreatStartDate') : 'Fecha de inicio' },
  { value: '{retreat.name}', label: t ? t('messageTemplates.dialog.variables.retreatParish') : 'Nombre del retiro' },
  { value: '{retreat.cost}', label: t ? t('messageTemplates.dialog.variables.retreatCost') : 'Costo' },
]);

const variableCategories = computed(() => [
  {
    id: 'participant',
    title: t ? t('messageTemplates.dialog.categories.participant') : 'Participante',
    variables: participantVariables.value.map(v => ({
      value: `{participant.${v.key}}`,
      label: v.label,
      category: 'participant'
    }))
  },
  {
    id: 'retreat',
    title: t ? t('messageTemplates.dialog.categories.retreat') : 'Retiro',
    variables: retreatVariables.value.map(v => ({
      value: `{retreat.${v.key}}`,
      label: v.label,
      category: 'retreat'
    }))
  },
  {
    id: 'user',
    title: t ? t('messageTemplates.dialog.categories.user') : 'Usuario',
    variables: userVariables.value.map(v => ({
      value: `{user.${v.key}}`,
      label: v.label,
      category: 'user'
    }))
  },
  {
    id: 'custom',
    title: t ? t('messageTemplates.dialog.categories.custom') : 'Personalizadas',
    variables: customVariables.value.map(v => ({
      value: `{${v.key}}`,
      label: v.label,
      category: 'custom'
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

// Computed properties for participant preview
const walkers = computed(() => (props.participants || []).filter(p => p.type.toLowerCase() === 'walker'));
const servers = computed(() => (props.participants || []).filter(p => p.type.toLowerCase() === 'server'));

const selectedParticipantData = computed(() => {
  return (props.participants || []).find(p => p.id === selectedParticipant.value) || null;
});

const previewMessage = computed(() => {
  let message = formData.value.message;

  if (!props.isGlobal && selectedParticipantData.value) {
    // Real participant data preview
    const participant = selectedParticipantData.value;
    const participantReplacements = {
      'participant.nickname': (participant as any).nickname || '',
      'participant.firstName': (participant as any).firstName || '',
      'participant.lastName': (participant as any).lastName || '',
      'participant.type': participant.type || '',
      'participant.cellPhone': (participant as any).cellPhone || '',
      'participant.email': (participant as any).email || '',
      'participant.hora_llegada': '3:00 PM', // Default value
    };

    Object.entries(participantReplacements).forEach(([key, value]) => {
      message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    });
  } else {
    // Sample data preview
    const replacements = {
      '{participant.nickname}': 'Juan Pérez',
      '{participant.firstName}': 'Juan',
      '{participant.lastName}': 'Pérez',
      '{participant.hora_llegada}': '3:00 PM',
      '{participant.type}': 'WALKER',
      '{participant.cellPhone}': '123-456-7890',
      '{participant.email}': 'juan@example.com',
    };

    Object.entries(replacements).forEach(([key, value]) => {
      message = message.replace(new RegExp(key, 'g'), value);
    });
  }

  // Retreat variables
  const retreat = retreatStore.selectedRetreat;
  const retreatReplacements = {
    '{retreat.startDate}': retreat?.startDate ? new Date(retreat.startDate).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }) : '15 de marzo de 2024',
    '{retreat.endDate}': retreat?.endDate ? new Date(retreat.endDate).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }) : '17 de marzo de 2024',
    '{retreat.name}': retreat?.parish || 'Parroquia San José',
    '{retreat.cost}': retreat?.cost || '50',
    '{retreat.paymentInfo}': retreat?.paymentInfo || 'Transferencia bancaria',
    '{retreat.thingsToBringNotes}': retreat?.thingsToBringNotes || 'Ropa cómoda, Biblia, cuaderno',
    '{retreat.fecha_limite_palanca}': '10 de marzo de 2024',
    '{retreat.next_meeting_date}': (retreat as any).next_meeting_date || '22 de marzo de 2024',
  };

  Object.entries(retreatReplacements).forEach(([key, value]) => {
    message = message.replace(new RegExp(key, 'g'), value);
  });

  // User and custom variables
  const customReplacements = {
    '{user.name}': 'María González',
    '{custom_message}': 'Este es un mensaje personalizado',
    '{inviterName}': 'Carlos López',
    '{shareLink}': 'https://ejemplo.com/invitacion',
    '{resetToken}': 'https://ejemplo.com/reset-password',
  };

  Object.entries(customReplacements).forEach(([key, value]) => {
    message = message.replace(new RegExp(key, 'g'), value);
  });

  return message;
});

const getTypeLabel = (type: string) => {
  return typeLabels.value[type] || type;
};

// Initialize form data
watch(
  () => props.template,
  (template, oldTemplate) => {
    console.log('Template watcher triggered:', { template, oldTemplate });
    if (template) {
      console.log('Setting form data from template');
      detectAndSetEmailFormat(); // Auto-detect email format when template changes
      formData.value = {
        name: (template as any).name || '',
        type: (template as any).type || '',
        message: (template as any).message || '',
        isActive: (template as any).isActive ?? true,
      };
    } else {
      console.log('Resetting form data - no template');
      formData.value = {
        name: '',
        type: '',
        message: '',
        isActive: true,
      };
    }
  },
  { immediate: true }
);

// Beautify HTML when switching to HTML tab
watch(
  activeTab,
  (newTab, oldTab) => {
    if (newTab === 'html' && oldTab !== 'html' && formData.value.message) {
      // Beautify HTML when switching to HTML tab from another tab
      formData.value.message = beautifyHtml(formData.value.message);
    }
  }
);

// Reset form when dialog is opened/closed
watch(
  () => props.open,
  (open) => {
    if (open) {
      showVariablesPanel.value = true;
      searchQuery.value = '';
      selectedCategory.value = 'all';
      activeTab.value = 'edit';
      // Auto-select first walker for retreat-specific templates
      if (!props.isGlobal && props.participants && props.participants.length > 0) {
        const firstWalker = walkers.value[0];
        selectedParticipant.value = firstWalker ? firstWalker.id : '';
      }
    }
  }
);

const insertVariable = (variable: string) => {
  if (richTextEditorRef.value) {
    // Use rich text editor's insertVariable method
    richTextEditorRef.value.insertVariable(variable);
  }
};

const syncFromHtmlEditor = () => {
  // This function ensures that when editing HTML directly,
  // the rich text editor stays in sync if we switch back to it
  // The v-model binding handles the actual synchronization
};

const exportToWhatsApp = () => {
  const message = formData.value.message;
  if (!message) return;

  // Debug: Test original message
  //console.log('Original message:', message);
  testEmojiConversion(message);

  // Convert HTML to WhatsApp-friendly format
  const whatsappMessage = convertHtmlToWhatsApp(message);

  // Debug: Test converted message
  //console.log('WhatsApp message:', whatsappMessage);
  testEmojiConversion(whatsappMessage);

  // Using WhatsApp's send endpoint for best compatibility
  const encodedMessage = encodeURIComponent(whatsappMessage);
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedMessage}`;

  console.log('WhatsApp URL:', whatsappUrl);
  console.log('WhatsApp text:', whatsappMessage);

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
    navigator.clipboard.writeText(whatsappMessage).then(() => {
      alert('Mensaje copiado al portapapeles. Por favor, abre WhatsApp manualmente y pega el mensaje.');
    }).catch(() => {
      alert('No se pudo abrir WhatsApp. Por favor, copia el mensaje manualmente:\n\n' + whatsappMessage);
    });
  });
};

const generateEmailPreview = () => {
  const message = formData.value.message;
  if (!message) return;

  // Convert HTML to email format
  emailPreviewHtml.value = convertHtmlToEmail(message, {
    format: emailFormat.value,
    includeJavaScript: true,
    preserveStyles: true
  });
};

const downloadHtmlFile = () => {
  const message = formData.value.message;
  if (!message) return;

  // Convert HTML to email format
  const emailHtml = convertHtmlToEmail(message, {
    format: emailFormat.value,
    includeJavaScript: true,
    preserveStyles: true
  });

  // Create blob and download link
  const blob = new Blob([emailHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${formData.value.name || 'email'}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const exportToEmail = async () => {
  const message = formData.value.message;
  if (!message) return;

  // Convert HTML to email format
  const emailHtml = convertHtmlToEmail(message, {
    format: emailFormat.value,
    includeJavaScript: true,
    preserveStyles: true
  });

  // Convert HTML to plain text for the email body
  const plainText = convertHtmlToWhatsApp(message);

  // Create email subject
  const subject = encodeURIComponent(formData.value.name || 'Mensaje de Emaús');

  // Create email body with plain text and note about HTML version
  const body = encodeURIComponent(`${plainText}\n\n---\nEste mensaje incluye formato HTML. Se ha generado una versión HTML completa que puedes descargar como archivo adjunto.`);

  // Create mailto URL with shorter content
  const emailUrl = `mailto:?subject=${subject}&body=${body}`;

  console.log('Attempting to open email client with URL (length:', emailUrl.length, 'characters)');

  // Store HTML in localStorage as primary fallback
  try {
    localStorage.setItem('emaus_email_html', emailHtml);
    console.log('HTML version stored in localStorage');
  } catch (e) {
    console.log('Failed to store in localStorage:', e);
  }

  // Copy HTML to clipboard
  try {
    await copyRichTextToClipboard(emailHtml);
    console.log('HTML copied to clipboard');
  } catch (e) {
    console.log('Failed to copy to clipboard:', e);
  }

  // Open email client first
  const emailWindow = window.open(emailUrl, '_self');

  if (emailWindow) {
    console.log('Email client opened successfully');
    // Show user instructions after a short delay
    setTimeout(() => {
      showEmailInstructions();
    }, 1500);
  } else {
    // Fallback if window.open fails
    try {
      const link = document.createElement('a');
      link.href = emailUrl;
      link.target = '_self';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      console.log('Link click method attempted');
      setTimeout(() => {
        showEmailInstructions();
      }, 1500);
    } catch (e) {
      console.log('Link click method failed:', e);
      // Final fallback
      window.location.href = emailUrl;
      setTimeout(() => {
        showEmailInstructions();
      }, 1500);
    }
  }
};

const handleCopyRichTextToClipboard = async () => {
  //console.log('🚀 handleCopyRichTextToClipboard called!');
  const message = formData.value.message;
  if (!message) {
    console.log('❌ No message content to copy');
    return;
  }

  try {
    console.log('📋 Starting clipboard copy with message length:', message.length);

    // Store HTML in localStorage for the dynamic button to access
    localStorage.setItem('emaus_email_html', message);
    console.log('✅ HTML stored in localStorage');

    // Call the imported utility function
    const result = await copyRichTextToClipboard(message);
    console.log('📋 Clipboard result:', result);

    if (result.success) {
      console.log('✅ Clipboard copy successful:', result.format);
    } else {
      console.error('❌ Clipboard copy failed:', result.message);
    }
  } catch (error) {
    console.error('❌ Error in handleCopyRichTextToClipboard:', error);
  }
};

const showEmailInstructions = () => {
  const instructions = `
¡Email iniciado!

Para obtener la versión HTML completa del mensaje:

1. COPIAR HTML (recomendado):
   • Haz clic en el botón "Copiar HTML" que aparecerá
   • Pega el contenido en tu email client

2. DESCARGAR ARCHIVO:
   • Usa el botón "Descargar HTML"
   • Adjunta el archivo a tu email

3. VISTA PREVIA:
   • Usa la pestaña "Email Preview" para ver cómo se verá

4. ALMACENAMIENTO LOCAL:
   • El HTML está guardado en el navegador
   • Pégalo manualmente si es necesario

El email básico ya está abierto en tu cliente de correo.
  `;

  // Show instructions
  alert(instructions.trim());
};

const copyVariableToClipboard = async (variable: string, event: Event) => {
  try {
    await navigator.clipboard.writeText(variable);
    event.stopPropagation();
  } catch (err) {
    console.error('Error al copiar variable:', err);
  }
};

// Removed unused exportToClipboard function - functionality moved to enhanced clipboard button

const close = () => {
  isOpen.value = false;
};

const handleSubmit = async () => {
  if (!isFormValid.value) return;

  loading.value = true;

  // Debug: Log the form data being submitted
  console.log('Submitting form data:', JSON.stringify(formData.value, null, 2));

  try {
    if (props.isGlobal) {
      // Global template
      if (props.template && (props.template as any).id) {
        await globalMessageTemplateStore.update((props.template as any).id, formData.value);
      } else {
        await globalMessageTemplateStore.create(formData.value);
      }
    } else {
      // Retreat-specific template
      if (!retreatStore.selectedRetreatId) {
        alert(t ? t('messageTemplates.dialog.selectRetreatFirst') : 'Por favor selecciona un retiro primero');
        return;
      }

      const templateData = {
        ...formData.value,
        retreatId: retreatStore.selectedRetreatId,
      };

      if (props.template && (props.template as any).id) {
        const templateId = (props.template as any).id;
        await messageTemplateStore.updateTemplate(templateId as string, templateData as any);
      } else {
        await messageTemplateStore.createTemplate(templateData as any);
      }
    }
    emit('saved');
    close();
  } catch (error) {
    console.error('Error saving template:', error);
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.preview-content {
  font-size: 11px;
  line-height: 1.6;
}

.preview-content :deep(ul) {
  padding-left: 20px;
  margin: 8px 0;
  list-style-type: disc;
}

.preview-content :deep(ol) {
  padding-left: 20px;
  margin: 8px 0;
  list-style-type: decimal;
}

.preview-content :deep(li) {
  margin: 4px 0;
}

.preview-content :deep(p) {
  margin: 0 0 8px 0;
}

.preview-content :deep(h1) {
  font-size: 1.5em;
  font-weight: bold;
  margin: 16px 0 8px 0;
}

.preview-content :deep(h2) {
  font-size: 1.3em;
  font-weight: bold;
  margin: 12px 0 4px 0;
}

.preview-content :deep(h3) {
  font-size: 1.1em;
  font-weight: bold;
  margin: 8px 0 4px 0;
}

.preview-content :deep(blockquote) {
  border-left: 3px solid hsl(var(--border));
  padding-left: 12px;
  margin: 8px 0;
  color: hsl(var(--muted-foreground));
  background-color: hsl(var(--muted) / 0.5);
}

.preview-content :deep(strong) {
  font-weight: bold;
}

.preview-content :deep(em) {
  font-style: italic;
}

.preview-content :deep(u) {
  text-decoration: underline;
}

.preview-content :deep(s) {
  text-decoration: line-through;
}

.preview-content :deep(a) {
  color: hsl(var(--primary));
  text-decoration: underline;
}

.preview-content :deep(code) {
  background-color: hsl(var(--muted) / 0.5);
  padding: 2px 4px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.9em;
}

.preview-content :deep(pre) {
  background-color: hsl(var(--muted) / 0.3);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 8px 0;
}

.preview-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}

.preview-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
}

.preview-content :deep(th),
.preview-content :deep(td) {
  border: 1px solid hsl(var(--border));
  padding: 8px;
  text-align: left;
}

.preview-content :deep(th) {
  background-color: hsl(var(--muted) / 0.5);
  font-weight: bold;
}

.preview-content :deep(.text-left) {
  text-align: left;
}

.preview-content :deep(.text-center) {
  text-align: center;
}

.preview-content :deep(.text-right) {
  text-align: right;
}

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