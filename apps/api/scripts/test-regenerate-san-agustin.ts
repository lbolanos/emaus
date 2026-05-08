/**
 * Script ad-hoc: invoca regenerateSantisimoSlotsFromSchedule contra la DB real
 * en el retiro de San Agustín y reporta qué pasó.
 *
 * Usage: cd apps/api && pnpm vite-node scripts/test-regenerate-san-agustin.ts
 */
import 'dotenv/config';
import { AppDataSource } from '../src/data-source';
import { retreatScheduleService } from '../src/services/retreatScheduleService';

const RETREAT_ID = '4c8173c9-a068-4efe-a936-e3618523bead';

async function main() {
	await AppDataSource.initialize();

	const before = await AppDataSource.query(
		`SELECT COUNT(*) AS total,
		        MIN(datetime(startTime)) AS first_start,
		        MAX(datetime(endTime)) AS last_end
		 FROM santisimo_slot WHERE retreatId = ?`,
		[RETREAT_ID],
	);
	console.log('SLOTS ANTES:', before[0]);

	const dupesBefore = await AppDataSource.query(
		`SELECT scheduleTemplateId, COUNT(*) AS cnt FROM retreat_schedule_item
		 WHERE retreatId = ? AND scheduleTemplateId IS NOT NULL
		 GROUP BY scheduleTemplateId HAVING cnt > 1`,
		[RETREAT_ID],
	);
	const totalItems = await AppDataSource.query(
		`SELECT COUNT(*) AS total FROM retreat_schedule_item WHERE retreatId = ?`,
		[RETREAT_ID],
	);
	console.log('ITEMS totales ANTES:', totalItems[0].total, '· duplicados:', dupesBefore.length);

	const result = await retreatScheduleService.regenerateSantisimoSlotsFromSchedule(RETREAT_ID);
	console.log('\nRESULT:', result);

	const after = await AppDataSource.query(
		`SELECT COUNT(*) AS total,
		        MIN(datetime(startTime)) AS first_start,
		        MAX(datetime(endTime)) AS last_end
		 FROM santisimo_slot WHERE retreatId = ?`,
		[RETREAT_ID],
	);
	console.log('\nSLOTS DESPUÉS:', after[0]);

	const dupesAfter = await AppDataSource.query(
		`SELECT scheduleTemplateId, COUNT(*) AS cnt FROM retreat_schedule_item
		 WHERE retreatId = ? AND scheduleTemplateId IS NOT NULL
		 GROUP BY scheduleTemplateId HAVING cnt > 1`,
		[RETREAT_ID],
	);
	const totalAfter = await AppDataSource.query(
		`SELECT COUNT(*) AS total FROM retreat_schedule_item WHERE retreatId = ?`,
		[RETREAT_ID],
	);
	console.log('ITEMS totales DESPUÉS:', totalAfter[0].total, '· duplicados:', dupesAfter.length);

	// Verifica que items "Desayuno" día 2 ahora estén SOLO a hora local correcta.
	const desayuno = await AppDataSource.query(
		`SELECT datetime(startTime) AS start FROM retreat_schedule_item
		 WHERE retreatId = ? AND name LIKE 'Desayuno%' AND day = 2
		 ORDER BY startTime`,
		[RETREAT_ID],
	);
	console.log('Items "Desayuno día 2" DESPUÉS:');
	desayuno.forEach((r: any) => console.log('  ', r.start));

	await AppDataSource.destroy();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
