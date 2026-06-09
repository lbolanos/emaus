import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Las plantillas de palanca (PALANCA_REQUEST / PALANCA_REMINDER) se envían a un
 * familiar/amigo del caminante (el palanquero), pero su saludo usaba
 * `{participant.nickname}` (= el caminante), así que decía "Hola JULIO" al
 * mandarla al contacto. Cambia ese saludo a `{participant.recipientName}`, que
 * se adapta a quien se le envía (caminante / contacto de emergencia / invitador).
 *
 * Conservador: solo toca filas que aún usan `{participant.nickname}`, dejando
 * intactas las variantes ya customizadas por retiros (p. ej. las que ya usan
 * `{participant.emergencyContactName}`). El cuerpo de estas plantillas no nombra
 * al caminante, así que el único `{participant.nickname}` es el saludo.
 */
export class PalancaGreetingRecipientName20260609140000 implements MigrationInterface {
	name = 'PalancaGreetingRecipientName20260609140000';
	timestamp = '20260609140000';

	private static readonly TYPES = "('PALANCA_REQUEST','PALANCA_REMINDER')";

	public async up(queryRunner: QueryRunner): Promise<void> {
		const C = PalancaGreetingRecipientName20260609140000;
		for (const table of ['global_message_templates', 'message_templates']) {
			await queryRunner.query(`
				UPDATE "${table}"
				SET message = REPLACE(message, '{participant.nickname}', '{participant.recipientName}')
				WHERE type IN ${C.TYPES} AND message LIKE '%{participant.nickname}%'
			`);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const C = PalancaGreetingRecipientName20260609140000;
		for (const table of ['global_message_templates', 'message_templates']) {
			await queryRunner.query(`
				UPDATE "${table}"
				SET message = REPLACE(message, '{participant.recipientName}', '{participant.nickname}')
				WHERE type IN ${C.TYPES} AND message LIKE '%{participant.recipientName}%'
			`);
		}
	}
}
