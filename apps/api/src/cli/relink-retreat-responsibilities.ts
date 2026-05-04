#!/usr/bin/env node
/**
 * Re-vincula items de un retiro a sus Responsabilidades por nombre.
 * Equivalente al endpoint POST /api/schedule/retreats/:id/relink-responsibilities.
 *
 * Uso:
 *   vite-node src/cli/relink-retreat-responsibilities.ts <retreatId> [--force]
 */
import 'dotenv/config';
import { AppDataSource } from '../data-source';
import { retreatScheduleService } from '../services/retreatScheduleService';

(async () => {
	const retreatId = process.argv[2];
	const force = process.argv.includes('--force');
	if (!retreatId) {
		console.error('Uso: vite-node src/cli/relink-retreat-responsibilities.ts <retreatId> [--force]');
		process.exit(1);
	}

	await AppDataSource.initialize();
	const result = await retreatScheduleService.relinkResponsibilities(retreatId, force);
	console.log(`Modo: ${force ? 'FORCE (sobrescribe)' : 'normal (solo null)'}`);
	console.log('Resultado:', JSON.stringify(result, null, 2));
	await AppDataSource.destroy();
})().catch((err) => {
	console.error('❌ Error:', err);
	process.exit(1);
});
