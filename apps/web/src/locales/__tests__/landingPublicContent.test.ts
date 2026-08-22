/**
 * Guardas del contenido de la landing pública.
 *
 * La landing la leen caminantes, no el equipo servidor, y hay cosas que la
 * organización decidió NO decir ahí. Estas reglas se perdían cada vez que
 * alguien reescribía un texto, así que quedan como test.
 *
 * Contexto y motivos: docs/features/landing-page.md
 */
import { describe, it, expect } from 'vitest';
import es from '../es.json';
import en from '../en.json';

type Entry = { path: string; text: string };

const flatten = (node: unknown, path = 'landing'): Entry[] => {
	if (typeof node === 'string') return [{ path, text: node }];
	if (node && typeof node === 'object') {
		return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
			flatten(value, `${path}.${key}`),
		);
	}
	return [];
};

const LOCALES: Array<[string, Entry[]]> = [
	['es', flatten((es as any).landing)],
	['en', flatten((en as any).landing)],
];

describe('contenido de la landing pública', () => {
	describe.each(LOCALES)('%s', (_locale, entries) => {
		it('no revela las palancas ni las cartas: son la sorpresa del retiro', () => {
			// \b al inicio también: sin él, "newsletter" cuenta como "letter"
			const offenders = entries.filter(({ text }) =>
				/\bpalancas?\b|\bcartas?\b|\bletters?\b/i.test(text),
			);
			expect(offenders).toEqual([]);
		});

		it('no describe las dinámicas internas del retiro (Santísimo, angelitos, misa de clausura)', () => {
			// Queja formal de otra hermandad (2026-08-22): lo que se vive adentro es la
			// sorpresa del caminante. A caminantes solo se les dice: tres días para
			// encontrarte contigo y con Dios.
			const offenders = entries.filter(({ text }) =>
				/sant[ií]simo|blessed sacrament|angelitos?\b|misa de clausura|closing mass/i.test(text),
			);
			expect(offenders).toEqual([]);
		});

		it('no ofrece becas: existen solo para casos excepcionales', () => {
			const offenders = entries.filter(({ text }) => /beca[s]?\b|scholarship/i.test(text));
			expect(offenders).toEqual([]);
		});

		it('no promete un costo fijo: cada retiro publica el suyo', () => {
			const offenders = entries.filter(({ text }) => /\$\s?\d|\d+\s?(pesos|mxn|usd)/i.test(text));
			expect(offenders).toEqual([]);
		});

		it('la respuesta de costos dice qué incluye y remite al retiro', () => {
			const answer = entries.find((entry) => entry.path.endsWith('thePath.faq.cost.a'));
			expect(answer).toBeDefined();
			// Hospedaje + comidas + materiales, confirmado por la organización
			expect(answer!.text.toLowerCase()).toMatch(/hospedaje|lodging/);
			expect(answer!.text.toLowerCase()).toMatch(/comida|meals/);
			expect(answer!.text.toLowerCase()).toMatch(/material/);
		});
	});

	it('las claves de El Camino y de los videos existen en los dos idiomas', () => {
		const required = [
			'landing.thePath.title',
			'landing.thePath.steps.weekend.body',
			'landing.thePath.steps.team.body',
			'landing.thePath.steps.after.body',
			'landing.thePath.faq.who.q',
			'landing.thePath.faq.serve.a',
			'landing.videos.title',
			'landing.videos.items.registration',
			'landing.nav.registration',
		];
		for (const [locale, entries] of LOCALES) {
			const paths = new Set(entries.map((entry) => entry.path));
			for (const key of required) {
				expect(paths.has(key), `${locale} sin ${key}`).toBe(true);
			}
		}
	});
});
