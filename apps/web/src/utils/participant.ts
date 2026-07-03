export interface ParticipantNameParts {
  firstName?: string | null;
  lastName?: string | null;
  nickname?: string | null;
}

/** Apodos "vacíos" que no deben mostrarse (algunos participantes traen "N/A"). */
export function isMeaninglessNickname(nick?: string | null): boolean {
  const n = (nick ?? '').trim().toLowerCase();
  return n === '' || n === 'n/a' || n === 'na' || n === 'n.a.' || n === 'n/d' || n === '-';
}

/** Nombre a mostrar: apodo si es significativo, si no el nombre completo. */
export function participantLabel(p?: ParticipantNameParts | null): string {
  if (!p) return '';
  if (!isMeaninglessNickname(p.nickname)) return (p.nickname ?? '').trim();
  return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
}
