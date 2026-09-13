import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reparación del incidente del 2026-09-12 (retiro Buen Despacho).
 *
 * El coordinador despachó a mano la bandeja de WhatsApp esa noche: los envíos
 * de SERVER_SHIRT_CONFIRMATION_REMINDER salieron por WhatsApp pero quedaron
 * `queued` (window.open corría antes del dispatch y el salto a la app mataba
 * el request). Además, ningún despacho manual de la bandeja registraba su
 * fila en participant_communications (el historial "Mensajes enviados").
 *
 * Esta migración:
 *  1. Marca como `sent` los recordatorios que siguen `queued` de ese retiro
 *     (envío confirmado por el propio coordinador).
 *  2. Backfill de participant_communications para TODOS los whatsapp `sent`
 *     que no tengan comunicación registrada — con los mismos campos que usa
 *     recordWhatsappCommunication (messageSequenceService), para que el
 *     historial retroactivo sea indistinguible del que escribirá el fix.
 *
 * Idempotente: el UPDATE filtra por status='queued' y el INSERT está protegido
 * por NOT EXISTS sobre la terna semántica (participantId, retreatId,
 * messageType, sentAt, messageContent) — las filas que inserta matchean esa
 * terna en una re-corrida y se saltan.
 *
 * Corre en dev (espejo de prod) y viaja con el deploy a prod, donde el
 * pipeline corre migration:run ANTES del pm2 reload: el backfill termina
 * antes de que el código nuevo (que ya registra comunicaciones) esté vivo,
 * sin riesgo de duplicados.
 *
 * Sin @repo/types (regla dura de migraciones de prod): el mapping de
 * audiencias es una copia literal de MESSAGE_TEMPLATE_AUDIENCE_BY_TYPE
 * (packages/types/src/message-template.ts).
 */
export class BackfillWhatsappCommunications20260913120000 implements MigrationInterface {
	name = 'BackfillWhatsappCommunications20260913120000';
	timestamp = '20260913120000';

	// Retiro Buen Despacho donde ocurrió el incidente.
	private readonly RETREAT_ID = 'e9b3c568-050a-4d66-a99d-305f287a59df';
	private readonly TEMPLATE_TYPE = 'SERVER_SHIRT_CONFIRMATION_REMINDER';
	// Último envío real de esa noche (verificado en access log, UTC).
	// ISO con Z obligatorio: DateTimeTransformer parsea con new Date(), y
	// 'YYYY-MM-DD HH:mm:ss' sin Z se interpretaría en la zona del proceso.
	private readonly SENT_AT = '2026-09-13T03:21:25.000Z';
	private readonly DISPATCHER_EMAIL = 'leonardo.bolanos@gmail.com';

	// Copia literal de MESSAGE_TEMPLATE_AUDIENCE_BY_TYPE (default 'general').
	private readonly AUDIENCE_BY_TYPE: Record<string, string> = {
		// Caminante
		WALKER_WELCOME: 'walker',
		WALKER_FOLLOWUP_WEEK_1: 'walker',
		WALKER_FOLLOWUP_MONTH_1: 'walker',
		WALKER_FOLLOWUP_MONTH_3: 'walker',
		WALKER_FOLLOWUP_MONTH_6: 'walker',
		WALKER_FOLLOWUP_YEAR_1: 'walker',
		WALKER_REUNION_INVITATION: 'walker',
		WALKER_CONFIRMATION: 'walker',
		POST_RETREAT_MESSAGE: 'walker',
		// Aplican a cualquier participante (caminante y servidor).
		PRE_RETREAT_REMINDER: 'participant',
		PAYMENT_REMINDER: 'participant',
		CANCELLATION_CONFIRMATION: 'participant',
		BIRTHDAY_MESSAGE: 'participant',
		EMERGENCY_CONTACT_VALIDATION: 'participant',
		// Servidor
		SERVER_WELCOME: 'server',
		SERVER_CONVOCATION: 'server',
		SERVER_SHIRT_CONFIRMATION: 'server',
		SERVER_SHIRT_CONFIRMATION_REMINDER: 'server',
		// Líder/colíder de mesa
		TABLE_LEADER_BRIEFING: 'table_leader',
		// Responsable (palanquero recibe el aviso de nuevo caminante)
		PALANQUERO_NEW_WALKER: 'responsible',
		// Familiar (palanquero/familia/contacto de emergencia)
		PALANCA_REQUEST: 'family',
		PALANCA_REMINDER: 'family',
		FAMILY_CLOSING_INVITATION_WHATSAPP: 'family',
		FAMILY_CLOSING_INVITATION_EMAIL: 'family',
		// El resto (GENERAL, PRIVACY_DATA_DELETE, COMMUNITY_*, SYS_*, etc.) → general.
	};

	public async up(queryRunner: QueryRunner): Promise<void> {
		// 1) El despachador de esa noche debe existir (validado contra el espejo
		// local antes de pushear). Si no está, no tocar nada: la reparación
		// sin `sentBy` correcto es peor que no reparar.
		const users: { id: string }[] = await queryRunner.query(
			`SELECT "id" FROM "users" WHERE "email" = ?`,
			[this.DISPATCHER_EMAIL],
		);
		if (!users.length) {
			console.error(
				`[migration ${this.name}] dispatcher ${this.DISPATCHER_EMAIL} not found — ` +
					`skipping repair (verify against the production mirror before deploying)`,
			);
			return;
		}
		const dispatcherId = users[0].id;

		// 2) Los recordatorios enviados-sin-marcar → sent. El guard por estado
		// lo hace idempotente: en dev/prod marca los que sigan queued (21/20
		// según el entorno), los ya sent no se tocan.
		const marked = await queryRunner.query(
			`UPDATE "scheduled_messages"
			 SET "status" = 'sent', "sentAt" = ?, "dispatchedBy" = ?, "updatedAt" = ?
			 WHERE "retreatId" = ? AND "templateType" = ? AND "status" = 'queued'`,
			[this.SENT_AT, dispatcherId, this.SENT_AT, this.RETREAT_ID, this.TEMPLATE_TYPE],
		);
		console.log(`[migration ${this.name}] marked ${marked} reminder(s) as sent`);

		// 3) Backfill del historial para TODOS los whatsapp sent sin
		//    comunicación. Candidatos leídos DESPUÉS del UPDATE: los recién
		//    marcados entran con su sentAt/dispatchedBy correctos.
		const candidates = await queryRunner.query(`
			SELECT
				sm."id"                          AS "smId",
				sm."participantId"               AS "participantId",
				sm."retreatId"                   AS "retreatId",
				sm."recipientTarget"             AS "recipientTarget",
				sm."recipientName"               AS "recipientName",
				sm."resolvedContact"             AS "resolvedContact",
				sm."resolvedContent"             AS "resolvedContent",
				sm."templateType"                AS "templateType",
				sm."sentAt"                      AS "sentAt",
				sm."updatedAt"                   AS "updatedAt",
				sm."dispatchedBy"                AS "dispatchedBy",
				(SELECT mt."id" FROM "message_templates" mt
				 WHERE mt."retreatId" = sm."retreatId" AND mt."type" = sm."templateType"
				 LIMIT 1)                        AS "templateId",
				(SELECT mt."name" FROM "message_templates" mt
				 WHERE mt."retreatId" = sm."retreatId" AND mt."type" = sm."templateType"
				 LIMIT 1)                        AS "templateName"
			FROM "scheduled_messages" sm
			WHERE sm."channel" = 'whatsapp' AND sm."status" = 'sent'
				AND NOT EXISTS (
					SELECT 1 FROM "participant_communications" pc
					WHERE pc."participantId" IS sm."participantId"
						AND pc."retreatId" IS sm."retreatId"
						and pc."messageType" = 'whatsapp'
						and pc."sentAt" IS sm."sentAt"
						and pc."messageContent" IS sm."resolvedContent"
				)
		`);

		let inserted = 0;
		let failed = 0;
		for (const sm of candidates) {
			const audience = this.AUDIENCE_BY_TYPE[sm.templateType as string] ?? 'general';
			// Id determinista derivado del propio scheduled_message: una
			// re-corrida choca por PK en vez de duplicar (defensa extra al
			// NOT EXISTS de arriba).
			const id = 'wa' + String(sm.smId).replace(/-/g, '');
			try {
				await queryRunner.query(
					`INSERT INTO "participant_communications"
					 ("id", "participantId", "scope", "retreatId", "messageType",
					  "recipientContact", "recipientContactKey", "recipientName", "audience",
					  "messageContent", "templateId", "templateName", "subject", "sentAt", "sentBy")
					 VALUES (?, ?, 'retreat', ?, 'whatsapp', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
					[
						id,
						sm.participantId,
						sm.retreatId,
						sm.resolvedContact || '',
						`${sm.recipientTarget || 'participant'}:whatsapp`,
						sm.recipientName || null,
						audience,
						sm.resolvedContent || '',
						sm.templateId ?? null,
						sm.templateName ?? null,
						sm.sentAt || sm.updatedAt,
						sm.dispatchedBy ?? dispatcherId,
					],
				);
				inserted++;
			} catch (err) {
				failed++;
				console.error(`[migration ${this.name}] failed to backfill ${id}:`, err);
			}
		}
		console.log(
			`[migration ${this.name}] whatsapp backfill: ${inserted} inserted, ` +
				`${failed} failed, ${candidates.length - inserted - failed} skipped`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Sólo las filas de esta migración (prefijo determinista) y sólo los
		// sentAt exactos que el up() escribió — los despachos legítimos de esa
		// noche (marcados en su momento por la UI) quedan intactos.
		const removed = await queryRunner.query(
			`DELETE FROM "participant_communications" WHERE "id" LIKE 'wa%'`,
		);
		const reverted = await queryRunner.query(
			`UPDATE "scheduled_messages"
			 SET "status" = 'queued', "sentAt" = NULL, "dispatchedBy" = NULL, "updatedAt" = ?
			 WHERE "retreatId" = ? AND "templateType" = ?
				 AND "status" = 'sent' AND "dispatchedBy" = ? AND "sentAt" = ?`,
			[
				this.SENT_AT,
				this.RETREAT_ID,
				this.TEMPLATE_TYPE,
				(
					await queryRunner.query(`SELECT "id" FROM "users" WHERE "email" = ?`, [
						this.DISPATCHER_EMAIL,
					])
				)[0]?.id ?? '',
				this.SENT_AT,
			],
		);
		console.log(
			`[migration ${this.name}] down: removed ${removed} communication(s), ` +
				`reverted ${reverted} reminder(s) to queued`,
		);
	}
}
