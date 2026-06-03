import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { defaultServiceTeams } from '../../data/dynamicsTemplates.js';

/**
 * Backfill de equipos de servicio faltantes para todos los retiros existentes.
 *
 * San Agustín (y otros retiros) tenían responsabilidades sin equipo pareja:
 *   - `Sacerdotes`  → ServiceTeamType.SACERDOTES (nuevo tipo, sincroniza líder ↔ responsabilidad)
 *   - `Compras`     → ServiceTeamType.COMPRAS    (ya mapeado en leaderSyncService, faltaba el equipo)
 * Además se agrega la dinámica `Examen de Conciencia / Quema de Pecados`, presente
 * en otros retiros pero ausente del template hasta ahora.
 *
 * Para Sacerdotes/Compras, si la responsabilidad pareja ya tiene un participante
 * asignado, se propaga al `leaderId` del equipo y se crea el miembro líder
 * (reproduce el efecto de `syncResponsibilityToTeam` sobre el estado existente).
 *
 * Idempotente: cada equipo se inserta solo si no existe (retreatId + name).
 * Sin DDL → no requiere `transaction = false`.
 */

// Equipos a sembrar: tomados del template canónico para no duplicar instrucciones.
const NEW_TEAM_NAMES = ['Sacerdotes', 'Compras', 'Examen de Conciencia / Quema de Pecados'];

// Equipos cuyo líder se sincroniza desde la responsabilidad homónima.
const LEADER_SYNC_TEAMS = ['Sacerdotes', 'Compras'];

export class AddMissingServiceTeams20260603120000 implements MigrationInterface {
	name = 'AddMissingServiceTeams20260603120000';
	timestamp = '20260603120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const newTeams = defaultServiceTeams.filter((t) => NEW_TEAM_NAMES.includes(t.name));

		const retreats: { id: string }[] = await queryRunner.query(`SELECT id FROM "retreat"`);

		for (const retreat of retreats) {
			for (const team of newTeams) {
				const existing = await queryRunner.query(
					`SELECT id FROM "service_teams" WHERE "retreatId" = ? AND "name" = ?`,
					[retreat.id, team.name],
				);
				if (existing.length > 0) continue;

				const teamId = uuidv4();
				await queryRunner.query(
					`INSERT INTO "service_teams" ("id", "name", "teamType", "description", "instructions", "retreatId", "priority", "isActive")
					 VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
					[teamId, team.name, team.teamType, team.description || null, team.instructions || null, retreat.id, team.priority],
				);

				// Backfill del líder desde la responsabilidad pareja (si ya tiene participante).
				if (LEADER_SYNC_TEAMS.includes(team.name)) {
					const resp: { participantId: string | null }[] = await queryRunner.query(
						`SELECT "participantId" FROM "retreat_responsibilities"
						 WHERE "retreatId" = ? AND "name" = ? AND "participantId" IS NOT NULL`,
						[retreat.id, team.name],
					);
					const participantId = resp[0]?.participantId;
					if (participantId) {
						await queryRunner.query(`UPDATE "service_teams" SET "leaderId" = ? WHERE "id" = ?`, [
							participantId,
							teamId,
						]);
						await queryRunner.query(
							`INSERT INTO "service_team_members" ("id", "serviceTeamId", "participantId", "role")
							 SELECT ?, ?, ?, 'líder'
							 WHERE NOT EXISTS (
								 SELECT 1 FROM "service_team_members" WHERE "serviceTeamId" = ? AND "participantId" = ?
							 )`,
							[uuidv4(), teamId, participantId, teamId, participantId],
						);
					}
				}
			}
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const placeholders = NEW_TEAM_NAMES.map(() => '?').join(', ');
		// Borrar primero los miembros de esos equipos, luego los equipos.
		await queryRunner.query(
			`DELETE FROM "service_team_members"
			 WHERE "serviceTeamId" IN (SELECT "id" FROM "service_teams" WHERE "name" IN (${placeholders}))`,
			NEW_TEAM_NAMES,
		);
		await queryRunner.query(`DELETE FROM "service_teams" WHERE "name" IN (${placeholders})`, NEW_TEAM_NAMES);
	}
}
