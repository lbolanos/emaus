// Mock EmailService before importing the service (same pattern as
// sequenceRecipientsAndSeed.test.ts — the engine references it even though
// these tests only exercise the whatsapp channel).
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
 * "Confirmación de camisetas (servidores)" sequence: the engine builds
 * `{participant.shirtOrderSummary}` and `{participant.shirtCharge}` on-demand
 * (same lazy pattern as `{table.*}`) by querying `participant_shirt_size`
 * scoped to the retreat. Covers: summary with garments and price, fallback
 * with no sizes configured, and that the 'server' audience doesn't enroll
 * walkers.
 */
describe('MessageSequence — server shirt confirmation', () => {
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

	it('server with garments configured: resolvedContent carries the summary and the formatted total', async () => {
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

	it('server with no sizes configured: falls back to the fallback text, without breaking', async () => {
		const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		const server = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'server',
			firstName: 'Beto',
			cellPhone: '5511112222',
		} as any);
		// A shirt type exists on the retreat but the server never configured a size.
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

	it('a garment from ANOTHER retreat does not mix into the in-context retreat summary', async () => {
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

	it('"server" audience: enrolling doesn\'t create a ScheduledMessage for a walker', async () => {
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

	// Regression: `{...participant, shirtOrderSummary, shirtCharge}` (spreading
	// the instance) loses the class getters (paymentRemaining, chargeBreakdown,
	// ...) because they live on the prototype, not as own properties of the
	// object — spread doesn't copy them. Without the fix, `paymentRemaining`
	// would be `undefined` and the variable would come out as an EMPTY string
	// in the message (buildParticipantReplacements: `!= null ? formatCurrency(...) : ''`).
	// None of the tests above catch this because the seeded templates never
	// combine {participant.shirt*} with another computed variable.
	//
	// NOTE: in this context (the sequence engine via processDue) the numeric
	// value of paymentRemaining always comes out $0.00 — that's a separate,
	// pre-existing bug (`participant.retreat` is never hydrated in
	// processDue(), so ANY getter depending on `this.retreat`/unloaded
	// relations gives 0 there, for any template, not just this one). That's
	// why the test verifies the variable RESOLVES TO A VALUE (the fix works),
	// not a specific amount.
	it('a template combining {participant.shirtCharge} with {participant.paymentRemaining} resolves both (neither is left empty)', async () => {
		const retreat = await TestDataFactory.createTestRetreat({
			timezone: 'America/Mexico_City',
			serverFeeAmount: 1000,
		} as any);
		const server = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'server',
			cellPhone: '5512345678',
		} as any);
		const shirt = await createShirtType(retreat.id, 'Playera', 150);
		await assignShirtSize(server.id, shirt.id, 'M');

		await createTemplate(
			retreat.id,
			'SERVER_SHIRT_CONFIRMATION',
			'Debes [{participant.paymentRemaining}]. Tus prendas: {participant.shirtCharge}.',
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
		// Without the fix (spread) this would be "Debes []" — the variable resolves, it's not left empty.
		expect(sm?.resolvedContent).toContain(`Debes [${formatCurrency(0)}]`);
		expect(sm?.resolvedContent).toContain(`prendas: ${formatCurrency(150)}`);
	});
});
