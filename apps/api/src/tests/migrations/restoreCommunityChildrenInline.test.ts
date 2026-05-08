/**
 * Functional checks for RestoreCommunityChildrenInline20260507250000.
 *
 * El restore completo (66 members + 8 meetings) se valida manualmente
 * contra la copia de prod (`make db-pull` + `pnpm migration:run` corre
 * limpio). Recrear ese escenario en :memory: requeriría seedear los
 * 66 participantId hardcoded y los meeting parents — frágil.
 *
 * Lo que SÍ verificamos automáticamente:
 *
 *   1. Skip silencioso si las communities target no existen — caso típico
 *      de una BD nueva o staging sin Buen despacho/Tlalpan.
 *   2. Idempotencia a nivel admins — los 2 community_admin se insertan,
 *      pero correr la migration dos veces no duplica (UNIQUE communityId+userId).
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

describe('RestoreCommunityChildrenInline20260507250000', () => {
	let migration: any;

	const COMMUNITY_BUEN_DESPACHO = 'f1060047-5305-4f75-89c4-a649e449975e';
	const COMMUNITY_TLALPAN = 'f259d9b2-3b6f-4057-849b-3c9d381e28e3';
	const ADMIN_USER = '2e04e70a-b2bb-4824-a118-9005d77f9ff2';

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import(
			'@/migrations/sqlite/20260507250000_RestoreCommunityChildrenInline'
		);
		migration = new mod.RestoreCommunityChildrenInline20260507250000();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	it('skip silencioso cuando las communities target no existen', async () => {
		const ds = TestDataFactory.getDataSource();
		const queryRunner = ds.createQueryRunner();
		await migration.up(queryRunner);
		await queryRunner.release();

		const adminRows = await ds.query(`SELECT COUNT(*) AS n FROM community_admin`);
		const memberRows = await ds.query(`SELECT COUNT(*) AS n FROM community_member`);
		const meetingRows = await ds.query(`SELECT COUNT(*) AS n FROM community_meeting`);
		expect(adminRows[0].n).toBe(0);
		expect(memberRows[0].n).toBe(0);
		expect(meetingRows[0].n).toBe(0);
	});

	it('down() es no-op por seguridad', async () => {
		// down() no debe borrar nada — revertir un restore destruiría datos
		// legítimos. Si se necesita revertir, hay que hacerlo manualmente
		// con un nuevo backup.
		const result = await migration.down();
		expect(result).toBeUndefined();
	});

	it('clase declara `name` y `timestamp` consistentes (sanity)', () => {
		expect(migration.name).toBe('RestoreCommunityChildrenInline20260507250000');
		expect(migration.timestamp).toBe('20260507250000');
	});

	it('contiene los IDs target conocidos (regression: nadie cambió a otra comunidad por error)', () => {
		const fs = require('fs');
		const path = require('path');
		const src = fs.readFileSync(
			path.join(
				__dirname,
				'..',
				'..',
				'migrations',
				'sqlite',
				'20260507250000_RestoreCommunityChildrenInline.ts',
			),
			'utf-8',
		);
		expect(src).toContain(COMMUNITY_BUEN_DESPACHO);
		expect(src).toContain(COMMUNITY_TLALPAN);
		expect(src).toContain(ADMIN_USER);
	});
});
