// The import matches a row to a participant of the same retreat by email. A row
// whose email only exists outside the retreat goes to createParticipant, which
// reuses that record (the email is the participant's identity) and overwrites
// its personal and health data with the row. That is right when the same person
// registers again, and wrong when the address was borrowed — typically a team
// member who registered their invitee with it (troubleshooting §25.9). The names
// tell the two apart: a row that names someone else is skipped, and one that
// names the same person is reported, so the overwrite is never silent.

import { normalizePersonName } from "@repo/utils";

type PersonName = { firstName?: string | null; lastName?: string | null };

const firstToken = (value?: string | null): string =>
  normalizePersonName(value).split(" ")[0] ?? "";

/**
 * True when the row clearly names someone other than the existing record.
 * Compares the first given name and the first surname, ignoring case and
 * accents, so a middle name or second surname on one side only ("Juan Carlos
 * Pérez Gómez" vs "Juan Pérez") is still the same person. A side with no name
 * cannot tell, so it never counts as a conflict.
 */
export const isImportNameConflict = (existing: PersonName, row: PersonName): boolean => {
  const pairs: Array<[string, string]> = [
    [firstToken(existing.firstName), firstToken(row.firstName)],
    [firstToken(existing.lastName), firstToken(row.lastName)],
  ];
  return pairs.some(([a, b]) => a !== "" && b !== "" && a !== b);
};

export const fullName = (person: PersonName): string =>
  `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim();

/** User-facing reason shown in the import summary ("Omitidos: Fila N: …"). */
export const importNameConflictReason = (existingName: string, rowName: string): string =>
  `el correo ya es de ${existingName}, registrado fuera de este retiro, y la fila es de ` +
  `${rowName}. No se tocó su ficha: si el correo era prestado, pon en el archivo el correo ` +
  `propio de ${rowName}; si es la misma persona, corrige el nombre`;
