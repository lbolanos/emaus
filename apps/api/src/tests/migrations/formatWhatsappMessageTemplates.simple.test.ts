import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { FormatWhatsappMessageTemplates20260914120000 } from '@/migrations/sqlite/20260914120000_FormatWhatsappMessageTemplates';

/**
 * Seed-and-verify for the WhatsApp reformat migration. The interesting nets:
 *
 * 1. No template variable may be lost in the rewrite — every `{scope.var}`
 *    present in the old text must still be present in the new one (a dropped
 *    variable renders literally to real recipients).
 * 2. WhatsApp invariants: no HTML tags, no Markdown that WhatsApp renders
 *    literally (`**`, `##`, `[x](url)`).
 * 3. The local Palanca flow of Buen Despacho is reformatted IN PLACE (never
 *    overwritten with the global text) and only when the row still carries the
 *    captured old text; a drifted row stays untouched.
 * 4. `down()` restores only rows still carrying OUR text — a coordinator edit
 *    made after the migration survives the revert.
 */

// Same fixed ids the migration targets.
const MIGRATION_CLASS = FormatWhatsappMessageTemplates20260914120000 as any;
const BUEN_DESPACHO_ID = 'e9b3c568-050a-4d66-a99d-305f287a59df';

// The entity enum lags behind the production CHECK: these types exist in the
// real global_message_templates but not in `GlobalMessageTemplateType`, so a
// synchronize-built test schema rejects them (message_templates has no CHECK,
// so the retreat rows still cover the full TYPES list).
const ENTITY_MISSING = new Set([
	'TABLE_LEADER_BRIEFING',
	'WALKER_CONFIRMATION',
	'SERVER_CONVOCATION',
	'PALANCA_DEFINITION',
]);

const HTML_OLD = '<p>Hola <strong>{user.name}</strong>,</p><p>legacy email body</p>';

function variablesOf(text: string): Set<string> {
	return new Set(text.match(/\{[a-zA-Z_][\w.]*\}/g) ?? []);
}

/** Restores CHECK validation before the connection goes back to the pool. */
async function release(qr: ReturnType<AppDataSource['createQueryRunner']>): Promise<void> {
	await qr.query('PRAGMA ignore_check_constraints = OFF');
	await qr.release();
}

/** Seeds globals (25 rewritten + 1 email-legacy control) and the retreat rows. */
async function seed(qr: ReturnType<AppDataSource['createQueryRunner']>): Promise<void> {
	// The REAL message_templates table has no CHECK on `type`, but the
	// synchronize-built test schema derives one from the shared zod enum,
	// which predates Buen Despacho's legacy PALANCA_DEFINITION row. Relax
	// CHECK validation on this connection so the legacy row can be seeded
	// and later updated by up()/down().
	await qr.query('PRAGMA ignore_check_constraints = ON');
	const types: string[] = MIGRATION_CLASS.TYPES;
	// `name` is UNIQUE and the test DB arrives with globals of its own
	// (clearTestData does not wipe them) — make the seed idempotent.
	const ph = Array(types.length + 1).fill('?').join(',');
	await qr.query(`DELETE FROM "global_message_templates" WHERE "type" IN (${ph})`, [
		...types,
		'PASSWORD_RESET',
	]);
	await qr.query(`DELETE FROM "message_templates" WHERE "retreatId" = ?`, [BUEN_DESPACHO_ID]);
	const globalTypes = types.filter((t: string) => !ENTITY_MISSING.has(t));
	for (const type of globalTypes) {
		await qr.query(
			`INSERT INTO "global_message_templates" ("id", "name", "type", "message", "isActive", "createdAt", "updatedAt")
			 VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
			[crypto.randomUUID(), `Plantilla ${type}`, type, MIGRATION_CLASS.OLD_TEXTS[type]],
		);
	}
	// Email-legacy control: HTML is correct for the email channel, must survive.
	await qr.query(
		`INSERT INTO "global_message_templates" ("id", "name", "type", "message", "isActive", "createdAt", "updatedAt")
		 VALUES (?, 'Legacy email', 'PASSWORD_RESET', ?, 1, datetime('now'), datetime('now'))`,
		[crypto.randomUUID(), HTML_OLD],
	);

	// The retreat the migration targets (factory handles the NOT NULLs and the
	// house FK; the id is then flipped to the stable id the migration hardcodes).
	const retreat = await TestDataFactory.createTestRetreat({});
	await qr.query(`UPDATE "retreat" SET "id" = ? WHERE "id" = ?`, [BUEN_DESPACHO_ID, retreat.id]);

	for (const type of types) {
		if (MIGRATION_CLASS.RETREAT_EXCLUDED.has(type)) continue;
		await qr.query(
			`INSERT INTO "message_templates" ("id", "name", "type", "scope", "message", "retreatId", "createdAt", "updatedAt")
			 VALUES (?, ?, ?, 'retreat', ?, ?, datetime('now'), datetime('now'))`,
			[crypto.randomUUID(), `Retreat ${type}`, type, MIGRATION_CLASS.OLD_TEXTS[type], BUEN_DESPACHO_ID],
		);
	}
	// The coordinator's local Palanca flow (REQUEST + REMINDER + DEFINITION, rowid order).
	const localTypes: string[] = MIGRATION_CLASS.LOCAL_TYPES;
	for (let i = 0; i < localTypes.length; i++) {
		await qr.query(
			`INSERT INTO "message_templates" ("id", "name", "type", "scope", "message", "retreatId", "createdAt", "updatedAt")
			 VALUES (?, ?, ?, 'retreat', ?, ?, datetime('now'), datetime('now'))`,
			[crypto.randomUUID(), `Local ${localTypes[i]} ${i}`, localTypes[i], MIGRATION_CLASS.OLD_LOCAL_TEXTS[i], BUEN_DESPACHO_ID],
		);
	}
}

describe('FormatWhatsappMessageTemplates — WhatsApp reformat + apply to Buen Despacho', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
	});

	it('rewrites the 25 globals and leaves the email-legacy HTML alone', async () => {
		const qr = AppDataSource.createQueryRunner();
		await seed(qr);

		const migration = new FormatWhatsappMessageTemplates20260914120000();
		await migration.up(qr);

		for (const type of MIGRATION_CLASS.TYPES) {
			if (ENTITY_MISSING.has(type)) continue;
			const rows = await qr.query(`SELECT "message" FROM "global_message_templates" WHERE "type" = ?`, [type]);
			expect(rows).toHaveLength(1);
			expect(rows[0].message).toBe(MIGRATION_CLASS.NEW_TEXTS[type]);
		}

		const legacy = await qr.query(`SELECT "message" FROM "global_message_templates" WHERE "type" = 'PASSWORD_RESET'`);
		expect(legacy[0].message).toBe(HTML_OLD);

		await release(qr);
	});

	it('loses no template variable: every {scope.var} of the old text survives the rewrite', async () => {
		for (const type of MIGRATION_CLASS.TYPES) {
			const oldVars = variablesOf(MIGRATION_CLASS.OLD_TEXTS[type]);
			const newText: string = MIGRATION_CLASS.NEW_TEXTS[type];
			for (const v of oldVars) {
				expect(newText.includes(v)).toBe(true);
			}
		}
		const localTypes: string[] = MIGRATION_CLASS.LOCAL_TYPES;
		for (let i = 0; i < localTypes.length; i++) {
			for (const v of variablesOf(MIGRATION_CLASS.OLD_LOCAL_TEXTS[i])) {
				expect((MIGRATION_CLASS.NEW_LOCAL_TEXTS[i] as string).includes(v)).toBe(true);
			}
		}
	});

	it('new texts satisfy the WhatsApp invariants (no HTML, no Markdown-only marks)', async () => {
		const allTexts: string[] = MIGRATION_CLASS.TYPES.map((t: string) => MIGRATION_CLASS.NEW_TEXTS[t]);
		allTexts.push(...MIGRATION_CLASS.NEW_LOCAL_TEXTS);
		for (const text of allTexts) {
			expect(text).not.toMatch(/<\/?(p|ul|ol|li|strong|em|h[1-6]|br|a)\b/i);
			expect(text).not.toContain('**');
			expect(text).not.toContain('##');
			expect(text).not.toContain('](');
		}
	});

	it('carries the first-time-server garment requirement in BOTH shirt templates', async () => {
		expect(MIGRATION_CLASS.NEW_TEXTS.SERVER_SHIRT_CONFIRMATION).toContain('primera vez que sirves');
		expect(MIGRATION_CLASS.NEW_TEXTS.SERVER_SHIRT_CONFIRMATION_REMINDER).toContain('primera vez que sirves');
	});

	it('applies the globals to the retreat but reformats the local Palanca flow in place', async () => {
		const qr = AppDataSource.createQueryRunner();
		await seed(qr);

		const migration = new FormatWhatsappMessageTemplates20260914120000();
		await migration.up(qr);

		for (const type of MIGRATION_CLASS.TYPES) {
			if (MIGRATION_CLASS.RETREAT_EXCLUDED.has(type)) continue;
			const rows = await qr.query(
				`SELECT "message" FROM "message_templates" WHERE "retreatId" = ? AND "type" = ?`,
				[BUEN_DESPACHO_ID, type],
			);
			expect(rows).toHaveLength(1);
			expect(rows[0].message).toBe(MIGRATION_CLASS.NEW_TEXTS[type]);
		}

		// The 3 local rows now carry the reformatted LOCAL texts — not the global ones.
		const palancaRows = await qr.query(
			`SELECT "message" FROM "message_templates" WHERE "retreatId" = ? AND "type" IN ('PALANCA_REQUEST', 'PALANCA_REMINDER', 'PALANCA_DEFINITION') ORDER BY rowid`,
			[BUEN_DESPACHO_ID],
		);
		expect(palancaRows.map((r: any) => r.message)).toEqual([
			...MIGRATION_CLASS.NEW_LOCAL_TEXTS,
		]);
		for (const row of palancaRows) {
			expect(row.message === MIGRATION_CLASS.NEW_TEXTS.PALANCA_REQUEST).toBe(false);
			expect(row.message === MIGRATION_CLASS.NEW_TEXTS.PALANCA_REMINDER).toBe(false);
		}
		// The palancas inbox email of the local flow survives the reformat.
		expect(palancaRows[2].message).toContain('emaus.palancas.mex@gmail.com');

		await release(qr);
	});

	it('a drifted local Palanca row (edited in prod) is left untouched by up()', async () => {
		const qr = AppDataSource.createQueryRunner();
		await seed(qr);
		// Simulate prod drift: the REQUEST row no longer matches the captured text.
		await qr.query(
			`UPDATE "message_templates" SET "message" = 'versión local distinta' WHERE "retreatId" = ? AND "type" = 'PALANCA_REQUEST'`,
			[BUEN_DESPACHO_ID],
		);

		const migration = new FormatWhatsappMessageTemplates20260914120000();
		await migration.up(qr);

		const drifted = await qr.query(
			`SELECT "message" FROM "message_templates" WHERE "retreatId" = ? AND "type" = 'PALANCA_REQUEST'`,
			[BUEN_DESPACHO_ID],
		);
		expect(drifted[0].message).toBe('versión local distinta');
		// The other two local rows (REMINDER + DEFINITION) still get reformatted.
		const def = await qr.query(
			`SELECT "message" FROM "message_templates" WHERE "retreatId" = ? AND "type" = 'PALANCA_DEFINITION'`,
			[BUEN_DESPACHO_ID],
		);
		expect(def[0].message).toBe(MIGRATION_CLASS.NEW_LOCAL_TEXTS[2]);

		await release(qr);
	});

	it('down() restores the old texts but keeps a coordinator edit made after up()', async () => {
		const qr = AppDataSource.createQueryRunner();
		await seed(qr);

		const migration = new FormatWhatsappMessageTemplates20260914120000();
		await migration.up(qr);
		// The coordinator personalized one template after the migration ran.
		await qr.query(
			`UPDATE "message_templates" SET "message" = 'Texto editado por el coordinador' WHERE "retreatId" = ? AND "type" = 'SERVER_CONVOCATION'`,
			[BUEN_DESPACHO_ID],
		);

		await migration.down(qr);

		for (const type of MIGRATION_CLASS.TYPES) {
			if (ENTITY_MISSING.has(type)) continue;
			const g = await qr.query(`SELECT "message" FROM "global_message_templates" WHERE "type" = ?`, [type]);
			expect(g[0].message).toBe(MIGRATION_CLASS.OLD_TEXTS[type]);
		}
		const edited = await qr.query(
			`SELECT "message" FROM "message_templates" WHERE "retreatId" = ? AND "type" = 'SERVER_CONVOCATION'`,
			[BUEN_DESPACHO_ID],
		);
		expect(edited[0].message).toBe('Texto editado por el coordinador');

		const other = await qr.query(
			`SELECT "message" FROM "message_templates" WHERE "retreatId" = ? AND "type" = 'WALKER_WELCOME'`,
			[BUEN_DESPACHO_ID],
		);
		expect(other[0].message).toBe(MIGRATION_CLASS.OLD_TEXTS.WALKER_WELCOME);

		const palancaRows = await qr.query(
			`SELECT "message" FROM "message_templates" WHERE "retreatId" = ? AND "type" IN ('PALANCA_REQUEST', 'PALANCA_REMINDER', 'PALANCA_DEFINITION') ORDER BY rowid`,
			[BUEN_DESPACHO_ID],
		);
		expect(palancaRows.map((r: any) => r.message)).toEqual([...MIGRATION_CLASS.OLD_LOCAL_TEXTS]);

		await release(qr);
	});
});
