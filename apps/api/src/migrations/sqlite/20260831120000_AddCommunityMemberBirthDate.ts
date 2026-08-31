import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cumpleaños de miembros de comunidad.
 *
 * 1. `community_member.birthDate` — columna de texto nullable con el cumpleaños
 *    capturado por la comunidad. Formato 'YYYY-MM-DD' o 'MM-DD' (año opcional:
 *    mucha gente da día y mes nada más). Texto y no `date` porque el año
 *    opcional no cabe en un tipo fecha, y un 'MM-DD' plano no puede
 *    desfasarse un día al cruzar zonas horarias.
 *
 * 2. Plantilla global `BIRTHDAY_MESSAGE` con `scope = 'community'`, que es la
 *    que precarga el diálogo de mensaje desde el panel "Cumplen pronto".
 *    El tipo ya existía para retiros; faltaba la variante de comunidad.
 *
 * Solo ADD COLUMN + INSERT: sin recreate-table, sin DROP, sin PRAGMA. Las
 * plantillas de comunidad usan el formato `{scope.var}` que dejó el rewrite de
 * 20260518200000, no el `{{var}}` del seed original.
 *
 * Idempotente en ambas partes.
 */
export class AddCommunityMemberBirthDate20260831120000 implements MigrationInterface {
	name = 'AddCommunityMemberBirthDate20260831120000';
	timestamp = '20260831120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const columns = await queryRunner.query(`PRAGMA table_info("community_member")`);
		const hasBirthDate = columns.some((c: { name: string }) => c.name === 'birthDate');
		if (!hasBirthDate) {
			await queryRunner.query(`ALTER TABLE "community_member" ADD COLUMN "birthDate" VARCHAR(10)`);
		}

		const existing = await queryRunner.query(
			`SELECT id FROM message_templates WHERE type = 'BIRTHDAY_MESSAGE' AND scope = 'community' AND communityId IS NULL`,
		);
		if (existing.length === 0) {
			const { randomUUID } = await import('crypto');
			const message = `¡Feliz cumpleaños, {participant.firstName}! 🎉

De parte de todo el grupo de {community.name}, te deseamos un día muy feliz. Que Dios te bendiga y te siga acompañando este año.

Un abrazo grande.`;
			await queryRunner.query(
				`INSERT INTO message_templates (id, name, type, scope, message, retreatId, communityId, createdAt, updatedAt)
				 VALUES (?, ?, 'BIRTHDAY_MESSAGE', 'community', ?, NULL, NULL, datetime('now'), datetime('now'))`,
				[randomUUID(), 'Felicitación de cumpleaños', message],
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DELETE FROM message_templates WHERE type = 'BIRTHDAY_MESSAGE' AND scope = 'community' AND communityId IS NULL`,
		);
		// SQLite >= 3.35 soporta DROP COLUMN nativo; no hace falta recreate.
		await queryRunner.query(`ALTER TABLE "community_member" DROP COLUMN "birthDate"`);
	}
}
