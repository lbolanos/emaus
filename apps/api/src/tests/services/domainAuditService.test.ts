import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { domainAuditService, DomainAuditAction } from '@/services/domainAuditService';
import { auditContext } from '@/utils/auditContext';

describe('DomainAuditService', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		jest.restoreAllMocks();
	});

	const repo = () => AppDataSource.getRepository(DomainAuditLog);

	it('persiste una fila con los campos correctos y serializa JSON', async () => {
		await domainAuditService.log({
			action: DomainAuditAction.PARTICIPANT_UPDATE,
			resourceType: 'participant',
			resourceId: 'p1',
			retreatId: 'r1',
			actorUserId: 'u1',
			oldValues: { type: 'walker' },
			newValues: { type: 'server' },
			metadata: { source: 'test' },
			ipAddress: '9.9.9.9',
			userAgent: 'jest-agent',
		});

		const rows = await repo().find();
		expect(rows).toHaveLength(1);
		const row = rows[0];
		expect(row.action).toBe('participant.update');
		expect(row.resourceType).toBe('participant');
		expect(row.resourceId).toBe('p1');
		expect(row.retreatId).toBe('r1');
		expect(row.actorUserId).toBe('u1');
		expect(row.ipAddress).toBe('9.9.9.9');
		expect(row.userAgent).toBe('jest-agent');
		expect(JSON.parse(row.oldValues!)).toEqual({ type: 'walker' });
		expect(JSON.parse(row.newValues!)).toEqual({ type: 'server' });
		expect(JSON.parse(row.metadata!)).toEqual({ source: 'test' });
	});

	it('lee el actor del auditContext cuando el evento no lo trae', async () => {
		await auditContext.run({ userId: 'ctx-user', ip: '1.1.1.1', userAgent: 'ctx-agent' }, async () => {
			await domainAuditService.log({
				action: DomainAuditAction.TABLE_ASSIGN_WALKER,
				resourceType: 'table',
				resourceId: 't1',
				retreatId: 'r1',
			});
		});

		const row = (await repo().find())[0];
		expect(row.actorUserId).toBe('ctx-user');
		expect(row.ipAddress).toBe('1.1.1.1');
		expect(row.userAgent).toBe('ctx-agent');
	});

	it('el actor explícito del evento gana sobre el del contexto', async () => {
		await auditContext.run({ userId: 'ctx-user', ip: '1.1.1.1' }, async () => {
			await domainAuditService.log({
				action: DomainAuditAction.PAYMENT_CREATE,
				resourceType: 'payment',
				resourceId: 'pay1',
				actorUserId: 'explicit-user',
			});
		});

		const row = (await repo().find())[0];
		expect(row.actorUserId).toBe('explicit-user');
	});

	it('trunca el userAgent a 255 caracteres', async () => {
		await domainAuditService.log({
			action: 'participant.update',
			resourceType: 'participant',
			resourceId: 'p1',
			userAgent: 'x'.repeat(400),
		});
		const row = (await repo().find())[0];
		expect(row.userAgent!.length).toBe(255);
	});

	it('es fire-and-forget: un fallo de save NO propaga (no rompe la operación)', async () => {
		const saveSpy = jest
			.spyOn(repo(), 'save')
			.mockRejectedValueOnce(new Error('DB down'));

		// No debe lanzar a pesar de que save rechaza.
		await expect(
			domainAuditService.log({
				action: 'participant.delete',
				resourceType: 'participant',
				resourceId: 'p1',
			}),
		).resolves.toBeUndefined();

		expect(saveSpy).toHaveBeenCalled();
	});

	describe('helpers', () => {
		it('logCreate guarda un snapshot compacto en newValues', async () => {
			await domainAuditService.logCreate(
				'table',
				't1',
				{ name: 'Mesa 1', retreatId: 'r1', secretInternal: 'x' },
				{ retreatId: 'r1', fields: ['name', 'retreatId'] },
			);
			const row = (await repo().find())[0];
			expect(row.action).toBe('table.create');
			expect(JSON.parse(row.newValues!)).toEqual({ name: 'Mesa 1', retreatId: 'r1' });
			expect(row.oldValues).toBeNull();
		});

		it('logUpdate guarda solo los campos cambiados', async () => {
			await domainAuditService.logUpdate(
				'payment',
				'pay1',
				{ amount: 100, notes: 'a' },
				{ amount: 250, notes: 'a' },
				{ retreatId: 'r1' },
			);
			const row = (await repo().find())[0];
			expect(row.action).toBe('payment.update');
			expect(JSON.parse(row.oldValues!)).toEqual({ amount: 100 });
			expect(JSON.parse(row.newValues!)).toEqual({ amount: 250 });
		});

		it('logDelete guarda el snapshot previo en oldValues', async () => {
			await domainAuditService.logDelete(
				'house',
				'h1',
				{ name: 'Casa', capacity: 10 },
				{ fields: ['name'] },
			);
			const row = (await repo().find())[0];
			expect(row.action).toBe('house.delete');
			expect(JSON.parse(row.oldValues!)).toEqual({ name: 'Casa' });
		});
	});
});
