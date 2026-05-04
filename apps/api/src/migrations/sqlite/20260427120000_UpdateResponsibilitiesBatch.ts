import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lote de actualizaciones a las responsabilidades canónicas de cada retiro.
 * Idempotente — las inserciones validan existencia previa y los UPDATE son
 * no-op si el nombre ya está al día.
 *
 *   1. Renombra `Texto: Dinámica Examen de Conciencia` → `Texto: Quema de Pecados`.
 *   2. Añade responsabilidades fijas faltantes:
 *        Biblias, Bolsas, Resumen del día, Recepción,
 *        Salón, Reglamento de la Casa, Explicación Rosario y entrega.
 *   3. Añade textos faltantes:
 *        Texto: Carta de Jesús, Texto: Oración al Espíritu Santo.
 *   4. Corrige typo `Santísmo` → `Santísimo` (retreats + schedule_template).
 *   5. Renombra `Oración` → `Oración de Intercesión` (retreats + schedule_template),
 *      reapuntando items del minuto-a-minuto si coexisten.
 *   6. Renombra `Rosarios` → `Explicación Rosario y entrega` (retreats +
 *      schedule_template), reapuntando items.
 *   7. Fusiona la responsabilidad orfana `Snack Posterior a la Pared` con la
 *      canónica `Snacks` (creada manualmente vía UI en algún retiro).
 *   8. Borra textos legacy ya no usados en ningún template:
 *        `Texto: Reflexión sobre Lucas 24, 13-35`,
 *        `Texto: Historia de los Retiros de Emaús`.
 */
export class UpdateResponsibilitiesBatch20260427120000 implements MigrationInterface {
	name = 'UpdateResponsibilitiesBatch20260427120000';
	timestamp = '20260427120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// 1. Rename Texto: Dinámica Examen de Conciencia → Texto: Quema de Pecados
		await queryRunner.query(
			`UPDATE retreat_responsibilities
			 SET name = 'Texto: Quema de Pecados'
			 WHERE name = 'Texto: Dinámica Examen de Conciencia'`,
		);

		const fixedRoles: Array<{ name: string; type: string }> = [
			{ name: 'Biblias', type: 'otro' },
			{ name: 'Bolsas', type: 'otro' },
			{ name: 'Resumen del día', type: 'otro' },
			{ name: 'Recepción', type: 'otro' },
			{ name: 'Salón', type: 'otro' },
			{ name: 'Reglamento de la Casa', type: 'otro' },
			{ name: 'Explicación Rosario y entrega', type: 'otro' },
			{ name: 'Texto: Carta de Jesús', type: 'charlista' },
			{ name: 'Texto: Oración al Espíritu Santo', type: 'charlista' },
		];

		const retreats: Array<{ id: string }> = await queryRunner.query(`SELECT id FROM retreat`);

		for (const r of retreats) {
			// 6. Rename Rosarios → Explicación Rosario y entrega (per retiro, antes de insertar)
			const rosOld: Array<{ id: string }> = await queryRunner.query(
				`SELECT id FROM retreat_responsibilities WHERE retreatId = ? AND name = 'Rosarios'`,
				[r.id],
			);
			const rosNew: Array<{ id: string }> = await queryRunner.query(
				`SELECT id FROM retreat_responsibilities WHERE retreatId = ? AND name = 'Explicación Rosario y entrega'`,
				[r.id],
			);
			if (rosOld.length && rosNew.length) {
				await queryRunner.query(
					`UPDATE retreat_schedule_item SET responsabilityId = ? WHERE responsabilityId = ?`,
					[rosNew[0].id, rosOld[0].id],
				);
				await queryRunner.query(`DELETE FROM retreat_responsibilities WHERE id = ?`, [
					rosOld[0].id,
				]);
			} else if (rosOld.length) {
				await queryRunner.query(
					`UPDATE retreat_responsibilities SET name = 'Explicación Rosario y entrega' WHERE id = ?`,
					[rosOld[0].id],
				);
			}

			// 2 + 3. Insertar roles fijos y textos si no existen
			for (const role of fixedRoles) {
				await queryRunner.query(
					`INSERT INTO retreat_responsibilities
						(id, name, retreatId, responsabilityType, isActive, priority, isLeadership)
					 SELECT lower(hex(randomblob(16))), ?, ?, ?, 1, 0, 0
					 WHERE NOT EXISTS (
						SELECT 1 FROM retreat_responsibilities
						WHERE retreatId = ? AND name = ?
					 )`,
					[role.name, r.id, role.type, r.id, role.name],
				);
			}

			// 4. Fix typo Santísmo → Santísimo (per retiro)
			const stmoOld: Array<{ id: string }> = await queryRunner.query(
				`SELECT id FROM retreat_responsibilities WHERE retreatId = ? AND name = 'Santísmo'`,
				[r.id],
			);
			const stmoNew: Array<{ id: string }> = await queryRunner.query(
				`SELECT id FROM retreat_responsibilities WHERE retreatId = ? AND name = 'Santísimo'`,
				[r.id],
			);

			if (stmoOld.length && stmoNew.length) {
				await queryRunner.query(
					`UPDATE retreat_schedule_item SET responsabilityId = ? WHERE responsabilityId = ?`,
					[stmoNew[0].id, stmoOld[0].id],
				);
				await queryRunner.query(
					`DELETE FROM retreat_responsibilities WHERE id = ?`,
					[stmoOld[0].id],
				);
			} else if (stmoOld.length) {
				await queryRunner.query(
					`UPDATE retreat_responsibilities SET name = 'Santísimo' WHERE id = ?`,
					[stmoOld[0].id],
				);
			}

			// 5. Rename Oración → Oración de Intercesión (per retiro)
			const oraOld: Array<{ id: string }> = await queryRunner.query(
				`SELECT id FROM retreat_responsibilities WHERE retreatId = ? AND name = 'Oración'`,
				[r.id],
			);
			const oraNew: Array<{ id: string }> = await queryRunner.query(
				`SELECT id FROM retreat_responsibilities WHERE retreatId = ? AND name = 'Oración de Intercesión'`,
				[r.id],
			);

			if (oraOld.length && oraNew.length) {
				await queryRunner.query(
					`UPDATE retreat_schedule_item SET responsabilityId = ? WHERE responsabilityId = ?`,
					[oraNew[0].id, oraOld[0].id],
				);
				await queryRunner.query(
					`DELETE FROM retreat_responsibilities WHERE id = ?`,
					[oraOld[0].id],
				);
			} else if (oraOld.length) {
				await queryRunner.query(
					`UPDATE retreat_responsibilities SET name = 'Oración de Intercesión' WHERE id = ?`,
					[oraOld[0].id],
				);
			}

			// 7. Merge "Snack Posterior a la Pared" → "Snacks"
			const snackOrphan: Array<{ id: string }> = await queryRunner.query(
				`SELECT id FROM retreat_responsibilities WHERE retreatId = ? AND name = 'Snack Posterior a la Pared'`,
				[r.id],
			);
			const snacks: Array<{ id: string }> = await queryRunner.query(
				`SELECT id FROM retreat_responsibilities WHERE retreatId = ? AND name = 'Snacks'`,
				[r.id],
			);
			if (snackOrphan.length && snacks.length) {
				await queryRunner.query(
					`UPDATE retreat_schedule_item SET responsabilityId = ? WHERE responsabilityId = ?`,
					[snacks[0].id, snackOrphan[0].id],
				);
				await queryRunner.query(`DELETE FROM retreat_responsibilities WHERE id = ?`, [
					snackOrphan[0].id,
				]);
			} else if (snackOrphan.length) {
				await queryRunner.query(
					`UPDATE retreat_responsibilities SET name = 'Snacks' WHERE id = ?`,
					[snackOrphan[0].id],
				);
			}

			// 8. Borrar textos legacy si no están referenciados por ningún item
			for (const name of [
				'Texto: Reflexión sobre Lucas 24, 13-35',
				'Texto: Historia de los Retiros de Emaús',
			]) {
				const found: Array<{ id: string }> = await queryRunner.query(
					`SELECT id FROM retreat_responsibilities WHERE retreatId = ? AND name = ?`,
					[r.id, name],
				);
				if (!found.length) continue;
				const refs: Array<{ c: number }> = await queryRunner.query(
					`SELECT COUNT(*) AS c FROM retreat_schedule_item WHERE responsabilityId = ?`,
					[found[0].id],
				);
				if (refs[0]?.c > 0) continue; // defensive: skip si aún referenciado
				await queryRunner.query(`DELETE FROM retreat_responsibilities WHERE id = ?`, [
					found[0].id,
				]);
			}
		}

		// schedule_template (template global)
		await queryRunner.query(
			`UPDATE schedule_template SET responsabilityName = 'Santísimo' WHERE responsabilityName = 'Santísmo'`,
		);
		await queryRunner.query(
			`UPDATE schedule_template SET responsabilityName = 'Oración de Intercesión' WHERE responsabilityName = 'Oración'`,
		);
		await queryRunner.query(
			`UPDATE schedule_template SET responsabilityName = 'Explicación Rosario y entrega' WHERE responsabilityName = 'Rosarios'`,
		);
	}

	public async down(_queryRunner: QueryRunner): Promise<void> {
		// No reversal — añadir/renombrar/limpiar roles canónicos es one-way en dev.
	}
}
