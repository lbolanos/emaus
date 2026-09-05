import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
	CURRENT_MATCH_CLASS,
	DIMMED_CLASS,
	OTHER_MATCH_CLASS,
	highlightClassFor,
	participantMatchesTokens,
	searchTokens,
} from '../participantSearch';

const juan = { firstName: 'Juan Carlos', lastName: 'Pérez Gómez', nickname: 'Juanito', id_on_retreat: 12 };
const ana = { firstName: 'Ana', lastName: 'López', nickname: undefined, id_on_retreat: 7 };

const matches = (participant: typeof juan | typeof ana, query: string) =>
	participantMatchesTokens(participant, searchTokens(query));

describe('participantMatchesTokens', () => {
	it('encuentra por nombre completo aunque nombre y apellido sean campos distintos', () => {
		expect(matches(juan, 'juan perez')).toBe(true);
		expect(matches(juan, 'Juan Pérez')).toBe(true);
	});

	it('ignora el orden de las palabras', () => {
		expect(matches(juan, 'perez juan')).toBe(true);
	});

	it('ignora acentos y mayúsculas', () => {
		expect(matches(juan, 'PEREZ')).toBe(true);
		expect(matches(juan, 'gomez')).toBe(true);
	});

	it('busca por apodo y por número de retiro', () => {
		expect(matches(juan, 'juanito')).toBe(true);
		expect(matches(juan, '12')).toBe(true);
	});

	it('exige que todas las palabras coincidan', () => {
		expect(matches(juan, 'juan lopez')).toBe(false);
		expect(matches(ana, 'ana perez')).toBe(false);
	});

	it('no devuelve coincidencias con la búsqueda vacía', () => {
		expect(searchTokens('   ')).toEqual([]);
		expect(matches(juan, '   ')).toBe(false);
	});
});

describe('highlightClassFor', () => {
	const ids = ['a', 'b', 'c'];
	const searching = (currentMatchId: string | null) => ({ matchingIds: ids, currentMatchId, searching: true });

	it('marca como actual solo al participante actual', () => {
		expect(highlightClassFor('b', searching('b'))).toBe(CURRENT_MATCH_CLASS);
		expect(highlightClassFor('a', searching('b'))).toBe(OTHER_MATCH_CLASS);
		expect(highlightClassFor('c', searching('b'))).toBe(OTHER_MATCH_CLASS);
	});

	it('atenúa a quien no coincide, para leer el tablero de un vistazo', () => {
		expect(highlightClassFor('z', searching('b'))).toBe(DIMMED_CLASS);
		expect(highlightClassFor(null, searching('b'))).toBe(DIMMED_CLASS);
	});

	it('atenúa a todos cuando la búsqueda no encuentra nada', () => {
		expect(highlightClassFor('a', { matchingIds: [], currentMatchId: null, searching: true })).toBe(
			DIMMED_CLASS,
		);
	});

	it('no toca a nadie mientras no se está buscando', () => {
		expect(highlightClassFor('a', { matchingIds: [], currentMatchId: null, searching: false })).toBe('');
		expect(highlightClassFor('a', { matchingIds: ids, currentMatchId: 'a', searching: false })).toBe('');
	});
});

describe('rebote de la coincidencia actual', () => {
	it('la coincidencia actual pide la animación y las demás no', () => {
		expect(CURRENT_MATCH_CLASS).toContain('match-bounce');
		expect(OTHER_MATCH_CLASS).not.toContain('match-bounce');
	});

	it('TablesView define los keyframes que la clase usa', () => {
		const css = readFileSync(resolve(__dirname, '../../views/TablesView.vue'), 'utf8');
		expect(css).toContain('@keyframes match-bounce');
		expect(css).toMatch(/\.match-bounce\s*{[^}]*animation:\s*match-bounce/);
	});
});
