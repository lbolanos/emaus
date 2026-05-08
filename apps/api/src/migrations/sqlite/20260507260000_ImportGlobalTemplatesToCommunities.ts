import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Importa todas las plantillas globales activas no-SYS_ a cada comunidad
 * existente que aún no tenga una plantilla del mismo `type` con
 * `scope='community'`. La idempotencia la garantiza un `NOT EXISTS` —
 * correr la migration dos veces no duplica.
 *
 * Por qué es necesaria:
 *   - El bug de AddPublicRegistrationToCommunity20260507120000 borró las
 *     plantillas community-scope que se hubieran creado antes (cascade
 *     desde DROP TABLE community).
 *   - Cuando se restauran las communities, las plantillas no se
 *     re-importan automáticamente. Esta migration lo cubre como
 *     bootstrap.
 *
 * Equivalente a hacer click en "Importar Plantillas" → "Globales" →
 * "Seleccionar todas" → "Importar" para cada comunidad, pero ejecutado
 * de forma idempotente y atómica al desplegar.
 *
 * No requiere `transaction = false` porque solo hace INSERTs sobre una
 * tabla existente — no recrea esquema. Sigue siendo seguro dentro de la
 * transacción que TypeORM abre por defecto.
 */
export class ImportGlobalTemplatesToCommunities20260507260000 implements MigrationInterface {
	name = 'ImportGlobalTemplatesToCommunities20260507260000';
	timestamp = '20260507260000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const result = await queryRunner.query(`
			INSERT INTO message_templates (id, name, type, scope, message, communityId, retreatId, createdAt, updatedAt)
			SELECT
				printf('%s-%s-%s-%s-%s',
					substr(lower(hex(randomblob(16))), 1, 8),
					substr(lower(hex(randomblob(16))), 1, 4),
					substr(lower(hex(randomblob(16))), 1, 4),
					substr(lower(hex(randomblob(16))), 1, 4),
					substr(lower(hex(randomblob(16))), 1, 12)
				),
				gmt.name, gmt.type, 'community', gmt.message,
				c.id, NULL, datetime('now'), datetime('now')
			FROM community c
			CROSS JOIN global_message_templates gmt
			WHERE gmt.isActive = 1
			  AND gmt.type NOT LIKE 'SYS_%'
			  AND NOT EXISTS (
				  SELECT 1 FROM message_templates mt
				  WHERE mt.communityId = c.id
				    AND mt.scope = 'community'
				    AND mt.type = gmt.type
			  )
		`);

		const inserted = await queryRunner.query(`SELECT changes() AS n`);
		console.log(
			`[ImportGlobalTemplatesToCommunities] ${inserted[0]?.n ?? 0} plantillas community-scope importadas.`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Borra solo las plantillas community-scope cuyo type/message
		// coincide con un global activo Y el name coincide con el del global.
		// Esto evita borrar plantillas que el usuario haya editado o creado
		// manualmente con el mismo type. Si quieres deshacer todo, hazlo
		// manualmente.
		await queryRunner.query(`
			DELETE FROM message_templates
			WHERE scope = 'community'
			  AND id IN (
				  SELECT mt.id FROM message_templates mt
				  JOIN global_message_templates gmt
				    ON gmt.type = mt.type
				    AND gmt.name = mt.name
				    AND gmt.message = mt.message
				  WHERE mt.scope = 'community' AND gmt.isActive = 1
			  )
		`);
	}
}
