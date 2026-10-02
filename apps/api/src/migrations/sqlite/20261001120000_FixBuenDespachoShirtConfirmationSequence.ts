import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cirugía de la secuencia "Ultimo Prendas" del retiro Buen Despacho
 * (16-18 oct 2026), creada el 2026-10-01 con dos problemas:
 *
 *   1. La plantilla elegida ("Reconfirmar Prendas", tipo
 *      SERVER_SHIRT_CONFIRMATION) colisionaba con la vieja "Confirmación
 *      de prendas" del mismo tipo: el motor resuelve la PRIMERA fila de
 *      (retreatId, type) y los pasos persisten templateType, así que los
 *      28 mensajes encolados salían contra la plantilla vieja (que además
 *      contiene el placeholder {custom_message}, despachado literal —
 *      ver el mensaje ya enviado). Decisión cerrada: se borra la VIEJA y
 *      la nueva queda como única del tipo.
 *   2. El paso quedó a offsetDays 20 con el retiro a 15 días → fecha en
 *      pasado → enrolamiento retroactivo masivo (28 queued vencidos).
 *      Se corrige a 5 días antes (11 oct) y la secuencia queda PAUSADA:
 *      Leonardo la revisa y la activa desde el editor.
 *
 * La purga borra SOLO las 28 filas queued; el envío ya hecho (despachado
 * a mano) NO se toca — decisión cerrada: la UQ (stepId, participantId,
 * occurrenceYear) deja a ese participante fuera del re-enrol, y si el
 * equipo quiere reenviarle es envío manual.
 *
 * Migración de datos puntual (ids estables de prod; dev es copia). Sin
 * @repo/types: solo typeorm + literales. Cada paso es idempotente para
 * converger si un arranque a medias la re-ejecuta.
 */
export class FixBuenDespachoShirtConfirmationSequence20261001120000 implements MigrationInterface {
	name = 'FixBuenDespachoShirtConfirmationSequence20261001120000';
	timestamp = '20261001120000';

	// Secuencia "Ultimo Prendas" del retiro Buen Despacho (e9b3c568-…).
	private static readonly SEQUENCE_ID = 'a41ad6fb-5e64-42d7-9b5f-7c5004c9c0b2';

	// Plantilla VIEJA "Confirmación de prendas" (13-sep) — la que el motor
	// resolvía por ser la primera fila del tipo. Se borra.
	private static readonly OLD_TEMPLATE_ID = '74d8e87b-8455-4187-8941-0b17f8911545';

	// Paso único de la secuencia: 20 días (pasado) → 5 días antes (11 oct).
	private static readonly STEP_ID = '734196da-f22d-4fb3-a3f0-72bbf812dbee';
	private static readonly NEW_OFFSET_DAYS = 5;
	private static readonly OLD_OFFSET_DAYS = 20;

	public async up(queryRunner: QueryRunner): Promise<void> {
		const seq = FixBuenDespachoShirtConfirmationSequence20261001120000.SEQUENCE_ID;

		// 1) Pausar PRIMERO: que ningún ciclo del cron re-enrole a mitad de
		// la cirugía (con la plantilla vieja aún viva y el offset roto).
		await queryRunner.query(
			`UPDATE message_sequences SET isActive = 0, updatedAt = datetime('now') WHERE id = ?`,
			[seq],
		);

		// 2) Purgar solo las queued (los 28 vencidos). El sent de Marco
		// queda: status 'sent' no matchea. participant_communications no
		// tiene FK a message_templates, y scheduled_messages guarda el tipo
		// como columna plana — sin efecto cascada.
		await queryRunner.query(
			`DELETE FROM scheduled_messages WHERE sequenceId = ? AND status = 'queued'`,
			[seq],
		);

		// 3) Borrar la plantilla vieja: la nueva "Reconfirmar Prendas"
		// (62fec9ab-…) queda como única SERVER_SHIRT_CONFIRMATION y pasa a
		// ser la que el motor resuelve.
		await queryRunner.query(
			`DELETE FROM message_templates WHERE id = ?`,
			[FixBuenDespachoShirtConfirmationSequence20261001120000.OLD_TEMPLATE_ID],
		);

		// 4) offsetDays 20 → 5 (11 oct, 5 días antes del retiro). Condicionado
		// al valor viejo: idempotente y no pisa un ajuste manual posterior.
		await queryRunner.query(
			`UPDATE sequence_steps
			 SET offsetDays = ?, updatedAt = datetime('now')
			 WHERE id = ? AND offsetDays = ?`,
			[
				FixBuenDespachoShirtConfirmationSequence20261001120000.NEW_OFFSET_DAYS,
				FixBuenDespachoShirtConfirmationSequence20261001120000.STEP_ID,
				FixBuenDespachoShirtConfirmationSequence20261001120000.OLD_OFFSET_DAYS,
			],
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Solo revierte el estado editable. Las 28 filas purgadas y la
		// plantilla vieja NO se restauran (no hay de dónde: el mensaje ya
		// salió con {custom_message} literal y re-encolarlas reenviaría
		// texto roto). Reactivar con offsetDays 20 reconstruiría el
		// enrolamiento retroactivo — down() queda como documentación;
		// migration:revert no se usa en este proyecto.
		await queryRunner.query(
			`UPDATE sequence_steps
			 SET offsetDays = ?, updatedAt = datetime('now')
			 WHERE id = ?`,
			[
				FixBuenDespachoShirtConfirmationSequence20261001120000.OLD_OFFSET_DAYS,
				FixBuenDespachoShirtConfirmationSequence20261001120000.STEP_ID,
			],
		);
		await queryRunner.query(
			`UPDATE message_sequences SET isActive = 1, updatedAt = datetime('now') WHERE id = ?`,
			[FixBuenDespachoShirtConfirmationSequence20261001120000.SEQUENCE_ID],
		);
	}
}
