// Mock del EmailService antes de importar el service (envío desatendido simulado).
jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: jest.fn(async () => true),
	})),
}));

import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { MessageSequenceService } from '@/services/messageSequenceService';
import { AppDataSource } from '@/data-source';
import { ScheduledMessage } from '@/entities/scheduledMessage.entity';
import { MessageTemplate } from '@/entities/messageTemplate.entity';
import { SequenceStep } from '@/entities/sequenceStep.entity';
import { MessageSequence } from '@/entities/messageSequence.entity';

/**
 * Cubre dos fixes del security review:
 *  - `processDue(retreatId)` solo procesa el retiro indicado (el disparo manual /
 *    runNow no debe enviar mensajes de otros retiros).
 *  - Un mensaje ya enviado no se reprocesa (base del claim atómico anti-doble-envío).
 */
describe('MessageSequenceService.processDue — scope por retiro y no-reproceso', () => {
	let svc: MessageSequenceService;

	beforeAll(async () => {
		await setupTestDatabase();
		svc = new MessageSequenceService();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
		// clearTestData no limpia las tablas de secuencias; hacerlo aquí (hijo→padre)
		// evita que mensajes de un test previo inflen el conteo de processDue().
		for (const Entity of [ScheduledMessage, SequenceStep, MessageSequence]) {
			await AppDataSource.getRepository(Entity).createQueryBuilder().delete().execute();
		}
	});

	async function setupDueEmail(timezone = 'America/Mexico_City') {
		const retreat = await TestDataFactory.createTestRetreat({ timezone } as any);
		const participant = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker',
			email: `w-${Date.now()}-${Math.floor(retreat.id.charCodeAt(0))}@example.com`,
			firstName: 'Juan',
		} as any);
		const tplRepo = AppDataSource.getRepository(MessageTemplate);
		await tplRepo.save(
			tplRepo.create({
				name: 'WALKER_WELCOME',
				type: 'WALKER_WELCOME' as any,
				message: 'Hola {participant.firstName}',
				retreatId: retreat.id,
				scope: 'retreat',
			}),
		);
		const seq = await svc.createSequence({
			name: 'S',
			retreatId: retreat.id,
			trigger: 'participant_created',
			audience: 'walker',
			steps: [
				{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any,
			],
		});
		const smRepo = AppDataSource.getRepository(ScheduledMessage);
		await smRepo.save(
			smRepo.create({
				sequenceId: seq.id,
				stepId: seq.steps![0].id,
				participantId: participant.id,
				retreatId: retreat.id,
				channel: 'email',
				templateType: 'WALKER_WELCOME',
				scheduledFor: new Date(Date.now() - 3600_000),
				status: 'pending',
			}),
		);
		return { retreat, participant };
	}

	it('procesa SOLO el retiro indicado; el otro queda pending', async () => {
		const a = await setupDueEmail();
		const b = await setupDueEmail();

		const processed = await svc.processDue(new Date(), 200, a.retreat.id);
		expect(processed).toBe(1);

		const smRepo = AppDataSource.getRepository(ScheduledMessage);
		const smA = await smRepo.findOne({ where: { retreatId: a.retreat.id } });
		const smB = await smRepo.findOne({ where: { retreatId: b.retreat.id } });
		expect(smA?.status).toBe('sent');
		expect(smB?.status).toBe('pending'); // intacto: otro retiro
	});

	it('sin retreatId procesa todos los retiros (cron global)', async () => {
		await setupDueEmail();
		await setupDueEmail();
		const processed = await svc.processDue();
		expect(processed).toBe(2);
	});

	it('no reprocesa un mensaje ya enviado (no doble envío)', async () => {
		const a = await setupDueEmail();
		expect(await svc.processDue(new Date(), 200, a.retreat.id)).toBe(1);
		// Segunda corrida sobre el mismo retiro: ya está 'sent' → no se reenvía.
		expect(await svc.processDue(new Date(), 200, a.retreat.id)).toBe(0);
	});
});
