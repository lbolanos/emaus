import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Shirt pricing for the server team + a confirmation sequence.
 *
 * 1. `retreat_shirt_type.price` — each garment type of a retreat can carry a
 *    price. The charge is COMPUTED from the participant's `participant_shirt_size`
 *    rows (never a manual `participant_debts` row), so changing a size recalculates
 *    the balance on its own. NULL/0 means "no charge", which keeps every existing
 *    retreat's balances untouched until a coordinator sets prices.
 *
 * 2. The "Confirmación de camisetas (servidores)" sequence, as an assisted
 *    WhatsApp flow: first notice 21 days before the retreat, reminder 7 days
 *    before. Both steps ride the existing drip engine with the `server` audience
 *    (server + partial_server) and land in the coordinator's WhatsApp queue —
 *    nothing is ever sent unattended, the channel decision documented in
 *    `docs/features/crm-messaging.md`.
 *
 *    The message renders the server's current garment setup through two new
 *    participant variables: `{participant.shirtOrderSummary}` (one line per
 *    requested garment, or "Aún no has configurado tus tallas" when empty) and
 *    `{participant.shirtCharge}` (formatted total).
 *
 * Seeds the templates (global + per retreat, so the step finds them) and the
 * importable global sequence. The imported copy arrives INACTIVE, like the rest
 * of the pack.
 *
 * `transaction = false` because the `global_message_templates.type` CHECK
 * recreate needs `PRAGMA foreign_keys = OFF` outside a transaction (skill
 * `sqlite-migrations`). That table has no incoming FKs and no indexes beyond
 * the PK, so the recreate is safe.
 */
export class ServerShirtPricingAndConfirmation20260910120000 implements MigrationInterface {
	name = 'ServerShirtPricingAndConfirmation20260910120000';
	timestamp = '20260910120000';

	// The project's own runner respects this property (`shouldUseTransaction`
	// in `database/transaction-policy.ts`): without it the API boot wraps the
	// migration in a transaction and SQLite silently ignores the
	// `PRAGMA foreign_keys = OFF` below, so the DROP TABLE would cascade.
	transaction = false as const;

	/** Stable IDs so the seed is idempotent and down() knows what to delete. */
	private readonly SEQ_ID = 'c0b00000-0000-4000-a000-000000000001';
	private readonly STEP_NOTICE_ID = 'c0b00000-0000-4000-a000-000000000002';
	private readonly STEP_REMINDER_ID = 'c0b00000-0000-4000-a000-000000000003';

	private static readonly NOTICE_TEMPLATE_NAME = 'Confirmación de prendas';
	private static readonly NOTICE_TEMPLATE_MESSAGE = `Hola {participant.firstName}, ya vamos a pedir las prendas del equipo para el retiro de {retreat.parish} ({retreat.startDate}).

Lo que tenemos registrado para ti:

{participant.shirtOrderSummary}

El valor de tus prendas se suma a tu cuenta: {participant.shirtCharge}.

Si todo está bien, respóndeme confirmándome. Si falta algo o hay que cambiar una talla, dime y lo corregimos.`;

	private static readonly REMINDER_TEMPLATE_NAME = 'Recordatorio de prendas';
	private static readonly REMINDER_TEMPLATE_MESSAGE = `Hola {participant.firstName}, un recordatorio: falta confirmar tus prendas para el retiro de {retreat.parish} del {retreat.startDate}.

{participant.shirtOrderSummary}

Total: {participant.shirtCharge}.

¿Me confirmas que está correcto o qué hay que cambiar?`;

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Idempotent on purpose. Declaring `transaction = false` gives up the
		// automatic rollback: if `up()` fails further down, this ADD COLUMN is
		// already committed, the migration stays unregistered and the next boot
		// re-runs it from the top. Without the guard it would die with
		// "duplicate column name" and get stuck forever.
		const columns: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("retreat_shirt_type")`,
		);
		if (!columns.some((c) => c.name === 'price')) {
			await queryRunner.query(
				`ALTER TABLE "retreat_shirt_type" ADD COLUMN "price" decimal(10,2)`,
			);
		}

		// The `global_message_templates.type` CHECK is a fixed list that does not
		// include the two new types, so without extending it the INSERTs below
		// fail with SQLITE_CONSTRAINT_CHECK. And the GLOBAL row is needed, not
		// just the per-retreat ones: `retreatService.createRetreat` calls
		// `copyAllActiveTemplatesToRetreat`, so a retreat created AFTER this
		// migration would miss the template and the sequence step would be
		// skipped with "sin plantilla" — the same silent failure the closing
		// invitation already had.
		//
		// SQLite cannot ALTER a CHECK, so it takes a recreate. Safe here: the
		// table has NO incoming FKs (verified against sqlite_master) and no
		// indexes beyond the PK — that is the scenario that destroyed data in
		// the 2026-05-07 incident. The CHECK is kept rather than dropped: it is
		// still a useful net, it was just short.
		await this.recreateGlobalTemplateTypeCheck(queryRunner, true);

		// Global templates (they show up in the global template selector).
		await this.insertGlobalTemplate(queryRunner, 'SERVER_SHIRT_CONFIRMATION', ServerShirtPricingAndConfirmation20260910120000.NOTICE_TEMPLATE_NAME, ServerShirtPricingAndConfirmation20260910120000.NOTICE_TEMPLATE_MESSAGE);
		await this.insertGlobalTemplate(queryRunner, 'SERVER_SHIRT_CONFIRMATION_REMINDER', ServerShirtPricingAndConfirmation20260910120000.REMINDER_TEMPLATE_NAME, ServerShirtPricingAndConfirmation20260910120000.REMINDER_TEMPLATE_MESSAGE);

		// And per retreat: the sequence step resolves `templateType` against the
		// retreat's OWN templates when processing. Without this copy the message
		// would be skipped with "sin plantilla".
		const retreats: { id: string }[] = await queryRunner.query(`SELECT id FROM "retreat"`);
		for (const retreat of retreats) {
			await this.insertRetreatTemplate(queryRunner, retreat.id, 'SERVER_SHIRT_CONFIRMATION', ServerShirtPricingAndConfirmation20260910120000.NOTICE_TEMPLATE_NAME, ServerShirtPricingAndConfirmation20260910120000.NOTICE_TEMPLATE_MESSAGE);
			await this.insertRetreatTemplate(queryRunner, retreat.id, 'SERVER_SHIRT_CONFIRMATION_REMINDER', ServerShirtPricingAndConfirmation20260910120000.REMINDER_TEMPLATE_NAME, ServerShirtPricingAndConfirmation20260910120000.REMINDER_TEMPLATE_MESSAGE);
		}

		// Importable global sequence. `days_before_retreat`: notice 21 days out
		// (right after the convocation window closes and servers have registered
		// their sizes), reminder 7 days out — same cadence as the palanca flow.
		// No `maxOverdueDays`: a retreat closer than 21 days still gets the notice
		// as a legitimate catch-up instead of a skipped "too overdue" step.
		await queryRunner.query(
			`INSERT OR IGNORE INTO "global_message_sequences"
				("id", "name", "description", "trigger", "audience", "isActive")
			 VALUES (?, ?, ?, 'days_before_retreat', 'server', 1)`,
			[
				this.SEQ_ID,
				'Confirmación de camisetas (servidores)',
				'Pide a cada servidor confirmar sus prendas y tallas 21 días antes del retiro, con recordatorio a 7 días. El mensaje incluye su configuración actual y el valor a su cargo. Cada mensaje se despacha a mano desde la bandeja de WhatsApp.',
			],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO "global_sequence_steps"
				("id", "sequenceId", "stepOrder", "offsetDays", "sendHour", "templateType", "channel", "recipientTarget", "recipientResponsibility", "condition")
			 VALUES (?, ?, 0, 21, 9, 'SERVER_SHIRT_CONFIRMATION', 'whatsapp', 'participant', NULL, NULL)`,
			[this.STEP_NOTICE_ID, this.SEQ_ID],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO "global_sequence_steps"
				("id", "sequenceId", "stepOrder", "offsetDays", "sendHour", "templateType", "channel", "recipientTarget", "recipientResponsibility", "condition")
			 VALUES (?, ?, 1, 7, 9, 'SERVER_SHIRT_CONFIRMATION_REMINDER', 'whatsapp', 'participant', NULL, NULL)`,
			[this.STEP_REMINDER_ID, this.SEQ_ID],
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DELETE FROM "global_sequence_steps" WHERE "id" IN (?, ?)`, [
			this.STEP_NOTICE_ID,
			this.STEP_REMINDER_ID,
		]);
		await queryRunner.query(`DELETE FROM "global_message_sequences" WHERE "id" = ?`, [
			this.SEQ_ID,
		]);
		// Only the templates carrying the seeded text: if the coordinator edited
		// one, it is theirs and stays.
		await queryRunner.query(
			`DELETE FROM "message_templates" WHERE "type" IN ('SERVER_SHIRT_CONFIRMATION', 'SERVER_SHIRT_CONFIRMATION_REMINDER') AND "message" IN (?, ?)`,
			[
				ServerShirtPricingAndConfirmation20260910120000.NOTICE_TEMPLATE_MESSAGE,
				ServerShirtPricingAndConfirmation20260910120000.REMINDER_TEMPLATE_MESSAGE,
			],
		);
		// Any row with the new types must go BEFORE restoring the narrow CHECK,
		// or the recreate's INSERT would reject it.
		await queryRunner.query(
			`DELETE FROM "global_message_templates" WHERE "type" IN ('SERVER_SHIRT_CONFIRMATION', 'SERVER_SHIRT_CONFIRMATION_REMINDER')`,
		);
		await this.recreateGlobalTemplateTypeCheck(queryRunner, false);
		const columns: { name: string }[] = await queryRunner.query(
			`PRAGMA table_info("retreat_shirt_type")`,
		);
		if (columns.some((c) => c.name === 'price')) {
			await queryRunner.query(`ALTER TABLE "retreat_shirt_type" DROP COLUMN "price"`);
		}
	}

	private async insertGlobalTemplate(
		queryRunner: QueryRunner,
		type: string,
		name: string,
		message: string,
	): Promise<void> {
		const existing = await queryRunner.query(
			`SELECT id FROM "global_message_templates" WHERE "type" = ?`,
			[type],
		);
		if (existing.length > 0) return;
		await queryRunner.query(
			`INSERT INTO "global_message_templates" ("id", "name", "type", "message", "isActive", "createdAt", "updatedAt")
			 VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
			[uuidv4(), name, type, message],
		);
	}

	private async insertRetreatTemplate(
		queryRunner: QueryRunner,
		retreatId: string,
		type: string,
		name: string,
		message: string,
	): Promise<void> {
		const existing = await queryRunner.query(
			`SELECT id FROM "message_templates" WHERE "retreatId" = ? AND "type" = ?`,
			[retreatId, type],
		);
		if (existing.length > 0) return;
		await queryRunner.query(
			`INSERT INTO "message_templates" ("id", "name", "type", "scope", "message", "retreatId", "createdAt", "updatedAt")
			 VALUES (?, ?, ?, 'retreat', ?, ?, datetime('now'), datetime('now'))`,
			[uuidv4(), name, type, message, retreatId],
		);
	}

	/**
	 * Recreates `global_message_templates` so its `type` CHECK includes (or
	 * drops) the shirt confirmation types. Recreate-table pattern from the
	 * `sqlite-migrations` skill: PRAGMA OFF outside a transaction, explicit
	 * columns (never `SELECT *`), and an integrity check at the end.
	 */
	private async recreateGlobalTemplateTypeCheck(
		queryRunner: QueryRunner,
		withShirtConfirmation: boolean,
	): Promise<void> {
		const types = [
			'WALKER_WELCOME', 'SERVER_WELCOME', 'EMERGENCY_CONTACT_VALIDATION',
			'PALANCA_REQUEST', 'PALANCA_REMINDER', 'GENERAL',
			'PRE_RETREAT_REMINDER', 'PAYMENT_REMINDER', 'POST_RETREAT_MESSAGE',
			'CANCELLATION_CONFIRMATION', 'USER_INVITATION', 'PASSWORD_RESET',
			'RETREAT_SHARED_NOTIFICATION', 'BIRTHDAY_MESSAGE', 'PALANQUERO_NEW_WALKER',
			'PRIVACY_DATA_DELETE',
			'WALKER_FOLLOWUP_WEEK_1', 'WALKER_FOLLOWUP_MONTH_1', 'WALKER_FOLLOWUP_MONTH_3',
			'WALKER_FOLLOWUP_MONTH_6', 'WALKER_FOLLOWUP_YEAR_1', 'WALKER_REUNION_INVITATION',
			'TABLE_LEADER_BRIEFING', 'WALKER_CONFIRMATION',
			'FAMILY_CLOSING_INVITATION_WHATSAPP', 'FAMILY_CLOSING_INVITATION_EMAIL',
			'SYS_PASSWORD_RESET', 'SYS_USER_INVITATION', 'SYS_REGISTRATION_CONFIRMATION',
			'SYS_EMAIL_VERIFICATION', 'SYS_ACCOUNT_LOCKED', 'SYS_ACCOUNT_UNLOCKED',
			'SYS_ROLE_REQUESTED', 'SYS_ROLE_APPROVED', 'SYS_ROLE_REJECTED',
			'SERVER_CONVOCATION',
		];
		if (withShirtConfirmation) {
			types.push('SERVER_SHIRT_CONFIRMATION', 'SERVER_SHIRT_CONFIRMATION_REMINDER');
		}
		const allowed = types.map((t) => `'${t}'`).join(', ');

		await queryRunner.query(`PRAGMA foreign_keys = OFF`);
		await queryRunner.query(`DROP TABLE IF EXISTS "global_message_templates_new"`);
		await queryRunner.query(`
			CREATE TABLE "global_message_templates_new" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN (${allowed})),
				"message" TEXT NOT NULL,
				"isActive" BOOLEAN NOT NULL DEFAULT (1),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);
		await queryRunner.query(`
			INSERT INTO "global_message_templates_new"
				("id", "name", "type", "message", "isActive", "createdAt", "updatedAt")
			SELECT "id", "name", "type", "message", "isActive", "createdAt", "updatedAt"
			FROM "global_message_templates"
		`);
		await queryRunner.query(`DROP TABLE "global_message_templates"`);
		await queryRunner.query(
			`ALTER TABLE "global_message_templates_new" RENAME TO "global_message_templates"`,
		);
		await queryRunner.query(`PRAGMA foreign_keys = ON`);
		const orphans = await queryRunner.query(`PRAGMA foreign_key_check`);
		if (orphans && orphans.length > 0) {
			throw new Error(`FK integrity broken after recreate: ${JSON.stringify(orphans)}`);
		}
	}
}
