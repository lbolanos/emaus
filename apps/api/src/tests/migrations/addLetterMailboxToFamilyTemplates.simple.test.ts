/**
 * Test de AddLetterMailboxToFamilyTemplates (2026-11-06, specs/letters-email).
 *
 * Migration content-only: actualiza las plantillas de cara a familia
 * (globals + clones por retiro) para informar {participant.letterMailbox}.
 * Verifica: actualiza por TEXTO EXACTO en ambas tablas, respeta plantillas
 * personalizadas (texto distinto queda intacto), es idempotente y down()
 * restaura el texto original. DataSource :memory: con las tablas mínimas.
 */
import { DataSource } from 'typeorm';
import { AddLetterMailboxToFamilyTemplates20261106100000 } from '@/migrations/sqlite/20261106100000_AddLetterMailboxToFamilyTemplates';

const OLD_WELCOME = `{participant.nickname}, qué gusto saber que vienes al retiro 🙏

Ya quedó apartado tu lugar. Estamos preparando todo con cariño para recibirte.

Para que lo tengas a la mano:
📅 {retreat.startDate}
⏰ Llegada: {retreat.walkerArrivalTime}

Te pedimos llegar puntual para que el registro fluya. Ven sin expectativas: el resto lo pone el Señor.

Nos vemos pronto.`;

describe('AddLetterMailboxToFamilyTemplates20261106100000', () => {
	let ds: DataSource;
	let migration: AddLetterMailboxToFamilyTemplates20261106100000;

	const messageOf = async (table: string, type: string): Promise<string | undefined> => {
		const rows = await ds.query(`SELECT "message" FROM "${table}" WHERE "type" = ?`, [type]);
		return rows[0]?.message;
	};

	beforeEach(async () => {
		ds = new DataSource({ type: 'sqlite', database: ':memory:', synchronize: false });
		await ds.initialize();
		// Tablas mínimas: global_message_templates (sin retreatId) y
		// message_templates (con retreatId, clones por retiro).
		await ds.query(`
			CREATE TABLE "global_message_templates" (
				"id" INTEGER PRIMARY KEY AUTOINCREMENT,
				"type" VARCHAR NOT NULL,
				"name" VARCHAR,
				"message" TEXT
			)
		`);
		await ds.query(`
			CREATE TABLE "message_templates" (
				"id" INTEGER PRIMARY KEY AUTOINCREMENT,
				"retreatId" VARCHAR,
				"type" VARCHAR NOT NULL,
				"name" VARCHAR,
				"message" TEXT
			)
		`);
		await ds.query(
			`INSERT INTO "global_message_templates" ("type", "name", "message") VALUES ('WALKER_WELCOME', 'Bienvenida Caminante', ?)`,
			[OLD_WELCOME],
		);
		await ds.query(
			`INSERT INTO "message_templates" ("retreatId", "type", "name", "message") VALUES ('r1', 'WALKER_WELCOME', 'Bienvenida Caminante', ?)`,
			[OLD_WELCOME],
		);
		// Personalizada por la comunidad: el guard NO debe tocarla.
		await ds.query(
			`INSERT INTO "message_templates" ("retreatId", "type", "name", "message") VALUES ('r1', 'PALANCA_REQUEST', 'Solicitud (variante local)', 'Texto personalizado de Buen Despacho')`,
		);
		migration = new AddLetterMailboxToFamilyTemplates20261106100000();
	});

	afterEach(async () => {
		await ds.destroy();
	});

	it('actualiza globals y clones con el buzón en el texto', async () => {
		await migration.up(ds.createQueryRunner());

		for (const table of ['global_message_templates', 'message_templates']) {
			const msg = await messageOf(table, 'WALKER_WELCOME');
			expect(msg).toContain('{participant.letterMailbox}');
			expect(msg).toContain('💌');
			expect(msg).toContain('el resto lo pone el Señor'); // el resto del texto intacto
		}
	});

	it('respeta plantillas personalizadas (texto distinto queda intacto)', async () => {
		await migration.up(ds.createQueryRunner());

		const custom = await messageOf('message_templates', 'PALANCA_REQUEST');
		expect(custom).toBe('Texto personalizado de Buen Despacho');
	});

	it('es idempotente: correrlo dos veces no duplica ni altera', async () => {
		await migration.up(ds.createQueryRunner());
		const afterFirst = await messageOf('global_message_templates', 'WALKER_WELCOME');
		await migration.up(ds.createQueryRunner());
		expect(await messageOf('global_message_templates', 'WALKER_WELCOME')).toBe(afterFirst);
	});

	it('down() restaura el texto original', async () => {
		await migration.up(ds.createQueryRunner());
		await migration.down(ds.createQueryRunner());

		expect(await messageOf('global_message_templates', 'WALKER_WELCOME')).toBe(OLD_WELCOME);
		expect(await messageOf('message_templates', 'WALKER_WELCOME')).toBe(OLD_WELCOME);
		const custom = await messageOf('message_templates', 'PALANCA_REQUEST');
		expect(custom).toBe('Texto personalizado de Buen Despacho');
	});
});
