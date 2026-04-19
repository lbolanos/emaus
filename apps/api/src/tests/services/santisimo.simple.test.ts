import {
	CreateSantisimoSlotSchema,
	UpdateSantisimoSlotSchema,
	GenerateSantisimoSlotsSchema,
	AdminCreateSantisimoSignupSchema,
	PublicSantisimoSignupSchema,
} from '@repo/types';

/**
 * Pure function that mirrors the slot generation math in santisimoService.
 * Kept here so we can unit-test boundary behavior without a DB.
 */
function computeSlotBoundaries(start: Date, end: Date, slotMinutes: number): Array<{ startTime: Date; endTime: Date }> {
	if (end <= start) throw new Error('endDateTime must be after startDateTime');
	const out: Array<{ startTime: Date; endTime: Date }> = [];
	for (
		let cursor = new Date(start);
		cursor < end;
		cursor = new Date(cursor.getTime() + slotMinutes * 60_000)
	) {
		const next = new Date(cursor.getTime() + slotMinutes * 60_000);
		const slotEnd = next > end ? end : next;
		out.push({ startTime: new Date(cursor), endTime: slotEnd });
	}
	return out;
}

describe('Santisimo — slot generation math', () => {
	test('creates one-hour slots covering a 3-hour window', () => {
		const start = new Date('2026-04-17T17:00:00Z');
		const end = new Date('2026-04-17T20:00:00Z');
		const slots = computeSlotBoundaries(start, end, 60);

		expect(slots).toHaveLength(3);
		expect(slots[0].startTime.toISOString()).toBe('2026-04-17T17:00:00.000Z');
		expect(slots[0].endTime.toISOString()).toBe('2026-04-17T18:00:00.000Z');
		expect(slots[2].endTime.toISOString()).toBe('2026-04-17T20:00:00.000Z');
	});

	test('covers a realistic retreat weekend (Fri 17:00 → Sun 13:00 = 44 one-hour slots)', () => {
		const start = new Date('2026-04-17T17:00:00Z');
		const end = new Date('2026-04-19T13:00:00Z');
		const slots = computeSlotBoundaries(start, end, 60);
		expect(slots).toHaveLength(44);
	});

	test('supports 30-minute slots', () => {
		const start = new Date('2026-04-17T17:00:00Z');
		const end = new Date('2026-04-17T18:00:00Z');
		const slots = computeSlotBoundaries(start, end, 30);
		expect(slots).toHaveLength(2);
		expect(slots[0].endTime.toISOString()).toBe('2026-04-17T17:30:00.000Z');
	});

	test('last slot is truncated if it would overshoot end', () => {
		const start = new Date('2026-04-17T17:00:00Z');
		const end = new Date('2026-04-17T18:45:00Z');
		const slots = computeSlotBoundaries(start, end, 60);
		expect(slots).toHaveLength(2);
		expect(slots[1].startTime.toISOString()).toBe('2026-04-17T18:00:00.000Z');
		expect(slots[1].endTime.toISOString()).toBe('2026-04-17T18:45:00.000Z');
	});

	test('throws when end <= start', () => {
		const start = new Date('2026-04-17T20:00:00Z');
		const end = new Date('2026-04-17T18:00:00Z');
		expect(() => computeSlotBoundaries(start, end, 60)).toThrow(/endDateTime must be after/);
	});

	test('throws when end equals start', () => {
		const d = new Date('2026-04-17T17:00:00Z');
		expect(() => computeSlotBoundaries(d, d, 60)).toThrow();
	});
});

describe('Santisimo — Zod schemas', () => {
	const uuid = '00000000-0000-4000-8000-000000000001';
	const retreatId = '00000000-0000-4000-8000-000000000002';

	describe('GenerateSantisimoSlotsSchema', () => {
		test('accepts valid generate payload', () => {
			const r = GenerateSantisimoSlotsSchema.safeParse({
				body: {
					startDateTime: '2026-04-17T17:00:00Z',
					endDateTime: '2026-04-19T13:00:00Z',
					slotMinutes: 60,
					capacity: 1,
				},
				params: { retreatId },
			});
			expect(r.success).toBe(true);
		});

		test('rejects too-short slot duration', () => {
			const r = GenerateSantisimoSlotsSchema.safeParse({
				body: {
					startDateTime: '2026-04-17T17:00:00Z',
					endDateTime: '2026-04-19T13:00:00Z',
					slotMinutes: 5,
				},
				params: { retreatId },
			});
			expect(r.success).toBe(false);
		});

		test('rejects too-long slot duration', () => {
			const r = GenerateSantisimoSlotsSchema.safeParse({
				body: {
					startDateTime: '2026-04-17T17:00:00Z',
					endDateTime: '2026-04-19T13:00:00Z',
					slotMinutes: 999,
				},
				params: { retreatId },
			});
			expect(r.success).toBe(false);
		});

		test('rejects negative capacity', () => {
			const r = GenerateSantisimoSlotsSchema.safeParse({
				body: {
					startDateTime: '2026-04-17T17:00:00Z',
					endDateTime: '2026-04-19T13:00:00Z',
					capacity: -1,
				},
				params: { retreatId },
			});
			expect(r.success).toBe(false);
		});
	});

	describe('CreateSantisimoSlotSchema', () => {
		test('accepts minimal valid slot', () => {
			const r = CreateSantisimoSlotSchema.safeParse({
				body: {
					startTime: '2026-04-17T17:00:00Z',
					endTime: '2026-04-17T18:00:00Z',
				},
				params: { retreatId },
			});
			expect(r.success).toBe(true);
		});

		test('accepts slot with intention and notes', () => {
			const r = CreateSantisimoSlotSchema.safeParse({
				body: {
					startTime: '2026-04-17T17:00:00Z',
					endTime: '2026-04-17T18:00:00Z',
					capacity: 2,
					isDisabled: false,
					intention: 'Por las familias',
					notes: 'Notas internas',
				},
				params: { retreatId },
			});
			expect(r.success).toBe(true);
		});

		test('rejects missing retreatId param', () => {
			const r = CreateSantisimoSlotSchema.safeParse({
				body: {
					startTime: '2026-04-17T17:00:00Z',
					endTime: '2026-04-17T18:00:00Z',
				},
				params: {},
			});
			expect(r.success).toBe(false);
		});
	});

	describe('UpdateSantisimoSlotSchema', () => {
		test('accepts partial update with just isDisabled', () => {
			const r = UpdateSantisimoSlotSchema.safeParse({
				body: { isDisabled: true },
				params: { id: uuid },
			});
			expect(r.success).toBe(true);
		});

		test('accepts null intention (to clear it)', () => {
			const r = UpdateSantisimoSlotSchema.safeParse({
				body: { intention: null },
				params: { id: uuid },
			});
			expect(r.success).toBe(true);
		});
	});

	describe('AdminCreateSantisimoSignupSchema', () => {
		test('accepts angelito-style signup with only name', () => {
			const r = AdminCreateSantisimoSignupSchema.safeParse({
				body: { slotId: uuid, name: 'Pedro García' },
				params: { retreatId },
			});
			expect(r.success).toBe(true);
		});

		test('rejects empty name', () => {
			const r = AdminCreateSantisimoSignupSchema.safeParse({
				body: { slotId: uuid, name: '' },
				params: { retreatId },
			});
			expect(r.success).toBe(false);
		});

		test('accepts signup with phone and email', () => {
			const r = AdminCreateSantisimoSignupSchema.safeParse({
				body: { slotId: uuid, name: 'Ana', phone: '555-1234', email: 'ana@example.com' },
				params: { retreatId },
			});
			expect(r.success).toBe(true);
		});

		test('accepts signup with empty string email (coerced to optional)', () => {
			const r = AdminCreateSantisimoSignupSchema.safeParse({
				body: { slotId: uuid, name: 'Ana', email: '' },
				params: { retreatId },
			});
			expect(r.success).toBe(true);
		});
	});

	describe('PublicSantisimoSignupSchema', () => {
		test('accepts valid public signup with only name', () => {
			const r = PublicSantisimoSignupSchema.safeParse({
				body: { slotIds: [uuid], name: 'Juan Pérez' },
				params: { slug: 'sanjudas2026' },
			});
			expect(r.success).toBe(true);
		});

		test('rejects empty slotIds array', () => {
			const r = PublicSantisimoSignupSchema.safeParse({
				body: { slotIds: [], name: 'Juan Pérez' },
				params: { slug: 'sanjudas2026' },
			});
			expect(r.success).toBe(false);
		});

		test('rejects missing name', () => {
			const r = PublicSantisimoSignupSchema.safeParse({
				body: { slotIds: [uuid] },
				params: { slug: 'sanjudas2026' },
			});
			expect(r.success).toBe(false);
		});

		test('accepts multiple slots', () => {
			const r = PublicSantisimoSignupSchema.safeParse({
				body: {
					slotIds: [uuid, '00000000-0000-4000-8000-000000000010'],
					name: 'Juan',
					phone: '555-1111',
				},
				params: { slug: 'retiro' },
			});
			expect(r.success).toBe(true);
		});
	});
});

describe('Santisimo — day grouping logic', () => {
	/**
	 * Mirrors the frontend's `columns` computed in both
	 * SantisimoAdminView.vue and PublicSantisimoView.vue.
	 * Slots are grouped by ISO date (YYYY-MM-DD) of their start.
	 */
	function groupByDay<T extends { startTime: Date | string }>(slots: T[]): Record<string, T[]> {
		const out: Record<string, T[]> = {};
		for (const s of slots) {
			const d = new Date(s.startTime);
			const key = d.toISOString().slice(0, 10);
			(out[key] ??= []).push(s);
		}
		return out;
	}

	test('groups slots into distinct days', () => {
		const slots = [
			{ startTime: new Date('2026-04-17T17:00:00Z') },
			{ startTime: new Date('2026-04-17T23:00:00Z') },
			{ startTime: new Date('2026-04-18T00:00:00Z') },
			{ startTime: new Date('2026-04-19T12:00:00Z') },
		];
		const grouped = groupByDay(slots);
		expect(Object.keys(grouped).sort()).toEqual(['2026-04-17', '2026-04-18', '2026-04-19']);
		expect(grouped['2026-04-17']).toHaveLength(2);
		expect(grouped['2026-04-18']).toHaveLength(1);
		expect(grouped['2026-04-19']).toHaveLength(1);
	});

	test('empty list returns empty object', () => {
		expect(groupByDay([])).toEqual({});
	});
});
