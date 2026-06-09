/**
 * Guard contra el bug recurrente: los Create/Update schemas NO deben requerir
 * campos read-only/derivados (id, isPrimary, sortOrder, createdAt). El cliente
 * a veces reenvía el DTO de lectura completo; el schema debe aceptarlo
 * (descartando los extras) y nunca exigir los derivados.
 */

import {
	createRetreatMemorySongSchema,
	updateRetreatMemorySongSchema,
	createRetreatSchema,
	updateRetreatSchema,
} from '@repo/types';

describe('retreat memory write schemas', () => {
	it('createRetreatMemorySongSchema solo requiere url (title opcional)', () => {
		expect(createRetreatMemorySongSchema.safeParse({ url: 'https://a.com' }).success).toBe(true);
		expect(
			createRetreatMemorySongSchema.safeParse({ url: 'https://a.com', title: 'X' }).success,
		).toBe(true);
		// url inválida -> falla
		expect(createRetreatMemorySongSchema.safeParse({ title: 'X' }).success).toBe(false);
	});

	it('createRetreatMemorySongSchema acepta el read DTO completo (descarta read-only)', () => {
		const readDto = {
			id: '11111111-1111-1111-1111-111111111111',
			retreatId: '22222222-2222-2222-2222-222222222222',
			url: 'https://a.com',
			title: 'Cantos',
			isPrimary: true,
			sortOrder: 0,
			createdAt: new Date(),
		};
		const parsed = createRetreatMemorySongSchema.safeParse(readDto);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			// Solo conserva los campos de escritura.
			expect(parsed.data).toEqual({ url: 'https://a.com', title: 'Cantos' });
		}
	});

	it('updateRetreatMemorySongSchema permite parciales (sin campos requeridos)', () => {
		expect(updateRetreatMemorySongSchema.safeParse({}).success).toBe(true);
		expect(updateRetreatMemorySongSchema.safeParse({ title: 'Solo título' }).success).toBe(true);
	});

	it('create/update Retreat omiten los arrays read-only memoryPhotos/memorySongs', () => {
		expect('memoryPhotos' in (createRetreatSchema.shape.body as any).shape).toBe(false);
		expect('memorySongs' in (createRetreatSchema.shape.body as any).shape).toBe(false);
		expect('memoryPhotos' in (updateRetreatSchema.shape.body as any).shape).toBe(false);
		expect('memorySongs' in (updateRetreatSchema.shape.body as any).shape).toBe(false);
	});
});
