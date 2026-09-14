/**
 * Functional test para FixBuenDespachoPalancasSequence20260913193000.
 *
 * Sembrando la secuencia "Palancas" tal como está en prod (5 pasos, todos
 * "Enviar a: Participante"), verifica:
 *   - up() voltaea todos los pasos de palanca a emergencyContact1.
 *   - up() intercala el paso PALANCA_DEFINITION en stepOrder 2 con
 *     offsetDays 18 y renumera los posteriores (sin huecos ni duplicados).
 *   - La secuencia sigue pausada (isActive no se toca).
 *   - Doble up() no duplica el paso nuevo (idempotente).
 *   - down() restaura participantes, quita el paso y cierra la numeración.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

// El id real de la secuencia de prod — la migración lo tiene hardcodeado.
const SEQ_ID = 'e27b0940-5f99-4921-9de4-ed8a1d53ba03';

describe('FixBuenDespachoPalancasSequence20260913193000', () => {
	let migration: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import(
			'@/migrations/sqlite/20260913193000_FixBuenDespachoPalancasSequence'
		);
		migration = new mod.FixBuenDespachoPalancasSequence20260913193000();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		const ds = TestDataFactory.getDataSource();
		await ds.query(`DELETE FROM sequence_steps`);
		await ds.query(`DELETE FROM message_sequences`);

		const retreat = await TestDataFactory.createTestRetreat();
		await ds.query(
			`INSERT INTO message_sequences (id, name, retreatId, trigger, audience, isActive, createdAt, updatedAt)
			 VALUES (?, 'Palancas', ?, 'days_before_retreat', 'all', 0, datetime('now'), datetime('now'))`,
			[SEQ_ID, retreat.id],
		);

		// Los 5 pasos como están en prod: destinatario participante.
		const steps: Array<[number, number, string]> = [
			[0, 25, 'PALANCA_REQUEST'],
			[1, 24, 'PALANCA_REQUEST'],
			[2, 14, 'PALANCA_REMINDER'],
			[3, 7, 'PALANCA_REMINDER'],
			[4, 3, 'PALANCA_REMINDER'],
		];
		for (const [order, offset, type] of steps) {
			await ds.query(
				`INSERT INTO sequence_steps
					(id, sequenceId, stepOrder, offsetDays, sendHour, templateType, channel, recipientTarget, isArchived, createdAt, updatedAt)
				 VALUES (printf('%08d-0000-4000-8000-000000000000', ?), ?, ?, ?, 9, ?, 'whatsapp', 'participant', 0, datetime('now'), datetime('now'))`,
				[order, SEQ_ID, order, offset, type],
			);
		}
	});

	const runUp = async () => {
		const ds = TestDataFactory.getDataSource();
		const qr = ds.createQueryRunner();
		await migration.up(qr);
		await qr.release();
	};

	const allSteps = async () =>
		(await TestDataFactory.getDataSource().query(
			`SELECT stepOrder, offsetDays, templateType, recipientTarget
			 FROM sequence_steps WHERE sequenceId = ? ORDER BY stepOrder`,
			[SEQ_ID],
		));

	it('voltaea los pasos a emergencyContact1 e intercala la definición', async () => {
		await runUp();

		const steps = await allSteps();
		expect(steps).toHaveLength(6);

		// El paso nuevo: posición 2, 18 días, mismo destinatario.
		expect(steps[2]).toMatchObject({
			stepOrder: 2,
			offsetDays: 18,
			templateType: 'PALANCA_DEFINITION',
			recipientTarget: 'emergencyContact1',
		});

		// Todos los pasos de palanca van al contacto, en orden cronológico
		// descendente de días (25, 24, 18, 14, 7, 3) sin huecos de stepOrder.
		expect(steps.map((s: any) => s.offsetDays)).toEqual([25, 24, 18, 14, 7, 3]);
		expect(steps.map((s: any) => s.stepOrder)).toEqual([0, 1, 2, 3, 4, 5]);
		for (const s of steps) {
			expect(s.recipientTarget).toBe('emergencyContact1');
		}
	});

	it('deja la secuencia pausada (isActive no se toca)', async () => {
		await runUp();
		const rows = await TestDataFactory.getDataSource().query(
			`SELECT isActive FROM message_sequences WHERE id = ?`,
			[SEQ_ID],
		);
		expect(rows[0].isActive).toBe(0);
	});

	it('autocura un intento a medias: renumber aplicado sin INSERT (hueco en stepOrder)', async () => {
		// Estado que deja la versión original de la migración si revienta en
		// el INSERT: el UPDATE stepOrder >= 2 → +1 ya corrió (0,1,3,4,5) pero
		// no hay paso de definición. El up() con renumber canónico re-deriva
		// la numeración completa y elimina el hueco.
		const ds = TestDataFactory.getDataSource();
		await ds.query(
			`UPDATE sequence_steps SET stepOrder = stepOrder + 1 WHERE sequenceId = ? AND stepOrder >= 2`,
			[SEQ_ID],
		);

		await runUp();

		const steps = await allSteps();
		expect(steps).toHaveLength(6);
		expect(steps.map((s: any) => s.offsetDays)).toEqual([25, 24, 18, 14, 7, 3]);
		expect(steps.map((s: any) => s.stepOrder)).toEqual([0, 1, 2, 3, 4, 5]);
	});

	it('doble up() no duplica el paso de definición', async () => {
		await runUp();
		await runUp();

		const steps = await allSteps();
		expect(steps).toHaveLength(6);
		expect(steps.filter((s: any) => s.templateType === 'PALANCA_DEFINITION')).toHaveLength(1);
	});

	it('down() restaura participantes, quita el paso y cierra la numeración', async () => {
		await runUp();
		const ds = TestDataFactory.getDataSource();
		const qr = ds.createQueryRunner();
		await migration.down(qr);
		await qr.release();

		const steps = await allSteps();
		expect(steps).toHaveLength(5);
		expect(steps.map((s: any) => s.templateType).sort()).toEqual(
			['PALANCA_REMINDER', 'PALANCA_REMINDER', 'PALANCA_REMINDER', 'PALANCA_REQUEST', 'PALANCA_REQUEST'].sort(),
		);
		expect(steps.map((s: any) => s.stepOrder)).toEqual([0, 1, 2, 3, 4]);
		for (const s of steps) {
			expect(s.recipientTarget).toBe('participant');
		}
	});
});
