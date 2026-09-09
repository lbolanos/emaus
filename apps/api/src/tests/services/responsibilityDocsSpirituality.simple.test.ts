/**
 * Contract for the "why this service matters" block that opens every operational
 * document (responsibilities, short texts and service team instructions).
 *
 * The block exists so a server reading their assignment finds the meaning of the task
 * before the checklist. Two things this guards:
 *   - the block is complete and sits above the operational table, and
 *   - the long charla scripts and the confidential dynamics were deliberately left alone
 *     (they already carry their own purpose section), so a future pass doesn't add it
 *     there out of inertia.
 */
import { createHash } from 'crypto';
import { charlaDocumentation, responsibilityDocumentation } from '../../data/charlaDocumentation';
import { defaultServiceTeams } from '../../data/dynamicsTemplates';
import { PREVIOUS_DOC_HASHES, PREVIOUS_TEAM_INSTRUCTION_HASHES } from '../../data/canonicalDocHashes';

const HEADINGS = [
	'### Objetivo',
	'### Por qué importa',
	'### La espiritualidad detrás',
	'### El regalo de servir aquí',
];

/** Unique to the block: the long charlas already had a "### Objetivo" of their own. */
const MARKER = '### La espiritualidad detrás';

/** Short texts that get the block. The other 13 charla scripts keep their own opening. */
const TEXTS_WITH_BLOCK = [
	'Texto: Explicación del Lema "Jesucristo Ha Resucitado"',
	'Texto: Explicación de la Confidencialidad',
	'Texto: Explicación de La Palanca',
	'Texto: Explicación del Ágape',
	'Charla: Conocerte a Ti Mismo',
	'Texto: Oración al Espíritu Santo',
	'Texto: Carta de Jesús',
	'Texto: Dinámica de Sanación',
];

/** Dynamics teams keep their original instructions: they explain their own meaning already. */
const TEAMS_WITHOUT_BLOCK = [
	'Dinámica de la Pared',
	'Serenata',
	'Dinámica del Perdón / Clausura',
	'Dinámica de la Rosa',
	'Dinámica de las Máscaras',
	'Sanación de los Recuerdos',
	'Examen de Conciencia / Quema de Pecados',
];

/** Anything specific to one retreat, house or edition must never be frozen into a template. */
const BURNED_IN_LITERALS = [
	'Polanco',
	'23 de Mayo',
	'23 de marzo',
	'17 de enero',
	'24 de enero',
	'31 de enero',
	'30 caminantes',
];

const sha256 = (value: string) => createHash('sha256').update(value, 'utf-8').digest('hex');
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

/**
 * Just the block, so the literal check audits what this feature wrote and not the
 * inherited manual (which does mention a parish by name in one of its variants).
 * It runs from the first heading to the end of the paragraph under the last one.
 */
const blockBounds = (content: string) => {
	const start = content.indexOf(HEADINGS[0]);
	if (start === -1) return null;
	const gift = content.indexOf(HEADINGS[3]);
	const afterGift = content.indexOf('\n\n', gift);
	return { start, end: afterGift === -1 ? content.length : afterGift + 2 };
};

const extractBlock = (content: string) => {
	const bounds = blockBounds(content);
	return bounds ? content.slice(bounds.start, bounds.end) : '';
};

/** The document as it was before the block: what is left once the block is removed. */
const withoutBlock = (content: string) => {
	const bounds = blockBounds(content);
	return bounds ? content.slice(0, bounds.start) + content.slice(bounds.end) : content;
};

const allDocs = { ...charlaDocumentation, ...responsibilityDocumentation };
const docsWithBlock = [...Object.keys(responsibilityDocumentation), ...TEXTS_WITH_BLOCK];
const teamsWithBlock = defaultServiceTeams.filter((t) => !TEAMS_WITHOUT_BLOCK.includes(t.name));

describe('Spirituality block', () => {
	describe('documents that carry it', () => {
		test('covers every responsibility plus the eight short texts', () => {
			expect(docsWithBlock).toHaveLength(37);
		});

		test.each(docsWithBlock)('%s has the four subsections exactly once', (name) => {
			const content = allDocs[name];
			expect(content).toBeDefined();
			for (const heading of HEADINGS) {
				expect(occurrences(content, heading)).toBe(1);
			}
		});

		test.each(docsWithBlock)('%s opens with the block, before the operational table', (name) => {
			const content = allDocs[name];
			const table = content.indexOf('| # |');
			if (table === -1) return; // texts without a table
			expect(content.indexOf(HEADINGS[0])).toBeLessThan(table);
		});

		test.each(docsWithBlock)('%s: the block carries no retreat-specific literal', (name) => {
			const block = extractBlock(allDocs[name]);
			expect(block).not.toHaveLength(0);
			for (const literal of BURNED_IN_LITERALS) {
				expect(block).not.toContain(literal);
			}
		});

		test.each(docsWithBlock.filter((n) => n !== 'Despedida'))(
			'%s: the block was added on top, the manual text is untouched',
			(name) => {
				// Removing the block must yield the frozen revision byte for byte: this is what
				// proves the pass added meaning without rewriting or dropping a single manual row,
				// and it is also what lets the refresh migration recognise an unedited copy.
				expect(PREVIOUS_DOC_HASHES[name]).toContain(sha256(withoutBlock(allDocs[name])));
			},
		);

		test.each(docsWithBlock)('%s: the block is the first thing after the title', (name) => {
			const before = allDocs[name].slice(0, allDocs[name].indexOf(HEADINGS[0]));
			expect(before).not.toMatch(/^###\s/m); // never below a manual subsection
			expect(before).not.toContain('| # |'); // never below the operational table
		});

		test.each(docsWithBlock)('%s: the block speaks to the serving team, not to the walker', (name) => {
			const block = extractBlock(allDocs[name]);
			expect(block).not.toMatch(/\bt[uú] caminante\b/i);
			expect(block).not.toMatch(/\bbienvenido a tu retiro\b/i);
		});
	});

	describe('documents deliberately left alone', () => {
		const untouched = Object.keys(charlaDocumentation).filter((n) => !TEXTS_WITH_BLOCK.includes(n));

		test('the 13 long charla scripts keep their own opening', () => {
			expect(untouched).toHaveLength(13);
		});

		test.each(untouched)('%s has no block and is byte-identical to its frozen revision', (name) => {
			const content = charlaDocumentation[name];
			expect(content).not.toContain(MARKER);
			expect(PREVIOUS_DOC_HASHES[name]).toContain(sha256(content));
		});
	});

	describe('service team instructions', () => {
		test('twenty operational teams carry the block', () => {
			expect(teamsWithBlock).toHaveLength(20);
		});

		test.each(teamsWithBlock.map((t) => [t.name, t] as const))(
			'%s has the four subsections exactly once',
			(_name, team) => {
				for (const heading of HEADINGS) {
					expect(occurrences(team.instructions ?? '', heading)).toBe(1);
				}
			},
		);

		test.each(teamsWithBlock.map((t) => [t.name, t] as const))(
			'%s: the block was added on top, the original instructions are untouched',
			(name, team) => {
				expect(PREVIOUS_TEAM_INSTRUCTION_HASHES[name]).toContain(
					sha256(withoutBlock(team.instructions ?? '')),
				);
			},
		);

		test.each(teamsWithBlock.map((t) => [t.name, t] as const))(
			'%s: the block carries no retreat-specific literal',
			(_name, team) => {
				const block = extractBlock(team.instructions ?? '');
				expect(block).not.toHaveLength(0);
				for (const literal of BURNED_IN_LITERALS) {
					expect(block).not.toContain(literal);
				}
			},
		);

		test.each(TEAMS_WITHOUT_BLOCK)('%s keeps its original instructions', (name) => {
			const team = defaultServiceTeams.find((t) => t.name === name);
			expect(team).toBeDefined();
			expect(team!.instructions).not.toContain(MARKER);
			expect(PREVIOUS_TEAM_INSTRUCTION_HASHES[name]).toContain(sha256(team!.instructions ?? ''));
		});
	});

	describe('roles that used to share the exact same document', () => {
		test.each([
			['Salón', 'Cuartos'],
			['Santísimo', 'Oración de Intercesión'],
			['Compras', 'Snacks'],
		])('%s and %s no longer read identically', (a, b) => {
			expect(responsibilityDocumentation[a]).not.toBe(responsibilityDocumentation[b]);
			expect(responsibilityDocumentation[a]).toBeDefined();
			expect(responsibilityDocumentation[b]).toBeDefined();
		});
	});

	describe('Despedida', () => {
		test('has a document at last: block plus operational table', () => {
			const doc = responsibilityDocumentation['Despedida'];
			expect(doc).toBeDefined();
			for (const heading of HEADINGS) expect(doc).toContain(heading);
			expect(doc).toContain('| # | Descripción | Cuándo | Dónde |');
		});
	});
});
