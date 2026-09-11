import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { ServerShirtPricingAndConfirmation20260910120000 } from '@/migrations/sqlite/20260910120000_ServerShirtPricingAndConfirmation';

/**
 * Seed-and-verify de la migración de precio de camisetas + secuencia de
 * confirmación a servidores. La DB de test usa `synchronize` (las entidades
 * ya declaran `retreat_shirt_type.price` y los 2 tipos de plantilla nuevos),
 * así que el `ADD COLUMN` y el recreate del CHECK son no-ops funcionales —
 * lo que importa es que `up()` corra limpio sobre ese esquema y siembre la
 * secuencia + plantillas, y que `down()` revierta.
 */
describe('ServerShirtPricingAndConfirmation — precio de camisetas + secuencia', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
	});

	it('siembra la secuencia de 2 pasos (21/7 días, whatsapp, audiencia server)', async () => {
		const migration = new ServerShirtPricingAndConfirmation20260910120000();
		const qr = AppDataSource.createQueryRunner();

		await migration.up(qr);

		const seqs = await qr.query(
			`SELECT name, trigger, audience, isActive FROM global_message_sequences WHERE name = 'Confirmación de camisetas (servidores)'`,
		);
		expect(seqs).toHaveLength(1);
		expect(seqs[0].trigger).toBe('days_before_retreat');
		expect(seqs[0].audience).toBe('server');
		expect(Number(seqs[0].isActive)).toBe(1);

		const steps = await qr.query(
			`SELECT stepOrder, offsetDays, sendHour, templateType, channel, recipientTarget
			 FROM global_sequence_steps st
			 JOIN global_message_sequences s ON s.id = st.sequenceId
			 WHERE s.name = 'Confirmación de camisetas (servidores)'
			 ORDER BY stepOrder`,
		);
		expect(steps).toHaveLength(2);
		expect(steps[0]).toMatchObject({
			stepOrder: 0,
			offsetDays: 21,
			sendHour: 9,
			templateType: 'SERVER_SHIRT_CONFIRMATION',
			channel: 'whatsapp',
			recipientTarget: 'participant',
		});
		expect(steps[1]).toMatchObject({
			stepOrder: 1,
			offsetDays: 7,
			sendHour: 9,
			templateType: 'SERVER_SHIRT_CONFIRMATION_REMINDER',
			channel: 'whatsapp',
			recipientTarget: 'participant',
		});

		await qr.release();
	});

	it('siembra las 2 plantillas globales con el texto esperado', async () => {
		const migration = new ServerShirtPricingAndConfirmation20260910120000();
		const qr = AppDataSource.createQueryRunner();

		await migration.up(qr);

		const templates = await qr.query(
			`SELECT type, message FROM global_message_templates WHERE type IN ('SERVER_SHIRT_CONFIRMATION', 'SERVER_SHIRT_CONFIRMATION_REMINDER') ORDER BY type`,
		);
		expect(templates).toHaveLength(2);
		const notice = templates.find((t: any) => t.type === 'SERVER_SHIRT_CONFIRMATION');
		const reminder = templates.find((t: any) => t.type === 'SERVER_SHIRT_CONFIRMATION_REMINDER');
		expect(notice.message).toContain('{participant.shirtOrderSummary}');
		expect(notice.message).toContain('{participant.shirtCharge}');
		expect(reminder.message).toContain('{participant.shirtOrderSummary}');
		expect(reminder.message).toContain('{participant.shirtCharge}');

		await qr.release();
	});

	it('copia las plantillas a cada retiro EXISTENTE al momento de correr la migración', async () => {
		const retreatBefore = await TestDataFactory.createTestRetreat({});

		const migration = new ServerShirtPricingAndConfirmation20260910120000();
		const qr = AppDataSource.createQueryRunner();
		await migration.up(qr);

		const perRetreat = await qr.query(
			`SELECT type FROM message_templates WHERE retreatId = ? AND type IN ('SERVER_SHIRT_CONFIRMATION', 'SERVER_SHIRT_CONFIRMATION_REMINDER')`,
			[retreatBefore.id],
		);
		expect(perRetreat).toHaveLength(2);

		await qr.release();
	});

	it('el ALTER TABLE de price es idempotente: PRAGMA table_info sigue reportando la columna tras 2 corridas', async () => {
		const migration = new ServerShirtPricingAndConfirmation20260910120000();
		const qr = AppDataSource.createQueryRunner();

		await migration.up(qr);
		await migration.up(qr); // segunda corrida no debe romper con "duplicate column name"

		const columns: { name: string }[] = await qr.query(`PRAGMA table_info("retreat_shirt_type")`);
		expect(columns.some((c) => c.name === 'price')).toBe(true);

		await qr.release();
	});

	it('re-ejecutar up() no duplica la secuencia ni sus pasos (INSERT OR IGNORE)', async () => {
		const migration = new ServerShirtPricingAndConfirmation20260910120000();
		const qr = AppDataSource.createQueryRunner();

		await migration.up(qr);
		await migration.up(qr);

		const seqs = await qr.query(
			`SELECT COUNT(*) AS c FROM global_message_sequences WHERE name = 'Confirmación de camisetas (servidores)'`,
		);
		expect(Number(seqs[0].c)).toBe(1);

		const steps = await qr.query(
			`SELECT COUNT(*) AS c FROM global_sequence_steps st
			 JOIN global_message_sequences s ON s.id = st.sequenceId
			 WHERE s.name = 'Confirmación de camisetas (servidores)'`,
		);
		expect(Number(steps[0].c)).toBe(2);

		await qr.release();
	});

	it('down() revierte: borra secuencia, pasos y plantillas sembradas (deja las editadas por el coordinador)', async () => {
		const retreat = await TestDataFactory.createTestRetreat({});

		const migration = new ServerShirtPricingAndConfirmation20260910120000();
		const qr = AppDataSource.createQueryRunner();
		await migration.up(qr);

		// El coordinador editó la plantilla per-retiro del aviso: down() no debe
		// tocarla — solo borra las que conservan el texto sembrado exacto.
		await qr.query(
			`UPDATE message_templates SET message = 'Texto editado por el coordinador' WHERE retreatId = ? AND type = 'SERVER_SHIRT_CONFIRMATION'`,
			[retreat.id],
		);

		await migration.down(qr);

		const seqs = await qr.query(
			`SELECT COUNT(*) AS c FROM global_message_sequences WHERE name = 'Confirmación de camisetas (servidores)'`,
		);
		expect(Number(seqs[0].c)).toBe(0);

		const steps = await qr.query(`SELECT COUNT(*) AS c FROM global_sequence_steps`);
		expect(Number(steps[0].c)).toBe(0);

		const globalTemplates = await qr.query(
			`SELECT COUNT(*) AS c FROM global_message_templates WHERE type IN ('SERVER_SHIRT_CONFIRMATION', 'SERVER_SHIRT_CONFIRMATION_REMINDER')`,
		);
		expect(Number(globalTemplates[0].c)).toBe(0);

		// El recordatorio (sin editar) se borró; el aviso editado sobrevive.
		const perRetreat = await qr.query(
			`SELECT type, message FROM message_templates WHERE retreatId = ? AND type IN ('SERVER_SHIRT_CONFIRMATION', 'SERVER_SHIRT_CONFIRMATION_REMINDER')`,
			[retreat.id],
		);
		expect(perRetreat).toHaveLength(1);
		expect(perRetreat[0].type).toBe('SERVER_SHIRT_CONFIRMATION');
		expect(perRetreat[0].message).toBe('Texto editado por el coordinador');

		await qr.release();
	});
});
