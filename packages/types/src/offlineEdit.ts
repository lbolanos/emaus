/**
 * Participant fields the team can correct without signal (specs/offline-mode, D13).
 *
 * Personal columns of `participants` only: what the retreat house fixes on the
 * spot (a name for the badge, a phone, the shirt size, who snores). The web
 * queues only these, and only the ones that changed, with the value they had
 * (`expectedValues`); the API answers 409 if any of them changed meanwhile.
 *
 * Left out on purpose: `email` (the global identity of a participant), every
 * `SENSITIVE_HEALTH_FIELDS` (never on the phone), the retreat fields written to
 * `retreat_participants` (type, scholarship, palancas, inviter, notes), dates,
 * sacraments and tags.
 */
export const OFFLINE_EDITABLE_PARTICIPANT_FIELDS = [
	'firstName',
	'lastName',
	'nickname',
	'cellPhone',
	'homePhone',
	'workPhone',
	'parish',
	'occupation',
	'street',
	'houseNumber',
	'neighborhood',
	'postalCode',
	'city',
	'state',
	'country',
	'tshirtSize',
	'snores',
] as const;

export type OfflineEditableParticipantField = (typeof OFFLINE_EDITABLE_PARTICIPANT_FIELDS)[number];

export function isOfflineEditableParticipantField(key: string): key is OfflineEditableParticipantField {
	return (OFFLINE_EDITABLE_PARTICIPANT_FIELDS as readonly string[]).includes(key);
}

/**
 * Comparable form of a field value: empty, null, undefined and `false` are the
 * same ("nothing written"; `snores` is null in old rows), the rest compares as
 * trimmed text.
 */
export function normalizeOfflineEditValue(value: unknown): string {
	if (value === null || value === undefined || value === false) return '';
	if (typeof value === 'string') return value.trim();
	return String(value);
}
