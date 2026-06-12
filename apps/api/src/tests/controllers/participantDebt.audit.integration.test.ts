import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { Retreat } from '@/entities/retreat.entity';
import { Participant } from '@/entities/participant.entity';
import { User } from '@/entities/user.entity';
import { ParticipantDebtController } from '@/controllers/participantDebtController';
import { authorizationService } from '@/middleware/authorization';
import { auditContext } from '@/utils/auditContext';

// Respuesta mínima de Express para invocar el controlador sin levantar el router.
function mockRes() {
	const res: any = { statusCode: 200, body: undefined };
	res.status = (code: number) => {
		res.statusCode = code;
		return res;
	};
	res.json = (body: any) => {
		res.body = body;
		return res;
	};
	return res;
}

describe('Domain audit — instrumentación de deudas (participant_debt)', () => {
	const controller = new ParticipantDebtController();
	let retreat: Retreat;
	let server: Participant; // las deudas solo aplican a servidores/angelitos
	let actor: User; // recordedBy tiene FK a users → debe ser un usuario real

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		jest.restoreAllMocks();
		actor = await TestDataFactory.createTestUser();
		retreat = await TestDataFactory.createTestRetreat();
		server = await TestDataFactory.createTestParticipant(retreat.id, { type: 'server' } as any);
		// El controller valida acceso al retiro efectivo; el actor de prueba no tiene
		// user_retreats, así que se mockea el acceso (los casos 403 lo apagan).
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
	});

	const logs = () => AppDataSource.getRepository(DomainAuditLog).find();
	async function waitForLogs(
		predicate: (rows: DomainAuditLog[]) => boolean,
		tries = 60,
		delayMs = 5,
	): Promise<DomainAuditLog[]> {
		let rows = await logs();
		for (let i = 0; i < tries && !predicate(rows); i++) {
			await new Promise((r) => setTimeout(r, delayMs));
			rows = await logs();
		}
		return rows;
	}

	async function createDebt(body: Record<string, any>) {
		const req: any = { body, user: { id: actor.id } };
		const res = mockRes();
		await auditContext.run({ userId: actor.id, ip: '10.0.0.5' }, async () => {
			await controller.createDebt(req, res);
		});
		return res;
	}

	it('createDebt registra participant_debt.create con newValues y actor', async () => {
		const res = await createDebt({
			participantId: server.id,
			amount: 500,
			description: 'Hospedaje',
			retreatId: retreat.id,
		});
		expect(res.statusCode).toBe(201);

		const rows = (
			await waitForLogs((r) => r.some((x) => x.action === 'participant_debt.create'))
		).filter((r) => r.action === 'participant_debt.create');

		expect(rows).toHaveLength(1);
		expect(rows[0].resourceType).toBe('participant_debt');
		expect(rows[0].retreatId).toBe(retreat.id);
		expect(rows[0].actorUserId).toBe(actor.id);
		const nv = JSON.parse(rows[0].newValues!);
		expect(nv.participantId).toBe(server.id);
		expect(Number(nv.amount)).toBe(500);
		expect(nv.description).toBe('Hospedaje');
	});

	it('updateDebt registra participant_debt.update solo con el diff (amount)', async () => {
		const created = await createDebt({
			participantId: server.id,
			amount: 500,
			description: 'Hospedaje',
			retreatId: retreat.id,
		});
		const debtId = created.body.id;

		const req: any = { params: { id: debtId }, body: { amount: 750 }, user: { id: actor.id } };
		const res = mockRes();
		await auditContext.run({ userId: actor.id }, async () => {
			await controller.updateDebt(req, res);
		});
		expect(res.statusCode).toBe(200);

		const rows = (
			await waitForLogs((r) => r.some((x) => x.action === 'participant_debt.update'))
		).filter((r) => r.action === 'participant_debt.update');

		expect(rows).toHaveLength(1);
		expect(rows[0].resourceId).toBe(debtId);
		const oldV = JSON.parse(rows[0].oldValues!);
		const newV = JSON.parse(rows[0].newValues!);
		expect(Number(oldV.amount)).toBe(500);
		expect(Number(newV.amount)).toBe(750);
		// description no cambió → no debe aparecer en el diff.
		expect(oldV.description).toBeUndefined();
		expect(newV.description).toBeUndefined();
	});

	it('deleteDebt registra participant_debt.delete con el snapshot eliminado', async () => {
		const created = await createDebt({
			participantId: server.id,
			amount: 500,
			description: 'Hospedaje',
			retreatId: retreat.id,
		});
		const debtId = created.body.id;

		const req: any = { params: { id: debtId }, user: { id: actor.id } };
		const res = mockRes();
		await auditContext.run({ userId: actor.id }, async () => {
			await controller.deleteDebt(req, res);
		});
		expect(res.statusCode).toBe(200);

		const rows = (
			await waitForLogs((r) => r.some((x) => x.action === 'participant_debt.delete'))
		).filter((r) => r.action === 'participant_debt.delete');

		expect(rows).toHaveLength(1);
		expect(rows[0].resourceId).toBe(debtId);
		const oldV = JSON.parse(rows[0].oldValues!);
		expect(Number(oldV.amount)).toBe(500);
		expect(oldV.description).toBe('Hospedaje');
	});

	describe('autorización cross-retiro (hasRetreatAccess)', () => {
		it('createDebt responde 403 si el usuario no tiene acceso al retiro efectivo', async () => {
			jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);
			const res = await createDebt({
				participantId: server.id,
				amount: 500,
				description: 'Hospedaje',
				retreatId: retreat.id,
			});
			expect(res.statusCode).toBe(403);
			const rows = await logs();
			expect(rows.filter((r) => r.action === 'participant_debt.create')).toHaveLength(0);
		});

		it('updateDebt responde 403 si el usuario no tiene acceso al retiro de la deuda', async () => {
			const created = await createDebt({
				participantId: server.id,
				amount: 500,
				description: 'Hospedaje',
				retreatId: retreat.id,
			});
			jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);

			const req: any = {
				params: { id: created.body.id },
				body: { amount: 750 },
				user: { id: actor.id },
			};
			const res = mockRes();
			await controller.updateDebt(req, res);
			expect(res.statusCode).toBe(403);
		});

		it('deleteDebt responde 403 si el usuario no tiene acceso al retiro de la deuda', async () => {
			const created = await createDebt({
				participantId: server.id,
				amount: 500,
				description: 'Hospedaje',
				retreatId: retreat.id,
			});
			jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);

			const req: any = { params: { id: created.body.id }, user: { id: actor.id } };
			const res = mockRes();
			await controller.deleteDebt(req, res);
			expect(res.statusCode).toBe(403);
		});
	});
});
