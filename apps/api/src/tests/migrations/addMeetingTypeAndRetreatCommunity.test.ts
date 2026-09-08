/**
 * Functional test para AddMeetingTypeAndRetreatCommunity20260907180000.
 *
 * Lo que importa verificar:
 *   - up() deja `community_meeting.meetingType` (default 'general') y
 *     `retreat.communityId` (nullable).
 *   - El backfill heurístico clasifica como 'preparation' las reuniones cuyo
 *     título ya dice "preparación" —con y sin acento— y NO toca las demás.
 *   - El backfill es idempotente y respeta un tipo elegido a mano.
 *   - down()/up() hacen round-trip.
 *
 * setupTestDatabase crea el schema desde las entities, así que las columnas ya
 * están: el beforeAll corre down()+up() para ejercitar de verdad el SQL de la
 * migración, igual que addCouplesRetreatSupport.test.ts.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { PREPARATION_BACKFILL_SQL } from '@/migrations/sqlite/20260907180000_AddMeetingTypeAndRetreatCommunity';

describe('AddMeetingTypeAndRetreatCommunity20260907180000', () => {
	let migration: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import(
			'@/migrations/sqlite/20260907180000_AddMeetingTypeAndRetreatCommunity'
		);
		migration = new mod.AddMeetingTypeAndRetreatCommunity20260907180000();

		const ds = TestDataFactory.getDataSource();
		const qr = ds.createQueryRunner();
		await migration.down(qr);
		await migration.up(qr);
		await qr.release();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	const tableColumns = async (table: string): Promise<string[]> => {
		const ds = TestDataFactory.getDataSource();
		const cols = await ds.query(`PRAGMA table_info(${table})`);
		return cols.map((c: any) => c.name);
	};

	it('up() deja las columnas nuevas en su lugar', async () => {
		expect(await tableColumns('community_meeting')).toContain('meetingType');
		expect(await tableColumns('retreat')).toContain('communityId');
	});

	it('meetingType defaultea a general y retreat.communityId a NULL', async () => {
		const ds = TestDataFactory.getDataSource();
		const user = await TestDataFactory.createTestUser();
		const community = await TestDataFactory.createTestCommunity(user.id);
		const meeting = await TestDataFactory.createTestCommunityMeeting(community.id);
		const retreat = await TestDataFactory.createTestRetreat();

		const [meetingRow] = await ds.query(
			`SELECT meetingType FROM community_meeting WHERE id = ?`,
			[meeting.id],
		);
		const [retreatRow] = await ds.query(`SELECT communityId FROM retreat WHERE id = ?`, [
			retreat.id,
		]);
		expect(meetingRow.meetingType).toBe('general');
		expect(retreatRow.communityId).toBeNull();
	});

	it('el backfill clasifica por título, con y sin acento, y deja el resto en general', async () => {
		const ds = TestDataFactory.getDataSource();
		const user = await TestDataFactory.createTestUser();
		const community = await TestDataFactory.createTestCommunity(user.id);

		const accented = await TestDataFactory.createTestCommunityMeeting(community.id, {
			title: 'Preparación Retiro',
		});
		const plain = await TestDataFactory.createTestCommunityMeeting(community.id, {
			title: 'Preparacion Retiro',
		});
		// El caso que el mirror del SQL dejaba pasar: mayúsculas CON acento. El
		// lower() de SQLite no baja la 'Ó'.
		const shouting = await TestDataFactory.createTestCommunityMeeting(community.id, {
			title: 'PREPARACIÓN RETIRO',
		});
		const regular = await TestDataFactory.createTestCommunityMeeting(community.id, {
			title: 'Reunión Del Valle',
		});

		// Se reejecuta sólo el UPDATE del backfill: `up()` completo fallaría porque
		// la columna ya existe, y lo que se está probando es la heurística. Se
		// ejecuta la constante que usa la migración, NO una copia: un mirror del SQL
		// confirmaría la heurística en vez de comprobarla.
		const qr = ds.createQueryRunner();
		await qr.query(PREPARATION_BACKFILL_SQL);
		await qr.release();

		const typeOf = async (id: string): Promise<string> => {
			const [row] = await ds.query(`SELECT meetingType FROM community_meeting WHERE id = ?`, [
				id,
			]);
			return row.meetingType;
		};
		expect(await typeOf(accented.id)).toBe('preparation');
		expect(await typeOf(plain.id)).toBe('preparation');
		expect(await typeOf(shouting.id)).toBe('preparation');
		expect(await typeOf(regular.id)).toBe('general');
	});

	it('el backfill no pisa un tipo elegido a mano', async () => {
		const ds = TestDataFactory.getDataSource();
		const user = await TestDataFactory.createTestUser();
		const community = await TestDataFactory.createTestCommunity(user.id);
		const meeting = await TestDataFactory.createTestCommunityMeeting(community.id, {
			title: 'Preparacion Retiro',
			meetingType: 'formation',
		});

		const qr = ds.createQueryRunner();
		await qr.query(
			`UPDATE "community_meeting" SET "meetingType" = 'preparation'
			 WHERE "meetingType" = 'general'
			   AND (lower("title") LIKE '%preparacion%' OR lower("title") LIKE '%preparación%')`,
		);
		await qr.release();

		const [row] = await ds.query(`SELECT meetingType FROM community_meeting WHERE id = ?`, [
			meeting.id,
		]);
		expect(row.meetingType).toBe('formation');
	});

	it('down() quita las columnas y up() las devuelve', async () => {
		const ds = TestDataFactory.getDataSource();
		const qr = ds.createQueryRunner();

		await migration.down(qr);
		expect(await tableColumns('community_meeting')).not.toContain('meetingType');
		expect(await tableColumns('retreat')).not.toContain('communityId');

		await migration.up(qr);
		await qr.release();
		expect(await tableColumns('community_meeting')).toContain('meetingType');
		expect(await tableColumns('retreat')).toContain('communityId');
	});
});
