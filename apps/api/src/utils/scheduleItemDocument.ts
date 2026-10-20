/**
 * Canonical attachment name of a schedule moment (D1 of specs/assignment-documents).
 *
 * 1. `template.documentName`: the moment's own document when it differs from its
 *    responsibility (table prayer dynamics).
 * 2. The retreat responsibility linked to the moment.
 * 3. `template.responsabilityName`: when the retreat has no responsibility with
 *    that name (e.g. 'Texto: Dinámica de la Pared'), materialization leaves the
 *    moment unlinked, but the template still names its document.
 */
export function resolveScheduleItemDocumentName(
	responsabilityName: string | null | undefined,
	template: { documentName?: string | null; responsabilityName?: string | null } | null | undefined,
): string | null {
	const pick = (value?: string | null) => value?.trim() || null;
	return (
		pick(template?.documentName) ?? pick(responsabilityName) ?? pick(template?.responsabilityName)
	);
}
