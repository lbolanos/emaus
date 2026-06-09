import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { User } from '@/entities/user.entity';
import { Retreat } from '@/entities/retreat.entity';
import { authorizationService } from '@/middleware/authorization';
import { getDomainAuditLogs } from '@/controllers/domainAuditController';

const createMockResponse = () => {
	const res: any = {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
	};
	return res;
};

describe('domainAuditController.getDomainAuditLogs', () => {
	let actor: User;
	let retreat: Retreat;

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		jest.restoreAllMocks();
		actor = await TestDataFactory.createTestUser({ displayName: 'Coord Uno' });
		retreat = await TestDataFactory.createTestRetreat();
	});

	const seed = (overrides: Partial<DomainAuditLog> = {}) =>
		AppDataSource.getRepository(DomainAuditLog).save(
			AppDataSource.getRepository(DomainAuditLog).create({
				action: 'table.create',
				resourceType: 'table',
				resourceId: 't1',
				retreatId: retreat.id,
				actorUserId: actor.id,
				...overrides,
			}),
		);

	it('responde 401 cuando no hay usuario autenticado', async () => {
		const req: any = { params: { retreatId: retreat.id }, query: {}, user: undefined };
		const res = createMockResponse();
		await getDomainAuditLogs(req, res);
		expect(res.status).toHaveBeenCalledWith(401);
	});

	it('responde 403 cuando el usuario no tiene acceso ni permisos', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);
		jest.spyOn(authorizationService, 'isRetreatCreator').mockResolvedValue(false);
		jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(false);

		const req: any = { params: { retreatId: retreat.id }, query: {}, user: { id: actor.id } };
		const res = createMockResponse();
		await getDomainAuditLogs(req, res);
		expect(res.status).toHaveBeenCalledWith(403);
	});

	it('devuelve los logs del retiro con el actor enriquecido', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		await seed({ action: 'payment.create', resourceType: 'payment', resourceId: 'p1' });

		const req: any = { params: { retreatId: retreat.id }, query: {}, user: { id: actor.id } };
		const res = createMockResponse();
		await getDomainAuditLogs(req, res);

		expect(res.json).toHaveBeenCalled();
		const payload = res.json.mock.calls[0][0];
		expect(payload.total).toBe(1);
		expect(payload.logs).toHaveLength(1);
		expect(payload.logs[0].action).toBe('payment.create');
		expect(payload.logs[0].actor).toEqual({ displayName: 'Coord Uno', email: actor.email });
	});

	it('parsea oldValues/newValues/metadata de JSON a objeto', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		await seed({
			action: 'table.update',
			oldValues: JSON.stringify({ name: 'A' }),
			newValues: JSON.stringify({ name: 'B' }),
			metadata: JSON.stringify({ k: 1 }),
		});

		const req: any = { params: { retreatId: retreat.id }, query: {}, user: { id: actor.id } };
		const res = createMockResponse();
		await getDomainAuditLogs(req, res);

		const log = res.json.mock.calls[0][0].logs[0];
		expect(log.oldValues).toEqual({ name: 'A' });
		expect(log.newValues).toEqual({ name: 'B' });
		expect(log.metadata).toEqual({ k: 1 });
	});

	it('filtra por resourceType', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		await seed({ resourceType: 'table', action: 'table.create' });
		await seed({ resourceType: 'payment', action: 'payment.create' });

		const req: any = {
			params: { retreatId: retreat.id },
			query: { resourceType: 'payment' },
			user: { id: actor.id },
		};
		const res = createMockResponse();
		await getDomainAuditLogs(req, res);

		const payload = res.json.mock.calls[0][0];
		expect(payload.logs).toHaveLength(1);
		expect(payload.logs[0].resourceType).toBe('payment');
	});

	it('solo devuelve logs del retiro pedido (aislamiento entre retiros)', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		const otherRetreat = await TestDataFactory.createTestRetreat();
		await seed();
		await seed({ retreatId: otherRetreat.id });

		const req: any = { params: { retreatId: retreat.id }, query: {}, user: { id: actor.id } };
		const res = createMockResponse();
		await getDomainAuditLogs(req, res);

		const payload = res.json.mock.calls[0][0];
		expect(payload.total).toBe(1);
		expect(payload.logs[0].retreatId).toBe(retreat.id);
	});

	it('permite el acceso al creador del retiro aunque no tenga hasRetreatAccess', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);
		jest.spyOn(authorizationService, 'isRetreatCreator').mockResolvedValue(true);
		jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(false);
		await seed();

		const req: any = { params: { retreatId: retreat.id }, query: {}, user: { id: actor.id } };
		const res = createMockResponse();
		await getDomainAuditLogs(req, res);

		expect(res.json).toHaveBeenCalled();
		expect(res.json.mock.calls[0][0].total).toBe(1);
	});
});
