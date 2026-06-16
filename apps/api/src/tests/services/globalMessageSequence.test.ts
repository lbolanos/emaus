import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { GlobalMessageSequenceService } from '@/services/globalMessageSequenceService';
import { messageSequenceService } from '@/services/messageSequenceService';
import { AppDataSource } from '@/data-source';
import { MessageSequence } from '@/entities/messageSequence.entity';
import { SequenceStep } from '@/entities/sequenceStep.entity';
import { GlobalSequenceStep } from '@/entities/globalSequenceStep.entity';

describe('GlobalMessageSequenceService', () => {
	let svc: GlobalMessageSequenceService;

	beforeAll(async () => {
		await setupTestDatabase();
		svc = new GlobalMessageSequenceService();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	it('create + getById: crea la plantilla global con sus pasos', async () => {
		const seq = await svc.create({
			name: 'Bienvenida global',
			description: 'desc',
			trigger: 'participant_created',
			audience: 'walker',
			steps: [
				{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'whatsapp' },
				{ stepOrder: 1, offsetDays: 3, sendHour: 10, templateType: 'PRE_RETREAT_REMINDER', channel: 'email', recipientTarget: 'emergencyContact1' },
			],
		});
		const found = await svc.getById(seq.id);
		expect(found?.name).toBe('Bienvenida global');
		expect(found?.audience).toBe('walker');
		expect(found?.steps).toHaveLength(2);
		const wa = found!.steps!.find((s) => s.channel === 'whatsapp');
		expect(wa?.templateType).toBe('WALKER_WELCOME');
		const ce = found!.steps!.find((s) => s.recipientTarget === 'emergencyContact1');
		expect(ce?.templateType).toBe('PRE_RETREAT_REMINDER');
	});

	it('update: reemplaza pasos y cambia campos', async () => {
		const seq = await svc.create({
			name: 'G', trigger: 'days_before_retreat', audience: 'all',
			steps: [{ stepOrder: 0, offsetDays: 7, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' }],
		});
		await svc.update(seq.id, {
			name: 'G2', audience: 'server',
			steps: [{ stepOrder: 0, offsetDays: 1, sendHour: 8, templateType: 'PAYMENT_REMINDER', channel: 'whatsapp' }],
		});
		const found = await svc.getById(seq.id);
		expect(found?.name).toBe('G2');
		expect(found?.audience).toBe('server');
		expect(found?.steps).toHaveLength(1);
		expect(found!.steps![0].templateType).toBe('PAYMENT_REMINDER');
		// Los pasos viejos se borraron (no quedan huérfanos).
		const total = await AppDataSource.getRepository(GlobalSequenceStep).count({ where: { sequenceId: seq.id } });
		expect(total).toBe(1);
	});

	it('toggleActive: alterna isActive', async () => {
		const seq = await svc.create({ name: 'T', trigger: 'birthday', audience: 'all', isActive: true });
		const off = await svc.toggleActive(seq.id);
		expect(off?.isActive).toBe(false);
		const on = await svc.toggleActive(seq.id);
		expect(on?.isActive).toBe(true);
	});

	it('copyToRetreat: clona en el retiro como secuencia INACTIVA con sus pasos', async () => {
		const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		const global = await svc.create({
			name: 'Seguimiento post', trigger: 'days_after_retreat', audience: 'table_leaders',
			isActive: true,
			steps: [
				{ stepOrder: 0, offsetDays: 7, sendHour: 9, templateType: 'WALKER_FOLLOWUP_WEEK_1', channel: 'whatsapp' },
				{ stepOrder: 1, offsetDays: 30, sendHour: 9, templateType: 'WALKER_FOLLOWUP_MONTH_1', channel: 'email' },
			],
		});

		const created = await svc.copyToRetreat(global.id, retreat.id, null);
		expect(created).not.toBeNull();

		const full = await messageSequenceService.findById(created!.id);
		expect(full?.retreatId).toBe(retreat.id);
		expect(full?.isActive).toBe(false); // importada inactiva
		expect(full?.name).toBe('Seguimiento post');
		expect(full?.audience).toBe('table_leaders');
		expect(full?.trigger).toBe('days_after_retreat');
		expect(full?.steps).toHaveLength(2);

		// Son pasos del retiro (sequence_steps), no los globales.
		const retreatSteps = await AppDataSource.getRepository(SequenceStep).find({
			where: { sequenceId: created!.id },
		});
		expect(retreatSteps).toHaveLength(2);
		expect(retreatSteps.map((s) => s.templateType).sort()).toEqual(
			['WALKER_FOLLOWUP_MONTH_1', 'WALKER_FOLLOWUP_WEEK_1'],
		);

		// La copia es independiente: existe en message_sequences.
		const inRetreat = await AppDataSource.getRepository(MessageSequence).find({
			where: { retreatId: retreat.id },
		});
		expect(inRetreat).toHaveLength(1);
	});

	it('copyToRetreat: devuelve null si la plantilla global no existe', async () => {
		const retreat = await TestDataFactory.createTestRetreat({});
		expect(await svc.copyToRetreat('00000000-0000-0000-0000-000000000000', retreat.id, null)).toBeNull();
	});

	it('copyToRetreat: lleva maxOverdueDays y la condición del paso', async () => {
		const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		const global = await svc.create({
			name: 'Pre-retiro', trigger: 'days_before_retreat', audience: 'walker',
			maxOverdueDays: 5,
			steps: [
				{ stepOrder: 0, offsetDays: 7, sendHour: 9, templateType: 'PAYMENT_REMINDER', channel: 'whatsapp', condition: { paymentStatus: 'unpaid' } },
			],
		});
		const created = await svc.copyToRetreat(global.id, retreat.id, null);
		const full = await messageSequenceService.findById(created!.id);
		expect(full?.maxOverdueDays).toBe(5);
		const step = await AppDataSource.getRepository(SequenceStep).findOne({
			where: { sequenceId: created!.id },
		});
		expect(step?.condition).toEqual({ paymentStatus: 'unpaid' });
	});
});
