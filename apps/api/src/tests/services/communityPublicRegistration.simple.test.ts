/**
 * Tests for the public community registration feature.
 *
 * Cubren:
 *  - Validación Zod del input público (`publicRegisterCommunitySchema`).
 *  - Validación Zod del rechazo (`rejectCommunitySchema`).
 *  - Helper de cálculo del próximo día de la semana (lógica de
 *    `createDefaultMeetingForCommunity` extraída en este test para no
 *    requerir DataSource).
 *
 * No tocamos AppDataSource — son tests de pure logic / Zod, rápidos y
 * sin dependencias de SQLite ni TypeORM.
 */

import {
	publicRegisterCommunitySchema,
	rejectCommunitySchema,
	approveCommunitySchema,
	CommunityStatusEnum,
	DayOfWeekEnum,
} from '@repo/types';

const validBody = {
	name: 'Comunidad de Prueba',
	address1: 'Av. Reforma 100',
	city: 'Ciudad de México',
	state: 'CDMX',
	zipCode: '06600',
	country: 'México',
	latitude: 19.4326,
	longitude: -99.1332,
	contactName: 'Pedro Pruebas',
	contactEmail: 'pedro@example.com',
	recaptchaToken: 'fake-token',
};

describe('publicRegisterCommunitySchema', () => {
	it('acepta un body con solo los campos requeridos', () => {
		const result = publicRegisterCommunitySchema.safeParse({ body: validBody });
		expect(result.success).toBe(true);
	});

	it('acepta horario por defecto completo', () => {
		const result = publicRegisterCommunitySchema.safeParse({
			body: {
				...validBody,
				defaultMeetingDayOfWeek: 'wednesday',
				defaultMeetingInterval: 2,
				defaultMeetingTime: '19:00',
				defaultMeetingDurationMinutes: 90,
				defaultMeetingDescription: 'Detrás de la sacristía',
			},
		});
		expect(result.success).toBe(true);
	});

	it('acepta URLs vacías como undefined (transform)', () => {
		const result = publicRegisterCommunitySchema.safeParse({
			body: {
				...validBody,
				website: '',
				facebookUrl: '',
				instagramUrl: '',
				googleMapsUrl: '',
			},
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.body.website).toBeUndefined();
			expect(result.data.body.facebookUrl).toBeUndefined();
		}
	});

	it('rechaza email inválido', () => {
		const result = publicRegisterCommunitySchema.safeParse({
			body: { ...validBody, contactEmail: 'no-es-email' },
		});
		expect(result.success).toBe(false);
	});

	it('rechaza lat fuera de rango', () => {
		const result = publicRegisterCommunitySchema.safeParse({
			body: { ...validBody, latitude: 200 },
		});
		expect(result.success).toBe(false);
	});

	it('rechaza lng fuera de rango', () => {
		const result = publicRegisterCommunitySchema.safeParse({
			body: { ...validBody, longitude: -200 },
		});
		expect(result.success).toBe(false);
	});

	it('rechaza name vacío', () => {
		const result = publicRegisterCommunitySchema.safeParse({
			body: { ...validBody, name: '' },
		});
		expect(result.success).toBe(false);
	});

	it('rechaza name de más de 200 caracteres', () => {
		const result = publicRegisterCommunitySchema.safeParse({
			body: { ...validBody, name: 'a'.repeat(201) },
		});
		expect(result.success).toBe(false);
	});

	it('rechaza ausencia de recaptchaToken', () => {
		const { recaptchaToken: _omit, ...withoutToken } = validBody;
		const result = publicRegisterCommunitySchema.safeParse({ body: withoutToken });
		expect(result.success).toBe(false);
	});

	it('rechaza recaptchaToken vacío', () => {
		const result = publicRegisterCommunitySchema.safeParse({
			body: { ...validBody, recaptchaToken: '' },
		});
		expect(result.success).toBe(false);
	});

	it('rechaza día de la semana inválido', () => {
		const result = publicRegisterCommunitySchema.safeParse({
			body: {
				...validBody,
				defaultMeetingDayOfWeek: 'lunes', // debería ser 'monday'
				defaultMeetingTime: '19:00',
				defaultMeetingInterval: 1,
			},
		});
		expect(result.success).toBe(false);
	});

	it('rechaza hora con formato inválido', () => {
		const result = publicRegisterCommunitySchema.safeParse({
			body: {
				...validBody,
				defaultMeetingDayOfWeek: 'monday',
				defaultMeetingTime: '7:00 PM', // debe ser HH:mm 24h
				defaultMeetingInterval: 1,
			},
		});
		expect(result.success).toBe(false);
	});

	it('rechaza intervalo no positivo', () => {
		const result = publicRegisterCommunitySchema.safeParse({
			body: { ...validBody, defaultMeetingInterval: 0 },
		});
		expect(result.success).toBe(false);
	});

	it('rechaza duración fuera de rango', () => {
		const result = publicRegisterCommunitySchema.safeParse({
			body: { ...validBody, defaultMeetingDurationMinutes: 5 }, // mín 15
		});
		expect(result.success).toBe(false);
	});

	it('normaliza el contactEmail a minúsculas', () => {
		const result = publicRegisterCommunitySchema.safeParse({
			body: { ...validBody, contactEmail: 'PEDRO@Example.COM' },
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.body.contactEmail).toBe('pedro@example.com');
		}
	});

	it('hace trim de strings con espacios', () => {
		const result = publicRegisterCommunitySchema.safeParse({
			body: { ...validBody, name: '   Comunidad   ' },
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.body.name).toBe('Comunidad');
		}
	});
});

describe('approveCommunitySchema / rejectCommunitySchema', () => {
	const validId = '123e4567-e89b-12d3-a456-426614174000';

	it('approveCommunitySchema acepta UUID válido', () => {
		const result = approveCommunitySchema.safeParse({ params: { id: validId } });
		expect(result.success).toBe(true);
	});

	it('approveCommunitySchema rechaza UUID inválido', () => {
		const result = approveCommunitySchema.safeParse({ params: { id: 'not-a-uuid' } });
		expect(result.success).toBe(false);
	});

	it('rejectCommunitySchema acepta sin razón (opcional)', () => {
		const result = rejectCommunitySchema.safeParse({
			params: { id: validId },
			body: {},
		});
		expect(result.success).toBe(true);
	});

	it('rejectCommunitySchema acepta razón opcional', () => {
		const result = rejectCommunitySchema.safeParse({
			params: { id: validId },
			body: { rejectionReason: 'Información insuficiente' },
		});
		expect(result.success).toBe(true);
	});

	it('rejectCommunitySchema rechaza razón mayor a 2000 chars', () => {
		const result = rejectCommunitySchema.safeParse({
			params: { id: validId },
			body: { rejectionReason: 'a'.repeat(2001) },
		});
		expect(result.success).toBe(false);
	});
});

describe('CommunityStatusEnum / DayOfWeekEnum', () => {
	it('CommunityStatusEnum incluye los 3 estados', () => {
		expect(CommunityStatusEnum.options).toEqual(['pending', 'active', 'rejected']);
	});

	it('DayOfWeekEnum incluye los 7 días en inglés', () => {
		expect(DayOfWeekEnum.options).toEqual([
			'monday',
			'tuesday',
			'wednesday',
			'thursday',
			'friday',
			'saturday',
			'sunday',
		]);
	});
});

/**
 * Helper inlined: replica de `getNextDayOfWeekDate` (private en
 * communityService.ts). Se prueba aquí para no exponerlo.
 */
function getNextDayOfWeekDate(dayOfWeek: string, time: string, now: Date): Date {
	const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
	const targetDay = days.indexOf(dayOfWeek.toLowerCase());
	if (targetDay < 0) return new Date(now);

	const [hours, minutes] = time.split(':').map(Number);
	const result = new Date(now);
	result.setHours(hours, minutes, 0, 0);

	const currentDay = result.getDay();
	let diff = targetDay - currentDay;
	if (diff < 0 || (diff === 0 && result <= now)) {
		diff += 7;
	}
	result.setDate(result.getDate() + diff);
	return result;
}

describe('getNextDayOfWeekDate (lógica del horario por defecto)', () => {
	// Jueves 7 de mayo de 2026 a las 12:00
	const now = new Date('2026-05-07T12:00:00');

	it('devuelve el próximo miércoles si hoy es jueves', () => {
		const next = getNextDayOfWeekDate('wednesday', '19:00', now);
		// Miércoles 13 de mayo
		expect(next.getDay()).toBe(3);
		expect(next.getDate()).toBe(13);
		expect(next.getHours()).toBe(19);
		expect(next.getMinutes()).toBe(0);
	});

	it('devuelve el siguiente jueves (no hoy mismo) si la hora ya pasó', () => {
		// Si la reunión es jueves y hoy es jueves a las 12:00, pero la hora pedida es 10:00, ya pasó
		const next = getNextDayOfWeekDate('thursday', '10:00', now);
		// Jueves 14 de mayo (la próxima semana)
		expect(next.getDay()).toBe(4);
		expect(next.getDate()).toBe(14);
	});

	it('devuelve hoy si la hora pedida aún no pasó (mismo día de la semana)', () => {
		const next = getNextDayOfWeekDate('thursday', '20:00', now);
		// Jueves 7 de mayo a las 20:00
		expect(next.getDay()).toBe(4);
		expect(next.getDate()).toBe(7);
		expect(next.getHours()).toBe(20);
	});

	it('respeta dayOfWeek case-insensitive', () => {
		const next = getNextDayOfWeekDate('FRIDAY', '08:00', now);
		expect(next.getDay()).toBe(5);
	});
});
