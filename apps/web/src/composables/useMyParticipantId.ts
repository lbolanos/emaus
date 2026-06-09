import { computed, type ComputedRef } from 'vue';
import { useAuthStore } from '@/stores/authStore';

/**
 * Resuelve el `participantId` del usuario logueado (el Participant ligado por
 * email en el registro).
 *
 * IMPORTANTE: `participantId` viene del objeto `user` (`/auth/status` y
 * `/auth/login` responden `{ ...user.toJSON(), profile }`), NO de `userProfile`
 * — `getUserProfile` solo devuelve `{ roles, permissions }`. Leer de
 * `userProfile` fue un bug (datos obsoletos/ausentes); se lee SOLO de
 * `authStore.user`, en el nivel superior o anidado en `user.participant.id`.
 */
export function useMyParticipantId(): ComputedRef<string | null> {
  const authStore = useAuthStore();
  return computed<string | null>(() => {
    const u = authStore.user as any;
    return u?.participantId ?? u?.participant?.id ?? null;
  });
}
