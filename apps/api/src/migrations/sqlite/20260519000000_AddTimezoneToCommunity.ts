import { MigrationInterface, QueryRunner } from 'typeorm';
import { inferTimezoneFromCoords } from '../../utils/date.transformer.js';

/**
 * Agrega `timezone` (IANA, ej. 'America/Mexico_City') a `community`. Igual que
 * en `House.timezone`, sirve para formatear fechas calendario en la zona local
 * de la comunidad cuando se envían mensajes/emails a los miembros.
 *
 * Up: ADD COLUMN nullable + backfill usando `inferTimezoneFromCoords(lat, lon)`
 * para las communities que ya tienen coordenadas. Las que no tengan lat/lon
 * quedan en NULL — el helper `getCommunityTimezone` cae a 'America/Mexico_City'
 * en runtime.
 *
 * Down: no-op (SQLite no soporta DROP COLUMN sin recreate-table; el costo de
 * implementarlo no se justifica para una columna aditiva opcional).
 */
export class AddTimezoneToCommunity20260519000000 implements MigrationInterface {
	name = 'AddTimezoneToCommunity';
	timestamp = '20260519000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const tableInfo = await queryRunner.query(`PRAGMA table_info("community")`);
		const existingColumns = new Set(tableInfo.map((col: any) => col.name));

		if (!existingColumns.has('timezone')) {
			await queryRunner.query(`ALTER TABLE "community" ADD COLUMN "timezone" varchar(64)`);
			console.log('Added timezone column to community');
		}

		// Backfill: inferir timezone para las communities con lat/lon definidos
		// y sin timezone. tz-lookup hace lookup local (sin Internet) sobre una
		// tabla embebida ~30KB.
		const rows: { id: string; latitude: number | null; longitude: number | null }[] =
			await queryRunner.query(
				`SELECT id, latitude, longitude FROM "community" WHERE timezone IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL`,
			);

		let backfilled = 0;
		for (const row of rows) {
			if (typeof row.latitude !== 'number' || typeof row.longitude !== 'number') continue;
			const tz = await inferTimezoneFromCoords(row.latitude, row.longitude);
			if (tz) {
				await queryRunner.query(`UPDATE "community" SET timezone = ? WHERE id = ?`, [tz, row.id]);
				backfilled++;
			}
		}
		if (backfilled > 0) {
			console.log(`[AddTimezoneToCommunity] backfilled timezone for ${backfilled} communities`);
		}
	}

	public async down(_queryRunner: QueryRunner): Promise<void> {
		console.warn('[AddTimezoneToCommunity] Rollback not implemented — SQLite limitation');
	}
}
