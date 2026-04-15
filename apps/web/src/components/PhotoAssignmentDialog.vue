<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>
          <span class="flex items-center gap-2">
            <Camera class="w-5 h-5" />
            {{ table.name }} — {{ $t('tables.photoAssign.tableTitle') }}
          </span>
        </DialogTitle>
        <DialogDescription>{{ $t('tables.photoAssign.tableDescription') }}</DialogDescription>
      </DialogHeader>

      <!-- Step: upload -->
      <div v-if="step === 'upload'" class="space-y-4">
        <div
          class="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors hover:border-primary hover:bg-primary/5"
          :class="{ 'border-primary bg-primary/5': previewUrl }"
          @click="fileInput?.click()"
          @drop.prevent="onDrop"
          @dragover.prevent
        >
          <template v-if="previewUrl">
            <img :src="previewUrl" class="max-h-40 rounded-lg mx-auto mb-3 object-contain" />
            <p class="text-xs text-gray-500">{{ $t('tables.photoAssign.changePhoto') }}</p>
          </template>
          <template v-else>
            <Camera class="w-10 h-10 mx-auto mb-2 text-gray-400" />
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ $t('tables.photoAssign.uploadLabel') }}</p>
            <p class="text-xs text-gray-400 mt-1">{{ $t('tables.photoAssign.uploadHint') }}</p>
          </template>
        </div>
        <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="onFileChange" />
        <Button v-if="previewUrl" @click="analyze" :disabled="isAnalyzing" class="w-full">
          <Loader2 v-if="isAnalyzing" class="w-4 h-4 mr-2 animate-spin" />
          {{ isAnalyzing ? $t('tables.photoAssign.analyzing') : $t('tables.photoAssign.analyze') }}
        </Button>
      </div>

      <!-- Step: review -->
      <div v-else-if="step === 'review'" class="space-y-3">
        <div class="flex items-center justify-between">
          <Button variant="ghost" size="sm" @click="step = 'upload'" class="h-7 px-2">
            <ChevronLeft class="w-4 h-4 mr-1" />{{ $t('tables.photoAssign.changePhoto') }}
          </Button>
          <span class="text-xs text-gray-500">
            {{ proposals.filter(p => p.valid).length }} {{ $t('tables.photoAssign.walkersFound') }}
          </span>
        </div>

        <div v-if="proposals.length === 0" class="text-center text-sm text-gray-500 py-4">
          {{ $t('tables.photoAssign.noResults') }}
        </div>

        <div v-else class="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          <label
            v-for="p in proposals"
            :key="p.idOnRetreat"
            class="flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors"
            :class="p.valid ? 'hover:bg-gray-50 dark:hover:bg-gray-800' : 'opacity-60 bg-red-50 dark:bg-red-900/20 border-red-200'"
          >
            <input type="checkbox" v-model="p.selected" :disabled="!p.valid" class="rounded" />
            <div class="flex-1 min-w-0">
              <span class="font-bold text-sm">{{ p.idOnRetreat }}</span>
              <span v-if="p.participantName" class="ml-2 text-sm text-gray-700 dark:text-gray-300">{{ p.participantName }}</span>
              <span v-if="p.error" class="block text-xs text-red-500 mt-0.5">{{ p.error }}</span>
            </div>
          </label>
        </div>

        <div v-if="analysis.unreadable.length > 0" class="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 rounded p-2">
          <span class="font-medium">{{ $t('tables.photoAssign.unreadable') }}:</span>
          {{ analysis.unreadable.map(u => u.description).join(', ') }}
        </div>

        <div v-if="analysis.notes" class="text-xs text-gray-500 italic">{{ analysis.notes }}</div>

        <Button @click="applyAssignments" :disabled="isApplying || selectedCount === 0" class="w-full">
          <Loader2 v-if="isApplying" class="w-4 h-4 mr-2 animate-spin" />
          {{ isApplying ? $t('tables.photoAssign.applying') : `${$t('tables.photoAssign.apply')} (${selectedCount})` }}
        </Button>
      </div>

      <!-- Step: done -->
      <div v-else-if="step === 'done'" class="text-center py-6 space-y-3">
        <div class="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
          <Check class="w-6 h-6 text-green-600" />
        </div>
        <p class="font-medium">{{ $t('tables.photoAssign.applied') }}</p>
        <p class="text-sm text-gray-500">{{ $t('tables.photoAssign.appliedDesc', { count: assignedCount }) }}</p>
        <Button @click="$emit('update:open', false)" class="w-full">{{ $t('common.close') }}</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { PropType } from 'vue';
import type { TableMesa } from '@repo/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Button, useToast } from '@repo/ui';
import { Camera, Loader2, ChevronLeft, Check } from 'lucide-vue-next';
import { analyzeTablePhoto, executeTableAssignments } from '@/services/api';
import { useRetreatStore } from '@/stores/retreatStore';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  open: { type: Boolean, required: true },
  table: { type: Object as PropType<TableMesa>, required: true },
});
const emit = defineEmits(['update:open', 'assigned']);

const { t } = useI18n();
const { toast } = useToast();
const retreatStore = useRetreatStore();

const step = ref<'upload' | 'review' | 'done'>('upload');
const fileInput = ref<HTMLInputElement | null>(null);
const previewUrl = ref<string | null>(null);
const imageBase64 = ref<string | null>(null);
const contentType = ref<string>('image/jpeg');
const isAnalyzing = ref(false);
const isApplying = ref(false);
const assignedCount = ref(0);

type Proposal = {
  idOnRetreat: number;
  participantId: string | null;
  participantName: string | null;
  tableName: string;
  tableId: string | null;
  valid: boolean;
  error?: string;
  selected: boolean;
};
const proposals = ref<Proposal[]>([]);
const analysis = ref<{ unreadable: Array<{ description: string }>; notes: string }>({ unreadable: [], notes: '' });

const selectedCount = computed(() => proposals.value.filter(p => p.selected).length);

const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const loadFile = async (file: File) => {
  contentType.value = file.type || 'image/jpeg';
  previewUrl.value = URL.createObjectURL(file);
  imageBase64.value = await readFileAsBase64(file);
};

const onFileChange = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) await loadFile(file);
};

const onDrop = async (e: DragEvent) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) await loadFile(file);
};

const analyze = async () => {
  if (!imageBase64.value || !retreatStore.selectedRetreat?.id) return;
  isAnalyzing.value = true;
  try {
    const result = await analyzeTablePhoto(retreatStore.selectedRetreat.id, props.table.id, imageBase64.value, contentType.value);
    proposals.value = result.proposals.map(p => ({ ...p, selected: p.valid }));
    analysis.value = { unreadable: result.unreadable, notes: result.notes };
    step.value = 'review';
  } catch (e: any) {
    toast({ title: t('tables.photoAssign.analyzeError'), description: e.message, variant: 'destructive' });
  } finally {
    isAnalyzing.value = false;
  }
};

const applyAssignments = async () => {
  if (!retreatStore.selectedRetreat?.id) return;
  const toAssign = proposals.value.filter(p => p.selected && p.valid && p.participantId && p.tableId);
  if (!toAssign.length) return;
  isApplying.value = true;
  try {
    const result = await executeTableAssignments(
      retreatStore.selectedRetreat.id,
      toAssign.map(p => ({
        participantId: p.participantId!,
        tableId: p.tableId!,
        idOnRetreat: p.idOnRetreat,
        participantName: p.participantName || '',
        tableName: p.tableName,
      })),
    );
    assignedCount.value = result.results.filter(r => r.success).length;
    step.value = 'done';
    emit('assigned');
  } catch (e: any) {
    toast({ title: t('tables.photoAssign.applyError'), description: e.message, variant: 'destructive' });
  } finally {
    isApplying.value = false;
  }
};
</script>
