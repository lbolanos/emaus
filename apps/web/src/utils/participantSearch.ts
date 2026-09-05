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
 * Everyone who does not match fades back while a search is running, turning the
 * board into a map: where a family or a parish ended up is read at a glance
 * instead of walked match by match. Faded pills keep their shape and colour, so
 * the layout still reads.
 */
export const DIMMED_CLASS = 'opacity-40';

/**
 * Anything with a name. The retreat number arrives under two spellings across
 * the codebase (`id_on_retreat` in the entities, `idOnRetreat` in some API
 * payloads), so both are accepted and callers need no mapping.
 */
type SearchableParticipant = {
	firstName?: string | null;
	lastName?: string | null;
	nickname?: string | null;
	email?: string | null;
	id_on_retreat?: number | string | null;
	idOnRetreat?: number | string | null;
};

/**
 * Email is opt-in: admin lists search by address, but on the tables board or
 * at the door it only adds noise (every "gmail" would match).
 */
export type SearchOptions = { includeEmail?: boolean };

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
export const participantHaystack = (
	participant: SearchableParticipant,
	{ includeEmail = false }: SearchOptions = {},
): string =>
	normalizeText(
		[
			participant.id_on_retreat ?? participant.idOnRetreat,
			participant.firstName,
			participant.lastName,
			participant.nickname,
			includeEmail ? participant.email : null,
		]
			.filter(Boolean)
			.join(' '),
	);

/** Every token must appear somewhere, so word order does not matter. */
export const participantMatchesTokens = (
	participant: SearchableParticipant | null | undefined,
	tokens: string[],
	options?: SearchOptions,
): boolean => {
	if (!participant || tokens.length === 0) return false;
	const haystack = participantHaystack(participant, options);
	return tokens.every((token) => haystack.includes(token));
};

/**
 * Search class for a participant: the current match, another match, or faded
 * out. The state is computed once by the view that owns the search, so every
 * zone (unassigned lists, leader slots, table walkers) agrees on it.
 */
export type SearchHighlight = {
	/** Ids of every match, in navigation order. */
	matchingIds: string[];
	/** The match the user is standing on, if any. */
	currentMatchId: string | null;
	/** Whether the box has text: with an empty search nothing fades. */
	searching: boolean;
};

export const highlightClassFor = (
	participantId: string | null | undefined,
	{ matchingIds, currentMatchId, searching }: SearchHighlight,
): string => {
	if (!searching) return '';
	if (!participantId || !matchingIds.includes(participantId)) return DIMMED_CLASS;
	return participantId === currentMatchId ? CURRENT_MATCH_CLASS : OTHER_MATCH_CLASS;
};
