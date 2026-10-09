import { ref } from 'vue';
import type { TimelineEvent } from '@repo/types';
import { getParticipantTimeline } from '@/services/api';

/**
 * Contexto "vivo" de un participante para la ficha: hilo de notas del CRM
 * (autor y fecha), mensajes ya enviados e hitos de palancas — todo del
 * timeline del servidor (`crmService.getParticipantTimeline`, ordenado DESC).
 *
 * Fetch-on-open (spec v1.1 D9): la fila no debe pagar un fetch por un popover
 * que quizás no se abre. Cache por retiro+participante para no refetchea al
 * reabrir la misma ficha durante la sesión de la vista.
 *
 * El error NO tumba la ficha: palancas, saldo y datos del roster vienen del
 * `participantStore` (sin fetch); si el timeline falla, esas secciones siguen.
 */
// Cache a nivel módulo: compartida entre instancias del composable — el
// popover y el panel de detalle de la misma vista fetchean un participante
// una sola vez.
const cache = new Map<string, TimelineEvent[]>();

export function useParticipantInsights() {
  const loading = ref(false);
  const error = ref(false);
  const events = ref<TimelineEvent[]>([]);

  async function load(
    retreatId: string | null | undefined,
    participantId: string | null | undefined,
  ) {
    if (!retreatId || !participantId) return;
    const key = `${retreatId}:${participantId}`;
    const cached = cache.get(key);
    if (cached) {
      events.value = cached;
      return;
    }
    loading.value = true;
    error.value = false;
    try {
      const res = await getParticipantTimeline(retreatId, participantId);
      cache.set(key, res);
      events.value = res;
    } catch {
      error.value = true;
    } finally {
      loading.value = false;
    }
  }

  function reset() {
    events.value = [];
    error.value = false;
  }

  return { loading, error, events, load, reset };
}
