// Mock del EmailService antes de importar el service (mismo patrón que
// sequenceRecipientsAndSeed.test.ts — el motor lo referencia aunque estos
// tests solo ejercitan el canal whatsapp).
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
import { RetreatShirtType } from '@/entities/retreatShirtType.entity';
import { ParticipantShirtSize } from '@/entities/participantShirtSize.entity';
import { formatCurrency } from '@repo/utils';

/**
 * Secuencia "Confirmación de camisetas (servidores)": el motor arma
 * `{participant.shirtOrderSummary}` y `{participant.shirtCharge}` on-demand
 * (mismo patrón lazy que `{table.*}`) consultando `participant_shirt_size`
 * scopeado al retiro. Cubre: resumen con prendas y precio, fallback sin
 * tallas configuradas, y que la audiencia 'server' no enrola caminantes.
 */
describe('MessageSequence — confirmación de camisetas a servidores', () => {
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

	async function createShirtType(retreatId: string, name: string, price: number | null) {
		const repo = AppDataSource.getRepository(RetreatShirtType);
		return repo.save(repo.create({ retreatId, name, price, sortOrder: 0 } as any));
	}

	async function assignShirtSize(participantId: string, shirtTypeId: string, size: string) {
		const repo = AppDataSource.getRepository(ParticipantShirtSize);
		return repo.save(repo.create({ participantId, shirtTypeId, size }));
	}

	it('servidor con prendas configuradas: resolvedContent trae el resumen y el total formateado', async () => {
		const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		const server = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'server',
			firstName: 'Ana',
			cellPhone: '5512345678',
		} as any);
		const playera = await createShirtType(retreat.id, 'Camiseta Blanca', 135);
		const chamarra = await createShirtType(retreat.id, 'Chamarra', 275);
		await assignShirtSize(server.id, playera.id, 'M');
		await assignShirtSize(server.id, chamarra.id, 'G');

		await createTemplate(
			retreat.id,
			'SERVER_SHIRT_CONFIRMATION',
			'Hola {participant.firstName}:\n\n{participant.shirtOrderSummary}\n\nTotal: {participant.shirtCharge}.',
		);

		const seq = await svc.createSequence({
			name: 'Confirmación de camisetas (servidores)',
			retreatId: retreat.id,
			trigger: 'days_before_retreat',
			audience: 'server',
			steps: [
				{
					stepOrder: 0,
					offsetDays: 21,
					sendHour: 9,
					templateType: 'SERVER_SHIRT_CONFIRMATION',
					channel: 'whatsapp',
					recipientTarget: 'participant',
				} as any,
			],
		});
		const repo = AppDataSource.getRepository(ScheduledMessage);
		await repo.save(
			repo.create({
				sequenceId: seq.id,
				stepId: seq.steps![0].id,
				participantId: server.id,
				retreatId: retreat.id,
				channel: 'whatsapp',
				templateType: 'SERVER_SHIRT_CONFIRMATION',
				recipientTarget: 'participant',
				scheduledFor: new Date(Date.now() - 3600_000),
				status: 'pending',
			}),
		);

		await svc.processDue();

		const sm = await repo.findOne({ where: { participantId: server.id } });
		expect(sm?.status).toBe('queued');
		expect(sm?.resolvedContent).toContain('Hola Ana');
		expect(sm?.resolvedContent).toContain('Camiseta Blanca');
		expect(sm?.resolvedContent).toContain('talla M');
		expect(sm?.resolvedContent).toContain(formatCurrency(135));
		expect(sm?.resolvedContent).toContain('Chamarra');
		expect(sm?.resolvedContent).toContain('talla G');
		expect(sm?.resolvedContent).toContain(formatCurrency(275));
		// Total: 135 + 275 = 410
		expect(sm?.resolvedContent).toContain(`Total: ${formatCurrency(410)}`);
	});

	it('servidor sin tallas configuradas: cae al texto de fallback, sin romper', async () => {
		const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		const server = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'server',
			firstName: 'Beto',
			cellPhone: '5511112222',
		} as any);
		// Tipo de camiseta existe en el retiro pero el servidor no configuró talla.
		await createShirtType(retreat.id, 'Camiseta Blanca', 135);

		await createTemplate(
			retreat.id,
			'SERVER_SHIRT_CONFIRMATION',
			'{participant.shirtOrderSummary} — {participant.shirtCharge}',
		);

		const seq = await svc.createSequence({
			name: 'Confirmación de camisetas (servidores)',
			retreatId: retreat.id,
			trigger: 'days_before_retreat',
			audience: 'server',
			steps: [
				{
					stepOrder: 0,
					offsetDays: 21,
					sendHour: 9,
					templateType: 'SERVER_SHIRT_CONFIRMATION',
					channel: 'whatsapp',
					recipientTarget: 'participant',
				} as any,
			],
		});
		const repo = AppDataSource.getRepository(ScheduledMessage);
		await repo.save(
			repo.create({
				sequenceId: seq.id,
				stepId: seq.steps![0].id,
				participantId: server.id,
				retreatId: retreat.id,
				channel: 'whatsapp',
				templateType: 'SERVER_SHIRT_CONFIRMATION',
				recipientTarget: 'participant',
				scheduledFor: new Date(Date.now() - 3600_000),
				status: 'pending',
			}),
		);

		await svc.processDue();

		const sm = await repo.findOne({ where: { participantId: server.id } });
		expect(sm?.status).toBe('queued');
		expect(sm?.resolvedContent).toContain('Aún no has configurado tus tallas');
	});

	it('prenda de OTRO retiro no se mezcla en el resumen del retiro en contexto', async () => {
		const retreatA = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		const retreatB = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		const server = await TestDataFactory.createTestParticipant(retreatA.id, {
			type: 'server',
			firstName: 'Cross',
			cellPhone: '5500000000',
		} as any);
		const shirtA = await createShirtType(retreatA.id, 'Playera A', 100);
		const shirtB = await createShirtType(retreatB.id, 'Playera B', 999);
		await assignShirtSize(server.id, shirtA.id, 'M');
		await assignShirtSize(server.id, shirtB.id, 'G');

		await createTemplate(
			retreatA.id,
			'SERVER_SHIRT_CONFIRMATION',
			'{participant.shirtOrderSummary} — {participant.shirtCharge}',
		);
		const seq = await svc.createSequence({
			name: 'Confirmación de camisetas (servidores)',
			retreatId: retreatA.id,
			trigger: 'days_before_retreat',
			audience: 'server',
			steps: [
				{
					stepOrder: 0,
					offsetDays: 21,
					sendHour: 9,
					templateType: 'SERVER_SHIRT_CONFIRMATION',
					channel: 'whatsapp',
					recipientTarget: 'participant',
				} as any,
			],
		});
		const repo = AppDataSource.getRepository(ScheduledMessage);
		await repo.save(
			repo.create({
				sequenceId: seq.id,
				stepId: seq.steps![0].id,
				participantId: server.id,
				retreatId: retreatA.id,
				channel: 'whatsapp',
				templateType: 'SERVER_SHIRT_CONFIRMATION',
				recipientTarget: 'participant',
				scheduledFor: new Date(Date.now() - 3600_000),
				status: 'pending',
			}),
		);

		await svc.processDue();

		const sm = await repo.findOne({ where: { participantId: server.id, retreatId: retreatA.id } });
		expect(sm?.resolvedContent).toContain('Playera A');
		expect(sm?.resolvedContent).not.toContain('Playera B');
		expect(sm?.resolvedContent).toContain(`— ${formatCurrency(100)}`);
	});

	it('audiencia "server": al enrolar, no crea ScheduledMessage para un caminante', async () => {
		const retreat = await TestDataFactory.createTestRetreat({
			timezone: 'America/Mexico_City',
			startDate: new Date(Date.now() + 25 * 24 * 3600_000),
			endDate: new Date(Date.now() + 27 * 24 * 3600_000),
		} as any);
		const server = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'server',
			cellPhone: '5512345678',
		} as any);
		const walker = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker',
			cellPhone: '5587654321',
		} as any);
		await createTemplate(retreat.id, 'SERVER_SHIRT_CONFIRMATION', 'Hola {participant.firstName}');

		const seq = await svc.createSequence({
			name: 'Confirmación de camisetas (servidores)',
			retreatId: retreat.id,
			trigger: 'days_before_retreat',
			audience: 'server',
			isActive: true,
			steps: [
				{
					stepOrder: 0,
					offsetDays: 21,
					sendHour: 9,
					templateType: 'SERVER_SHIRT_CONFIRMATION',
					channel: 'whatsapp',
					recipientTarget: 'participant',
				} as any,
			],
		});

		const { MessageSequence } = await import('@/entities/messageSequence.entity');
		const seqWithSteps = await AppDataSource.getRepository(MessageSequence).findOne({
			where: { id: seq.id },
			relations: ['steps'],
		});
		await svc.enrollSequence(seqWithSteps!);

		const repo = AppDataSource.getRepository(ScheduledMessage);
		const forServer = await repo.findOne({ where: { participantId: server.id } });
		const forWalker = await repo.findOne({ where: { participantId: walker.id } });
		expect(forServer).not.toBeNull();
		expect(forWalker).toBeNull();
	});
});
