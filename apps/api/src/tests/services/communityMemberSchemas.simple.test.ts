import {
	updateMemberProfileSchema,
	setCommunityMemberPhotoSchema,
	publicJoinRequestSchema,
} from '@repo/types';

/**
 * Contrato de la frontera de validación para el cumpleaños y la foto.
 *
 * Existe por un bug recurrente del proyecto: encadenar un formato con
 * `.optional()` (`.regex(...).optional()`, `.url().optional()`) rechaza el
 * STRING VACÍO que el cliente manda al limpiar un campo, y el usuario recibe
 * un 400 incomprensible. Estos campos aceptan `''` a propósito — significa
 * "borra el dato" — y estos tests lo fijan.
 */

const uuid = '11111111-1111-4111-8111-111111111111';
const params = { id: uuid, memberId: uuid };

const parseProfile = (body: Record<string, unknown>) =>
	updateMemberProfileSchema.safeParse({ body, params });

describe('updateMemberProfileSchema — birthDate', () => {
	it('acepta el formato con año', () => {
		expect(parseProfile({ birthDate: '1985-03-14' }).success).toBe(true);
	});

	it('acepta el formato sin año', () => {
		expect(parseProfile({ birthDate: '03-14' }).success).toBe(true);
	});

	it('acepta el string vacío para limpiar el dato', () => {
		// El caso que rompe si alguien "endurece" el schema con .regex().optional().
		expect(parseProfile({ birthDate: '' }).success).toBe(true);
	});

	it('rechaza otros formatos de fecha', () => {
		expect(parseProfile({ birthDate: '14/03/1985' }).success).toBe(false);
		expect(parseProfile({ birthDate: '1985/03/14' }).success).toBe(false);
		expect(parseProfile({ birthDate: 'mañana' }).success).toBe(false);
		expect(parseProfile({ birthDate: '1985-3-4' }).success).toBe(false);
	});

	it('rechaza una cadena más larga de lo que cabe en la columna', () => {
		expect(parseProfile({ birthDate: '1985-03-14T00:00:00Z' }).success).toBe(false);
	});

	it('sigue permitiendo actualizar solo el cumpleaños', () => {
		// El schema exige al menos un campo; birthDate debe contar como uno.
		const result = parseProfile({ birthDate: '03-14' });
		expect(result.success).toBe(true);
	});

	it('el calendario NO se valida aquí (lo hace el service)', () => {
		// 31 de febrero pasa la forma; `normalizeBirthdayValue` lo rechaza
		// después y el controller devuelve INVALID_BIRTH_DATE. Se fija para que
		// nadie "arregle" el schema creyendo que hay un hueco.
		expect(parseProfile({ birthDate: '02-31' }).success).toBe(true);
	});
});

describe('setCommunityMemberPhotoSchema', () => {
	const parsePhoto = (body: Record<string, unknown>) =>
		setCommunityMemberPhotoSchema.safeParse({ body, params });

	it('acepta un data-URI de imagen', () => {
		for (const type of ['jpeg', 'jpg', 'png', 'gif', 'webp']) {
			expect(parsePhoto({ photoData: `data:image/${type};base64,AAAA` }).success).toBe(true);
		}
	});

	it('rechaza lo que no es una imagen', () => {
		expect(parsePhoto({ photoData: 'no-soy-una-imagen' }).success).toBe(false);
		expect(parsePhoto({ photoData: '' }).success).toBe(false);
		expect(parsePhoto({ photoData: 'data:text/html;base64,PHNjcmlwdD4=' }).success).toBe(false);
		// Un SVG puede llevar script dentro: no está en la lista permitida.
		expect(parsePhoto({ photoData: 'data:image/svg+xml;base64,AAAA' }).success).toBe(false);
	});

	it('exige los dos ids en la ruta', () => {
		expect(
			setCommunityMemberPhotoSchema.safeParse({
				body: { photoData: 'data:image/png;base64,AAAA' },
				params: { id: uuid },
			}).success,
		).toBe(false);
	});
});

describe('publicJoinRequestSchema — cumpleaños opcional', () => {
	const base = {
		firstName: 'Juan',
		lastName: 'Pérez',
		email: 'juan@example.com',
		cellPhone: '5551234567',
	};
	const parseJoin = (body: Record<string, unknown>) =>
		publicJoinRequestSchema.safeParse({ body, params: { id: uuid } });

	it('funciona sin cumpleaños (es opcional)', () => {
		expect(parseJoin(base).success).toBe(true);
	});

	it('acepta el cumpleaños en los dos formatos', () => {
		expect(parseJoin({ ...base, birthDate: '1985-03-14' }).success).toBe(true);
		expect(parseJoin({ ...base, birthDate: '03-14' }).success).toBe(true);
	});

	it('acepta el string vacío que manda el formulario cuando no se llena', () => {
		expect(parseJoin({ ...base, birthDate: '' }).success).toBe(true);
	});

	it('rechaza basura en el cumpleaños', () => {
		expect(parseJoin({ ...base, birthDate: 'ayer' }).success).toBe(false);
	});
});
