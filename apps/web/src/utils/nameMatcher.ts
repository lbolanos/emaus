/**
 * Fuzzy name matching for spoken attendance (specs/community-attendance-faces, FR-19, D5).
 * Pure and offline: speech recognition gives lowercase words, often without accents,
 * with merged/split tokens or trailing punctuation, so we compare normalized tokens
 * with Jaro-Winkler instead of exact strings.
 */

export interface NameCandidate {
	id: string;
	name: string;
}

export interface NameMatch extends NameCandidate {
	score: number;
}

export interface MatchNamesOptions {
	/** Max results returned. Default 3. */
	limit?: number;
	/** Results scoring below this are dropped. Default 0.8 (0..1+bonus, capped at 1). */
	minScore?: number;
}

export const DEFAULT_LIMIT = 3;
export const DEFAULT_MIN_SCORE = 0.8;

/** Spanish particles that carry no identity ("María de la Luz" vs "maria luz"). */
const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y']);
/** Added when the first spoken token matches the candidate's first name. */
const FIRST_NAME_BONUS = 0.05;
/** A first-name token counts as matching at or above this similarity. */
const FIRST_NAME_THRESHOLD = 0.9;

export function normalizeName(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

const tokenize = (text: string): string[] =>
	normalizeName(text)
		.split(' ')
		.filter((t) => t && !PARTICLES.has(t));

export function jaroWinkler(a: string, b: string): number {
	if (a === b) return a.length === 0 ? 0 : 1;
	if (!a.length || !b.length) return 0;
	const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
	const aMatched = new Array<boolean>(a.length).fill(false);
	const bMatched = new Array<boolean>(b.length).fill(false);
	let matches = 0;
	for (let i = 0; i < a.length; i++) {
		const from = Math.max(0, i - window);
		const to = Math.min(b.length - 1, i + window);
		for (let j = from; j <= to; j++) {
			if (bMatched[j] || a[i] !== b[j]) continue;
			aMatched[i] = true;
			bMatched[j] = true;
			matches++;
			break;
		}
	}
	if (matches === 0) return 0;
	let transpositions = 0;
	let k = 0;
	for (let i = 0; i < a.length; i++) {
		if (!aMatched[i]) continue;
		while (!bMatched[k]) k++;
		if (a[i] !== b[k]) transpositions++;
		k++;
	}
	const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
	let prefix = 0;
	while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
	return jaro + prefix * 0.1 * (1 - jaro);
}

function scoreCandidate(spoken: string[], candidate: string[]): number {
	if (!spoken.length || !candidate.length) return 0;
	let total = 0;
	for (const s of spoken) {
		let best = 0;
		for (const c of candidate) best = Math.max(best, jaroWinkler(s, c));
		total += best;
	}
	let score = total / spoken.length;
	// Speech often merges or splits tokens ("de la cruz" -> "delacruz"): try the joined form too.
	const joinedSpoken = spoken.join('');
	const joinedCandidate = candidate.join('');
	score = Math.max(score, jaroWinkler(joinedSpoken, joinedCandidate));
	if (jaroWinkler(spoken[0], candidate[0]) >= FIRST_NAME_THRESHOLD) score += FIRST_NAME_BONUS;
	return Math.min(1, score);
}

/**
 * Best candidates for a spoken name, sorted by score desc (ties by name).
 * Returns [] for empty input or when nothing reaches `minScore`.
 */
export function matchNames(
	spoken: string,
	candidates: NameCandidate[],
	opts: MatchNamesOptions = {},
): NameMatch[] {
	const limit = opts.limit ?? DEFAULT_LIMIT;
	const minScore = opts.minScore ?? DEFAULT_MIN_SCORE;
	const spokenTokens = tokenize(spoken);
	if (!spokenTokens.length || limit <= 0) return [];
	const out: NameMatch[] = [];
	for (const c of candidates) {
		const score = scoreCandidate(spokenTokens, tokenize(c.name));
		if (score >= minScore) out.push({ id: c.id, name: c.name, score });
	}
	out.sort((x, y) => y.score - x.score || x.name.localeCompare(y.name));
	return out.slice(0, limit);
}
