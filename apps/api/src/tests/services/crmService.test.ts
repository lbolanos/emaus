import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { CrmService } from '@/services/crmService';
import { Retreat } from '@/entities/retreat.entity';
import { Participant } from '@/entities/participant.entity';

describe('CrmService', () => {
	let svc: CrmService;
	let retreat: Retreat;
	let participant: Participant;

	beforeAll(async () => {
		await setupTestDatabase();
		svc = new CrmService();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
		retreat = await TestDataFactory.createTestRetreat();
		participant = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' } as any);
	});

	describe('follow-up (pipeline)', () => {
		it('upsert crea y luego actualiza el estado (un solo registro por participante)', async () => {
			await svc.upsertFollowUp({
				retreatId: retreat.id,
				participantId: participant.id,
				status: 'contacted',
				note: 'Le escribí por WhatsApp',
			});
			let list = await svc.listFollowUps(retreat.id);
			expect(list).toHaveLength(1);
			expect(list[0].status).toBe('contacted');

			// Upsert de nuevo → actualiza, no duplica.
			await svc.upsertFollowUp({
				retreatId: retreat.id,
				participantId: participant.id,
				status: 'confirmed',
			});
			list = await svc.listFollowUps(retreat.id);
			expect(list).toHaveLength(1);
			expect(list[0].status).toBe('confirmed');
		});
	});

	describe('tasks', () => {
		it('crea, lista, completa y elimina tareas', async () => {
			const task = await svc.createTask({
				retreatId: retreat.id,
				participantId: participant.id,
				title: 'Confirmar pago',
				dueDate: '2026-07-01T15:00:00.000Z',
			});
			expect(task.status).toBe('open');

			const open = await svc.listTasks(retreat.id, 'open');
			expect(open).toHaveLength(1);

			const done = await svc.updateTask(task.id, { status: 'done' });
			expect(done?.status).toBe('done');
			expect(done?.completedAt).toBeTruthy();

			expect(await svc.listTasks(retreat.id, 'open')).toHaveLength(0);
			expect(await svc.listTasks(retreat.id, 'done')).toHaveLength(1);

			expect(await svc.deleteTask(task.id)).toBe(true);
			expect(await svc.listTasks(retreat.id)).toHaveLength(0);
		});
	});
});
