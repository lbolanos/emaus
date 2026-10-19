import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the documents block ({assignments.documentsRoster}) to the
 * SERVER_ASSIGNMENTS_BRIEFING template (specs/assignment-documents, D6).
 *
 * Only rows whose `message` is still exactly the seed of
 * 20261015130000_AddServerAssignmentsBriefingTemplate are updated, global and
 * per retreat: a template someone edited keeps its text. WhatsApp plain text
 * (\n + *bold*), as every WhatsApp template since 20260914.
 *
 * Data only → normal transaction. Idempotent: a second run finds no row with
 * the old seed.
 */
export class AddDocumentsToServerAssignmentsBriefing20261019130000 implements MigrationInterface {
	name = 'AddDocumentsToServerAssignmentsBriefing20261019130000';
	timestamp = '20261019130000';

	private static readonly TEMPLATE_TYPE = 'SERVER_ASSIGNMENTS_BRIEFING';

	// Exact seed of 20261015130000_AddServerAssignmentsBriefingTemplate.
	static readonly OLD_MESSAGE = `Hola {participant.firstName}, estas son tus tareas para el retiro de Emaús de {retreat.parish} 📋

*Tus responsabilidades ({assignments.responsibilitiesCount}):*
{assignments.responsibilitiesRoster}

*Tus equipos de servicio ({assignments.teamsCount}):*
{assignments.teamsRoster}

Cualquier duda, responde a este mensaje. ¡Gracias por tu servicio! 🙏`;

	static readonly NEW_MESSAGE = `Hola {participant.firstName}, estas son tus tareas para el retiro de Emaús de {retreat.parish} 📋

*Tus responsabilidades ({assignments.responsibilitiesCount}):*
{assignments.responsibilitiesRoster}

*Tus equipos de servicio ({assignments.teamsCount}):*
{assignments.teamsRoster}

*Tus documentos ({assignments.documentsCount}):*
{assignments.documentsRoster}

Cualquier duda, responde a este mensaje. ¡Gracias por tu servicio! 🙏`;

	public async up(queryRunner: QueryRunner): Promise<void> {
		await this.replaceMessage(
			queryRunner,
			AddDocumentsToServerAssignmentsBriefing20261019130000.OLD_MESSAGE,
			AddDocumentsToServerAssignmentsBriefing20261019130000.NEW_MESSAGE,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await this.replaceMessage(
			queryRunner,
			AddDocumentsToServerAssignmentsBriefing20261019130000.NEW_MESSAGE,
			AddDocumentsToServerAssignmentsBriefing20261019130000.OLD_MESSAGE,
		);
	}

	private async replaceMessage(queryRunner: QueryRunner, from: string, to: string): Promise<void> {
		const type = AddDocumentsToServerAssignmentsBriefing20261019130000.TEMPLATE_TYPE;
		for (const table of ['global_message_templates', 'message_templates']) {
			await queryRunner.query(`UPDATE "${table}" SET "message" = ? WHERE "type" = ? AND "message" = ?`, [
				to,
				type,
				from,
			]);
		}
	}
}
