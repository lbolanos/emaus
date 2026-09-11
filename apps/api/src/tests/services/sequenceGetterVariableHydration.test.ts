// Mock del EmailService antes de importar el service (canal whatsapp no lo usa,
// pero el constructor lo instancia).
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
import { Payment } from '@/entities/payment.entity';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { formatCurrency } from '@repo/utils';

/**
 * `{participant.paymentRemaining}` is the only template variable backed by
 * entity getters (computeCharges/totalPaid). Those getters read
 * `participant.retreat`, `payments`, `debts` and the per-retreat overlay fields
 * (`type`, `isScholarship`, `mealCount`, `takesFridayMeal`) — none of which are
 * present on the bare `sm.participant` row that processDue() loads, so the
 * variable resolved to formatCurrency(0) in every automatic-sequence message.
 *
 * These tests pin the hydration contract: the engine must resolve the variable
 * with the same data `findParticipantById` would produce for that retreat.
 */
describe('MessageSequence — getter-based template variable {participant.paymentRemaining}', () => {
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

	async function addPayment(participantId: string, retreatId: string, amount: number) {
		const repo = AppDataSource.getRepository(Payment);
		await repo.save(
			repo.create({
				participantId,
				retreatId,
				amount: amount as any,
				paymentDate: new Date(),
				paymentMethod: 'cash',
			}),
		);
	}

	/**
	 * Retreat with serverFeeAmount 1000 + mealCost 150, a server enrolled on it,
	 * a template using the getter variable, and one overdue whatsapp message.
	 * Returns the scheduled message id for assertions.
	 */
	async function setupDueBalanceMessage(opts: {
		retreatOverrides?: Record<string, unknown>;
		participantOverrides?: Record<string, unknown>;
		paymentsInRetreat?: number[];
	} = {}) {
		const retreat = await TestDataFactory.createTestRetreat({
			cost: '$2,800',
			serverFeeAmount: 1000,
			mealCost: 150,
			...(opts.retreatOverrides ?? {}),
		} as any);
		const participant = await TestDataFactory.createTestParticipant(retreat.id, {
			firstName: 'Ana',
			type: 'server',
			cellPhone: '1234567890',
			...(opts.participantOverrides ?? {}),
		} as any);
		for (const amount of opts.paymentsInRetreat ?? []) {
			await addPayment(participant.id, retreat.id, amount);
		}

		const tplRepo = AppDataSource.getRepository(MessageTemplate);
		await tplRepo.save(
			tplRepo.create({
				name: 'BALANCE_REMINDER',
				type: 'WALKER_WELCOME' as any,
				message: 'Hola {participant.firstName}, saldo: {participant.paymentRemaining}',
				retreatId: retreat.id,
				scope: 'retreat',
			}),
		);
		const seq = await svc.createSequence({
			name: 'Balance',
			retreatId: retreat.id,
			trigger: 'participant_created',
			audience: 'server',
			steps: [
				{
					stepOrder: 0,
					offsetDays: 0,
					sendHour: 9,
					templateType: 'WALKER_WELCOME',
					channel: 'whatsapp',
				} as any,
			],
		});
		const smRepo = AppDataSource.getRepository(ScheduledMessage);
		const sm = await smRepo.save(
			smRepo.create({
				sequenceId: seq.id,
				stepId: seq.steps![0].id,
				participantId: participant.id,
				retreatId: retreat.id,
				channel: 'whatsapp',
				templateType: 'WALKER_WELCOME',
				scheduledFor: new Date(Date.now() - 3600_000),
				status: 'pending',
			}),
		);
		return { retreat, participant, smId: sm.id };
	}

	async function processedContent(smId: string) {
		expect(await svc.processDue(new Date(), 200)).toBe(1);
		const sm = await AppDataSource.getRepository(ScheduledMessage).findOne({
			where: { id: smId },
		});
		expect(sm?.status).toBe('queued'); // whatsapp snapshot, sin envío real
		return sm?.resolvedContent ?? '';
	}

	it('resolves the real balance for a server with serverFeeAmount and no payments', async () => {
		const { smId } = await setupDueBalanceMessage();
		const content = await processedContent(smId);
		expect(content).toContain(`saldo: ${formatCurrency(1000)}`);
	});

	it('subtracts payments of the same retreat (partial payment)', async () => {
		const { smId } = await setupDueBalanceMessage({ paymentsInRetreat: [400] });
		const content = await processedContent(smId);
		expect(content).toContain(`saldo: ${formatCurrency(600)}`);
	});

	it('ignores payments of a different retreat and uses that retreat fees (cross-retreat)', async () => {
		// Participant's PRIMARY retreat is A (walker, cost 2800); also enrolled as
		// server in retreat B (serverFeeAmount 800) with a 500 payment there and a
		// 999 payment in A. B's message must show B's balance: 800 - 500 = 300.
		const retreatA = await TestDataFactory.createTestRetreat({
			cost: '$2,800',
			serverFeeAmount: 1500,
		} as any);
		const participant = await TestDataFactory.createTestParticipant(retreatA.id, {
			firstName: 'Cross',
			type: 'walker',
			cellPhone: '1234567890',
		} as any);

		const retreatB = await TestDataFactory.createTestRetreat({
			cost: '$2,800',
			serverFeeAmount: 800,
			mealCost: 150,
		} as any);
		const rpRepo = AppDataSource.getRepository(RetreatParticipant);
		await rpRepo.save(
			rpRepo.create({
				participantId: participant.id,
				retreatId: retreatB.id,
				roleInRetreat: 'server',
				type: 'server',
				isCancelled: false,
				isPrimaryRetreat: false,
			}),
		);
		await addPayment(participant.id, retreatA.id, 999);
		await addPayment(participant.id, retreatB.id, 500);

		const tplRepo = AppDataSource.getRepository(MessageTemplate);
		await tplRepo.save(
			tplRepo.create({
				name: 'BALANCE_REMINDER',
				type: 'WALKER_WELCOME' as any,
				message: 'Hola {participant.firstName}, saldo: {participant.paymentRemaining}',
				retreatId: retreatB.id,
				scope: 'retreat',
			}),
		);
		const seq = await svc.createSequence({
			name: 'Balance B',
			retreatId: retreatB.id,
			trigger: 'participant_created',
			audience: 'server',
			steps: [
				{
					stepOrder: 0,
					offsetDays: 0,
					sendHour: 9,
					templateType: 'WALKER_WELCOME',
					channel: 'whatsapp',
				} as any,
			],
		});
		const smRepo = AppDataSource.getRepository(ScheduledMessage);
		const sm = await smRepo.save(
			smRepo.create({
				sequenceId: seq.id,
				stepId: seq.steps![0].id,
				participantId: participant.id,
				retreatId: retreatB.id,
				channel: 'whatsapp',
				templateType: 'WALKER_WELCOME',
				scheduledFor: new Date(Date.now() - 3600_000),
				status: 'pending',
			}),
		);

		const content = await processedContent(sm.id);
		expect(content).toContain(`saldo: ${formatCurrency(300)}`);
	});

	it('keeps the balance at zero for scholarship participants (overlay from retreat_participants)', async () => {
		// isScholarship lives on retreat_participants; the hydration must overlay it
		// (not the stale legacy column) so the exemption still applies.
		const { participant, retreat, smId } = await setupDueBalanceMessage();
		await AppDataSource.getRepository(RetreatParticipant).update(
			{ participantId: participant.id, retreatId: retreat.id },
			{ isScholarship: true },
		);
		const content = await processedContent(smId);
		expect(content).toContain(`saldo: ${formatCurrency(0)}`);
	});

	it('previewStep resolves the same real balance as the engine', async () => {
		const { retreat, participant } = await setupDueBalanceMessage();
		const preview = await svc.previewStep({
			retreatId: retreat.id,
			participantId: participant.id,
			templateType: 'WALKER_WELCOME',
			channel: 'whatsapp',
			recipientTarget: 'participant',
		});
		expect(preview?.warning).toBeNull();
		expect(preview?.content).toContain(`saldo: ${formatCurrency(1000)}`);
	});
});
