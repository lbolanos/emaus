// The import matches a row to a participant by email in two places: the update
// branch (same retreat) and createParticipant (the email only exists outside
// the retreat — it reuses that record and overwrites its personal and health
// data with the row). Both overwrites are right when the same person registers
// again, and wrong when the address was borrowed — typically a team member who
// registered their invitee with it (troubleshooting §25.8/§25.9). The names
// tell the two apart: a row that names someone else is skipped, so the
// overwrite is never silent.

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

/**
 * User-facing reason shown in the import summary ("Omitidos: Fila N: …").
 * `scope` says where the existing record lives, so the operator knows where to
 * look for it: outside this retreat (§25.9) or enrolled in it (§25.8).
 */
export const importNameConflictReason = (
  existingName: string,
  rowName: string,
  scope: "outside-retreat" | "in-retreat" = "outside-retreat",
): string =>
  `el correo ya es de ${existingName}, ` +
  (scope === "in-retreat"
    ? "inscrito en este retiro"
    : "registrado fuera de este retiro") +
  `, y la fila es de ${rowName}. No se tocó su ficha: si el correo era prestado, pon en el archivo ` +
  `el correo propio de ${rowName}; si es la misma persona, corrige el nombre`;
