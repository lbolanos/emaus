import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Normaliza el formato TEXT de las fechas usadas en ORDER BY / comparaciones.
 *
 * `participant_communications.sentAt` y `scheduled_messages.sentAt/updatedAt`
 * conviven en dos formatos desde el backfill 20260913120000:
 *   - 'YYYY-MM-DD HH:MM:SS[.SSS]' — lo que escriben TypeORM/CURRENT_TIMESTAMP
 *   - 'YYYY-MM-DDTHH:MM:SS.sssZ'  — ISO-Z que escribió ese backfill
 *
 * SQLite compara TEXT lexicográficamente y ' ' (0x20) < 'T' (0x54): en un mismo
 * día TODAS las filas ISO quedan después de todas las naive, sin importar la
 * hora. Consecuencias observadas (2026-09-12): el historial del participante
 * (`ORDER BY sentAt DESC` en participantCommunicationController y
 * messageSequenceService.getQueueItemDetail) salía con el envío más reciente en
 * medio de la lista, y `pc.sentAt >= datetime('now', ?)` en communityService
 * compara contra el formato equivocado.
 *
 * El fix reformatea las filas ISO al formato naive que escribe el runtime.
 * Prod corre en Etc/UTC (pm2 no define TZ — skill infra-remota) y las naive
 * existentes son UTC, así que `strftime` re-renderiza el MISMO instante: no se
 * mueve ningún timestamp, solo cambia su representación. Data-only, sin schema
 * ni FKs.
 *
 * Idempotente: el GLOB solo matchea filas ISO; una re-corrida encuentra 0
 * (necesario con MIGRATIONS_AUTO_RUN=true, que aplica al primer guardado).
 * Debe correr DESPUÉS de 20260913120000 (timestamp mayor) para que en prod
 * normalice las filas que ese backfill inserte en el mismo deploy.
 *
 * Sin @repo/types (regla dura de migraciones de prod).
 */
export class NormalizeSentAtTextFormat20260913130000 implements MigrationInterface {
	name = 'NormalizeSentAtTextFormat20260913130000';
	timestamp = '20260913130000';

	// Solo el formato ISO ('YYYY-MM-DDT…'); el naive ('YYYY-MM-DD HH:MM:SS')
	// jamás contiene 'T'. GLOB —no LIKE— para anclar el patrón completo.
	private static readonly ISO_GLOB = '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const pc = await queryRunner.query(
			`UPDATE "participant_communications"
			 SET "sentAt" = strftime('%Y-%m-%d %H:%M:%f', "sentAt")
			 WHERE "sentAt" GLOB ?`,
			[NormalizeSentAtTextFormat20260913130000.ISO_GLOB],
		);
		const smSentAt = await queryRunner.query(
			`UPDATE "scheduled_messages"
			 SET "sentAt" = strftime('%Y-%m-%d %H:%M:%f', "sentAt")
			 WHERE "sentAt" GLOB ?`,
			[NormalizeSentAtTextFormat20260913130000.ISO_GLOB],
		);
		const smUpdatedAt = await queryRunner.query(
			`UPDATE "scheduled_messages"
			 SET "updatedAt" = strftime('%Y-%m-%d %H:%M:%f', "updatedAt")
			 WHERE "updatedAt" GLOB ?`,
			[NormalizeSentAtTextFormat20260913130000.ISO_GLOB],
		);
		console.log(
			`[migration ${this.name}] normalized to naive format: ` +
				`${pc} participant_communications.sentAt, ` +
				`${smSentAt} scheduled_messages.sentAt, ` +
				`${smUpdatedAt} scheduled_messages.updatedAt`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Inversa best-effort: up() es genérico (cualquier fila ISO), pero la
		// única población ISO que existió provino del backfill 20260913120000
		// — sus filas pc tienen id determinista 'wa%' + el sentAt exacto de la
		// reparación, y sus filas sm el retiro/plantilla de ese incidente.
		// Reconstituye el formato ISO de exactamente esas filas; el resto de
		// los 'wa%' ya eran naive ANTES de up() (el backfill copió sentAt
		// preexistentes) y no se tocan.
		const REPAIR_SENT_AT_NAIVE = '2026-09-13 03:21:25.000';
		const REPAIR_ISO = '2026-09-13T03:21:25.000Z';
		const RETREAT_ID = 'e9b3c568-050a-4d66-a99d-305f287a59df';
		const TEMPLATE_TYPE = 'SERVER_SHIRT_CONFIRMATION_REMINDER';

		const pc = await queryRunner.query(
			`UPDATE "participant_communications"
			 SET "sentAt" = ?
			 WHERE "id" LIKE 'wa%' AND "sentAt" = ?`,
			[REPAIR_ISO, REPAIR_SENT_AT_NAIVE],
		);
		const sm = await queryRunner.query(
			`UPDATE "scheduled_messages"
			 SET "sentAt" = ?, "updatedAt" = ?
			 WHERE "retreatId" = ? AND "templateType" = ? AND "sentAt" = ?`,
			[REPAIR_ISO, REPAIR_ISO, RETREAT_ID, TEMPLATE_TYPE, REPAIR_SENT_AT_NAIVE],
		);
		console.log(
			`[migration ${this.name}] down: re-ISO ${pc} communication(s), ${sm} scheduled_message(s)`,
		);
	}
}
