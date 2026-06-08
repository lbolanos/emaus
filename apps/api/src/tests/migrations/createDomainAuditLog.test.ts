import { DataSource } from 'typeorm';
import { CreateDomainAuditLog20260606000000 } from '@/migrations/sqlite/20260606000000_CreateDomainAuditLog';

/**
 * La migration crea una tabla nueva (hoja, sin FKs entrantes). Validamos que up()
 * cree la tabla + índices, que sea idempotente (re-ejecutar no falla) y que down()
 * la elimine.
 */
describe('CreateDomainAuditLog20260606000000', () => {
	let ds: DataSource;

	beforeEach(async () => {
		ds = new DataSource({ type: 'sqlite', database: ':memory:', synchronize: false });
		await ds.initialize();
	});

	afterEach(async () => {
		if (ds.isInitialized) await ds.destroy();
	});

	const tableExists = async () => {
		const r = await ds.query(
			`SELECT name FROM sqlite_master WHERE type='table' AND name='domain_audit_log'`,
		);
		return r.length > 0;
	};

	it('up() crea la tabla domain_audit_log con sus índices', async () => {
		const migration = new CreateDomainAuditLog20260606000000();
		await migration.up(ds.createQueryRunner());

		expect(await tableExists()).toBe(true);

		const indexes = await ds.query(
			`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='domain_audit_log'`,
		);
		const names = indexes.map((i: any) => i.name);
		expect(names).toEqual(
			expect.arrayContaining([
				'idx_domain_audit_log_resource',
				'idx_domain_audit_log_retreat',
				'idx_domain_audit_log_actor',
				'idx_domain_audit_log_action',
			]),
		);

		// Insert sanity check
		await ds.query(
			`INSERT INTO domain_audit_log (id, action, resourceType) VALUES ('1', 'table.create', 'table')`,
		);
		const rows = await ds.query(`SELECT COUNT(*) AS c FROM domain_audit_log`);
		expect(Number(rows[0].c)).toBe(1);
	});

	it('up() es idempotente (re-ejecutar no lanza)', async () => {
		const migration = new CreateDomainAuditLog20260606000000();
		await migration.up(ds.createQueryRunner());
		await expect(migration.up(ds.createQueryRunner())).resolves.not.toThrow();
	});

	it('down() elimina la tabla', async () => {
		const migration = new CreateDomainAuditLog20260606000000();
		await migration.up(ds.createQueryRunner());
		await migration.down(ds.createQueryRunner());
		expect(await tableExists()).toBe(false);
	});
});
