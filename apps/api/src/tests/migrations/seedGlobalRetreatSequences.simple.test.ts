import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { AppDataSource } from '@/data-source';
import { CrmSequencingSchemaAndSeed20260612130000 } from '@/migrations/sqlite/20260612130000_CrmSequencingSchemaAndSeed';

/**
 * Seed-and-verify del pack de plantillas globales de secuencias. La migración
 * consolidada del feature (`CrmSequencingSchemaAndSeed`) siembra 10 secuencias
 * globales con sus pasos. Como el test-setup usa `synchronize` (las tablas ya
 * existen), ejercemos solo el seed vía `seedGlobalPack`/`removeGlobalPack` en vez
 * del `up()` completo (que además corre ALTER TABLE sobre tablas existentes).
 */
describe('CrmSequencingSchemaAndSeed — pack global de secuencias', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});

	it('siembra las 10 secuencias globales con sus pasos (idempotente)', async () => {
		const migration = new CrmSequencingSchemaAndSeed20260612130000();
		const qr = AppDataSource.createQueryRunner();
		// Limpieza previa por si otra suite dejó datos.
		await qr.query('DELETE FROM global_sequence_steps');
		await qr.query('DELETE FROM global_message_sequences');

		await migration.seedGlobalPack(qr);
		await migration.seedGlobalPack(qr); // re-ejecutar no duplica (INSERT OR IGNORE)

		const seqs = await qr.query(
			'SELECT name, trigger, audience FROM global_message_sequences ORDER BY name',
		);
		expect(seqs).toHaveLength(10);

		const byTrigger = (t: string) => seqs.filter((s: any) => s.trigger === t).length;
		expect(byTrigger('participant_created')).toBe(3); // bienvenida caminante/servidor + palanquero
		expect(byTrigger('days_before_retreat')).toBe(4); // pre-retiro, líderes, pago, familia
		expect(byTrigger('days_after_retreat')).toBe(2); // post-retiro + seguimiento largo
		expect(byTrigger('birthday')).toBe(1);

		// Hay una secuencia dirigida a líderes/colíderes de mesa.
		expect(seqs.some((s: any) => s.audience === 'table_leaders')).toBe(true);

		// La secuencia pre-retiro tiene 5 pasos: palancas a EC1/EC2 + confirmación.
		const preSteps = await qr.query(
			`SELECT st.templateType, st.recipientTarget FROM global_sequence_steps st
			 JOIN global_message_sequences s ON s.id = st.sequenceId
			 WHERE s.name = 'Pre-retiro: palancas y confirmación' ORDER BY st.stepOrder`,
		);
		expect(preSteps).toHaveLength(5);
		expect(preSteps.filter((s: any) => s.recipientTarget === 'emergencyContact1')).toHaveLength(2);
		expect(preSteps.filter((s: any) => s.recipientTarget === 'emergencyContact2')).toHaveLength(2);
		expect(preSteps.some((s: any) => s.templateType === 'WALKER_CONFIRMATION')).toBe(true);

		// Palanquero: 3 pasos a responsabilidad Palanquero 1/2/3.
		const pal = await qr.query(
			`SELECT st.recipientTarget, st.recipientResponsibility FROM global_sequence_steps st
			 JOIN global_message_sequences s ON s.id = st.sequenceId
			 WHERE s.name = 'Aviso al palanquero (nuevo caminante)' ORDER BY st.stepOrder`,
		);
		expect(pal).toHaveLength(3);
		expect(pal.every((p: any) => p.recipientTarget === 'responsibility')).toBe(true);
		expect(pal.map((p: any) => p.recipientResponsibility)).toEqual([
			'Palanquero 1',
			'Palanquero 2',
			'Palanquero 3',
		]);

		// Pago: 2 pasos con condición unpaid/partial.
		const pay = await qr.query(
			`SELECT st.condition FROM global_sequence_steps st
			 JOIN global_message_sequences s ON s.id = st.sequenceId
			 WHERE s.name = 'Recordatorio de pago (saldo pendiente)' ORDER BY st.stepOrder`,
		);
		expect(pay).toHaveLength(2);
		expect(
			pay.map((p: any) => (p.condition?.paymentStatus ?? JSON.parse(p.condition).paymentStatus)),
		).toEqual(['unpaid', 'partial']);

		// Seguimiento largo: 5 pasos (week1 → year1).
		const fu = await qr.query(
			`SELECT COUNT(*) AS c FROM global_sequence_steps st
			 JOIN global_message_sequences s ON s.id = st.sequenceId
			 WHERE s.name = 'Seguimiento del Cuarto Día (largo)'`,
		);
		expect(Number(fu[0].c)).toBe(5);

		// removeGlobalPack limpia lo sembrado.
		await migration.removeGlobalPack(qr);
		const after = await qr.query('SELECT COUNT(*) AS c FROM global_message_sequences');
		expect(Number(after[0].c)).toBe(0);

		await qr.release();
	});
});
