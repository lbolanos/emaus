import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrige max_walkers / max_servers del retiro de Veracruz XXIII.
 *
 * AddVeracruzXxiiiHouseAndRetreat los calculó del reparto de la CASA (102 caminante / 80
 * servidor) en vez de las camas del RETIRO, que tras las excepciones por habitación son
 * 115 / 68. El efecto era un tope de servidores mayor que las camas que existen para ellos
 * y uno de caminantes menor: el sistema habría aceptado servidores sin cama y marcado en
 * espera a caminantes que sí la tenían. Aquella migración ya corrió en producción, así que
 * la corrección va aparte.
 *
 * Los valores no se codifican: se cuentan de `retreat_bed`, que es la fuente de verdad y deja
 * la migración correcta aunque el mapa de camas cambie antes de aplicarla.
 *
 * Sin DDL → no requiere transaction = false. Idempotente: si los topes ya cuadran, no escribe.
 */

const RETREAT_SLUG = 'veracruzxxiii';

export class FixVeracruzXxiiiCapacity20260907120000 implements MigrationInterface {
	name = 'FixVeracruzXxiiiCapacity20260907120000';
	timestamp = '20260907120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const rows = await queryRunner.query(
			`SELECT "id", "max_walkers" AS mw, "max_servers" AS ms FROM "retreat" WHERE "slug" = ?`,
			[RETREAT_SLUG],
		);
		if (rows.length === 0) {
			console.log(`[FixVeracruzXxiiiCapacity] no existe el retiro ${RETREAT_SLUG} — no se hace nada`);
			return;
		}
		const retreat = rows[0];

		const [counts] = await queryRunner.query(
			`SELECT
			   SUM(CASE WHEN "defaultUsage" = 'caminante' THEN 1 ELSE 0 END) AS walkers,
			   SUM(CASE WHEN "defaultUsage" = 'servidor'  THEN 1 ELSE 0 END) AS servers
			 FROM "retreat_bed" WHERE "retreatId" = ?`,
			[retreat.id],
		);
		const walkers = Number(counts?.walkers ?? 0);
		const servers = Number(counts?.servers ?? 0);
		if (walkers === 0 && servers === 0) {
			console.log('[FixVeracruzXxiiiCapacity] el retiro no tiene camas — no se toca');
			return;
		}
		if (Number(retreat.mw) === walkers && Number(retreat.ms) === servers) {
			console.log('[FixVeracruzXxiiiCapacity] los topes ya cuadran con las camas — no se hace nada');
			return;
		}

		await queryRunner.query(`UPDATE "retreat" SET "max_walkers" = ?, "max_servers" = ? WHERE "id" = ?`, [
			walkers,
			servers,
			retreat.id,
		]);
		console.log(
			`[FixVeracruzXxiiiCapacity] topes corregidos: ${retreat.mw}/${retreat.ms} -> ${walkers}/${servers}`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Vuelve al reparto de la casa, que es lo que había antes de esta corrección.
		const rows = await queryRunner.query(
			`SELECT r."id", h."id" AS "houseId" FROM "retreat" r JOIN "house" h ON h."id" = r."houseId" WHERE r."slug" = ?`,
			[RETREAT_SLUG],
		);
		if (rows.length === 0) return;
		const [counts] = await queryRunner.query(
			`SELECT
			   SUM(CASE WHEN "defaultUsage" = 'caminante' THEN 1 ELSE 0 END) AS walkers,
			   SUM(CASE WHEN "defaultUsage" = 'servidor'  THEN 1 ELSE 0 END) AS servers
			 FROM "bed" WHERE "houseId" = ?`,
			[rows[0].houseId],
		);
		await queryRunner.query(`UPDATE "retreat" SET "max_walkers" = ?, "max_servers" = ? WHERE "id" = ?`, [
			Number(counts?.walkers ?? 0),
			Number(counts?.servers ?? 0),
			rows[0].id,
		]);
	}
}
