import {
	createGlobalMessageSequenceSchema,
	updateGlobalMessageSequenceSchema,
} from '@repo/types';

/**
 * Contrato Zod de las plantillas globales de secuencias. A diferencia de las
 * secuencias por-retiro, NO llevan `retreatId` ni `segmentId`.
 */
describe('global message sequence schemas', () => {
	it('crea con pasos y aplica defaults (audience=all, recipientTarget=participant)', () => {
		const parsed = createGlobalMessageSequenceSchema.parse({
			body: {
				name: 'Bienvenida global',
				trigger: 'participant_created',
				steps: [{ templateType: 'WALKER_WELCOME', channel: 'whatsapp' }],
			},
		});
		expect(parsed.body.audience).toBe('all');
		expect(parsed.body.isActive).toBe(true);
		expect(parsed.body.steps[0].recipientTarget).toBe('participant');
		expect(parsed.body.steps[0].sendHour).toBe(9);
	});

	it('preserva audience y recipientTarget de contacto de emergencia', () => {
		const parsed = createGlobalMessageSequenceSchema.parse({
			body: {
				name: 'Aviso a familia',
				trigger: 'days_before_retreat',
				audience: 'table_leaders',
				steps: [
					{ templateType: 'PALANCA_REQUEST', channel: 'whatsapp', recipientTarget: 'emergencyContact1' },
				],
			},
		});
		expect(parsed.body.audience).toBe('table_leaders');
		expect(parsed.body.steps[0].recipientTarget).toBe('emergencyContact1');
	});

	it('NO acepta retreatId ni segmentId (los ignora: son por-retiro)', () => {
		const parsed = createGlobalMessageSequenceSchema.parse({
			body: {
				name: 'X',
				trigger: 'birthday',
				retreatId: '11111111-1111-1111-1111-111111111111',
				segmentId: '22222222-2222-2222-2222-222222222222',
				steps: [],
			} as any,
		});
		expect((parsed.body as any).retreatId).toBeUndefined();
		expect((parsed.body as any).segmentId).toBeUndefined();
	});

	it('rechaza nombre vacío', () => {
		expect(() =>
			createGlobalMessageSequenceSchema.parse({
				body: { name: '', trigger: 'birthday', steps: [] },
			}),
		).toThrow();
	});

	it('rechaza un trigger inválido', () => {
		expect(() =>
			createGlobalMessageSequenceSchema.parse({
				body: { name: 'X', trigger: 'on_full_moon', steps: [] } as any,
			}),
		).toThrow();
	});

	it('update: permite cambios parciales y valida el id de params', () => {
		const parsed = updateGlobalMessageSequenceSchema.parse({
			body: { isActive: false },
			params: { id: '33333333-3333-3333-3333-333333333333' },
		});
		expect(parsed.body.isActive).toBe(false);
		expect(parsed.params.id).toBe('33333333-3333-3333-3333-333333333333');
	});

	it('update: rechaza un id de params no-uuid', () => {
		expect(() =>
			updateGlobalMessageSequenceSchema.parse({ body: {}, params: { id: 'no-uuid' } }),
		).toThrow();
	});
});
