import { ref } from 'vue';
import type { Participant } from '@repo/types';

// Singleton reactivo a nivel de módulo. Los popovers de detalle de participante
// están anidados (TablesView → TableCard → ServerDropZone); este composable evita
// prop-drilling para abrir un único <MessageDialog> montado en TablesView.
const isOpen = ref(false);
const participant = ref<Participant | null>(null);

export function useParticipantMessageDialog() {
  const open = (p: Participant) => {
    participant.value = p;
    isOpen.value = true;
  };

  return { isOpen, participant, open };
}
