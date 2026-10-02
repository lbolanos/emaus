/**
 * Functional test para FixBuenDespachoShirtConfirmationSequence20261001120000.
 *
 * Sembrando la secuencia "Ultimo Prendas" tal como está en prod (activa, paso
 * a offsetDays 20 —fecha pasada—, plantilla vieja y nueva del mismo tipo, y
 * la bandeja llena de queued vencidos más el sent despachado a mano),
 * verifica:
 *   - up() purga SOLO las queued de esa secuencia (el sent sobrevive, y las
 *     queued de OTRA secuencia del mismo retiro no se tocan).
 *   - up() borra la plantilla vieja y deja la nueva como única del tipo.
 *   - up() pausa la secuencia y corrige offsetDays 20 → 5.
 *   - Doble up() converge al mismo estado (idempotente).
 *   - El UPDATE de offsetDays está condicionado al valor viejo: un ajuste
 *     manual posterior no se pisa.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

// IDs reales de prod — la migración los tiene hardcodeados.
const SEQ_ID = 'a41ad6fb-5e64-42d7-9b5f-7c5004c9c0b2';
const OLD_TEMPLATE_ID = '74d8e87b-8455-4187-8941-0b17f8911545';
const NEW_TEMPLATE_ID = '62fec9ab-e77c-4c6d-bc1b-61bb28c1e1de';
const STEP_ID = '734196da-f22d-4fb3-a3f0-72bbf812dbee';

// Segunda secuencia del mismo retiro: sus queued NO entran a la purga.
const OTHER_SEQ_ID = 'b41ad6fb-5e64-42d7-9b5f-7c5004c9c0b3';
const OTHER_STEP_ID = '834196da-f22d-4fb3-a3f0-72bbf812dbee';

// Ids deterministas con formato uuid para las filas de scheduled_messages.
let rowSeq = 0;
const rowId = () => `${String(++rowSeq).padStart(8, '0')}-0000-4000-8000-000000000000`;

describe('FixBuenDespachoShirtConfirmationSequence20261001120000', () => {
	let migration: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import(
			'@/migrations/sqlite/20261001120000_FixBuenDespachoShirtConfirmationSequence'
		);
		migration = new mod.FixBuenDespachoShirtConfirmationSequence20261001120000();
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

		// Secuencia ACTIVA (el bug: activa con paso en el pasado).
		await ds.query(
			`INSERT INTO message_sequences (id, name, retreatId, trigger, audience, isActive, createdAt, updatedAt)
			 VALUES (?, 'Ultimo Prendas', ?, 'days_before_retreat', 'responsables', 1, datetime('now'), datetime('now'))`,
			[SEQ_ID, retreat.id],
		);
		await ds.query(
			`INSERT INTO sequence_steps
				(id, sequenceId, stepOrder, offsetDays, sendHour, templateType, channel, recipientTarget, isArchived, createdAt, updatedAt)
			 VALUES (?, ?, 0, 20, 9, 'SERVER_SHIRT_CONFIRMATION', 'whatsapp', 'participant', 0, datetime('now'), datetime('now'))`,
			[STEP_ID, SEQ_ID],
		);

		// Las dos plantillas del mismo tipo: la VIEJA (13-sep, primero en la
		// tabla → la que el motor resolvía) y la NUEVA (1-oct).
		await ds.query(
			`INSERT INTO message_templates (id, name, type, scope, message, retreatId, createdAt, updatedAt)
			 VALUES (?, 'Confirmación de prendas', 'SERVER_SHIRT_CONFIRMATION', 'retreat',
			         'Hola {nombre}, {custom_message}', ?, '2026-09-13 10:00:00', '2026-09-13 10:00:00')`,
			[OLD_TEMPLATE_ID, retreat.id],
		);
		await ds.query(
			`INSERT INTO message_templates (id, name, type, scope, message, retreatId, createdAt, updatedAt)
			 VALUES (?, 'Reconfirmar Prendas', 'SERVER_SHIRT_CONFIRMATION', 'retreat',
			         'Hola {nombre}, confirma tu camiseta', ?, '2026-10-01 09:00:00', '2026-10-01 09:00:00')`,
			[NEW_TEMPLATE_ID, retreat.id],
		);
		// Una plantilla de otro tipo del mismo retiro: no entra al DELETE.
		await ds.query(
			`INSERT INTO message_templates (id, name, type, scope, message, retreatId, createdAt, updatedAt)
			 VALUES ('74d8e87b-8455-4187-8941-0b17f8911599', 'General BD', 'GENERAL', 'retreat',
			         'Texto general', ?, datetime('now'), datetime('now'))`,
			[retreat.id],
		);

		// Segunda secuencia con su propia queued: invariante de alcance.
		await ds.query(
			`INSERT INTO message_sequences (id, name, retreatId, trigger, audience, isActive, createdAt, updatedAt)
			 VALUES (?, 'Otra secuencia', ?, 'days_before_retreat', 'all', 1, datetime('now'), datetime('now'))`,
			[OTHER_SEQ_ID, retreat.id],
		);
		await ds.query(
			`INSERT INTO sequence_steps
				(id, sequenceId, stepOrder, offsetDays, sendHour, templateType, channel, recipientTarget, isArchived, createdAt, updatedAt)
			 VALUES (?, ?, 0, 10, 9, 'GENERAL', 'whatsapp', 'participant', 0, datetime('now'), datetime('now'))`,
			[OTHER_STEP_ID, OTHER_SEQ_ID],
		);

		// Participantes reales (la DB de test enforcea FKs). En prod eran 28
		// queued + 1 sent; acá 3 queued bastan — la purga es por (sequenceId,
		// status), no por conteo.
		const queuedParticipants = [
			await TestDataFactory.createTestParticipant(retreat.id),
			await TestDataFactory.createTestParticipant(retreat.id),
			await TestDataFactory.createTestParticipant(retreat.id),
		];
		for (const p of queuedParticipants) {
			await ds.query(
				`INSERT INTO scheduled_messages
					(id, sequenceId, stepId, participantId, retreatId, occurrenceYear, channel, templateType,
					 recipientTarget, scheduledFor, status, attempts, createdAt, updatedAt)
				 VALUES (?, ?, ?, ?, ?, 0,
				         'whatsapp', 'SERVER_SHIRT_CONFIRMATION', 'participant',
				         '2026-09-26 09:00:00', 'queued', 0, datetime('now'), datetime('now'))`,
				[rowId(), SEQ_ID, STEP_ID, p.id, retreat.id],
			);
		}

		// El sent despachado a mano (Marco): queda, decisión cerrada.
		const sentParticipant = await TestDataFactory.createTestParticipant(retreat.id);
		await ds.query(
			`INSERT INTO scheduled_messages
				(id, sequenceId, stepId, participantId, retreatId, occurrenceYear, channel, templateType,
				 recipientTarget, scheduledFor, status, sentAt, dispatchedBy, attempts, createdAt, updatedAt)
			 VALUES (?, ?, ?, ?, ?, 0,
			         'whatsapp', 'SERVER_SHIRT_CONFIRMATION', 'participant',
			         '2026-09-26 09:00:00', 'sent', '2026-10-01 12:00:00',
			         '2e04e70a-b2bb-4824-a118-9005d77f9ff2', 0, datetime('now'), datetime('now'))`,
			[rowId(), SEQ_ID, STEP_ID, sentParticipant.id, retreat.id],
		);

		// Queued de la otra secuencia: sobrevive.
		const otherParticipant = await TestDataFactory.createTestParticipant(retreat.id);
		await ds.query(
			`INSERT INTO scheduled_messages
				(id, sequenceId, stepId, participantId, retreatId, occurrenceYear, channel, templateType,
				 recipientTarget, scheduledFor, status, attempts, createdAt, updatedAt)
			 VALUES (?, ?, ?, ?, ?, 0,
			         'whatsapp', 'GENERAL', 'participant',
			         '2026-09-26 09:00:00', 'queued', 0, datetime('now'), datetime('now'))`,
			[rowId(), OTHER_SEQ_ID, OTHER_STEP_ID, otherParticipant.id, retreat.id],
		);
	});

	const runUp = async () => {
		const ds = TestDataFactory.getDataSource();
		const qr = ds.createQueryRunner();
		await migration.up(qr);
		await qr.release();
	};

	const scalar = async (sql: string, params: unknown[]) =>
		(await TestDataFactory.getDataSource().query(sql, params))[0].c;

	it('purga solo las queued de la secuencia; el sent y otras secuencias quedan', async () => {
		await runUp();

		expect(await scalar(`SELECT COUNT(*) AS c FROM scheduled_messages WHERE sequenceId = ? AND status = 'queued'`, [SEQ_ID])).toBe(0);
		expect(await scalar(`SELECT COUNT(*) AS c FROM scheduled_messages WHERE sequenceId = ? AND status = 'sent'`, [SEQ_ID])).toBe(1);
		expect(
			await scalar(`SELECT COUNT(*) AS c FROM scheduled_messages WHERE sequenceId = ? AND status = 'queued'`, [OTHER_SEQ_ID]),
		).toBe(1);
	});

	it('borra la plantilla vieja y deja la nueva como única del tipo', async () => {
		await runUp();

		expect(await scalar(`SELECT COUNT(*) AS c FROM message_templates WHERE id = ?`, [OLD_TEMPLATE_ID])).toBe(0);
		expect(await scalar(`SELECT COUNT(*) AS c FROM message_templates WHERE id = ?`, [NEW_TEMPLATE_ID])).toBe(1);
		// Única del tipo en el retiro, y la de otro tipo sobrevive.
		expect(
			await scalar(
				`SELECT COUNT(*) AS c FROM message_templates WHERE type = 'SERVER_SHIRT_CONFIRMATION'`,
			),
		).toBe(1);
		expect(await scalar(`SELECT COUNT(*) AS c FROM message_templates WHERE type = 'GENERAL'`)).toBe(1);
	});

	it('pausa la secuencia y corrige offsetDays 20 → 5', async () => {
		await runUp();

		const rows = await TestDataFactory.getDataSource().query(
			`SELECT ms.isActive, ss.offsetDays
			 FROM message_sequences ms JOIN sequence_steps ss ON ss.sequenceId = ms.id
			 WHERE ms.id = ?`,
			[SEQ_ID],
		);
		expect(rows[0].isActive).toBe(0);
		expect(rows[0].offsetDays).toBe(5);
	});

	it('doble up() converge al mismo estado (idempotente)', async () => {
		await runUp();
		await runUp();

		expect(await scalar(`SELECT COUNT(*) AS c FROM scheduled_messages WHERE sequenceId = ?`, [SEQ_ID])).toBe(1);
		expect(await scalar(`SELECT COUNT(*) AS c FROM message_templates`)).toBe(2);
		const rows = await TestDataFactory.getDataSource().query(
			`SELECT ms.isActive, ss.offsetDays
			 FROM message_sequences ms JOIN sequence_steps ss ON ss.sequenceId = ms.id
			 WHERE ms.id = ?`,
			[SEQ_ID],
		);
		expect(rows[0].isActive).toBe(0);
		expect(rows[0].offsetDays).toBe(5);
	});

	it('no pisa un offsetDays ajustado a mano tras la cirugía', async () => {
		// Re-ejecución con el paso ya corregido a otro valor (p.ej. Leonardo
		// lo movió a 3 días): el UPDATE condicionado a offsetDays = 20 no toca.
		await runUp();
		const ds = TestDataFactory.getDataSource();
		await ds.query(`UPDATE sequence_steps SET offsetDays = 3 WHERE id = ?`, [STEP_ID]);
		await runUp();

		const rows = await ds.query(`SELECT offsetDays FROM sequence_steps WHERE id = ?`, [STEP_ID]);
		expect(rows[0].offsetDays).toBe(3);
	});
});
