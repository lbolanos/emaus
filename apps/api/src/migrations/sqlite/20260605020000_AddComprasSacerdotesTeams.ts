import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Inserta los equipos de servicio "Compras" y "Sacerdotes" en todos los retiros.
 *
 * Reemplazo PARA PRODUCCIÓN de AddMissingServiceTeams: aquella importa @repo/types
 * (enum ServiceTeamType) vía dynamicsTemplates, y el loader de migraciones de prod no
 * puede cargar @repo/types como .ts ("Unknown file extension .ts for packages/types/
 * src/index.ts") → quedaba pending y los equipos faltaban en prod. Esta versión embebe
 * los valores literales (teamType como string) y NO importa @repo/types: se aplica limpio
 * por el CI/CD, igual que AssignSanAgustinTables. Incidente 2026-06-04.
 *
 * Idempotente: cada equipo se inserta sólo si no existe (retreatId + name).
 * Backfill del líder desde la responsabilidad homónima (replica syncResponsibilityToTeam).
 * Sin DDL → no requiere transaction = false.
 */

const NEW_TEAMS: Array<{ name: string; teamType: string; description: string | null; instructions: string | null; priority: number }> = [
  {
    "name": "Compras",
    "teamType": "compras",
    "description": "Aprovisionamiento y compras de materiales e insumos del retiro",
    "instructions": "## Equipo de Compras\n\n### Propósito\nAsegurar que todos los insumos y materiales necesarios para el retiro estén comprados y disponibles a tiempo, cuidando el presupuesto.\n\n### Responsabilidades\n- Consolidar las listas de compras de todos los equipos (cocina, snacks, dinámicas, liturgia, etc.)\n- Cotizar y comprar los insumos respetando el **presupuesto** asignado\n- Coordinar la entrega de lo comprado a cada equipo responsable\n- Llevar el control de **gastos y comprobantes** (coordinar con Tesorería)\n- Atender compras de último momento durante el retiro\n\n### Coordinación\n- Recibir con anticipación las listas de cada equipo (especialmente **Cocina/Comedor** y **Snacks**)\n- Coordinar con **Transporte** la recolección y traslado de las compras\n- Reportar gastos a **Tesorero**\n\n\n---\n*Las instrucciones detalladas paso a paso deben seguirse del Manual oficial de Emaús de su parroquia/diócesis. Consulte con el Rector del retiro.*",
    "priority": 26
  },
  {
    "name": "Sacerdotes",
    "teamType": "sacerdotes",
    "description": "Coordinación de los sacerdotes y la atención sacramental del retiro",
    "instructions": "## Equipo de Sacerdotes\n\n### Propósito\nCoordinar la presencia y participación de los sacerdotes a lo largo del retiro para asegurar la atención sacramental y litúrgica de caminantes y servidores.\n\n### Responsabilidades\n- Confirmar con anticipación qué sacerdote(s) acompañarán el retiro y sus horarios de llegada/salida\n- Coordinar los horarios de **confesiones** (especialmente tras la dinámica del Examen de Conciencia / Quema de Pecados)\n- Coordinar la **celebración de las Santas Misas** (incluida la Misa de Clausura)\n- Coordinar la **bendición de los alimentos** cuando el sacerdote esté presente\n- Apoyar en la **imposición de la ceniza** durante la dinámica que lo requiera\n- Asegurar que el sacerdote tenga todo lo necesario para la liturgia (coordinar con el equipo de Liturgia)\n- Atender el hospedaje, traslado y alimentación de los sacerdotes invitados\n\n### Coordinación\n- Trabajar en estrecha relación con el equipo de **Liturgia** (preparación de eucaristía y lecturas)\n- Confirmar tiempos exactos con **Logística** dentro del minuto-a-minuto del retiro\n\n\n---\n*Las instrucciones detalladas paso a paso deben seguirse del Manual oficial de Emaús de su parroquia/diócesis. Consulte con el Rector del retiro.*",
    "priority": 25
  }
];

export class AddComprasSacerdotesTeams20260605020000 implements MigrationInterface {
	name = 'AddComprasSacerdotesTeams20260605020000';
	timestamp = '20260605020000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const retreats: { id: string }[] = await queryRunner.query(`SELECT id FROM "retreat"`);
		for (const retreat of retreats) {
			for (const team of NEW_TEAMS) {
				const existing = await queryRunner.query(
					`SELECT id FROM "service_teams" WHERE "retreatId" = ? AND "name" = ?`,
					[retreat.id, team.name],
				);
				if (existing.length > 0) continue;

				const teamId = uuidv4();
				await queryRunner.query(
					`INSERT INTO "service_teams" ("id", "name", "teamType", "description", "instructions", "retreatId", "priority", "isActive")
					 VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
					[teamId, team.name, team.teamType, team.description ?? null, team.instructions ?? null, retreat.id, team.priority],
				);

				const resp: { participantId: string | null }[] = await queryRunner.query(
					`SELECT "participantId" FROM "retreat_responsibilities"
					 WHERE "retreatId" = ? AND "name" = ? AND "participantId" IS NOT NULL`,
					[retreat.id, team.name],
				);
				const participantId = resp[0]?.participantId;
				if (participantId) {
					await queryRunner.query(`UPDATE "service_teams" SET "leaderId" = ? WHERE "id" = ?`, [participantId, teamId]);
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

	public async down(queryRunner: QueryRunner): Promise<void> {
		const names = NEW_TEAMS.map((t) => t.name);
		const placeholders = names.map(() => '?').join(', ');
		await queryRunner.query(
			`DELETE FROM "service_team_members"
			 WHERE "serviceTeamId" IN (SELECT "id" FROM "service_teams" WHERE "name" IN (${placeholders}))`,
			names,
		);
		await queryRunner.query(`DELETE FROM "service_teams" WHERE "name" IN (${placeholders})`, names);
	}
}
