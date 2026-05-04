import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lote: añade charlas/textos canónicos faltantes a cada retiro existente.
 *
 *   - `Charla: Conocerte a Ti Mismo` (charlista): charla del Día 1, distinta de
 *     `Las Máscaras` (Día 2). Antes ambas compartían responsable.
 *   - `Texto: Dinámica de Sanación` (charlista): la dinámica la guían 3 voces,
 *     antes compartía responsable con la `Charla: Sanación de los Recuerdos`.
 *
 * Idempotente: solo inserta si no existe la fila.
 */
export class AddResponsibilitiesBatch20260502120000 implements MigrationInterface {
	name = 'AddResponsibilitiesBatch20260502120000';
	timestamp = '20260502120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const newRoles: Array<{ name: string; type: string }> = [
			{ name: 'Charla: Conocerte a Ti Mismo', type: 'charlista' },
			{ name: 'Texto: Dinámica de Sanación', type: 'charlista' },
		];

		const retreats: Array<{ id: string }> = await queryRunner.query(`SELECT id FROM retreat`);

		for (const r of retreats) {
			for (const role of newRoles) {
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
		}
	}

	public async down(_queryRunner: QueryRunner): Promise<void> {
		// No reversal — añadir roles canónicos es one-way en dev.
	}
}
