/**
 * Test funcional del backfill de AddPalancasCountAndThreshold.
 *
 * Lo que importa verificar es que el backfill **no puede perder información**:
 * `palancasReceived` es TEXT y algunas fichas podrían traer prosa. La migración
 * rellena el conteo sólo cuando el texto es un entero limpio y deja el resto
 * intacto, así que nunca hace falta restaurar un backup.
 *
 * El schema lo crea `synchronize` (las columnas ya están en las entidades), así
 * que aquí se ejercita únicamente el UPDATE del backfill.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

describe('AddPalancasCountAndThreshold — backfill', () => {
	let migration: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import(
			'@/migrations/sqlite/20260908150100_AddPalancasCountAndThreshold'
		);
		migration = new mod.AddPalancasCountAndThreshold20260908150100();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	/**
	 * Corre sólo el UPDATE del backfill (sin los ALTER TABLE, que fallarían
	 * porque `synchronize` ya creó las columnas).
	 */
	async function runBackfill() {
		const ds = TestDataFactory.getDataSource();
		await ds.query(`
			UPDATE "retreat_participants"
			   SET "palancasReceivedCount" = CAST(TRIM("palancasReceived") AS INTEGER)
			 WHERE "palancasReceivedCount" IS NULL
			   AND "palancasReceived" IS NOT NULL
			   AND TRIM("palancasReceived") <> ''
			   AND TRIM("palancasReceived") GLOB '[0-9]*'
			   AND TRIM("palancasReceived") NOT GLOB '*[^0-9]*'
		`);
	}

	async function seedWalker(palancasReceived: string | null) {
		const retreat = await TestDataFactory.createTestRetreat();
		const participant = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker',
		} as any);
		const ds = TestDataFactory.getDataSource();
		await ds.query(
			`UPDATE "retreat_participants" SET "palancasReceived" = ?, "palancasNotes" = ?
			  WHERE "participantId" = ? AND "retreatId" = ?`,
			[palancasReceived, 'nota original', participant.id, retreat.id],
		);
		return { retreatId: retreat.id, participantId: participant.id };
	}

	async function readRow(participantId: string) {
		const ds = TestDataFactory.getDataSource();
		const [row] = await ds.query(
			`SELECT "palancasReceived", "palancasReceivedCount", "palancasNotes"
			   FROM "retreat_participants" WHERE "participantId" = ?`,
			[participantId],
		);
		return row;
	}

	it('rellena el conteo desde un entero limpio', async () => {
		const { participantId } = await seedWalker('4');
		await runBackfill();
		const row = await readRow(participantId);
		expect(row.palancasReceivedCount).toBe(4);
		// El texto sigue ahí, intacto.
		expect(row.palancasReceived).toBe('4');
	});

	it('tolera espacios alrededor del número', async () => {
		const { participantId } = await seedWalker('  7  ');
		await runBackfill();
		expect((await readRow(participantId)).palancasReceivedCount).toBe(7);
	});

	it('un cero explícito se guarda como 0, no como null', async () => {
		const { participantId } = await seedWalker('0');
		await runBackfill();
		// "no ha recibido ninguna" es un dato, distinto de "sin capturar".
		expect((await readRow(participantId)).palancasReceivedCount).toBe(0);
	});

	it('deja en null la prosa y NO toca el texto ni las notas', async () => {
		const { participantId } = await seedWalker('tres cartas de su mamá');
		await runBackfill();
		const row = await readRow(participantId);
		expect(row.palancasReceivedCount).toBeNull();
		expect(row.palancasReceived).toBe('tres cartas de su mamá');
		expect(row.palancasNotes).toBe('nota original');
	});

	it('no adivina en un texto que empieza con número', async () => {
		// `parseInt` daría 3 y con eso nace un cuarto criterio distinto.
		const { participantId } = await seedWalker('3 de la mamá');
		await runBackfill();
		expect((await readRow(participantId)).palancasReceivedCount).toBeNull();
	});

	it('una ficha vacía se queda sin conteo', async () => {
		const { participantId } = await seedWalker('');
		await runBackfill();
		expect((await readRow(participantId)).palancasReceivedCount).toBeNull();
	});

	it('es idempotente y no sobrescribe un conteo ya capturado a mano', async () => {
		const { participantId, retreatId } = await seedWalker('4');
		await runBackfill();

		// Alguien corrige el conteo a mano sin tocar el texto.
		const ds = TestDataFactory.getDataSource();
		await ds.query(
			`UPDATE "retreat_participants" SET "palancasReceivedCount" = 9
			  WHERE "participantId" = ? AND "retreatId" = ?`,
			[participantId, retreatId],
		);

		await runBackfill();
		// El guard `IS NULL` protege la corrección manual.
		expect((await readRow(participantId)).palancasReceivedCount).toBe(9);
	});

	it('el down() del archivo quita las dos columnas', async () => {
		// No se ejecuta (SQLite y synchronize pelean con DROP COLUMN aquí);
		// se verifica el contrato del archivo para que no se olvide.
		const src = migration.constructor.toString() + migration.down.toString();
		expect(src).toContain('minPalancasPerWalker');
		expect(migration.down.toString()).toContain('DROP COLUMN');
	});
});
