// Correo de asignación de angelitos (notifyAngelitosOfNewAssignments): la guardia es
// en la capilla de la casa de retiro, así que el correo nombra la casa y no la parroquia.
// Con la parroquia, "Guardia de la Capilla — Buen Despacho" se leía como la capilla de
// la parroquia (Del Valle II, 2026-10-16).

import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { RetreatScheduleService } from '@/services/retreatScheduleService';

jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn().mockImplementation(() => ({
		isSmtpConfigured: () => true,
		sendEmail: jest.fn().mockResolvedValue(true),
	})),
}));

describe('RetreatScheduleService — correo de asignación de angelitos', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	test('nombra la casa de retiro como lugar, con el retiro entre paréntesis', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const angelito = await TestDataFactory.createTestParticipant(retreat.id, {
			firstName: 'Lalo',
			type: 'partial_server',
		} as any);
		const slot = {
			id: 'slot-1',
			startTime: new Date('2026-10-17T20:00:00.000Z'),
			endTime: new Date('2026-10-17T21:00:00.000Z'),
		};

		const service = new RetreatScheduleService();
		await (service as any).notifyAngelitosOfNewAssignments(
			retreat.id,
			[angelito],
			new Map([[angelito.id, [slot]]]),
		);

		const { EmailService } = jest.requireMock('@/services/emailService');
		const sendEmail = EmailService.mock.results[0].value.sendEmail as jest.Mock;
		expect(sendEmail).toHaveBeenCalledTimes(1);
		const sent = sendEmail.mock.calls[0][0];
		expect(sent.subject).toBe('Guardia de la Capilla — Test House');
		expect(sent.subject).not.toContain(retreat.parish);
		expect(sent.html).toContain(`en <strong>Test House</strong> (retiro de ${retreat.parish})`);
		expect(sent.text).toContain(`en Test House (retiro de ${retreat.parish})`);
	});
});
