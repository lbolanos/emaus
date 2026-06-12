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
import { ParticipantCommunication } from '@/entities/participantCommunication.entity';
import { Retreat } from '@/entities/retreat.entity';

describe('MessageSequenceService', () => {
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
	});

	async function createTemplate(retreatId: string, type: string, message: string) {
		const repo = AppDataSource.getRepository(MessageTemplate);
		return repo.save(repo.create({ name: type, type: type as any, message, retreatId, scope: 'retreat' }));
	}

	describe('computeScheduledFor (TZ-aware)', () => {
		it('days_before_retreat: 7 días antes a las 9:00 CDMX → 15:00 UTC', () => {
			const retreat = {
				startDate: new Date('2026-06-10T00:00:00.000Z'),
				endDate: new Date('2026-06-13T00:00:00.000Z'),
				timezone: 'America/Mexico_City',
			} as Retreat;
			const when = svc.computeScheduledFor(
				'days_before_retreat',
				{ offsetDays: 7, sendHour: 9 },
				{} as any,
				retreat,
			);
			expect(when?.toISOString()).toBe('2026-06-03T15:00:00.000Z');
		});

		it('days_after_retreat: 30 días después a las 9:00 CDMX', () => {
			const retreat = {
				startDate: new Date('2026-06-10T00:00:00.000Z'),
				endDate: new Date('2026-06-13T00:00:00.000Z'),
				timezone: 'America/Mexico_City',
			} as Retreat;
			const when = svc.computeScheduledFor(
				'days_after_retreat',
				{ offsetDays: 30, sendHour: 9 },
				{} as any,
				retreat,
			);
			// 2026-06-13 + 30 = 2026-07-13 09:00 CDMX = 15:00 UTC
			expect(when?.toISOString()).toBe('2026-07-13T15:00:00.000Z');
		});
	});

	describe('enrollSequence', () => {
		it('enrola solo la audiencia indicada y es idempotente', async () => {
			const retreat = await TestDataFactory.createTestRetreat({
				startDate: new Date('2026-09-10T00:00:00.000Z'),
				timezone: 'America/Mexico_City',
			});
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				email: 'w1@example.com',
			} as any);
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				email: 'w2@example.com',
			} as any);
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'server',
				email: 's1@example.com',
			} as any);

			const seq = await svc.createSequence({
				name: 'Bienvenida caminantes',
				retreatId: retreat.id,
				trigger: 'days_before_retreat',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 3, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
			});

			const created = await svc.enrollSequence(seq);
			expect(created).toBe(2); // solo los 2 walkers

			// Idempotencia: segunda corrida no crea nada nuevo.
			const again = await svc.enrollSequence(seq);
			expect(again).toBe(0);

			const total = await AppDataSource.getRepository(ScheduledMessage).count({
				where: { sequenceId: seq.id },
			});
			expect(total).toBe(2);
		});
	});

	describe('processDue', () => {
		it('email: envía, marca sent y registra la comunicación', async () => {
			const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				email: 'walker@example.com',
				firstName: 'Juan',
			} as any);
			await createTemplate(retreat.id, 'WALKER_WELCOME', 'Hola {participant.firstName}');

			const seq = await svc.createSequence({
				name: 'S',
				retreatId: retreat.id,
				trigger: 'participant_created',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
			});
			const step = seq.steps![0];

			// Insertar un mensaje vencido (scheduledFor en el pasado).
			const smRepo = AppDataSource.getRepository(ScheduledMessage);
			await smRepo.save(
				smRepo.create({
					sequenceId: seq.id,
					stepId: step.id,
					participantId: participant.id,
					retreatId: retreat.id,
					channel: 'email',
					templateType: 'WALKER_WELCOME',
					scheduledFor: new Date(Date.now() - 3600_000),
					status: 'pending',
				}),
			);

			const processed = await svc.processDue();
			expect(processed).toBe(1);

			const sm = await smRepo.findOne({ where: { participantId: participant.id } });
			expect(sm?.status).toBe('sent');
			expect(sm?.sentAt).toBeTruthy();

			const comms = await AppDataSource.getRepository(ParticipantCommunication).find({
				where: { participantId: participant.id },
			});
			expect(comms).toHaveLength(1);
			expect(comms[0].messageType).toBe('email');
		});

		it('whatsapp: encola (queued) sin enviar ni registrar', async () => {
			const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				email: 'walker2@example.com',
				firstName: 'Ana',
			} as any);
			await createTemplate(retreat.id, 'WALKER_WELCOME', 'Hola {participant.firstName}');

			const seq = await svc.createSequence({
				name: 'S-wa',
				retreatId: retreat.id,
				trigger: 'participant_created',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'whatsapp' } as any],
			});
			const step = seq.steps![0];

			const smRepo = AppDataSource.getRepository(ScheduledMessage);
			await smRepo.save(
				smRepo.create({
					sequenceId: seq.id,
					stepId: step.id,
					participantId: participant.id,
					retreatId: retreat.id,
					channel: 'whatsapp',
					templateType: 'WALKER_WELCOME',
					scheduledFor: new Date(Date.now() - 3600_000),
					status: 'pending',
				}),
			);

			await svc.processDue();

			const sm = await smRepo.findOne({ where: { participantId: participant.id } });
			expect(sm?.status).toBe('queued');

			const comms = await AppDataSource.getRepository(ParticipantCommunication).count({
				where: { participantId: participant.id },
			});
			expect(comms).toBe(0); // se registra cuando el coordinador lo despacha

			// Aparece en la bandeja de pendientes del retiro.
			const queue = await svc.listQueued(retreat.id);
			expect(queue).toHaveLength(1);
		});
	});
});
