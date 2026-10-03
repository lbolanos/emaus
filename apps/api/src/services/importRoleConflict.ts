// The import matches rows to existing participants by email and updates them,
// but never changes their role (troubleshooting §25.8). A row whose declared
// role sits on the other side of the walker/team line therefore belongs to
// someone else's enrollment — typically a team member who registered their
// invitee with their own address — and updating would overwrite that team
// member's record with the invitee's data. Such rows are skipped instead.

const TEAM_TYPES = new Set(["server", "partial_server"]);

const TYPE_LABELS: Record<string, string> = {
  walker: "caminante",
  waiting: "caminante en espera",
  server: "servidor",
  partial_server: "angelito",
};

/**
 * True when an import row must not update the participant it matched by email.
 * `declaredType` is undefined when the row has no `tipousuario`: the importer
 * then defaults to "server", which is not a declaration and must not count.
 */
export const isImportRoleConflict = (
  existingType: string | null | undefined,
  declaredType: string | null | undefined,
): boolean => {
  if (!existingType || !declaredType) return false;
  return TEAM_TYPES.has(existingType) !== TEAM_TYPES.has(declaredType);
};

/** User-facing reason shown in the import summary ("Omitidos: Fila N: …"). */
export const importRoleConflictReason = (
  existingName: string,
  existingType: string,
  declaredType: string,
): string =>
  `el correo ya es de ${existingName}, inscrito en este retiro como ` +
  `${TYPE_LABELS[existingType] ?? existingType}; la fila viene como ` +
  `${TYPE_LABELS[declaredType] ?? declaredType}. No se tocó su ficha: si el correo ` +
  `era prestado, corrígelo en el archivo; si es la misma persona cambiando de rol, ` +
  `cambia el tipo a mano`;
