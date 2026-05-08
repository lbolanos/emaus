import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega tipos de plantilla globales para el seguimiento del caminante
 * después del retiro:
 *
 *   - WALKER_FOLLOWUP_WEEK_1   — primera semana
 *   - WALKER_FOLLOWUP_MONTH_1  — primer mes
 *   - WALKER_FOLLOWUP_MONTH_3  — tres meses
 *   - WALKER_FOLLOWUP_MONTH_6  — seis meses
 *   - WALKER_FOLLOWUP_YEAR_1   — primer aniversario
 *   - WALKER_REUNION_INVITATION — invitación a reunión de comunidad
 *
 * El CHECK constraint de `global_message_templates.type` enumera los
 * tipos permitidos, así que para añadir tipos nuevos hay que recrear la
 * tabla. La tabla NO tiene FKs entrantes (otras tablas referencian a
 * `global_message_templates` solo por `templateId` opcional vía relación
 * en código, no por SQL FK), pero seguimos el patrón seguro
 * `transaction = false` + `PRAGMA foreign_keys = OFF` por convención del
 * proyecto (ver `.ruler/skills/sqlite-migrations/SKILL.md`).
 *
 * Después de recrear la tabla, hace seed idempotente de las 6 plantillas
 * (skip si ya existen por nombre).
 */
export class AddWalkerFollowupTemplates20260507240000 implements MigrationInterface {
	name = 'AddWalkerFollowupTemplates20260507240000';
	timestamp = '20260507240000';

	// CRÍTICO: TypeORM no envuelve up()/down() en BEGIN…COMMIT cuando
	// transaction=false. SQLite ignora PRAGMA foreign_keys=OFF dentro de
	// transacción multi-sentencia, por eso hay que salir de la tx implícita.
	transaction = false as const;

	private static readonly NEW_CHECK = `(
		'WALKER_WELCOME', 'SERVER_WELCOME', 'EMERGENCY_CONTACT_VALIDATION',
		'PALANCA_REQUEST', 'PALANCA_REMINDER', 'GENERAL',
		'PRE_RETREAT_REMINDER', 'PAYMENT_REMINDER', 'POST_RETREAT_MESSAGE',
		'CANCELLATION_CONFIRMATION', 'USER_INVITATION', 'PASSWORD_RESET',
		'RETREAT_SHARED_NOTIFICATION', 'BIRTHDAY_MESSAGE', 'PALANQUERO_NEW_WALKER',
		'PRIVACY_DATA_DELETE',
		'WALKER_FOLLOWUP_WEEK_1', 'WALKER_FOLLOWUP_MONTH_1', 'WALKER_FOLLOWUP_MONTH_3',
		'WALKER_FOLLOWUP_MONTH_6', 'WALKER_FOLLOWUP_YEAR_1', 'WALKER_REUNION_INVITATION',
		'SYS_PASSWORD_RESET', 'SYS_USER_INVITATION', 'SYS_REGISTRATION_CONFIRMATION',
		'SYS_EMAIL_VERIFICATION', 'SYS_ACCOUNT_LOCKED', 'SYS_ACCOUNT_UNLOCKED',
		'SYS_ROLE_REQUESTED', 'SYS_ROLE_APPROVED', 'SYS_ROLE_REJECTED'
	)`;

	private static readonly OLD_CHECK = `(
		'WALKER_WELCOME', 'SERVER_WELCOME', 'EMERGENCY_CONTACT_VALIDATION',
		'PALANCA_REQUEST', 'PALANCA_REMINDER', 'GENERAL',
		'PRE_RETREAT_REMINDER', 'PAYMENT_REMINDER', 'POST_RETREAT_MESSAGE',
		'CANCELLATION_CONFIRMATION', 'USER_INVITATION', 'PASSWORD_RESET',
		'RETREAT_SHARED_NOTIFICATION', 'BIRTHDAY_MESSAGE', 'PALANQUERO_NEW_WALKER',
		'PRIVACY_DATA_DELETE',
		'SYS_PASSWORD_RESET', 'SYS_USER_INVITATION', 'SYS_REGISTRATION_CONFIRMATION',
		'SYS_EMAIL_VERIFICATION', 'SYS_ACCOUNT_LOCKED', 'SYS_ACCOUNT_UNLOCKED',
		'SYS_ROLE_REQUESTED', 'SYS_ROLE_APPROVED', 'SYS_ROLE_REJECTED'
	)`;

	private static readonly TEMPLATES: Array<{
		name: string;
		type: string;
		message: string;
	}> = [
		{
			name: 'Seguimiento Caminante - 1 Semana',
			type: 'WALKER_FOLLOWUP_WEEK_1',
			message: `<h2>Hola {participant.firstName}</h2>
<p>Ya pasó una semana desde que terminaste tu retiro de Emaús. ¿Cómo te sientes en este nuevo cuarto día?</p>
<p>Recuerda que no estás solo. Tu comunidad de retiro y los servidores estamos pendientes de ti. Te recomendamos:</p>
<ul>
  <li>Mantener tus oraciones diarias.</li>
  <li>Conectar con los caminantes de tu mesa, si aún no lo has hecho.</li>
  <li>Asistir a la primera reunión de tu comunidad de Emaús.</li>
</ul>
<p>Si necesitas hablar con alguien o tienes dudas, escríbenos. Estamos aquí.</p>
<p>De Cristo Resucitado, ¡siempre!</p>`,
		},
		{
			name: 'Seguimiento Caminante - 1 Mes',
			type: 'WALKER_FOLLOWUP_MONTH_1',
			message: `<h2>{participant.firstName}, ¿cómo va tu cuarto día?</h2>
<p>Ha pasado un mes desde tu retiro. Es normal que la "burbuja" del retiro vaya bajando — es justamente ahora cuando empieza el verdadero cuarto día.</p>
<p>Algunas señales de que vas bien:</p>
<ul>
  <li>Sigues orando, aunque sea poco.</li>
  <li>Te conectas con tu comunidad o con tus compañeros de mesa.</li>
  <li>Vas notando pequeños cambios en cómo respondes a los demás.</li>
</ul>
<p>Si alguno te falta, está bien — pídelo de nuevo. La gracia se renueva cuando se pide. ¿Te gustaría que conversemos?</p>
<p>De Cristo Resucitado, ¡siempre!</p>`,
		},
		{
			name: 'Seguimiento Caminante - 3 Meses',
			type: 'WALKER_FOLLOWUP_MONTH_3',
			message: `<h2>{participant.firstName}, tres meses ya</h2>
<p>Tres meses desde tu retiro de Emaús. Para muchos, este es el punto donde el entusiasmo inicial baja y aparecen las preguntas reales: <em>¿esto es para mí?, ¿cómo lo llevo en mi día a día?, ¿con quién comparto el camino?</em></p>
<p>Buenas noticias: es exactamente para eso que existe la <strong>comunidad</strong>. Te invitamos a:</p>
<ul>
  <li>Asistir a la próxima reunión de tu comunidad — con o sin entusiasmo.</li>
  <li>Pensar si te gustaría servir en un próximo retiro como servidor.</li>
  <li>Invitar a alguien cercano a hacer su retiro.</li>
</ul>
<p>Cuéntanos cómo va. Nos importa.</p>
<p>De Cristo Resucitado, ¡siempre!</p>`,
		},
		{
			name: 'Seguimiento Caminante - 6 Meses',
			type: 'WALKER_FOLLOWUP_MONTH_6',
			message: `<h2>{participant.firstName}, medio año de tu retiro</h2>
<p>Han pasado 6 meses. ¿Recuerdas cómo te sentiste el último día del retiro? Vale la pena volver a esa imagen de vez en cuando — es buen termómetro.</p>
<p>Después de medio año, los caminantes que seguimos de cerca suelen necesitar dos cosas:</p>
<ol>
  <li><strong>Volver a contar la experiencia.</strong> Hablar con alguien que también lo vivió ayuda a no perderlo.</li>
  <li><strong>Servir.</strong> El siguiente retiro está cerca y tú podrías ser parte. Servir consolida lo que recibiste.</li>
</ol>
<p>Si te animas a alguno de los dos, escríbenos. Si necesitas espacio, también está bien — solo no te pierdas del todo.</p>
<p>De Cristo Resucitado, ¡siempre!</p>`,
		},
		{
			name: 'Seguimiento Caminante - 1 Año',
			type: 'WALKER_FOLLOWUP_YEAR_1',
			message: `<h2>¡Feliz aniversario, {participant.firstName}!</h2>
<p>Hace un año hiciste tu retiro de Emaús. Es una fecha que vale la pena agradecer: hoy eres distinto a quien fue al retiro hace 12 meses, aunque a veces no se note.</p>
<p>Para celebrar este aniversario te proponemos:</p>
<ul>
  <li>Tomarte 10 minutos hoy para agradecer en oración.</li>
  <li>Escribirle a un compañero de mesa para saber cómo está.</li>
  <li>Pensar a quién podrías invitar al próximo retiro — ese paso suele cambiarle la vida a alguien.</li>
</ul>
<p>Si quieres servir, hablar, regresar o simplemente saludar, aquí estamos. Tu comunidad te espera.</p>
<p>De Cristo Resucitado, ¡siempre!</p>`,
		},
		{
			name: 'Invitación a Reunión de Comunidad',
			type: 'WALKER_REUNION_INVITATION',
			message: `<h2>{participant.firstName}, te esperamos</h2>
<p>Estás invitado a la próxima reunión de tu comunidad de Emaús. Es un espacio sencillo, en confianza, para compartir, orar juntos y caminar acompañados.</p>
<p>No necesitas haber estado en las reuniones anteriores. No necesitas tener nada preparado. Solo ven.</p>
<p>Si tienes alguna duda sobre fecha, lugar u horario, escríbenos y te confirmamos.</p>
<p>Hasta pronto.</p>
<p>De Cristo Resucitado, ¡siempre!</p>`,
		},
	];

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		// 1) Recrear la tabla con el CHECK ampliado.
		await queryRunner.query(`
			CREATE TABLE "global_message_templates_new" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN ${AddWalkerFollowupTemplates20260507240000.NEW_CHECK}),
				"message" TEXT NOT NULL,
				"isActive" BOOLEAN NOT NULL DEFAULT (1),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);

		await queryRunner.query(`
			INSERT INTO "global_message_templates_new"
				(id, name, type, message, isActive, createdAt, updatedAt)
			SELECT id, name, type, message, isActive, createdAt, updatedAt
			FROM "global_message_templates"
		`);

		await queryRunner.query(`DROP TABLE "global_message_templates"`);
		await queryRunner.query(`ALTER TABLE "global_message_templates_new" RENAME TO "global_message_templates"`);

		// 2) Reactivar FK + integrity check.
		await queryRunner.query(`PRAGMA foreign_keys = ON`);
		const fkCheck = await queryRunner.query(`PRAGMA foreign_key_check`);
		if (fkCheck && fkCheck.length > 0) {
			throw new Error(
				`[AddWalkerFollowupTemplates] FK violations after recreate: ${JSON.stringify(fkCheck)}`,
			);
		}

		// 3) Seed idempotente — skip si ya existe una plantilla con ese name.
		for (const t of AddWalkerFollowupTemplates20260507240000.TEMPLATES) {
			await queryRunner.query(
				`
				INSERT INTO global_message_templates (id, name, type, message, isActive, createdAt, updatedAt)
				SELECT
					printf('%s-%s-%s-%s-%s',
						substr(lower(hex(randomblob(16))), 1, 8),
						substr(lower(hex(randomblob(16))), 1, 4),
						substr(lower(hex(randomblob(16))), 1, 4),
						substr(lower(hex(randomblob(16))), 1, 4),
						substr(lower(hex(randomblob(16))), 1, 12)
					),
					?, ?, ?, 1, datetime('now'), datetime('now')
				WHERE NOT EXISTS (
					SELECT 1 FROM global_message_templates WHERE name = ?
				)
				`,
				[t.name, t.type, t.message, t.name],
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		// Borrar las plantillas que insertamos (por type, no por id).
		const types = AddWalkerFollowupTemplates20260507240000.TEMPLATES.map((t) => `'${t.type}'`).join(',');
		await queryRunner.query(`DELETE FROM global_message_templates WHERE type IN (${types})`);

		// Recrear la tabla con el CHECK viejo.
		await queryRunner.query(`
			CREATE TABLE "global_message_templates_old" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"type" VARCHAR(255) NOT NULL CHECK ("type" IN ${AddWalkerFollowupTemplates20260507240000.OLD_CHECK}),
				"message" TEXT NOT NULL,
				"isActive" BOOLEAN NOT NULL DEFAULT (1),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);
		await queryRunner.query(`
			INSERT INTO "global_message_templates_old"
				(id, name, type, message, isActive, createdAt, updatedAt)
			SELECT id, name, type, message, isActive, createdAt, updatedAt
			FROM "global_message_templates"
		`);
		await queryRunner.query(`DROP TABLE "global_message_templates"`);
		await queryRunner.query(`ALTER TABLE "global_message_templates_old" RENAME TO "global_message_templates"`);

		await queryRunner.query(`PRAGMA foreign_keys = ON`);
	}
}
