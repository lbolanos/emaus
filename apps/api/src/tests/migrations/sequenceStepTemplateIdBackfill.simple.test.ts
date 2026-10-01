/**
 * Functional test para SequenceStepTemplateId20261002120000 (M3).
 *
 * Sembrando el escenario del incidente "Ultimo Prendas" (dos plantillas del
 * mismo tipo en un retiro, la nueva creada después), verifica:
 *   - up() backfillea cada paso vivo con la plantilla MÁS ANTIGUA de su tipo
 *     (createdAt ASC) — exactamente la que el motor resolvía antes, así el
 *     backfill no cambia ningún envío existente.
 *   - Sin plantilla del tipo en el retiro, el paso queda NULL (el fallback
 *     por templateType sigue vivo).
 *   - Los pasos archivados (isArchived = 1) no se backfillean.
 *   - Un templateId fijado a mano no se pisa: el UPDATE sólo toca NULLs.
 *   - Doble up() converge (guard de PRAGMA table_info ante re-ejecución
 *     parcial) y la columna se recrea si un arranque a medias la dropeó.
 *   - down() elimina la columna.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

// La migración no tiene ids hardcodeados: estos son sólo semilla legible.
const SEQ_ID = 'c41ad6fb-5e64-42d7-9b5f-7c5004c9c0b2';
const LIVE_STEP_ID = 'd34196da-f22d-4fb3-a3f0-72bbf812dbee'; // prendas, vivo
const ARCHIVED_STEP_ID = 'd34196da-f22d-4fb3-a3f0-72bbf812dbef'; // general, archivado
const ORPHAN_STEP_ID = 'd34196da-f22d-4fb3-a3f0-72bbf812dbf0'; // tipo sin plantilla, vivo
const OLD_TPL_ID = 'e9b3c568-8455-4187-8941-0b17f8911545'; // 13-sep, la que el motor resolvía
const NEW_TPL_ID = 'e9b3c568-8455-4187-8941-0b17f8911546'; // 1-oct, inalcanzable antes de M3
const GEN_TPL_ID = 'e9b3c568-8455-4187-8941-0b17f8911547'; // GENERAL, para el paso archivado

describe('SequenceStepTemplateId20261002120000', () => {
	let migration: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import('@/migrations/sqlite/20261002120000_SequenceStepTemplateId');
		migration = new mod.SequenceStepTemplateId20261002120000();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		const ds = TestDataFactory.getDataSource();
		// clearTestData no cubre las tablas del motor de secuencias.
		await ds.query(`DELETE FROM scheduled_messages`);
		await ds.query(`DELETE FROM sequence_steps`);
		await ds.query(`DELETE FROM message_sequences`);
		await ds.query(`DELETE FROM message_templates`);

		const retreat = await TestDataFactory.createTestRetreat();

		await ds.query(
			`INSERT INTO message_sequences (id, name, retreatId, trigger, audience, isActive, createdAt, updatedAt)
			 VALUES (?, 'M3 backfill', ?, 'participant_created', 'walker', 1, datetime('now'), datetime('now'))`,
			[SEQ_ID, retreat.id],
		);
		// El escenario del bug: paso de prendas con DOS plantillas del mismo
		// tipo en el retiro. Ningún INSERT menciona templateId (queda NULL,
		// como venían los pasos históricos).
		await ds.query(
			`INSERT INTO sequence_steps
				(id, sequenceId, stepOrder, offsetDays, sendHour, templateType, channel, recipientTarget, isArchived, createdAt, updatedAt)
			 VALUES (?, ?, 0, 3, 9, 'SERVER_SHIRT_CONFIRMATION', 'whatsapp', 'participant', 0, datetime('now'), datetime('now'))`,
			[LIVE_STEP_ID, SEQ_ID],
		);
		await ds.query(
			`INSERT INTO sequence_steps
				(id, sequenceId, stepOrder, offsetDays, sendHour, templateType, channel, recipientTarget, isArchived, createdAt, updatedAt)
			 VALUES (?, ?, 1, 5, 9, 'GENERAL', 'whatsapp', 'participant', 1, datetime('now'), datetime('now'))`,
			[ARCHIVED_STEP_ID, SEQ_ID],
		);
		await ds.query(
			`INSERT INTO sequence_steps
				(id, sequenceId, stepOrder, offsetDays, sendHour, templateType, channel, recipientTarget, isArchived, createdAt, updatedAt)
			 VALUES (?, ?, 2, 0, 9, 'PALANCA_REQUEST', 'whatsapp', 'participant', 0, datetime('now'), datetime('now'))`,
			[ORPHAN_STEP_ID, SEQ_ID],
		);

		await ds.query(
			`INSERT INTO message_templates (id, name, type, scope, message, retreatId, createdAt, updatedAt)
			 VALUES (?, 'Confirmación de prendas', 'SERVER_SHIRT_CONFIRMATION', 'retreat',
			         'VIEJA {nombre}', ?, '2026-09-13 10:00:00', '2026-09-13 10:00:00')`,
			[OLD_TPL_ID, retreat.id],
		);
		await ds.query(
			`INSERT INTO message_templates (id, name, type, scope, message, retreatId, createdAt, updatedAt)
			 VALUES (?, 'Reconfirmar Prendas', 'SERVER_SHIRT_CONFIRMATION', 'retreat',
			         'NUEVA {nombre}', ?, '2026-10-01 09:00:00', '2026-10-01 09:00:00')`,
			[NEW_TPL_ID, retreat.id],
		);
		await ds.query(
			`INSERT INTO message_templates (id, name, type, scope, message, retreatId, createdAt, updatedAt)
			 VALUES (?, 'General', 'GENERAL', 'retreat',
			         'Texto general', ?, datetime('now'), datetime('now'))`,
			[GEN_TPL_ID, retreat.id],
		);
	});

	const runUp = async () => {
		const ds = TestDataFactory.getDataSource();
		const qr = ds.createQueryRunner();
		await migration.up(qr);
		await qr.release();
	};

	const runDown = async () => {
		const ds = TestDataFactory.getDataSource();
		const qr = ds.createQueryRunner();
		await migration.down(qr);
		await qr.release();
	};

	const scalar = async (sql: string, params: unknown[]) =>
		(await TestDataFactory.getDataSource().query(sql, params))[0].c;

	const templateIdOf = async (stepId: string) =>
		(
			await TestDataFactory.getDataSource().query(
				`SELECT templateId FROM sequence_steps WHERE id = ?`,
				[stepId],
			)
		)[0].templateId;

	const hasTemplateIdColumn = async () => {
		const cols: { name: string }[] = await TestDataFactory.getDataSource().query(
			`PRAGMA table_info("sequence_steps")`,
		);
		return cols.some((c) => c.name === 'templateId');
	};

	it('backfillea el paso vivo con la plantilla más antigua del tipo (la misma que el motor resolvía)', async () => {
		await runUp();

		expect(await templateIdOf(LIVE_STEP_ID)).toBe(OLD_TPL_ID);
	});

	it('sin plantilla del tipo en el retiro, el paso queda NULL', async () => {
		await runUp();

		expect(await templateIdOf(ORPHAN_STEP_ID)).toBeNull();
	});

	it('los pasos archivados no se backfillean', async () => {
		await runUp();

		expect(await templateIdOf(ARCHIVED_STEP_ID)).toBeNull();
	});

	it('respeta un templateId fijado a mano: el UPDATE sólo toca NULLs', async () => {
		// Leonardo ya eligió la nueva para este paso: ni el backfill ni una
		// re-ejecución deben pisar esa decisión.
		const ds = TestDataFactory.getDataSource();
		await ds.query(`UPDATE sequence_steps SET templateId = ? WHERE id = ?`, [
			NEW_TPL_ID,
			LIVE_STEP_ID,
		]);

		await runUp();

		expect(await templateIdOf(LIVE_STEP_ID)).toBe(NEW_TPL_ID);
	});

	it('doble up() converge (idempotente) y recrea la columna si un arranque a medias la dropeó', async () => {
		await runUp();
		expect(await templateIdOf(LIVE_STEP_ID)).toBe(OLD_TPL_ID);

		// Re-ejecutar con la columna ya creada: el guard de PRAGMA table_info
		// evita el "duplicate column name" que atascaría la migración.
		await runUp();
		expect(await templateIdOf(LIVE_STEP_ID)).toBe(OLD_TPL_ID);

		// Un arranque murió tras el down()/antes del up() siguiente: la tabla
		// quedó sin columna y con pasos NULL — up() la recrea y backfillea.
		await runDown();
		await runUp();
		expect(await hasTemplateIdColumn()).toBe(true);
		expect(await templateIdOf(LIVE_STEP_ID)).toBe(OLD_TPL_ID);
	});

	it('createdAt empatado: gana la primera insertada (rowid ASC, tiebreaker del backfill)', async () => {
		// Dos plantillas nacidas el mismo segundo: el ORDER BY secundario es
		// el que decide, y tiene que ser estable.
		const ds = TestDataFactory.getDataSource();
		await ds.query(`DELETE FROM message_templates WHERE type = 'SERVER_SHIRT_CONFIRMATION'`);
		await ds.query(
			`INSERT INTO message_templates (id, name, type, scope, message, retreatId, createdAt, updatedAt)
			 VALUES ('e9b3c568-8455-4187-8941-0b17f8911555', 'Primera', 'SERVER_SHIRT_CONFIRMATION', 'retreat',
			         'uno', (SELECT retreatId FROM message_sequences WHERE id = ?), '2026-10-02 09:00:00', '2026-10-02 09:00:00')`,
			[SEQ_ID],
		);
		await ds.query(
			`INSERT INTO message_templates (id, name, type, scope, message, retreatId, createdAt, updatedAt)
			 VALUES ('e9b3c568-8455-4187-8941-0b17f8911556', 'Segunda', 'SERVER_SHIRT_CONFIRMATION', 'retreat',
			         'dos', (SELECT retreatId FROM message_sequences WHERE id = ?), '2026-10-02 09:00:00', '2026-10-02 09:00:00')`,
			[SEQ_ID],
		);

		await runUp();

		expect(await templateIdOf(LIVE_STEP_ID)).toBe('e9b3c568-8455-4187-8941-0b17f8911555');
	});

	it('down() elimina la columna', async () => {
		await runUp();
		await runDown();

		expect(await hasTemplateIdColumn()).toBe(false);
		// Los datos de los pasos sobreviven al DROP.
		expect(await scalar(`SELECT COUNT(*) AS c FROM sequence_steps WHERE id = ?`, [LIVE_STEP_ID])).toBe(1);
	});
});
