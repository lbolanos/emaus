/**
 * Functional test para AddCouplesRetreatSupport20260822130000.
 *
 * Verifica:
 *   - up() agrega gender / spouseParticipantId / couplesShareRoom / couplesShareTable.
 *   - El índice de email relajado: un duplicado individual (gender NULL) sigue
 *     bloqueado; un matrimonio M/F puede compartir email en el mismo retiro; un
 *     tercer registro con el mismo email+gender sigue bloqueado.
 *   - El índice parcial de spouseParticipantId impide vincular al mismo cónyuge
 *     desde dos filas del mismo retiro.
 *   - down()/up() hacen round-trip.
 *
 * setupTestDatabase crea el schema desde las entities (sin índices de migrations),
 * por eso el beforeAll corre down()+up() para instalar los índices reales.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

describe('AddCouplesRetreatSupport20260822130000', () => {
	let migration: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import('@/migrations/sqlite/20260822130000_AddCouplesRetreatSupport');
		migration = new mod.AddCouplesRetreatSupport20260822130000();

		// El schema sincronizado ya trae las columnas (vienen de las entities) pero no
		// los índices. down() las quita y up() deja columnas + índices como en prod.
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
		expect(await tableColumns('participants')).toContain('gender');
		expect(await tableColumns('retreat_participants')).toContain('spouseParticipantId');
		const retreatCols = await tableColumns('retreat');
		expect(retreatCols).toContain('couplesShareRoom');
		expect(retreatCols).toContain('couplesShareTable');
	});

	it('couplesShareRoom/couplesShareTable defaultean a true (1)', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const ds = TestDataFactory.getDataSource();
		const rows = await ds.query(
			`SELECT couplesShareRoom, couplesShareTable FROM retreat WHERE id = ?`,
			[retreat.id],
		);
		expect(rows[0].couplesShareRoom).toBe(1);
		expect(rows[0].couplesShareTable).toBe(1);
	});

	it('bloquea el email duplicado individual (gender NULL) en el mismo retiro', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		await TestDataFactory.createTestParticipant(retreat.id, {
			email: 'compartido@example.com',
		});
		await expect(
			TestDataFactory.createTestParticipant(retreat.id, {
				email: 'compartido@example.com',
			}),
		).rejects.toThrow();
	});

	it('permite que un matrimonio M/F comparta email en el mismo retiro', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const husband = await TestDataFactory.createTestParticipant(retreat.id, {
			email: 'matrimonio@example.com',
			gender: 'M',
		});
		const wife = await TestDataFactory.createTestParticipant(retreat.id, {
			email: 'matrimonio@example.com',
			gender: 'F',
		});
		expect(husband.id).not.toBe(wife.id);
	});

	it('bloquea un tercer registro con el mismo email y mismo gender', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		await TestDataFactory.createTestParticipant(retreat.id, {
			email: 'matrimonio@example.com',
			gender: 'M',
		});
		await TestDataFactory.createTestParticipant(retreat.id, {
			email: 'matrimonio@example.com',
			gender: 'F',
		});
		await expect(
			TestDataFactory.createTestParticipant(retreat.id, {
				email: 'matrimonio@example.com',
				gender: 'M',
			}),
		).rejects.toThrow();
	});

	it('sigue permitiendo el mismo email en retiros distintos', async () => {
		const retreatA = await TestDataFactory.createTestRetreat();
		const retreatB = await TestDataFactory.createTestRetreat();
		await TestDataFactory.createTestParticipant(retreatA.id, {
			email: 'viajero@example.com',
		});
		const second = await TestDataFactory.createTestParticipant(retreatB.id, {
			email: 'viajero@example.com',
		});
		expect(second.id).toBeTruthy();
	});

	it('impide vincular al mismo cónyuge desde dos filas del mismo retiro', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const spouse = await TestDataFactory.createTestParticipant(retreat.id, {
			email: 'esposa@example.com',
			gender: 'F',
		});
		const a = await TestDataFactory.createTestParticipant(retreat.id, {
			email: 'a@example.com',
		});
		const b = await TestDataFactory.createTestParticipant(retreat.id, {
			email: 'b@example.com',
		});
		const ds = TestDataFactory.getDataSource();
		await ds.query(
			`UPDATE retreat_participants SET spouseParticipantId = ? WHERE participantId = ?`,
			[spouse.id, a.id],
		);
		await expect(
			ds.query(
				`UPDATE retreat_participants SET spouseParticipantId = ? WHERE participantId = ?`,
				[spouse.id, b.id],
			),
		).rejects.toThrow();
	});

	it('down() restaura el índice estricto y up() vuelve a relajarlo', async () => {
		// Nota: tras down() no se puede usar el factory (la entity sigue mapeando
		// gender y el reload de TypeORM fallaría con "no such column"), así que la
		// verificación es sobre el SQL del índice en sqlite_master.
		const ds = TestDataFactory.getDataSource();
		// clearTestData no limpia `participants` (borra 'participant', singular — bug
		// latente de test-setup), y las parejas M/F con email compartido de los tests
		// anteriores violarían el índice estricto que down() recrea.
		await ds.query(`DELETE FROM retreat_participants`);
		await ds.query(`DELETE FROM participants`);
		const indexSql = async (): Promise<string> => {
			const rows = await ds.query(
				`SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'UQ_participants_email_retreat'`,
			);
			return rows[0]?.sql ?? '';
		};

		const qr = ds.createQueryRunner();
		await migration.down(qr);
		expect(await tableColumns('participants')).not.toContain('gender');
		expect(await indexSql()).not.toContain('COALESCE');

		await migration.up(qr);
		await qr.release();
		expect(await tableColumns('participants')).toContain('gender');
		expect(await indexSql()).toContain('COALESCE');
	});
});
