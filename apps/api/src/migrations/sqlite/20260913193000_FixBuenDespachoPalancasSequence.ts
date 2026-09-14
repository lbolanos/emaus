import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrige la secuencia "Palancas" del retiro Buen Despacho (oct 2026) para
 * que quede lista tras el nuevo tipo PALANCA_DEFINITION (ver migración
 * 20260913190000).
 *
 * La secuencia la armó el equipo de palancas con dos problemas:
 *
 *   1. Todos los pasos tenían "Enviar a: Participante" — la solicitud de
 *      palancas le llegaría al propio caminante y arruinaría la sorpresa
 *      (regla dura de la organización). Van al contacto de emergencia 1.
 *   2. Faltaba el paso intermedio de "Definición de Palanca": se intercala
 *      a 18 días antes del retiro, entre el contacto inicial (24) y el
 *      primer recordatorio (14), con el mismo destinatario/canal/hora.
 *
 * La secuencia queda PAUSADA (isActive = 0, como estaba): el equipo la
 * revisa y la activa desde el editor. Nada encolado aún, así que voltear
 * destinatarios no tiene efecto retroactivo.
 *
 * Migración de datos puntual (secuencia por id de prod, estable entre
 * entornos — la dev es copia). Sin @repo/types: solo typeorm + literales.
 */
export class FixBuenDespachoPalancasSequence20260913193000 implements MigrationInterface {
	name = 'FixBuenDespachoPalancasSequence20260913193000';
	timestamp = '20260913193000';

	// Secuencia "Palancas" del retiro Buen Despacho (e9b3c568-…).
	private static readonly SEQUENCE_ID = 'e27b0940-5f99-4921-9de4-ed8a1d53ba03';

	// Paso nuevo: Definición a 18 días, en posición 2 (entre contacto y
	// recordatorios). Mismo canal/hora que el resto de la secuencia.
	private static readonly DEFINITION_OFFSET_DAYS = 18;
	private static readonly DEFINITION_STEP_ORDER = 2;

	public async up(queryRunner: QueryRunner): Promise<void> {
		const seq = FixBuenDespachoPalancasSequence20260913193000.SEQUENCE_ID;

		// Idempotente por presencia: si el paso de definición ya existe
		// (re-ejecución tras un reinicio a medias), no re-insertar.
		const existing = await queryRunner.query(
			`SELECT COUNT(*) AS c FROM sequence_steps
			 WHERE sequenceId = ? AND templateType = 'PALANCA_DEFINITION'`,
			[seq],
		);
		const hasDefinition = Number(existing?.[0]?.c ?? 0) > 0;

		if (!hasDefinition) {
			await queryRunner.query(
				`INSERT INTO sequence_steps
					(id, sequenceId, stepOrder, offsetDays, sendHour, templateType, channel,
					 recipientTarget, recipientResponsibility, condition, isArchived, createdAt, updatedAt)
				VALUES (
					printf('%s-%s-%s-%s-%s',
						substr(lower(hex(randomblob(16))), 1, 8),
						substr(lower(hex(randomblob(16))), 1, 4),
						substr(lower(hex(randomblob(16))), 1, 4),
						substr(lower(hex(randomblob(16))), 1, 4),
						substr(lower(hex(randomblob(16))), 1, 12)
					),
					?, 0, ?, 9, 'PALANCA_DEFINITION', 'whatsapp',
					'emergencyContact1', NULL, NULL, 0, datetime('now'), datetime('now')
				)`,
				[seq, FixBuenDespachoPalancasSequence20260913193000.DEFINITION_OFFSET_DAYS],
			);
		}

		// Destinatario correcto en todos los pasos de palanca: el contacto de
		// emergencia 1, nunca el participante (la palanca es sorpresa).
		await queryRunner.query(
			`UPDATE sequence_steps
			 SET recipientTarget = 'emergencyContact1', updatedAt = datetime('now')
			 WHERE sequenceId = ?
				AND templateType IN ('PALANCA_REQUEST', 'PALANCA_REMINDER', 'PALANCA_DEFINITION')
				AND isArchived = 0`,
			[seq],
		);

		// Renumeración CANÓNICA: stepOrder = posición cronológica por
		// offsetDays descendente. Convergente ante re-ejecución — si un
		// intento anterior murió a mitad de un renumber incremental, este
		// paso re-deriva la numeración completa y elimina huecos/duplicados.
		// (offsetDays no se modifica, así que la subquery correlacionada es
		// estable sin importar el orden de evaluación de las filas.)
		await queryRunner.query(
			`UPDATE sequence_steps AS ss
			 SET stepOrder = (
					SELECT COUNT(*) FROM sequence_steps s2
					WHERE s2.sequenceId = ss.sequenceId AND s2.offsetDays > ss.offsetDays
				),
			 	 updatedAt = datetime('now')
			 WHERE ss.sequenceId = ?`,
			[seq],
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const seq = FixBuenDespachoPalancasSequence20260913193000.SEQUENCE_ID;

		// Quitar el paso intermedio y re-derivar la numeración sin él.
		await queryRunner.query(
			`DELETE FROM sequence_steps WHERE sequenceId = ? AND templateType = 'PALANCA_DEFINITION'`,
			[seq],
		);
		await queryRunner.query(
			`UPDATE sequence_steps AS ss
			 SET stepOrder = (
					SELECT COUNT(*) FROM sequence_steps s2
					WHERE s2.sequenceId = ss.sequenceId AND s2.offsetDays > ss.offsetDays
				),
			 	 updatedAt = datetime('now')
			 WHERE ss.sequenceId = ?`,
			[seq],
		);

		// Volver los pasos de palanca al participante (estado original).
		await queryRunner.query(
			`UPDATE sequence_steps
			 SET recipientTarget = 'participant', updatedAt = datetime('now')
			 WHERE sequenceId = ?
				AND templateType IN ('PALANCA_REQUEST', 'PALANCA_REMINDER')
				AND isArchived = 0`,
			[seq],
		);
	}
}
