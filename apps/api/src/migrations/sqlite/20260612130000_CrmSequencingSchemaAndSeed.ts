import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Migración CONSOLIDADA del feature de secuencias de mensajes (CRM/drip).
 * Reúne en un solo archivo lo que antes estaban en 8 migraciones incrementales
 * (130000–200000), garantizando el orden de columnas correcto en una DB fresca:
 *
 *   A. Targeting/ownership sobre tablas existentes (ADD COLUMN, aditivo):
 *      - sequence_steps    → recipientTarget, condition, recipientResponsibility
 *      - scheduled_messages→ recipientTarget, attempts, resolvedContent,
 *                            resolvedContact, recipientName, assignedTo,
 *                            openedAt, dispatchedBy
 *      - message_sequences → maxOverdueDays
 *      - participants      → doNotContact (opt-out global de no-contacto)
 *   B. Plantillas GLOBALES de secuencias (tablas nuevas), creadas ya con TODAS
 *      sus columnas finales (recipientTarget/recipientResponsibility/condition/
 *      maxOverdueDays), así no requieren ALTERs posteriores.
 *   C. Seed del "pack" global (10 secuencias) listo para importar a un retiro.
 *      Globales → al importarse quedan inactivas; sembrarlas NO dispara envíos.
 *   D. Backfill por retiro de las secuencias de "registro" que reemplazan los
 *      envíos automáticos del alta (bienvenida, privacidad, invitador, palanquero).
 *   E+F. Mejora de textos dirigidos a FAMILIARES (PALANCA_REQUEST/REMINDER y
 *      FAMILY_CLOSING_INVITATION email/whatsapp): lenguaje sin jerga, nombran al
 *      caminante y piden mensajes positivos (conservador, solo el texto default).
 *   G. Siembra FAMILY_CLOSING_INVITATION por retiro (antes solo existía global,
 *      así el paso de secuencia "Invitación a la familia" deja de omitirse).
 *
 * Las tablas base (saved_segments, message_sequences, sequence_steps,
 * participant_follow_up, tasks) se crean en las migraciones previas
 * (100000/110000/120000). scheduled_messages preexiste al feature.
 *
 * Valores literales embebidos (el loader de migraciones no resuelve @repo/types).
 * Data-only en C/D con INSERT OR IGNORE / guardas por nombre → idempotente.
 */
export class CrmSequencingSchemaAndSeed20260612130000 implements MigrationInterface {
	name = 'CrmSequencingSchemaAndSeed20260612130000';
	timestamp = '20260612130000';
	// El down() hace DROP TABLE de las tablas globales; el guard sqliteSafePattern
	// exige declarar este flag. (Tablas nuevas sin FKs entrantes; el runner custom
	// además decide la transacción por el flag CLI, no por esta propiedad.)
	transaction = false as const;

	// ── Pack global de secuencias (IDs estables para idempotencia) ──────────────
	private readonly G = {
		welcome: 'a0000000-0000-4000-a000-000000000001',
		pre: 'a0000000-0000-4000-a000-000000000002',
		leaders: 'a0000000-0000-4000-a000-000000000003',
		post: 'a0000000-0000-4000-a000-000000000004',
		serverWelcome: 'a0000000-0000-4000-a000-000000000005',
		palanquero: 'a0000000-0000-4000-a000-000000000006',
		payment: 'a0000000-0000-4000-a000-000000000007',
		birthday: 'a0000000-0000-4000-a000-000000000008',
		followup: 'a0000000-0000-4000-a000-000000000009',
		familyClosing: 'a0000000-0000-4000-a000-00000000000a',
	};

	// ── Textos de plantillas dirigidas a familiares (mejorados, sin jerga) ──────
	private static readonly PALANCA_REQUEST = `<p>Hola {participant.recipientFirstName}, ¿cómo estás?</p>
<p>Te escribimos porque {participant.firstName} participará este fin de semana en un retiro espiritual, una experiencia muy especial. Como parte del retiro, las personas más cercanas preparan en secreto unas cartas de cariño que llamamos <strong>«palancas»</strong>.</p>
<p>Una palanca es simplemente <strong>un mensaje breve, escrito desde el corazón</strong>, que {participant.firstName} leerá en un momento muy emotivo del fin de semana. Tus palabras pueden significar muchísimo.</p>
<p><strong>¿Qué puedes escribir?</strong></p>
<ul>
  <li>Lo que más aprecias y admiras de {participant.firstName}.</li>
  <li>Un recuerdo bonito que compartan, o por qué es importante en tu vida.</li>
  <li>Palabras de cariño, ánimo y tus mejores deseos.</li>
</ul>
<p><strong>Por favor, que sea un mensaje totalmente positivo.</strong> Es un regalo de amor: evita reproches, críticas, quejas, problemas, temas tristes o de dinero, o cualquier cosa que pueda doler. La intención es que {participant.firstName} sienta todo tu cariño y apoyo.</p>
<p>No tiene que ser largo ni perfecto: unas pocas líneas sinceras bastan. <strong>Haz llegar tu palanca antes del inicio del retiro: {retreat.startDate}.</strong></p>
<p>Es una sorpresa, así que te pedimos no comentarle nada a {participant.firstName}. ¡Gracias por ser parte de esto!</p>`;

	private static readonly PALANCA_REMINDER = `<p>Hola {participant.recipientFirstName}, ¿cómo estás?</p>
<p>Te recordamos con cariño la <strong>palanca</strong> para {participant.firstName}: esa carta breve y positiva que leerá durante su retiro este fin de semana (es la sorpresa de cartas de aliento que preparan sus seres queridos).</p>
<p>Aún estás a tiempo. No necesita ser larga ni perfecta; unas líneas sinceras con tu cariño, ánimo y buenos deseos serán un regalo enorme. Recuerda <strong>evitar cualquier cosa negativa</strong> —reproches, problemas o temas tristes—: la idea es que {participant.firstName} se sienta querido y animado.</p>
<p><strong>Fecha límite: {retreat.startDate}.</strong> Y recuerda que es una sorpresa, no le comentes nada. ¡Gracias!</p>`;

	private static readonly FAMILY_CLOSING_EMAIL = `<h2>Misa de Clausura del retiro</h2>
<p>Hola {participant.recipientFirstName},</p>
<p>{participant.firstName} está viviendo este fin de semana un retiro espiritual muy especial, y queremos invitarte con mucho cariño a la <strong>Misa de Clausura</strong> del retiro de Emaús de <strong>{retreat.parish}</strong>: el momento en que recibimos de vuelta a {participant.firstName} y celebramos en familia el cierre de la experiencia.</p>
<ul>
  <li><strong>Fecha:</strong> {retreat.endDate}</li>
  <li><strong>Iglesia:</strong> {retreat.closingChurchName}</li>
  <li><strong>Dirección:</strong> {retreat.closingChurchAddress}</li>
</ul>
<p>
  <a href="{retreat.closingChurchMapsUrl}">Abrir en Google Maps</a> &nbsp;·&nbsp;
  <a href="{retreat.closingChurchWazeUrl}">Abrir en Waze</a>
</p>
<p>Tu presencia será una hermosa sorpresa y significará muchísimo para {participant.firstName}. ¡Ahí nos vemos!</p>`;

	private static readonly FAMILY_CLOSING_WHATSAPP = `Hola {participant.recipientFirstName}, {participant.firstName} está viviendo este fin de semana un retiro espiritual muy especial. Te invitamos con mucho cariño a la *Misa de Clausura* del retiro de Emaús de *{retreat.parish}*: el momento en que lo recibimos de vuelta y celebramos en familia.

🗓️ {retreat.endDate}
⛪ {retreat.closingChurchName}
📍 {retreat.closingChurchAddress}

Cómo llegar:
• Google Maps: {retreat.closingChurchMapsUrl}
• Waze: {retreat.closingChurchWazeUrl}

Tu presencia será una hermosa sorpresa y significará muchísimo para {participant.firstName}. ¡Ahí nos vemos!`;

	private globalSequences() {
		return [
			{ id: this.G.welcome, name: 'Bienvenida al caminante', description: 'Mensaje de bienvenida al darse de alta el caminante.', trigger: 'participant_created', audience: 'walker' },
			{ id: this.G.pre, name: 'Pre-retiro: palancas y confirmación', description: 'Solicitud de palancas a los contactos de emergencia, su recordatorio, y confirmación de asistencia al caminante, en los días previos al retiro.', trigger: 'days_before_retreat', audience: 'walker' },
			{ id: this.G.leaders, name: 'Briefing a líderes y colíderes de mesa', description: 'Briefing de mesa el día antes del retiro a líderes y colíderes.', trigger: 'days_before_retreat', audience: 'table_leaders' },
			{ id: this.G.post, name: 'Seguimiento post-retiro (Cuarto Día)', description: 'Mensaje un día después del retiro invitando al Cuarto Día y a unirse a una comunidad cercana (con el link de la landing).', trigger: 'days_after_retreat', audience: 'walker' },
			{ id: this.G.serverWelcome, name: 'Bienvenida al servidor', description: 'Mensaje de bienvenida al darse de alta el servidor.', trigger: 'participant_created', audience: 'server' },
			{ id: this.G.palanquero, name: 'Aviso al palanquero (nuevo caminante)', description: 'Avisa a los servidores asignados a la responsabilidad Palanquero cuando se registra un caminante.', trigger: 'participant_created', audience: 'walker' },
			{ id: this.G.payment, name: 'Recordatorio de pago (saldo pendiente)', description: 'Recuerda el pago días antes del retiro, solo a quienes tienen saldo pendiente o parcial.', trigger: 'days_before_retreat', audience: 'all' },
			{ id: this.G.birthday, name: 'Felicitación de cumpleaños', description: 'Mensaje automático en el cumpleaños del participante.', trigger: 'birthday', audience: 'all' },
			{ id: this.G.followup, name: 'Seguimiento del Cuarto Día (largo)', description: 'Acompañamiento al caminante: 1 semana, 1 mes, 3, 6 meses y 1 año después del retiro.', trigger: 'days_after_retreat', audience: 'walker' },
			{ id: this.G.familyClosing, name: 'Invitación a la familia (misa de clausura)', description: 'Invita a los contactos de emergencia (familia) a la misa de clausura, el día antes.', trigger: 'days_before_retreat', audience: 'walker' },
		];
	}

	// [stepId, sequenceId, stepOrder, offsetDays, sendHour, templateType, channel, recipientTarget, recipientResponsibility|null, conditionJson|null]
	private globalSteps(): Array<[string, string, number, number, number, string, string, string, string | null, string | null]> {
		const unpaid = JSON.stringify({ paymentStatus: 'unpaid' });
		const partial = JSON.stringify({ paymentStatus: 'partial' });
		return [
			// Base (4 secuencias originales)
			['a1000000-0000-4000-a000-000000000001', this.G.welcome, 0, 0, 9, 'WALKER_WELCOME', 'whatsapp', 'participant', null, null],
			['a2000000-0000-4000-a000-000000000001', this.G.pre, 0, 21, 9, 'PALANCA_REQUEST', 'whatsapp', 'emergencyContact1', null, null],
			['a2000000-0000-4000-a000-000000000002', this.G.pre, 1, 21, 9, 'PALANCA_REQUEST', 'whatsapp', 'emergencyContact2', null, null],
			['a2000000-0000-4000-a000-000000000003', this.G.pre, 2, 7, 9, 'PALANCA_REMINDER', 'whatsapp', 'emergencyContact1', null, null],
			['a2000000-0000-4000-a000-000000000004', this.G.pre, 3, 7, 9, 'PALANCA_REMINDER', 'whatsapp', 'emergencyContact2', null, null],
			['a2000000-0000-4000-a000-000000000005', this.G.pre, 4, 3, 9, 'WALKER_CONFIRMATION', 'whatsapp', 'participant', null, null],
			['a3000000-0000-4000-a000-000000000001', this.G.leaders, 0, 1, 9, 'TABLE_LEADER_BRIEFING', 'whatsapp', 'participant', null, null],
			['a4000000-0000-4000-a000-000000000001', this.G.post, 0, 1, 10, 'POST_RETREAT_MESSAGE', 'whatsapp', 'participant', null, null],
			// Extra (6 secuencias adicionales)
			['a5000000-0000-4000-a000-000000000001', this.G.serverWelcome, 0, 0, 9, 'SERVER_WELCOME', 'whatsapp', 'participant', null, null],
			['a6000000-0000-4000-a000-000000000001', this.G.palanquero, 0, 0, 9, 'PALANQUERO_NEW_WALKER', 'whatsapp', 'responsibility', 'Palanquero 1', null],
			['a6000000-0000-4000-a000-000000000002', this.G.palanquero, 1, 0, 9, 'PALANQUERO_NEW_WALKER', 'whatsapp', 'responsibility', 'Palanquero 2', null],
			['a6000000-0000-4000-a000-000000000003', this.G.palanquero, 2, 0, 9, 'PALANQUERO_NEW_WALKER', 'whatsapp', 'responsibility', 'Palanquero 3', null],
			['a7000000-0000-4000-a000-000000000001', this.G.payment, 0, 10, 9, 'PAYMENT_REMINDER', 'whatsapp', 'participant', null, unpaid],
			['a7000000-0000-4000-a000-000000000002', this.G.payment, 1, 10, 9, 'PAYMENT_REMINDER', 'whatsapp', 'participant', null, partial],
			['a8000000-0000-4000-a000-000000000001', this.G.birthday, 0, 0, 9, 'BIRTHDAY_MESSAGE', 'whatsapp', 'participant', null, null],
			['a9000000-0000-4000-a000-000000000001', this.G.followup, 0, 7, 10, 'WALKER_FOLLOWUP_WEEK_1', 'whatsapp', 'participant', null, null],
			['a9000000-0000-4000-a000-000000000002', this.G.followup, 1, 30, 10, 'WALKER_FOLLOWUP_MONTH_1', 'whatsapp', 'participant', null, null],
			['a9000000-0000-4000-a000-000000000003', this.G.followup, 2, 90, 10, 'WALKER_FOLLOWUP_MONTH_3', 'whatsapp', 'participant', null, null],
			['a9000000-0000-4000-a000-000000000004', this.G.followup, 3, 180, 10, 'WALKER_FOLLOWUP_MONTH_6', 'whatsapp', 'participant', null, null],
			['a9000000-0000-4000-a000-000000000005', this.G.followup, 4, 365, 10, 'WALKER_FOLLOWUP_YEAR_1', 'whatsapp', 'participant', null, null],
			['aa000000-0000-4000-a000-000000000001', this.G.familyClosing, 0, 1, 9, 'FAMILY_CLOSING_INVITATION_WHATSAPP', 'whatsapp', 'emergencyContact1', null, null],
			['aa000000-0000-4000-a000-000000000002', this.G.familyClosing, 1, 1, 9, 'FAMILY_CLOSING_INVITATION_WHATSAPP', 'whatsapp', 'emergencyContact2', null, null],
		];
	}

	/**
	 * Inserta el pack global (idempotente, INSERT OR IGNORE). Público para que el
	 * test seed-and-verify lo ejerza sin re-correr los ALTER TABLE del up().
	 */
	public async seedGlobalPack(queryRunner: QueryRunner): Promise<void> {
		for (const s of this.globalSequences()) {
			await queryRunner.query(
				`INSERT OR IGNORE INTO "global_message_sequences"
					("id", "name", "description", "trigger", "audience", "isActive")
				 VALUES (?, ?, ?, ?, ?, 1)`,
				[s.id, s.name, s.description, s.trigger, s.audience],
			);
		}
		for (const st of this.globalSteps()) {
			await queryRunner.query(
				`INSERT OR IGNORE INTO "global_sequence_steps"
					("id", "sequenceId", "stepOrder", "offsetDays", "sendHour", "templateType", "channel", "recipientTarget", "recipientResponsibility", "condition")
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[st[0], st[1], st[2], st[3], st[4], st[5], st[6], st[7], st[8], st[9]],
			);
		}
	}

	/** Elimina el pack global por sus IDs estables (steps por FK, luego secuencias). */
	public async removeGlobalPack(queryRunner: QueryRunner): Promise<void> {
		const ids = Object.values(this.G);
		const ph = ids.map(() => '?').join(', ');
		await queryRunner.query(
			`DELETE FROM "global_sequence_steps" WHERE "sequenceId" IN (${ph})`,
			ids,
		);
		await queryRunner.query(
			`DELETE FROM "global_message_sequences" WHERE "id" IN (${ph})`,
			ids,
		);
	}

	public async up(queryRunner: QueryRunner): Promise<void> {
		// ── A. Targeting/ownership sobre tablas existentes ──────────────────────
		await queryRunner.query(
			`ALTER TABLE "sequence_steps" ADD COLUMN "recipientTarget" varchar(30) NOT NULL DEFAULT 'participant'`,
		);
		await queryRunner.query(`ALTER TABLE "sequence_steps" ADD COLUMN "condition" text`);
		await queryRunner.query(
			`ALTER TABLE "sequence_steps" ADD COLUMN "recipientResponsibility" varchar(100)`,
		);

		await queryRunner.query(
			`ALTER TABLE "scheduled_messages" ADD COLUMN "recipientTarget" varchar(30) NOT NULL DEFAULT 'participant'`,
		);
		await queryRunner.query(
			`ALTER TABLE "scheduled_messages" ADD COLUMN "attempts" integer NOT NULL DEFAULT 0`,
		);
		await queryRunner.query(`ALTER TABLE "scheduled_messages" ADD COLUMN "resolvedContent" text`);
		await queryRunner.query(
			`ALTER TABLE "scheduled_messages" ADD COLUMN "resolvedContact" varchar(255)`,
		);
		await queryRunner.query(
			`ALTER TABLE "scheduled_messages" ADD COLUMN "recipientName" varchar(150)`,
		);
		await queryRunner.query(`ALTER TABLE "scheduled_messages" ADD COLUMN "assignedTo" varchar`);
		await queryRunner.query(`ALTER TABLE "scheduled_messages" ADD COLUMN "openedAt" datetime`);
		await queryRunner.query(`ALTER TABLE "scheduled_messages" ADD COLUMN "dispatchedBy" varchar`);

		await queryRunner.query(`ALTER TABLE "message_sequences" ADD COLUMN "maxOverdueDays" integer`);

		await queryRunner.query(
			`ALTER TABLE "participants" ADD COLUMN "doNotContact" boolean NOT NULL DEFAULT (0)`,
		);

		// ── B. Tablas globales (ya con TODAS sus columnas finales) ──────────────
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "global_message_sequences" (
				"id" varchar PRIMARY KEY NOT NULL,
				"name" varchar(150) NOT NULL,
				"description" text,
				"trigger" varchar(30) NOT NULL,
				"audience" varchar(20) NOT NULL DEFAULT 'all',
				"maxOverdueDays" integer,
				"isActive" boolean NOT NULL DEFAULT (1),
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				CONSTRAINT "UQ_global_message_sequences_name" UNIQUE ("name")
			)
		`);
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "global_sequence_steps" (
				"id" varchar PRIMARY KEY NOT NULL,
				"sequenceId" varchar NOT NULL,
				"stepOrder" integer NOT NULL DEFAULT (0),
				"offsetDays" integer NOT NULL DEFAULT (0),
				"sendHour" integer NOT NULL DEFAULT (9),
				"templateType" varchar(60) NOT NULL,
				"channel" varchar(20) NOT NULL,
				"recipientTarget" varchar(30) NOT NULL DEFAULT 'participant',
				"recipientResponsibility" varchar(100),
				"condition" text,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				CONSTRAINT "FK_global_sequence_steps_sequence" FOREIGN KEY ("sequenceId") REFERENCES "global_message_sequences" ("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_global_sequence_steps_sequence" ON "global_sequence_steps" ("sequenceId")`,
		);

		// ── C. Seed del pack global (10 secuencias) ─────────────────────────────
		await this.seedGlobalPack(queryRunner);

		// ── D. Backfill por retiro de secuencias de "registro" ──────────────────
		const retreats: Array<{
			id: string;
			notifyParticipant: number | null;
			notifyInviter: number | null;
			notifyPalanqueros: string | null;
		}> = await queryRunner.query(
			`SELECT id, notifyParticipant, notifyInviter, notifyPalanqueros FROM "retreat"`,
		);

		for (const r of retreats) {
			const welcomeActive = r.notifyParticipant === 0 ? 0 : 1;
			const inviterActive = r.notifyInviter === 0 ? 0 : 1;
			let palanqueros: number[] = [];
			try {
				palanqueros = r.notifyPalanqueros ? JSON.parse(r.notifyPalanqueros) : [];
			} catch {
				palanqueros = [];
			}
			const palanqueroActive = palanqueros.length > 0 ? 1 : 0;

			// step: [templateType, recipientTarget, recipientResponsibility|null]
			const defs: Array<{
				name: string;
				audience: string;
				active: number;
				steps: Array<[string, string, string | null]>;
			}> = [
				{ name: 'Bienvenida al caminante', audience: 'walker', active: welcomeActive, steps: [['WALKER_WELCOME', 'participant', null]] },
				{ name: 'Bienvenida al servidor', audience: 'server', active: welcomeActive, steps: [['SERVER_WELCOME', 'participant', null]] },
				{ name: 'Aviso de privacidad', audience: 'all', active: welcomeActive, steps: [['PRIVACY_DATA_DELETE', 'participant', null]] },
				{ name: 'Aviso al invitador (nuevo caminante)', audience: 'walker', active: inviterActive, steps: [['GENERAL', 'inviter', null]] },
				{
					name: 'Aviso al palanquero (nuevo caminante)',
					audience: 'walker',
					active: palanqueroActive,
					steps: [1, 2, 3].map(
						(n) => ['PALANQUERO_NEW_WALKER', 'responsibility', `Palanquero ${n}`] as [string, string, string],
					),
				},
			];

			for (const d of defs) {
				const existing = await queryRunner.query(
					`SELECT id FROM "message_sequences" WHERE "retreatId" = ? AND "name" = ?`,
					[r.id, d.name],
				);
				if (existing.length > 0) continue;

				const seqId = uuidv4();
				await queryRunner.query(
					`INSERT INTO "message_sequences" ("id", "name", "retreatId", "trigger", "audience", "isActive")
					 VALUES (?, ?, ?, 'participant_created', ?, ?)`,
					[seqId, d.name, r.id, d.audience, d.active],
				);
				for (let i = 0; i < d.steps.length; i++) {
					const [templateType, target, resp] = d.steps[i];
					await queryRunner.query(
						`INSERT INTO "sequence_steps" ("id", "sequenceId", "stepOrder", "offsetDays", "sendHour", "templateType", "channel", "recipientTarget", "recipientResponsibility")
						 VALUES (?, ?, ?, 0, 9, ?, 'email', ?, ?)`,
						[uuidv4(), seqId, i, templateType, target, resp],
					);
				}
			}
		}

		// ── E+F. Mejora de textos para FAMILIARES (palanca + clausura) ──────────
		// Reescribe a un lenguaje sin jerga, nombra al caminante y pide mensajes
		// positivos. Conservador: solo filas con el texto por defecto (frase
		// distintiva), en ambas tablas, para no pisar customizaciones por retiro.
		const C = CrmSequencingSchemaAndSeed20260612130000;
		for (const table of ['global_message_templates', 'message_templates']) {
			await queryRunner.query(
				`UPDATE "${table}" SET message = ? WHERE type = 'PALANCA_REQUEST' AND message LIKE '%oración convertida en palabras%'`,
				[C.PALANCA_REQUEST],
			);
			await queryRunner.query(
				`UPDATE "${table}" SET message = ? WHERE type = 'PALANCA_REMINDER' AND message LIKE '%recordatorio cariñoso%'`,
				[C.PALANCA_REMINDER],
			);
			await queryRunner.query(
				`UPDATE "${table}" SET message = ? WHERE type = 'FAMILY_CLOSING_INVITATION_EMAIL' AND message LIKE '%para tu hermano(a)%'`,
				[C.FAMILY_CLOSING_EMAIL],
			);
			await queryRunner.query(
				`UPDATE "${table}" SET message = ? WHERE type = 'FAMILY_CLOSING_INVITATION_WHATSAPP' AND message LIKE '%para él/ella%'`,
				[C.FAMILY_CLOSING_WHATSAPP],
			);
		}

		// ── G. Siembra FAMILY_CLOSING_INVITATION por retiro (no existía per-retreat;
		// el paso de secuencia se omitía por "sin plantilla"). Idempotente. ───────
		const familyDefs = [
			{ type: 'FAMILY_CLOSING_INVITATION_EMAIL', name: 'Invitación Familia - Misa de Clausura (Email)', message: C.FAMILY_CLOSING_EMAIL },
			{ type: 'FAMILY_CLOSING_INVITATION_WHATSAPP', name: 'Invitación Familia - Misa de Clausura (WhatsApp)', message: C.FAMILY_CLOSING_WHATSAPP },
		];
		for (const r of retreats) {
			for (const d of familyDefs) {
				const existing = await queryRunner.query(
					`SELECT id FROM "message_templates" WHERE "retreatId" = ? AND "type" = ?`,
					[r.id, d.type],
				);
				if (existing.length > 0) continue;
				await queryRunner.query(
					`INSERT INTO "message_templates" ("id", "name", "type", "scope", "message", "retreatId", "createdAt", "updatedAt")
					 VALUES (?, ?, ?, 'retreat', ?, ?, datetime('now'), datetime('now'))`,
					[uuidv4(), d.name, d.type, d.message, r.id],
				);
			}
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const C = CrmSequencingSchemaAndSeed20260612130000;
		// G. Borra las plantillas de clausura por-retiro que insertamos (texto exacto).
		await queryRunner.query(
			`DELETE FROM "message_templates" WHERE "scope" = 'retreat' AND "type" = 'FAMILY_CLOSING_INVITATION_EMAIL' AND "message" = ?`,
			[C.FAMILY_CLOSING_EMAIL],
		);
		await queryRunner.query(
			`DELETE FROM "message_templates" WHERE "scope" = 'retreat' AND "type" = 'FAMILY_CLOSING_INVITATION_WHATSAPP' AND "message" = ?`,
			[C.FAMILY_CLOSING_WHATSAPP],
		);
		// (E+F dejan el texto mejorado; revertir el wording exacto no aplica en un down de feature.)

		// D. Backfill por retiro (por nombre).
		const regNames = [
			'Bienvenida al caminante',
			'Bienvenida al servidor',
			'Aviso de privacidad',
			'Aviso al invitador (nuevo caminante)',
			'Aviso al palanquero (nuevo caminante)',
		];
		const regPh = regNames.map(() => '?').join(', ');
		await queryRunner.query(
			`DELETE FROM "sequence_steps" WHERE "sequenceId" IN (
				SELECT id FROM "message_sequences" WHERE "name" IN (${regPh})
			)`,
			regNames,
		);
		await queryRunner.query(
			`DELETE FROM "message_sequences" WHERE "name" IN (${regPh})`,
			regNames,
		);

		// B+C. Tablas globales (DROP arrastra sus pasos por FK CASCADE).
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_global_sequence_steps_sequence"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "global_sequence_steps"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "global_message_sequences"`);

		// A. Columnas aditivas sobre tablas existentes.
		await queryRunner.query(`ALTER TABLE "participants" DROP COLUMN "doNotContact"`);
		await queryRunner.query(`ALTER TABLE "message_sequences" DROP COLUMN "maxOverdueDays"`);
		await queryRunner.query(`ALTER TABLE "scheduled_messages" DROP COLUMN "dispatchedBy"`);
		await queryRunner.query(`ALTER TABLE "scheduled_messages" DROP COLUMN "openedAt"`);
		await queryRunner.query(`ALTER TABLE "scheduled_messages" DROP COLUMN "assignedTo"`);
		await queryRunner.query(`ALTER TABLE "scheduled_messages" DROP COLUMN "recipientName"`);
		await queryRunner.query(`ALTER TABLE "scheduled_messages" DROP COLUMN "resolvedContact"`);
		await queryRunner.query(`ALTER TABLE "scheduled_messages" DROP COLUMN "resolvedContent"`);
		await queryRunner.query(`ALTER TABLE "scheduled_messages" DROP COLUMN "attempts"`);
		await queryRunner.query(`ALTER TABLE "scheduled_messages" DROP COLUMN "recipientTarget"`);
		await queryRunner.query(`ALTER TABLE "sequence_steps" DROP COLUMN "recipientResponsibility"`);
		await queryRunner.query(`ALTER TABLE "sequence_steps" DROP COLUMN "condition"`);
		await queryRunner.query(`ALTER TABLE "sequence_steps" DROP COLUMN "recipientTarget"`);
	}
}
