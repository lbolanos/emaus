import {
	parsePalancasCount,
	palancaMilestone,
	effectiveMinPalancas,
	resolvePalancas,
	DEFAULT_MIN_PALANCAS_PER_WALKER,
} from '@repo/utils';

/**
 * Criterio único para el conteo de cartas (palancas).
 *
 * Antes de esto el repo tenía tres criterios contradictorios sobre la misma
 * columna TEXT: `Number(raw) > 0`, "texto no vacío" y `parseInt`. El caso que
 * los delata es una ficha con prosa: el primero la daba por "Pendiente", el
 * segundo por "Recibidas" y el tercero no la contaba en el total.
 */
describe('parsePalancasCount', () => {
	it('lee enteros limpios, con o sin espacios', () => {
		expect(parsePalancasCount('3')).toBe(3);
		expect(parsePalancasCount('  3  ')).toBe(3);
		expect(parsePalancasCount('0')).toBe(0);
		expect(parsePalancasCount('12')).toBe(12);
		expect(parsePalancasCount(3)).toBe(3);
		expect(parsePalancasCount(0)).toBe(0);
	});

	it('devuelve null cuando no hay dato', () => {
		expect(parsePalancasCount(null)).toBeNull();
		expect(parsePalancasCount(undefined)).toBeNull();
		expect(parsePalancasCount('')).toBeNull();
		expect(parsePalancasCount('   ')).toBeNull();
	});

	it('rechaza prosa en vez de adivinar un número', () => {
		expect(parsePalancasCount('tres cartas de su mamá')).toBeNull();
		// El caso peligroso: parseInt daría 3 y con eso nace un cuarto criterio.
		expect(parsePalancasCount('3 de la mamá')).toBeNull();
		expect(parsePalancasCount('muchas')).toBeNull();
		expect(parsePalancasCount('~5')).toBeNull();
		expect(parsePalancasCount('3.5')).toBeNull();
		expect(parsePalancasCount('-2')).toBeNull();
	});
});

describe('palancaMilestone', () => {
	it('distingue no-recibió de no-capturado', () => {
		// Sin conteo y sin texto: no ha recibido.
		expect(palancaMilestone(null, 3, null)).toBe('none');
		expect(palancaMilestone(null, 3, '')).toBe('none');
		// Sin conteo pero CON texto: alguien escribió algo que no pudimos leer.
		// Este es el bug vivo de EditParticipantForm: se veía como "Pendiente".
		expect(palancaMilestone(null, 3, 'tres cartas de su mamá')).toBe('unknown');
	});

	it('clasifica contra el umbral', () => {
		expect(palancaMilestone(0, 3)).toBe('none');
		expect(palancaMilestone(1, 3)).toBe('below');
		expect(palancaMilestone(2, 3)).toBe('below');
		expect(palancaMilestone(3, 3)).toBe('met');
		expect(palancaMilestone(9, 3)).toBe('met');
	});

	it('respeta un umbral distinto del default', () => {
		expect(palancaMilestone(2, 2)).toBe('met');
		expect(palancaMilestone(2, 5)).toBe('below');
	});
});

describe('effectiveMinPalancas', () => {
	it('cae al default cuando el retiro no fija umbral', () => {
		expect(effectiveMinPalancas(null)).toBe(DEFAULT_MIN_PALANCAS_PER_WALKER);
		expect(effectiveMinPalancas(undefined)).toBe(DEFAULT_MIN_PALANCAS_PER_WALKER);
		expect(effectiveMinPalancas(0)).toBe(DEFAULT_MIN_PALANCAS_PER_WALKER);
	});

	it('usa el umbral del retiro cuando lo hay', () => {
		expect(effectiveMinPalancas(5)).toBe(5);
		expect(effectiveMinPalancas(1)).toBe(1);
	});
});

describe('resolvePalancas', () => {
	it('prefiere la columna de conteo sobre el texto heredado', () => {
		const r = resolvePalancas(
			{ palancasReceivedCount: 4, palancasReceived: 'lo que sea' },
			3,
		);
		expect(r).toEqual({ count: 4, threshold: 3, milestone: 'met' });
	});

	it('cae al texto cuando el conteo aún no está capturado', () => {
		expect(resolvePalancas({ palancasReceived: '2' }, 3).milestone).toBe('below');
		expect(resolvePalancas({ palancasReceived: '3' }, 3).milestone).toBe('met');
	});

	it('marca unknown cuando el texto heredado es prosa', () => {
		const r = resolvePalancas({ palancasReceived: 'dos de su tía' }, 3);
		expect(r.count).toBeNull();
		expect(r.milestone).toBe('unknown');
	});

	it('un cero explícito no es lo mismo que una ficha en blanco, pero ambos son none', () => {
		expect(resolvePalancas({ palancasReceivedCount: 0 }).milestone).toBe('none');
		expect(resolvePalancas({}).milestone).toBe('none');
	});

	it('usa el default del retiro cuando no se pasa umbral', () => {
		expect(resolvePalancas({ palancasReceivedCount: 3 }).threshold).toBe(
			DEFAULT_MIN_PALANCAS_PER_WALKER,
		);
	});
});
