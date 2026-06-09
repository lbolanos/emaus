import { ref } from 'vue';
import type { Participant } from '@repo/types';
import type { TableData } from '@/utils/message';

// Singleton reactivo a nivel de módulo. Los popovers de detalle de participante
// están anidados (TablesView → TableCard → ServerDropZone); este composable evita
// prop-drilling para abrir un único <MessageDialog> montado en TablesView.
const isOpen = ref(false);
const participant = ref<Participant | null>(null);
// Datos de mesa para resolver variables {table.*} (flujo briefing de mesa).
const tableData = ref<TableData | null>(null);
// Tipo de plantilla a preseleccionar al abrir (p. ej. 'TABLE_LEADER_BRIEFING').
const templateType = ref<string | null>(null);

interface OpenOptions {
  tableData?: TableData | null;
  templateType?: string | null;
}

export function useParticipantMessageDialog() {
  const open = (p: Participant, opts?: OpenOptions) => {
    participant.value = p;
    tableData.value = opts?.tableData ?? null;
    templateType.value = opts?.templateType ?? null;
    isOpen.value = true;
  };

  return { isOpen, participant, tableData, templateType, open };
}
