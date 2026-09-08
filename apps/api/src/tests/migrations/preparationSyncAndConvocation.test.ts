/**
 * Functional test de PreparationSyncAndConvocation20260907200000.
 *
 * Lo que importa verificar:
 *   - up() deja `retreat_preparation.communityMeetingId`.
 *   - El recreate de `global_message_templates` **no pierde filas** (seed-and-verify
 *     obligatorio del skill `sqlite-migrations`) y extiende el CHECK para que
 *     'SERVER_CONVOCATION' quepa.
 *   - Se siembra la plantilla (global + por retiro) y la secuencia global de
 *     WhatsApp con la audiencia `community_roster`.
 *   - down()/up() hacen round-trip, incluido restaurar el CHECK estrecho.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

describe('PreparationSyncAndConvocation20260907200000', () => {
	let migration: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import(
			'@/migrations/sqlite/20260907200000_PreparationSyncAndConvocation'
		);
		migration = new mod.PreparationSyncAndConvocation20260907200000();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	const ds = () => TestDataFactory.getDataSource();

	const tableColumns = async (table: string): Promise<string[]> => {
		const cols = await ds().query(`PRAGMA table_info(${table})`);
		return cols.map((c: any) => c.name);
	};

	const count = async (sql: string, params: unknown[] = []): Promise<number> => {
		const [row] = await ds().query(sql, params);
		return Number(Object.values(row)[0]);
	};

	/** Deja el schema en el estado pre-migración para poder ejercer `up()` de verdad. */
	const runDownThenUp = async () => {
		const qr = ds().createQueryRunner();
		await migration.down(qr);
		await migration.up(qr);
		await qr.release();
	};

	it('up() deja la columna del puente', async () => {
		await runDownThenUp();
		expect(await tableColumns('retreat_preparation')).toContain('communityMeetingId');
	});

	it('el recreate de global_message_templates no pierde filas', async () => {
		// Semilla: una plantilla global cualquiera que debe sobrevivir al recreate.
		await ds().query(
			`INSERT INTO global_message_templates ("id", "name", "type", "message", "isActive", "createdAt", "updatedAt")
			 VALUES ('seed-survives', 'Semilla', 'GENERAL', 'hola', 1, datetime('now'), datetime('now'))`,
		);
		// Se cuentan las filas AJENAS a la convocatoria: `clearTestData` no limpia
		// esta tabla, así que el conteo total arrastra la fila sembrada por un test
		// anterior y compararlo contra `before + 1` mediría otra cosa.
		const otherRows = `SELECT COUNT(*) FROM global_message_templates WHERE type != 'SERVER_CONVOCATION'`;
		const before = await count(otherRows);

		await runDownThenUp();

		// La invariante del seed-and-verify: el recreate no pierde ni una fila.
		expect(await count(otherRows)).toBe(before);
		expect(
			await count(`SELECT COUNT(*) FROM global_message_templates WHERE id = 'seed-survives'`),
		).toBe(1);
	});

	it('el CHECK extendido acepta SERVER_CONVOCATION', async () => {
		await runDownThenUp();
		expect(
			await count(
				`SELECT COUNT(*) FROM global_message_templates WHERE type = 'SERVER_CONVOCATION'`,
			),
		).toBe(1);
	});

	it('siembra la plantilla en cada retiro existente', async () => {
		// El paso de la secuencia resuelve `templateType` contra las plantillas DEL
		// RETIRO: sin esta copia el mensaje se omitiría por "sin plantilla".
		const retreat = await TestDataFactory.createTestRetreat();
		await runDownThenUp();

		expect(
			await count(
				`SELECT COUNT(*) FROM message_templates WHERE retreatId = ? AND type = 'SERVER_CONVOCATION'`,
				[retreat.id],
			),
		).toBe(1);
	});

	it('siembra la secuencia global de WhatsApp al padrón', async () => {
		await runDownThenUp();
		const [seq] = await ds().query(
			`SELECT s.audience, s.trigger, st.channel, st.templateType, st.offsetDays
			   FROM global_message_sequences s
			   JOIN global_sequence_steps st ON st.sequenceId = s.id
			  WHERE s.audience = 'community_roster'`,
		);
		expect(seq).toBeTruthy();
		expect(seq.trigger).toBe('days_before_retreat');
		// WhatsApp, no email: en este sistema WhatsApp se encola y lo despacha una
		// persona; el correo masivo era justo lo que se descartó.
		expect(seq.channel).toBe('whatsapp');
		expect(seq.templateType).toBe('SERVER_CONVOCATION');
	});

	it('es idempotente: volver a correr up() no duplica la siembra', async () => {
		await runDownThenUp();
		const qr = ds().createQueryRunner();
		// Sólo la parte de siembra: `up()` completo fallaría por la columna ya creada.
		await migration.recreateGlobalTemplateTypeCheck(qr, true);
		await qr.release();

		expect(
			await count(
				`SELECT COUNT(*) FROM global_message_templates WHERE type = 'SERVER_CONVOCATION'`,
			),
		).toBe(1);
		expect(
			await count(
				`SELECT COUNT(*) FROM global_message_sequences WHERE audience = 'community_roster'`,
			),
		).toBe(1);
	});

	it('down() quita la columna y restaura el CHECK estrecho', async () => {
		await runDownThenUp();
		const qr = ds().createQueryRunner();
		await migration.down(qr);
		await qr.release();

		expect(await tableColumns('retreat_preparation')).not.toContain('communityMeetingId');
		expect(
			await count(
				`SELECT COUNT(*) FROM global_message_templates WHERE type = 'SERVER_CONVOCATION'`,
			),
		).toBe(0);
		// Y el CHECK volvió a rechazar el tipo.
		await expect(
			ds().query(
				`INSERT INTO global_message_templates ("id", "name", "type", "message", "isActive", "createdAt", "updatedAt")
				 VALUES ('x', 'x', 'SERVER_CONVOCATION', 'x', 1, datetime('now'), datetime('now'))`,
			),
		).rejects.toThrow();

		// Dejar el schema como lo espera el resto de la suite.
		const qr2 = ds().createQueryRunner();
		await migration.up(qr2);
		await qr2.release();
	});
});
