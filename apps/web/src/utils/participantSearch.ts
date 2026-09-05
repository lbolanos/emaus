/**
 * Highlight for the match the user is currently standing on. `match-bounce`
 * makes the pill hop once so the eye catches it; the animation replays because
 * the class lands on a different element on every search or step. Keyframes
 * live in TablesView's global style block.
 */
export const CURRENT_MATCH_CLASS =
	'match-bounce ring-2 ring-yellow-500 ring-offset-2 bg-yellow-200 dark:bg-yellow-700 scale-110';

/** Highlight for the remaining matches. */
export const OTHER_MATCH_CLASS = 'bg-yellow-100 dark:bg-yellow-800/50';

/**
 * Anything with a name. The retreat number arrives under two spellings across
 * the codebase (`id_on_retreat` in the entities, `idOnRetreat` in some API
 * payloads), so both are accepted and callers need no mapping.
 */
type SearchableParticipant = {
	firstName?: string | null;
	lastName?: string | null;
	nickname?: string | null;
	id_on_retreat?: number | string | null;
	idOnRetreat?: number | string | null;
};

/** Remove accents and lowercase, so "Pérez" matches "perez". */
export const normalizeText = (text: string): string =>
	text
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();

/** Split a query into normalized tokens; an empty query yields no tokens. */
export const searchTokens = (query: string): string[] =>
	normalizeText(query.trim())
		.split(/\s+/)
		.filter(Boolean);

/**
 * Single searchable string per participant. First and last name live in
 * separate fields, so matching them one by one makes "juan perez" find nothing.
 */
export const participantHaystack = (participant: SearchableParticipant): string =>
	normalizeText(
		[
			participant.id_on_retreat ?? participant.idOnRetreat,
			participant.firstName,
			participant.lastName,
			participant.nickname,
		]
			.filter(Boolean)
			.join(' '),
	);

/** Every token must appear somewhere, so word order does not matter. */
export const participantMatchesTokens = (
	participant: SearchableParticipant | null | undefined,
	tokens: string[],
): boolean => {
	if (!participant || tokens.length === 0) return false;
	const haystack = participantHaystack(participant);
	return tokens.every((token) => haystack.includes(token));
};

/**
 * Highlight class for a participant. `matchingIds` and `currentMatchId` are
 * computed once by the view that owns the search, so every zone (unassigned
 * lists, leader slots, table walkers) agrees on which match is the current one.
 */
export const highlightClassFor = (
	participantId: string | null | undefined,
	matchingIds: string[],
	currentMatchId: string | null,
): string => {
	if (!participantId || !matchingIds.includes(participantId)) return '';
	return participantId === currentMatchId ? CURRENT_MATCH_CLASS : OTHER_MATCH_CLASS;
};
