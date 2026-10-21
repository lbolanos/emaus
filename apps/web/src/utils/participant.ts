import { usableName } from '@repo/utils';

export interface ParticipantNameParts {
  firstName?: string | null;
  lastName?: string | null;
  nickname?: string | null;
}

/**
 * Apodos "vacíos" que no deben mostrarse (algunos participantes traen "N/A"
 * del Excel de inscripción). Delega en `usableName` de `@repo/utils` para que
 * el criterio sea EL MISMO que usa el motor de mensajes al saludar — cuando
 * las listas divergen (el display perdonaba "N/D" pero el saludo no, o
 * viceversa con "."), una de las dos caras muestra basura.
 */
export function isMeaninglessNickname(nick?: string | null): boolean {
  return usableName(nick ?? '') === '';
}

/** Nombre a mostrar: apodo si es significativo, si no el nombre completo. */
export function participantLabel(p?: ParticipantNameParts | null): string {
  if (!p) return '';
  if (!isMeaninglessNickname(p.nickname)) return (p.nickname ?? '').trim();
  return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
}
