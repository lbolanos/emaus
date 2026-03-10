<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ team?.name }} - {{ $t('serviceTeams.instructions') }}</DialogTitle>
        <DialogDescription class="sr-only">{{ $t('serviceTeams.instructions') }}</DialogDescription>
      </DialogHeader>
      <div v-if="team?.instructions" class="prose dark:prose-invert max-w-none instructions-print-area">
        <div v-html="renderedInstructions" />
      </div>
      <div v-else class="text-gray-500 text-center py-8">
        {{ $t('serviceTeams.noInstructions') }}
      </div>
      <DialogFooter>
        <Button variant="outline" @click="handlePrint">
          <Printer class="w-4 h-4 mr-2" />
          {{ $t('serviceTeams.print') }}
        </Button>
        <Button @click="$emit('update:open', false)">{{ $t('common.close') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PropType } from 'vue';
import type { ServiceTeam } from '@repo/types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Button } from '@repo/ui';
import { Printer } from 'lucide-vue-next';
import { renderMarkdown } from '@/composables/useMarkdown';

const props = defineProps({
  open: { type: Boolean, default: false },
  team: { type: Object as PropType<ServiceTeam | null>, default: null },
});

defineEmits(['update:open']);

const escapeHtml = (text: string): string => {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

const renderedInstructions = computed(() => {
  if (!props.team?.instructions) return '';
  let html = renderMarkdown(props.team.instructions);

  // Append leader/member info
  if (props.team.leader) {
    html += `<p><strong>Líder:</strong> ${escapeHtml(props.team.leader.firstName)} ${escapeHtml(props.team.leader.lastName)}</p>`;
  }
  const members = (props.team.members || []).filter(m => m.participantId !== props.team?.leaderId);
  if (members.length > 0) {
    html += '<p><strong>Miembros:</strong></p><ul>';
    for (const m of members) {
      if (m.participant) {
        html += `<li>${escapeHtml(m.participant.firstName)} ${escapeHtml(m.participant.lastName)}</li>`;
      }
    }
    html += '</ul>';
  }
  return html;
});

const handlePrint = () => {
  const printContent = document.querySelector('.instructions-print-area');
  if (!printContent) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const teamName = props.team?.name || '';
  printWindow.document.write(`<!DOCTYPE html>
<html><head><title>${teamName}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 2rem; color: #111; line-height: 1.6; }
  h1 { font-size: 1.5rem; border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
  h2 { font-size: 1.3rem; margin-top: 1.5rem; }
  h3 { font-size: 1.1rem; margin-top: 1.2rem; }
  ul { padding-left: 1.5rem; }
  li { margin-bottom: 0.3rem; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; font-size: 0.9rem; }
  th { background: #f5f5f5; }
  strong { font-weight: 600; }
  hr { margin: 1.5rem 0; border: none; border-top: 1px solid #ccc; }
  em { font-style: italic; color: #555; }
  @page { size: A4; margin: 1.5cm; }
</style></head><body>${printContent.innerHTML}</body></html>`);
  printWindow.document.close();
  printWindow.print();
};
</script>
