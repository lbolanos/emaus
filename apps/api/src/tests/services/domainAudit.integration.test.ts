import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { Retreat } from '@/entities/retreat.entity';
import { createTable, updateTable, deleteTable } from '@/services/tableMesaService';
import { auditContext } from '@/utils/auditContext';

/**
 * Integración end-to-end: instrumentación de un service real → auditContext (ALS) →
 * fila en domain_audit_log con el actor correcto. Usamos Mesas por ser el flujo más
 * simple de invocar (solo requiere un retreatId).
 */
describe('Domain audit — integración instrumentación + ALS', () => {
	let retreat: Retreat;

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		retreat = await TestDataFactory.createTestRetreat();
	});

	const logs = () => AppDataSource.getRepository(DomainAuditLog).find();

	// La auditoría es fire-and-forget (los call sites usan `void`), así que el INSERT
	// no está garantizado cuando la operación de negocio retorna. Esperamos a que la
	// fila aparezca (poll corto) — refleja el comportamiento real sin acoplar al timing.
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

	it('createTable registra table.create con el actor del contexto', async () => {
		await auditContext.run({ userId: 'coord-1', ip: '10.0.0.1', userAgent: 'jest' }, async () => {
			await createTable({ name: 'Mesa 1', retreatId: retreat.id });
		});

		const rows = await waitForLogs((r) => r.some((x) => x.action === 'table.create'));
		const createRows = rows.filter((r) => r.action === 'table.create');
		expect(createRows).toHaveLength(1);
		expect(createRows[0].resourceType).toBe('table');
		expect(createRows[0].retreatId).toBe(retreat.id);
		expect(createRows[0].actorUserId).toBe('coord-1');
		expect(createRows[0].ipAddress).toBe('10.0.0.1');
	});

	it('updateTable registra table.update con el diff de name', async () => {
		const table = await auditContext.run({ userId: 'u1' }, () =>
			createTable({ name: 'Mesa A', retreatId: retreat.id }),
		);

		await auditContext.run({ userId: 'u2' }, async () => {
			await updateTable(table.id, { name: 'Mesa B' });
		});

		const updateRows = (
			await waitForLogs((r) => r.some((x) => x.action === 'table.update'))
		).filter((r) => r.action === 'table.update');
		expect(updateRows).toHaveLength(1);
		expect(updateRows[0].actorUserId).toBe('u2');
		expect(JSON.parse(updateRows[0].oldValues!)).toEqual({ name: 'Mesa A' });
		expect(JSON.parse(updateRows[0].newValues!)).toEqual({ name: 'Mesa B' });
	});

	it('deleteTable registra table.delete con el snapshot previo', async () => {
		const table = await createTable({ name: 'Mesa X', retreatId: retreat.id });
		await deleteTable(table.id);

		const deleteRows = (
			await waitForLogs((r) => r.some((x) => x.action === 'table.delete'))
		).filter((r) => r.action === 'table.delete');
		expect(deleteRows).toHaveLength(1);
		expect(deleteRows[0].resourceId).toBe(table.id);
		expect(JSON.parse(deleteRows[0].oldValues!)).toMatchObject({ name: 'Mesa X' });
	});

	it('sin contexto (fuera de un request) registra con actor null y no lanza', async () => {
		await createTable({ name: 'Mesa sin actor', retreatId: retreat.id });
		const createRows = (
			await waitForLogs((r) => r.some((x) => x.action === 'table.create'))
		).filter((r) => r.action === 'table.create');
		expect(createRows).toHaveLength(1);
		expect(createRows[0].actorUserId).toBeNull();
	});
});
