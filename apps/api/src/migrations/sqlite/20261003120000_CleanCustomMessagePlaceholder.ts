import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M4: `{custom_message}` no es una variable del motor — es un hueco que el
 * flujo manual rellena al enviar. La bandeja de WhatsApp no tiene paso de
 * edición, así que una secuencia que lo usa despacha el placeholder LITERAL
 * (el mensaje enviado el 2026-10-01 con "{custom_message}" a un participante
 * real). Esta migración limpia el dato existente; el guard en
 * messageSequenceService impide que un placeholder nuevo vuelva a despacharse.
 *
 * Alcance: TODAS las plantillas con el placeholder, sin filtrar por type.
 * Hoy solo lo tienen las GENERAL "Mensaje General" (7 retreat + 2 community),
 * pero el incidente fue una SERVER_SHIRT_CONFIRMATION — filtrar por type
 * dejaría el hueco abierto.
 *
 * La frase neutral es un marcador a propósito: el guard del motor también la
 * detecta, así una plantilla migrada pero nunca personalizada no se despacha
 * desde una secuencia con la frase literal.
 *
 * down(): replace inverso. Plantillas editadas a mano tras el up() (la frase
 * ya no está) quedan como estén — no se restauran las ediciones del usuario.
 */
export class CleanCustomMessagePlaceholder20261003120000 implements MigrationInterface {
	name = 'CleanCustomMessagePlaceholder20261003120000';
	timestamp = '20261003120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`UPDATE message_templates
			 SET message = replace(message, '{custom_message}', '«Escribe aquí tu mensaje personalizado»')
			 WHERE message LIKE '%{custom_message}%'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`UPDATE message_templates
			 SET message = replace(message, '«Escribe aquí tu mensaje personalizado»', '{custom_message}')
			 WHERE message LIKE '%«Escribe aquí tu mensaje personalizado»%'`,
		);
	}
}
