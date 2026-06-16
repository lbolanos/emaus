import {
	createMessageSequenceSchema,
	updateMessageSequenceSchema,
	sequenceAudience,
	messageRecipientTarget,
} from '@repo/types';

const RETREAT_ID = '11111111-1111-1111-1111-111111111111';

/**
 * Tests del contrato Zod de las secuencias. Blindan dos extensiones cuyo fallo
 * sería silencioso: Zod hace strip de campos no declarados, así que si
 * `recipientTarget` o la audiencia `table_leaders` se cayeran del schema, el
 * dato llegaría al backend perdido (sin error) — exactamente el síntoma que
 * apareció en QA cuando un API viejo corría un schema previo.
 */
describe('message sequence schemas — destinatario y audiencia', () => {
	it('preserva recipientTarget = emergencyContact1 en los pasos', () => {
		const parsed = createMessageSequenceSchema.parse({
			body: {
				name: 'Aviso familia',
				retreatId: RETREAT_ID,
				trigger: 'participant_created',
				steps: [
					{ templateType: 'PALANCA_REQUEST', channel: 'whatsapp', recipientTarget: 'emergencyContact1' },
				],
			},
		});
		expect(parsed.body.steps[0].recipientTarget).toBe('emergencyContact1');
	});

	it('aplica default recipientTarget = participant cuando se omite', () => {
		const parsed = createMessageSequenceSchema.parse({
			body: {
				name: 'Bienvenida',
				retreatId: RETREAT_ID,
				trigger: 'participant_created',
				steps: [{ templateType: 'WALKER_WELCOME', channel: 'email' }],
			},
		});
		expect(parsed.body.steps[0].recipientTarget).toBe('participant');
	});

	it('preserva recipientTarget al actualizar una secuencia', () => {
		const parsed = updateMessageSequenceSchema.parse({
			params: { id: RETREAT_ID },
			body: {
				steps: [
					{ templateType: 'GENERAL', channel: 'email', recipientTarget: 'emergencyContact2' },
				],
			},
		});
		expect(parsed.body.steps?.[0].recipientTarget).toBe('emergencyContact2');
	});

	it('acepta la audiencia table_leaders', () => {
		expect(sequenceAudience.parse('table_leaders')).toBe('table_leaders');
		const parsed = createMessageSequenceSchema.parse({
			body: {
				name: 'Líderes',
				retreatId: RETREAT_ID,
				trigger: 'days_before_retreat',
				audience: 'table_leaders',
				steps: [{ templateType: 'GENERAL', channel: 'whatsapp' }],
			},
		});
		expect(parsed.body.audience).toBe('table_leaders');
	});

	it('rechaza un destinatario inválido', () => {
		expect(() => messageRecipientTarget.parse('jefe')).toThrow();
	});

	it('acepta destinatarios inviter, tableLeader y responsibility', () => {
		expect(messageRecipientTarget.parse('inviter')).toBe('inviter');
		expect(messageRecipientTarget.parse('tableLeader')).toBe('tableLeader');
		expect(messageRecipientTarget.parse('responsibility')).toBe('responsibility');
	});

	it('preserva recipientTarget=responsibility + recipientResponsibility en el paso', () => {
		const parsed = createMessageSequenceSchema.parse({
			body: {
				name: 'Aviso coord',
				retreatId: RETREAT_ID,
				trigger: 'participant_created',
				steps: [
					{
						templateType: 'GENERAL',
						channel: 'email',
						recipientTarget: 'responsibility',
						recipientResponsibility: 'Coordinador de Palancas',
					},
				],
			},
		});
		expect(parsed.body.steps[0].recipientTarget).toBe('responsibility');
		expect(parsed.body.steps[0].recipientResponsibility).toBe('Coordinador de Palancas');
	});
});
