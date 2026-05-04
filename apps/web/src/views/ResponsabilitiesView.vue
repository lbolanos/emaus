<template>
  <div class="h-full flex flex-col">
    <!-- Sticky Header -->
    <div class="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-2 sm:p-3 lg:p-4 border-b">
      <div class="sm:flex sm:items-center sm:justify-between gap-4">
        <div class="sm:flex-auto">
          <h1 class="text-[20px] font-bold leading-6 text-gray-900 dark:text-white">{{ $t('responsibilities.title') }}</h1>
          <p class="mt-1 text-[10px] text-gray-700 dark:text-gray-300">{{ $t('responsibilities.description') }}</p>
        </div>

        <div class="flex items-center gap-2 mt-4 sm:mt-0">
          <!-- Search -->
          <Input
            v-model="searchQuery"
            :placeholder="$t('responsibilities.searchPlaceholder')"
            class="w-64"
          />

          <!-- Column Selector -->
          <Select v-model="columnCount">
            <SelectTrigger class="w-[140px]">
              <LayoutGrid class="h-4 w-4 mr-2" />
              <SelectValue :placeholder="$t('tables.columns')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 {{ $t('tables.columns') }}</SelectItem>
              <SelectItem value="3">3 {{ $t('tables.columns') }}</SelectItem>
              <SelectItem value="4">4 {{ $t('tables.columns') }}</SelectItem>
            </SelectContent>
          </Select>

          <!-- Create Button -->
          <Button variant="outline" size="sm" @click="openAddEditModal(null)">
            <Plus class="h-4 w-4 mr-1" />
            {{ $t('responsibilities.createResponsability') }}
          </Button>

          <!-- Actions Menu -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="icon">
                <MoreVertical class="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem @click="handleExport" :disabled="isExporting">
                <Download v-if="!isExporting" class="mr-2 h-4 w-4" />
                <Loader2 v-else class="mr-2 h-4 w-4 animate-spin" />
                {{ isExporting ? $t('responsibilities.exporting') : $t('responsibilities.exportDocx') }}
              </DropdownMenuItem>
              <DropdownMenuItem @click="handlePrint">
                <Printer class="mr-2 h-4 w-4" />
                {{ $t('responsibilities.print') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>

    <!-- Stats Bar + Filter Tabs -->
    <div class="sticky top-[60px] z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-2 sm:px-3 lg:px-4 py-2 border-b">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4 text-sm">
          <span class="text-gray-600 dark:text-gray-400">
            {{ $t('responsibilities.totalResponsibilities') }}: <strong>{{ responsibilities.length }}</strong>
          </span>
          <span class="text-green-600 dark:text-green-400">
            {{ $t('responsibilities.assignedCount') }}: <strong>{{ assignedCount }}</strong>
          </span>
          <span class="text-amber-600 dark:text-amber-400">
            {{ $t('responsibilities.unassignedCount') }}: <strong>{{ unassignedCount }}</strong>
          </span>
        </div>
        <!-- Filter Tabs -->
        <div class="flex items-center gap-1">
          <Button
            v-for="tab in filterTabs"
            :key="tab.value"
            :variant="activeFilter === tab.value ? 'default' : 'ghost'"
            size="sm"
            class="h-7 text-xs"
            @click="activeFilter = tab.value"
          >
            {{ tab.label }}
            <span class="ml-1 text-[10px] opacity-70">({{ tab.count }})</span>
          </Button>
        </div>
      </div>
    </div>

    <!-- Scrollable Content -->
    <div class="print-container flex-1 overflow-y-auto p-2 sm:p-3 lg:p-4">
      <div v-if="loading" class="mt-8 text-center">
        <p>{{ $t('participants.loading') }}</p>
      </div>
      <div v-else-if="error" class="mt-8 text-center text-red-500">
        <p>{{ error }}</p>
      </div>
      <div v-else-if="filteredResponsibilities.length === 0" class="mt-8 text-center text-gray-500 dark:text-gray-400">
        <p v-if="searchQuery.trim()">{{ $t('responsibilities.noServersFound') }}</p>
        <p v-else>{{ $t('responsibilities.noResponsibilities') }}</p>
      </div>
      <div v-else class="mt-4 grid gap-4" :class="gridColumnsClass">
        <div
          v-for="resp in filteredResponsibilities"
          :key="resp.id"
          class="resp-card relative border rounded-lg p-4 transition-all hover:shadow-md"
          :class="getCardClass(resp)"
        >
          <!-- Action buttons top-right -->
          <div class="absolute top-2 right-2 flex gap-1">
            <Button v-if="hasDocumentation(resp)" variant="ghost" size="icon" class="h-7 w-7 text-blue-500 hover:text-blue-700" @click="openDocModal(resp)" :title="$t('responsibilities.viewDocs')">
              <FileText class="h-3.5 w-3.5" />
            </Button>
            <template v-if="getDocFiles(resp.name).length === 1 && !documentationKeys.has(resp.name)">
              <a :href="getDocFileUrl(getDocFiles(resp.name)[0])" target="_blank" :title="getDocFiles(resp.name)[0]">
                <Button variant="ghost" size="icon" class="h-7 w-7 text-green-600 hover:text-green-800">
                  <Download class="h-3.5 w-3.5" />
                </Button>
              </a>
            </template>
            <DropdownMenu v-else-if="getDocFiles(resp.name).length > 0 || documentationKeys.has(resp.name)">
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon" class="h-7 w-7 text-green-600 hover:text-green-800" :title="$t('responsibilities.downloadDocs')">
                  <Download class="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem v-for="file in getDocFiles(resp.name)" :key="file" as-child>
                  <a :href="getDocFileUrl(file)" target="_blank" class="flex items-center gap-2">
                    <Download class="h-3.5 w-3.5" />
                    {{ file }}
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem v-if="documentationKeys.has(resp.name)" @click="openAndPrintDoc(resp)">
                  <Printer class="h-3.5 w-3.5 mr-2" />
                  {{ $t('responsibilities.generatePdf') || 'Imprimir / Guardar como PDF' }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7 text-emerald-600 hover:text-emerald-800 relative"
              :title="$t('responsibilities.openAttachments')"
              @click="openAttachments(resp)"
            >
              <Paperclip class="h-3.5 w-3.5" />
              <span
                v-if="(attachmentCounts[resp.name] ?? 0) > 0"
                class="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-emerald-600 text-white text-[9px] font-semibold leading-none"
              >{{ attachmentCounts[resp.name] }}</span>
            </Button>
            <Button variant="ghost" size="icon" class="h-7 w-7" @click="openAddEditModal(resp)">
              <Edit class="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" class="h-7 w-7 text-red-500 hover:text-red-700" @click="openDeleteDialog(resp)">
              <Trash2 class="h-3.5 w-3.5" />
            </Button>
          </div>

          <!-- Type badge -->
          <div class="flex items-center gap-2 mb-1">
            <span
              v-if="resp.responsabilityType === ResponsabilityType.CHARLISTA"
              class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
            >
              {{ resp.name.startsWith('Texto:') ? $t('responsibilities.texto') : $t('responsibilities.charla') }}
            </span>
          </div>

          <!-- Responsibility name -->
          <h3 class="font-semibold text-sm text-gray-900 dark:text-white pr-16">{{ displayName(resp) }}</h3>

          <!-- Assigned person or unassigned state -->
          <div class="mt-2">
            <template v-if="resp.participant">
              <div class="flex items-center gap-2">
                <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  {{ resp.participant.firstName }} {{ resp.participant.lastName }}
                  <button
                    class="ml-1 hover:bg-green-200 dark:hover:bg-green-800 rounded-full p-0.5 transition-colors"
                    :title="$t('responsibilities.unassign')"
                    @click="unassignParticipant(resp.id)"
                  >
                    <X class="h-3 w-3" />
                  </button>
                </span>
              </div>
            </template>
            <template v-else>
              <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                {{ $t('responsibilities.unassigned') }}
              </span>
              <Button
                v-if="resp.responsabilityType === ResponsabilityType.CHARLISTA"
                variant="outline"
                size="sm"
                class="ml-2 h-7 text-xs"
                @click="openSpeakerAssignModal(resp)"
              >
                {{ $t('responsibilities.assignSpeaker') }}
              </Button>
              <Button
                v-else
                variant="outline"
                size="sm"
                class="ml-2 h-7 text-xs"
                @click="openAssignModal(resp)"
              >
                {{ $t('responsibilities.assign') }}
              </Button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Attachments dialog (managed by responsability name, shared across retreats) -->
    <ResponsabilityAttachmentsDialog
      v-if="attachmentsTarget"
      :open="isAttachmentsDialogOpen"
      :responsability-name="attachmentsTarget.responsabilityName"
      :context-label="attachmentsTarget.contextLabel"
      :can-manage="canManage.scheduleTemplate.value"
      @update:open="onAttachmentsDialog"
    />

    <!-- Add/Edit Modal -->
    <Dialog :open="isAddEditModalOpen" @update:open="isAddEditModalOpen = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ editingResponsability ? $t('responsibilities.addEditModal.editTitle') : $t('responsibilities.addEditModal.createTitle') }}</DialogTitle>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="responsability-name" class="text-right">{{ $t('responsibilities.addEditModal.responsabilityNameLabel') }}</Label>
            <Input id="responsability-name" v-model="responsabilityName" class="col-span-3" :placeholder="$t('responsibilities.addEditModal.responsabilityNamePlaceholder')" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="isAddEditModalOpen = false">{{ $t('common.cancel') }}</Button>
          <Button @click="saveResponsability">{{ $t('responsibilities.addEditModal.save') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Confirmation Dialog -->
    <Dialog :open="isDeleteDialog" @update:open="isDeleteDialog = $event">
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{{ $t('responsibilities.deleteConfirmationTitle') }}</DialogTitle>
                <DialogDescription>{{ $t('responsibilities.deleteConfirmation') }}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
                <Button variant="outline" @click="isDeleteDialog = false">{{ $t('common.cancel') }}</Button>
                <Button variant="destructive" @click="confirmDelete">{{ $t('common.delete') }}</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <!-- Assign Server Modal (for regular responsibilities) -->
    <Dialog :open="isAssignModalOpen" @update:open="isAssignModalOpen = $event">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ $t('responsibilities.assignServer') }} - {{ selectedResponsability?.name }}</DialogTitle>
          <DialogDescription>{{ $t('responsibilities.selectServerDescription') }}</DialogDescription>
        </DialogHeader>
        <div class="mt-4">
          <div class="mb-4">
            <Input
              v-model="serverSearchTerm"
              :placeholder="$t('responsibilities.searchServersPlaceholder')"
              class="w-full"
            />
          </div>
          <div v-if="filteredParticipants.length === 0" class="text-center py-8 text-gray-500">
            <template v-if="serverSearchTerm.trim()">
              {{ $t('responsibilities.noServersFound') }}
            </template>
            <template v-else>
              {{ $t('responsibilities.noAvailableServers') }}
            </template>
          </div>
          <div v-else class="grid gap-3 max-h-96 overflow-y-auto">
            <div
              v-for="participant in filteredParticipants"
              :key="participant.id"
              class="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
              @click="assignParticipant(selectedResponsability!.id, participant.id)"
            >
              <div class="flex flex-col">
                <span class="font-medium">{{ participant.firstName }} {{ participant.lastName }}</span>
                <span class="text-sm text-gray-500">{{ participant.email }}</span>
                <span class="text-sm text-gray-500">{{ participant.cellPhone }}</span>
                <span
                  v-if="getExistingAssignments(participant.id).length > 0"
                  class="text-xs text-amber-600 dark:text-amber-400 mt-1"
                >
                  Ya asignado a: {{ getExistingAssignments(participant.id).join(', ') }}
                </span>
              </div>
              <Button variant="outline" size="sm">{{ $t('responsibilities.assign') }}</Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="isAssignModalOpen = false">{{ $t('common.cancel') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Documentation Modal -->
    <Dialog :open="isDocModalOpen" @update:open="isDocModalOpen = $event">
      <DialogContent class="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{{ docResponsability?.name }}</DialogTitle>
          <DialogDescription v-if="docResponsability?.responsabilityType === 'charlista'">
            {{ $t('responsibilities.charla') }} — {{ $t('responsibilities.viewDocs') }}
          </DialogDescription>
        </DialogHeader>
        <div v-if="docLoading" class="flex items-center justify-center py-8">
          <Loader2 class="h-6 w-6 animate-spin text-gray-400" />
        </div>
        <div v-else-if="docMarkdown" class="mt-2 overflow-y-auto max-h-[60vh] prose dark:prose-invert max-w-none text-sm p-4 bg-gray-50 dark:bg-gray-900 rounded" v-html="renderMarkdown(docMarkdown)" />
        <div v-else class="text-center text-gray-500 py-8">
          {{ $t('responsibilities.noDocumentation') || 'Sin documentación disponible' }}
        </div>
        <DialogFooter class="flex-wrap gap-2">
          <template v-if="docResponsability && getDocFiles(docResponsability.name).length > 0">
            <a v-for="file in getDocFiles(docResponsability.name)" :key="file" :href="getDocFileUrl(file)" target="_blank">
              <Button variant="outline">
                <Download class="h-4 w-4 mr-2" />
                {{ file }}
              </Button>
            </a>
          </template>
          <Button v-if="docMarkdown" variant="outline" @click="handlePrintDoc">
            <Printer class="h-4 w-4 mr-2" />
            {{ $t('responsibilities.print') }}
          </Button>
          <Button @click="isDocModalOpen = false">{{ $t('common.close') || 'Cerrar' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Speaker Assign Modal (for charlas) -->
    <Dialog :open="isSpeakerModalOpen" @update:open="isSpeakerModalOpen = $event">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ $t('responsibilities.assignSpeaker') }} - {{ selectedResponsability?.name }}</DialogTitle>
          <DialogDescription>{{ $t('responsibilities.selectSpeakerDescription') }}</DialogDescription>
        </DialogHeader>
        <div class="mt-4">
          <!-- Search input -->
          <div class="mb-4">
            <Input
              v-model="speakerSearchTerm"
              :placeholder="$t('responsibilities.searchSpeakerPlaceholder')"
              class="w-full"
              @input="debouncedSpeakerSearch"
            />
          </div>

          <!-- Search results -->
          <div v-if="!showManualEntry">
            <div v-if="speakerSearchLoading" class="text-center py-4 text-gray-500">
              <Loader2 class="h-5 w-5 animate-spin mx-auto mb-2" />
            </div>
            <div v-else-if="speakerSearchResults.length > 0" class="grid gap-2 max-h-60 overflow-y-auto mb-4">
              <div
                v-for="p in speakerSearchResults"
                :key="p.id"
                class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                @click="assignExistingSpeaker(p.id)"
              >
                <div class="flex flex-col">
                  <span class="font-medium text-sm">{{ p.firstName }} {{ p.lastName }}</span>
                  <span class="text-xs text-gray-500">{{ p.cellPhone }} {{ p.email ? `· ${p.email}` : '' }}</span>
                </div>
                <Button variant="outline" size="sm" class="text-xs">{{ $t('responsibilities.assign') }}</Button>
              </div>
            </div>
            <div v-else-if="speakerSearchTerm.trim().length >= 2" class="text-center py-4 text-gray-500 text-sm">
              {{ $t('responsibilities.noServersFound') }}
            </div>

            <!-- Manual entry toggle -->
            <div class="border-t pt-3">
              <Button variant="ghost" size="sm" class="w-full text-sm" @click="showManualEntry = true">
                <UserPlus class="h-4 w-4 mr-2" />
                {{ $t('responsibilities.notInSystem') }} — {{ $t('responsibilities.manualEntry') }}
              </Button>
            </div>
          </div>

          <!-- Manual entry form -->
          <div v-else class="space-y-3">
            <div class="flex items-center gap-2 mb-2">
              <Button variant="ghost" size="sm" class="h-7 px-2" @click="showManualEntry = false">
                <ChevronLeft class="h-4 w-4" />
              </Button>
              <span class="text-sm font-medium">{{ $t('responsibilities.manualEntry') }}</span>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <Label>{{ $t('responsibilities.speakerFirstName') }} *</Label>
                <Input v-model="newSpeaker.firstName" class="mt-1" />
              </div>
              <div>
                <Label>{{ $t('responsibilities.speakerLastName') }} *</Label>
                <Input v-model="newSpeaker.lastName" class="mt-1" />
              </div>
              <div>
                <Label>{{ $t('responsibilities.speakerPhone') }}</Label>
                <Input v-model="newSpeaker.cellPhone" class="mt-1" />
              </div>
              <div>
                <Label>{{ $t('responsibilities.speakerEmail') }}</Label>
                <Input v-model="newSpeaker.email" class="mt-1" />
              </div>
            </div>
            <Button
              class="w-full mt-2"
              :disabled="!newSpeaker.firstName.trim() || !newSpeaker.lastName.trim() || isCreatingSpeaker"
              @click="handleCreateAndAssignSpeaker"
            >
              <Loader2 v-if="isCreatingSpeaker" class="h-4 w-4 mr-2 animate-spin" />
              {{ $t('responsibilities.createSpeaker') }}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="closeSpeakerModal">{{ $t('common.cancel') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import { useResponsabilityStore } from '@/stores/responsabilityStore';
import { storeToRefs } from 'pinia';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@repo/ui';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@repo/ui';
import { Label } from '@repo/ui';
import { ChevronLeft, Download, Edit, FileText, LayoutGrid, Loader2, MoreVertical, Paperclip, Plus, Printer, Trash2, UserPlus, X } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import {
  exportResponsibilitiesToDocx,
  getResponsibilityDocumentation,
  listResponsibilityDocumentationKeys,
  responsabilityAttachmentApi,
} from '@/services/api';
import { renderMarkdown } from '@/composables/useMarkdown';
import { ResponsabilityType } from '@repo/types';
import ResponsabilityAttachmentsDialog from '@/components/ResponsabilityAttachmentsDialog.vue';
import { useAuthPermissions } from '@/composables/useAuthPermissions';
import { getSocket } from '@/services/realtime';
import type { Responsability, Participant } from '@repo/types';

const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();
const responsabilityStore = useResponsabilityStore();

const { selectedRetreatId } = storeToRefs(retreatStore);
const { participants } = storeToRefs(participantStore);
const { responsibilities, loading, error } = storeToRefs(responsabilityStore);

const isAddEditModalOpen = ref(false);
const isDeleteDialog = ref(false);
const isAssignModalOpen = ref(false);
const isSpeakerModalOpen = ref(false);
const isDocModalOpen = ref(false);
const docResponsability = ref<Responsability | null>(null);
const docMarkdown = ref<string>('');
const docLoading = ref(false);
const documentationKeys = ref<Set<string>>(new Set());
const editingResponsability = ref<Responsability | null>(null);
const responsabilityToDelete = ref<Responsability | null>(null);
const selectedResponsability = ref<Responsability | null>(null);
const responsabilityName = ref('');
const serverSearchTerm = ref('');
const searchQuery = ref('');
const columnCount = ref(localStorage.getItem('responsibilities_column_count') || '3');
const isExporting = ref(false);
const activeFilter = ref<'all' | 'charlas' | 'responsibilities' | 'unassigned'>('all');
const { t } = useI18n();

// Speaker modal state
const speakerSearchTerm = ref('');
const speakerSearchResults = ref<Participant[]>([]);
const speakerSearchLoading = ref(false);
const showManualEntry = ref(false);
const isCreatingSpeaker = ref(false);
const newSpeaker = ref({ firstName: '', lastName: '', cellPhone: '', email: '' });

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

// Mapping of responsibility names to downloadable document files in /docs/dinamicas/
const responsibilityDocFiles: Record<string, string[]> = {
	'Santísimo': ['03 Guardia Santísimo.xlsx'],
	'Texto: Explicación de la Confidencialidad': ['03 Sobre la Confidencialidad.pdf'],
	'Charla: De la Rosa': ['04 La Rosa.pdf'],
	'Texto: Explicación de La Palanca': ['05 Palancas.pdf'],
	'Palanquero 1': ['05 Palancas.pdf'],
	'Palanquero 2': ['05 Palancas.pdf'],
	'Palanquero 3': ['05 Palancas.pdf'],
	'Oración de Intercesión': ['07 Dinamica 1 Oracion Peticion v2.pdf', '12 Dinamica 2 Oracion en grupo.pdf', 'Dinámica de Oración de Intercesión. Sabado..docx'],
	'Charla: Sanación de Recuerdos': ['08 Dinamica Sanacion De Recuerdos Hombres.pdf', 'Introducción a la Dinámica de Sanación.docx'],
	'Texto: Dinámica de Sanación': ['08 Dinamica Sanacion De Recuerdos Hombres.pdf', 'Introducción a la Dinámica de Sanación.docx'],
	'Texto: Quema de Pecados': ['09 Explicacion de la Hoja de Pecados.pdf', '09 Explicacion de la Hoja de Pecados (Una Nueva Voz Despues de Sanacion de Recuerdos).pdf', 'Letreros Dinamicas - Cenizas,Lavado,Bendicion.pdf'],
	'Sacerdotes': ['10 Confesiones Instrucciones a Sacerdotes.pdf'],
	'Texto: Dinámica de la Pared': ['10 Dinamicas Pared Lavado Palancas.pdf'],
	'Charla: Confianza': ['10 Dinamicas Pared Lavado Palancas.pdf'],
	'Texto: Lavado de Manos': ['10 Dinamicas Pared Lavado Palancas.pdf', 'Letreros Dinamicas - Cenizas,Lavado,Bendicion.pdf'],
	'Texto: Explicación del Lema "Jesucristo Ha Resucitado"': ['Jesucristo Ha Resucitado v2015_1Cor15_12-20.pdf'],
	'Reglamento de la Casa': ['REGLAS PARA EL RETIRO.pdf'],
	'Texto: Dinámica de la Carta a Jesús': ['11 Carta a Jesús.pdf'],
	'Texto: Explicación Cuadernitos': ['05.B Diario.pdf'],
};

const getDocFiles = (name: string): string[] => {
	return responsibilityDocFiles[name] || [];
};

const getDocFileUrl = (filename: string): string => {
	return `/docs/dinamicas/${encodeURIComponent(filename)}`;
};

watch(columnCount, (newValue) => {
  localStorage.setItem('responsibilities_column_count', newValue);
});

const gridColumnsClass = computed(() => {
  switch (columnCount.value) {
    case '2': return 'grid-cols-1 sm:grid-cols-2';
    case '3': return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    case '4': return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
    default: return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  }
});

const assignedCount = computed(() => responsibilities.value.filter(r => r.participant).length);
const unassignedCount = computed(() => responsibilities.value.filter(r => !r.participant).length);

const charlaCount = computed(() => responsibilities.value.filter(r => r.responsabilityType === ResponsabilityType.CHARLISTA).length);
const regularCount = computed(() => responsibilities.value.filter(r => r.responsabilityType !== ResponsabilityType.CHARLISTA).length);

const filterTabs = computed(() => [
  { value: 'all' as const, label: t('responsibilities.allItems'), count: responsibilities.value.length },
  { value: 'charlas' as const, label: t('responsibilities.charlas'), count: charlaCount.value },
  { value: 'responsibilities' as const, label: t('responsibilities.responsibilitiesFilter'), count: regularCount.value },
  { value: 'unassigned' as const, label: t('responsibilities.unassignedCount'), count: unassignedCount.value },
]);

const filteredResponsibilities = computed(() => {
  let items = responsibilities.value;

  // Apply type filter
  if (activeFilter.value === 'charlas') {
    items = items.filter(r => r.responsabilityType === ResponsabilityType.CHARLISTA);
  } else if (activeFilter.value === 'responsibilities') {
    items = items.filter(r => r.responsabilityType !== ResponsabilityType.CHARLISTA);
  } else if (activeFilter.value === 'unassigned') {
    items = items.filter(r => !r.participant);
  }

  // Apply search
  if (!searchQuery.value.trim()) return items;
  const q = searchQuery.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return items.filter(r => {
    const name = r.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const participantName = r.participant
      ? `${r.participant.firstName} ${r.participant.lastName}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      : '';
    return name.includes(q) || participantName.includes(q);
  });
});

const availableParticipants = computed(() => {
  return (participants.value || []).filter(p => p.type === 'server' && !p.isCancelled);
});

const getExistingAssignments = (participantId: string) =>
  responsibilities.value
    .filter(r => r.participantId === participantId && r.id !== selectedResponsability.value?.id)
    .map(r => r.name);

const filteredParticipants = computed(() => {
  if (!serverSearchTerm.value.trim()) {
    return availableParticipants.value;
  }
  const searchTerm = serverSearchTerm.value.toLowerCase();
  return availableParticipants.value.filter(participant =>
    participant.firstName.toLowerCase().includes(searchTerm) ||
    participant.lastName.toLowerCase().includes(searchTerm) ||
    participant.email.toLowerCase().includes(searchTerm) ||
    (participant.cellPhone && participant.cellPhone.includes(searchTerm))
  );
});

const displayName = (resp: Responsability) => {
  if (resp.responsabilityType === ResponsabilityType.CHARLISTA) {
    return resp.name.replace(/^Charla:\s*/, '').replace(/^Texto:\s*/, '');
  }
  return resp.name;
};

const getCardClass = (resp: Responsability) => {
  if (resp.responsabilityType === ResponsabilityType.CHARLISTA) {
    return resp.participant
      ? 'border-l-4 border-l-blue-500 bg-blue-50/30 dark:bg-blue-950/10'
      : 'border-l-4 border-l-blue-300 bg-blue-50/10 dark:bg-blue-950/5';
  }
  return resp.participant
    ? 'border-l-4 border-l-green-500 bg-green-50/30 dark:bg-green-950/10'
    : 'border-l-4 border-l-amber-500 bg-amber-50/30 dark:bg-amber-950/10';
};

// Single watcher with immediate:true replaces the duplicate onMounted + watch.
watch(selectedRetreatId, (newRetreatId) => {
  if (newRetreatId) {
    responsabilityStore.fetchResponsibilities(newRetreatId);
    participantStore.filters.retreatId = newRetreatId;
    participantStore.fetchParticipants();
  }
}, { immediate: true });

// --- Attachments (Documentos por Responsabilidad) ---
const { canManage } = useAuthPermissions();
const attachmentCounts = ref<Record<string, number>>({});
const isAttachmentsDialogOpen = ref(false);
const attachmentsTarget = ref<{ responsabilityName: string; contextLabel: string } | null>(null);

async function refreshAttachmentCounts() {
  try {
    attachmentCounts.value = await responsabilityAttachmentApi.counts();
  } catch (err) {
    console.warn('No se pudieron cargar los contadores de attachments', err);
  }
}

function openAttachments(resp: Responsability) {
  attachmentsTarget.value = { responsabilityName: resp.name, contextLabel: resp.name };
  isAttachmentsDialogOpen.value = true;
}

function onAttachmentsDialog(v: boolean) {
  isAttachmentsDialogOpen.value = v;
  if (!v) {
    attachmentsTarget.value = null;
    // Refresh counts after the dialog closes — may have created/deleted/updated.
    void refreshAttachmentCounts();
  }
}

let detachWS: (() => void) | null = null;
function attachWSListener() {
  const socket = getSocket();
  // Subscribe to a dummy retreat-scoped channel so we join SCHEDULE_GLOBAL_ROOM
  // and receive attachment-changed broadcasts. If the user has no retreat
  // selected (rare), we still listen — the event has the responsabilityName
  // we need to update counts.
  const onChanged = (e: { responsabilityName: string; action: 'created' | 'updated' | 'deleted' }) => {
    if (e.action === 'created' || e.action === 'deleted') {
      // count changed — do a fresh fetch (cheaper than maintaining delta)
      void refreshAttachmentCounts();
    }
    // 'updated' doesn't change count, skip
  };
  socket.on('schedule:attachment-changed', onChanged);
  // Also need to be in the global room — piggyback on schedule:subscribe with
  // the current retreat. If no retreat, just listen passively (the event will
  // still arrive only if some other client emits within the global room — but
  // since we never join the room, we won't receive). Best-effort.
  if (selectedRetreatId.value) {
    socket.emit('schedule:subscribe', selectedRetreatId.value, () => {});
  }
  detachWS = () => {
    socket.off('schedule:attachment-changed', onChanged);
    if (selectedRetreatId.value) {
      socket.emit('schedule:unsubscribe', selectedRetreatId.value);
    }
  };
}

onMounted(async () => {
  try {
    const { charlas, responsibilities: respKeys } = await listResponsibilityDocumentationKeys();
    documentationKeys.value = new Set([...charlas, ...respKeys]);
  } catch (err) {
    console.warn('Could not load documentation keys', err);
  }
  await refreshAttachmentCounts();
  attachWSListener();
});

onUnmounted(() => {
  detachWS?.();
});

const hasDocumentation = (resp: Responsability): boolean => {
  if (resp.description && resp.description.length > 20) return true;
  return documentationKeys.value.has(resp.name);
};

const openAddEditModal = (responsability: Responsability | null) => {
  editingResponsability.value = responsability;
  responsabilityName.value = responsability ? responsability.name : '';
  isAddEditModalOpen.value = true;
};

const saveResponsability = async () => {
  if (!selectedRetreatId.value) return;

  if (editingResponsability.value) {
    await responsabilityStore.updateResponsability(editingResponsability.value.id, { name: responsabilityName.value });
  } else {
    await responsabilityStore.createResponsability({ name: responsabilityName.value, retreatId: selectedRetreatId.value });
  }
  isAddEditModalOpen.value = false;
  editingResponsability.value = null;
  responsabilityName.value = '';
};

const openDeleteDialog = (responsability: Responsability) => {
  responsabilityToDelete.value = responsability;
  isDeleteDialog.value = true;
};

const confirmDelete = async () => {
  if (responsabilityToDelete.value) {
    await responsabilityStore.deleteResponsability(responsabilityToDelete.value.id);
  }
  isDeleteDialog.value = false;
  responsabilityToDelete.value = null;
};

const openAssignModal = (responsability: Responsability) => {
  selectedResponsability.value = responsability;
  serverSearchTerm.value = '';
  isAssignModalOpen.value = true;
};

const openSpeakerAssignModal = (responsability: Responsability) => {
  selectedResponsability.value = responsability;
  speakerSearchTerm.value = '';
  speakerSearchResults.value = [];
  showManualEntry.value = false;
  newSpeaker.value = { firstName: '', lastName: '', cellPhone: '', email: '' };
  isSpeakerModalOpen.value = true;
};

const closeSpeakerModal = () => {
  isSpeakerModalOpen.value = false;
  selectedResponsability.value = null;
};

const debouncedSpeakerSearch = () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    const q = speakerSearchTerm.value.trim();
    if (q.length < 2 || !selectedRetreatId.value) {
      speakerSearchResults.value = [];
      return;
    }
    speakerSearchLoading.value = true;
    speakerSearchResults.value = await responsabilityStore.searchSpeakers(q, selectedRetreatId.value);
    speakerSearchLoading.value = false;
  }, 300);
};

const assignExistingSpeaker = async (participantId: string) => {
  if (!selectedResponsability.value) return;
  await responsabilityStore.assignParticipant(selectedResponsability.value.id, participantId);
  closeSpeakerModal();
};

const handleCreateAndAssignSpeaker = async () => {
  if (!selectedResponsability.value || !selectedRetreatId.value) return;
  isCreatingSpeaker.value = true;
  await responsabilityStore.createAndAssignSpeaker(selectedResponsability.value.id, {
    firstName: newSpeaker.value.firstName.trim(),
    lastName: newSpeaker.value.lastName.trim(),
    cellPhone: newSpeaker.value.cellPhone.trim() || undefined,
    email: newSpeaker.value.email.trim() || undefined,
    retreatId: selectedRetreatId.value,
  });
  isCreatingSpeaker.value = false;
  closeSpeakerModal();
};

const assignParticipant = async (responsabilityId: string, participantId: string) => {
  const idToAssign = participantId === 'unassigned' ? null : participantId;
  await responsabilityStore.assignParticipant(responsabilityId, idToAssign);
  isAssignModalOpen.value = false;
  selectedResponsability.value = null;
};

const unassignParticipant = async (responsabilityId: string) => {
  await responsabilityStore.assignParticipant(responsabilityId, null);
};

const openDocModal = async (resp: Responsability) => {
  docResponsability.value = resp;
  docMarkdown.value = '';
  isDocModalOpen.value = true;

  // Use local description if it has substantial content; otherwise fetch from API
  const hasLocalDesc = resp.description && resp.description.length > 20;
  if (hasLocalDesc) {
    docMarkdown.value = resp.description!;
    return;
  }

  if (documentationKeys.value.has(resp.name)) {
    docLoading.value = true;
    try {
      const result = await getResponsibilityDocumentation(resp.name);
      if (result?.markdown) docMarkdown.value = result.markdown;
    } catch (err) {
      console.error('Could not fetch documentation', err);
    } finally {
      docLoading.value = false;
    }
  }
};

const openAndPrintDoc = async (resp: Responsability) => {
  docResponsability.value = resp;
  docMarkdown.value = '';
  if (resp.description && resp.description.length > 20) {
    docMarkdown.value = resp.description;
  } else if (documentationKeys.value.has(resp.name)) {
    try {
      const result = await getResponsibilityDocumentation(resp.name);
      if (result?.markdown) docMarkdown.value = result.markdown;
    } catch (err) {
      console.error('Could not fetch documentation', err);
      return;
    }
  }
  if (docMarkdown.value) handlePrintDoc();
};

const handlePrintDoc = () => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  const rendered = renderMarkdown(docMarkdown.value || '');
  printWindow.document.write(`<!DOCTYPE html>
<html><head><title>${docResponsability.value?.name || 'Documento'}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 2rem; color: #111; line-height: 1.6; }
  h1 { font-size: 1.5rem; border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
  h2 { font-size: 1.3rem; margin-top: 1.5rem; }
  h3 { font-size: 1.1rem; margin-top: 1.2rem; }
  ul, ol { padding-left: 1.5rem; }
  li { margin-bottom: 0.3rem; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; font-size: 0.9rem; }
  th { background: #f5f5f5; }
  hr { margin: 1.5rem 0; border: none; border-top: 1px solid #ccc; }
  @page { size: A4; margin: 1.5cm; }
</style></head><body>
<h1>${docResponsability.value?.name || ''}</h1>
<hr/>
${rendered}
</body></html>`);
  printWindow.document.close();
  printWindow.print();
};

const handleExport = async () => {
  if (!selectedRetreatId.value || isExporting.value) return;
  isExporting.value = true;
  try {
    await exportResponsibilitiesToDocx(selectedRetreatId.value);
  } catch (err) {
    console.error('Export error:', err);
  } finally {
    isExporting.value = false;
  }
};

const handlePrint = () => {
  window.print();
};
</script>

<style>
@media print {
  body * { visibility: hidden; }
  .print-container, .print-container * { visibility: visible; }
  .print-container { position: absolute; left: 0; top: 0; width: 100%; }
  .no-print, .sticky, button, input { display: none !important; }
  .print-container .grid {
    display: grid !important;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  @page { size: A4; margin: 1cm; }
  .resp-card {
    break-inside: avoid-page;
    page-break-inside: avoid;
    display: block;
    height: auto;
    border: 1px solid #ccc;
    margin-bottom: 0.5rem;
  }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
</style>
