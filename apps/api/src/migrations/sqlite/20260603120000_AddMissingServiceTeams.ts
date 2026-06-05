import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Backfill de equipos de servicio faltantes para todos los retiros existentes:
 *   - Sacerdotes  (sincroniza líder ↔ responsabilidad homónima)
 *   - Compras     (sincroniza líder ↔ responsabilidad homónima)
 *   - Examen de Conciencia / Quema de Pecados
 *
 * NOTA (2026-06-04): originalmente importaba defaultServiceTeams desde
 * dynamicsTemplates, que importa @repo/types (enum ServiceTeamType). En PRODUCCIÓN
 * el loader de migraciones (await import del .ts) no puede resolver @repo/types
 * (apunta a src/index.ts) → "Unknown file extension .ts" → la migración quedaba
 * pending y nunca corría. Se reemplazó por valores LITERALES embebidos (teamType
 * como string, copiados del template) para que NO importe @repo/types y se aplique
 * limpio por el CI/CD, igual que AssignSanAgustinTables. Mismo efecto de datos.
 *
 * Idempotente: cada equipo se inserta sólo si no existe (retreatId + name).
 * Sin DDL → no requiere transaction = false.
 */

const NEW_TEAMS: Array<{ name: string; teamType: string; description: string | null; instructions: string | null; priority: number }> = [
  {
    "name": "Sacerdotes",
    "teamType": "sacerdotes",
    "description": "Coordinación de los sacerdotes y la atención sacramental del retiro",
    "instructions": "## Equipo de Sacerdotes\n\n### Propósito\nCoordinar la presencia y participación de los sacerdotes a lo largo del retiro para asegurar la atención sacramental y litúrgica de caminantes y servidores.\n\n### Responsabilidades\n- Confirmar con anticipación qué sacerdote(s) acompañarán el retiro y sus horarios de llegada/salida\n- Coordinar los horarios de **confesiones** (especialmente tras la dinámica del Examen de Conciencia / Quema de Pecados)\n- Coordinar la **celebración de las Santas Misas** (incluida la Misa de Clausura)\n- Coordinar la **bendición de los alimentos** cuando el sacerdote esté presente\n- Apoyar en la **imposición de la ceniza** durante la dinámica que lo requiera\n- Asegurar que el sacerdote tenga todo lo necesario para la liturgia (coordinar con el equipo de Liturgia)\n- Atender el hospedaje, traslado y alimentación de los sacerdotes invitados\n\n### Coordinación\n- Trabajar en estrecha relación con el equipo de **Liturgia** (preparación de eucaristía y lecturas)\n- Confirmar tiempos exactos con **Logística** dentro del minuto-a-minuto del retiro\n\n\n---\n*Las instrucciones detalladas paso a paso deben seguirse del Manual oficial de Emaús de su parroquia/diócesis. Consulte con el Rector del retiro.*",
    "priority": 25
  },
  {
    "name": "Compras",
    "teamType": "compras",
    "description": "Aprovisionamiento y compras de materiales e insumos del retiro",
    "instructions": "## Equipo de Compras\n\n### Propósito\nAsegurar que todos los insumos y materiales necesarios para el retiro estén comprados y disponibles a tiempo, cuidando el presupuesto.\n\n### Responsabilidades\n- Consolidar las listas de compras de todos los equipos (cocina, snacks, dinámicas, liturgia, etc.)\n- Cotizar y comprar los insumos respetando el **presupuesto** asignado\n- Coordinar la entrega de lo comprado a cada equipo responsable\n- Llevar el control de **gastos y comprobantes** (coordinar con Tesorería)\n- Atender compras de último momento durante el retiro\n\n### Coordinación\n- Recibir con anticipación las listas de cada equipo (especialmente **Cocina/Comedor** y **Snacks**)\n- Coordinar con **Transporte** la recolección y traslado de las compras\n- Reportar gastos a **Tesorero**\n\n\n---\n*Las instrucciones detalladas paso a paso deben seguirse del Manual oficial de Emaús de su parroquia/diócesis. Consulte con el Rector del retiro.*",
    "priority": 26
  },
  {
    "name": "Examen de Conciencia / Quema de Pecados",
    "teamType": "dinamica",
    "description": "Dinámica de examen de conciencia y quema de pecados (Anexo A-2-16)",
    "instructions": "## Examen de Conciencia / Quema de Pecados\n\n### Contexto\nEsta dinámica es el inicio de una serie que incluye la pared y la reconciliación, terminando con la misa del sábado. Muchos caminantes quizás nunca han confesado sus pecados o no se confiesan desde hace mucho tiempo. Se busca que el caminante, en un ambiente de reflexión y en forma individual, haga una introspección profunda sobre sus faltas y escriba sus pecados, para concientizar la necesidad de un cambio profundo en su vida.\n\n### Propósito\n- Guiar a los caminantes en un examen de conciencia personal\n- Invitar a la introspección profunda sobre faltas cometidas y bien omitido hacia Dios, el prójimo y uno mismo\n- Preparar el corazón para el sacramento de la reconciliación\n- Simbolizar la liberación de los pecados mediante la quema de los papeles\n\n### Preparación\n- Preparar hojas de papel y bolígrafos/plumas para cada caminante\n- Conseguir un envase metálico resistente al fuego para la quema\n- Tener aceite y hojas secas para iniciar el fuego\n- Preparar dos vasos de plástico pequeños para la pasta de ceniza\n- Coordinar el espacio exterior seguro para la fogata\n- Tener agua cerca como medida de seguridad contra incendios\n- Preparar música suave y de recogimiento\n\n### Materiales\n- Hojas de papel (una por caminante)\n- Bolígrafos o plumas\n- Envase metálico para quemar los papeles\n- Aceite y hojas secas para el fuego\n- Agua (para mezclar con ceniza y como seguridad)\n- Dos vasos de plástico pequeños\n- Encendedor o fósforos\n- Música de recogimiento preparada\n\n### Desarrollo\n1. Se invita a los caminantes a escribir en silencio todos los pecados que puedan recordar\n2. Se les asegura que **nadie leerá los papeles** — serán quemados\n3. Los caminantes permanecen sentados en silencio hasta que todos terminen\n4. Se organizan en círculo alrededor del envase preparado\n5. Se inicia el fuego con hojas y aceite en el fondo del envase\n6. Cada caminante se acerca a depositar su papel en el fuego\n7. Se entonan canciones suaves mientras se queman los papeles\n8. La ceniza se mezcla con agua/aceite para formar una pasta\n9. Se ordena a los caminantes en dos filas **por edad** (mayor a menor)\n10. Dos servidores colocan una **cruz de ceniza en las manos** de cada caminante diciendo: *\"Estas cenizas representan todos los pecados que escribiste y los que no escribiste, los cuales solo en confesión te serán perdonados por Dios\"*\n11. Se indica a los participantes que pasen al salón de actividades\n\n### Coordinación con Líderes de Mesa\n- Los líderes de mesa deben ser informados para ser los primeros en entrar al salón\n- Deben sentarse en los últimos asientos para facilitar el vendaje de los caminantes\n- Los servidores NO serán vendados (para la dinámica siguiente de la Pared)\n\n### ⚠️ Confidencialidad\n**No divulgar los detalles de esta dinámica a los caminantes antes del retiro.** La experiencia de escribir y quemar los pecados debe ser completamente espontánea.\n\n\n---\n*Las instrucciones detalladas paso a paso deben seguirse del Manual oficial de Emaús de su parroquia/diócesis. Consulte con el Rector del retiro.*",
    "priority": 27
  }
];

const LEADER_SYNC_TEAMS = ['Sacerdotes', 'Compras'];

export class AddMissingServiceTeams20260603120000 implements MigrationInterface {
	name = 'AddMissingServiceTeams20260603120000';
	timestamp = '20260603120000';

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
