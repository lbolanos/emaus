// `externalRegistrationUrl` is the URL emaus.cc redirects walkers to when the
// parish runs registration on its own site (ParticipantRegistrationView calls
// `window.location.replace` with it) and the value encoded into the flyer QR.
//
// That makes it the one retreat field where a bad value is not a display bug
// but an open redirect / XSS vector: Zod's `.url()` alone accepts
// `javascript:alert(1)` because `new URL()` accepts any scheme. The schema
// therefore pins the protocol to http(s), and this test is the guard.
//
// It also covers clearing the field: the modal sends '' for an empty input, so
// '' must reach the DB as null instead of failing validation or being ignored.

import { describe, it, expect } from '@jest/globals';
import { createRetreatSchema, updateRetreatSchema } from '@repo/types';

const parse = (externalRegistrationUrl: unknown) =>
	updateRetreatSchema.shape.body.safeParse({ externalRegistrationUrl });

describe('retreat.externalRegistrationUrl', () => {
	describe('protocolos', () => {
		it('acepta https', () => {
			const result = parse('https://emaushombres.buendespacho.com/inscripcion');
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.externalRegistrationUrl).toBe(
					'https://emaushombres.buendespacho.com/inscripcion',
				);
			}
		});

		it('acepta http', () => {
			expect(parse('http://ejemplo.com/inscripcion').success).toBe(true);
		});

		it('rechaza javascript: aunque sea una URL válida para new URL()', () => {
			// new URL('javascript:alert(1)') no lanza, así que `.url()` por sí solo
			// lo dejaría pasar hasta window.location.replace.
			expect(parse('javascript:alert(1)').success).toBe(false);
		});

		it('rechaza data:', () => {
			expect(parse('data:text/html,<script>alert(1)</script>').success).toBe(false);
		});

		it('rechaza texto que no es una URL', () => {
			expect(parse('el sitio de la parroquia').success).toBe(false);
		});

		it('rechaza una URL más larga que el límite de la columna', () => {
			expect(parse(`https://ejemplo.com/${'a'.repeat(600)}`).success).toBe(false);
		});
	});

	describe('vaciar el campo', () => {
		it("'' se normaliza a null para poder borrar el enlace", () => {
			// El modal manda cadena vacía cuando el input queda en blanco; sin el
			// preprocess sería un 400, y mapeándolo a undefined el valor viejo
			// quedaría pegado para siempre.
			const result = parse('');
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.externalRegistrationUrl).toBeNull();
			}
		});

		it('null explícito también borra', () => {
			const result = parse(null);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.externalRegistrationUrl).toBeNull();
			}
		});

		it('omitir el campo no lo toca', () => {
			const result = updateRetreatSchema.shape.body.safeParse({});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.externalRegistrationUrl).toBeUndefined();
			}
		});
	});

	it('el schema de creación acepta un retiro sin enlace externo', () => {
		// La inmensa mayoría de los retiros registran en emaus.cc: el campo nunca
		// puede volverse obligatorio al crear.
		const result = createRetreatSchema.shape.body.safeParse({
			parish: 'Buen Despacho',
			startDate: new Date('2026-10-16'),
			endDate: new Date('2026-10-18'),
			houseId: '3f1a6d7e-0000-4000-8000-000000000001',
		});
		expect(result.success).toBe(true);
	});
});
