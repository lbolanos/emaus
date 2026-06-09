import { computed, type ComputedRef } from 'vue';
import { useAuthStore } from '@/stores/authStore';

/**
 * Resuelve el `participantId` del usuario logueado (el Participant ligado por
 * email en el registro).
 *
 * IMPORTANTE: `participantId` viene en el nivel superior del user
 * (`/auth/status` y `/auth/login` responden `{ ...user.toJSON(), profile }`),
 * NO en `profile` — `getUserProfile` solo devuelve `{ roles, permissions }`.
 * Por eso se lee primero de `authStore.user`, con fallback a `userProfile` por
 * robustez ante respuestas que sí lo aniden.
 */
export function useMyParticipantId(): ComputedRef<string | null> {
  const authStore = useAuthStore();
  return computed<string | null>(() => {
    const u = authStore.user as any;
    const p = authStore.userProfile as any;
    return u?.participantId ?? p?.participantId ?? p?.participant?.id ?? null;
  });
}
