#!/usr/bin/env node
/**
 * Backfill responsabilityName en items del schedule_template ya existentes.
 * Usa la lista del seeder (idempotente).
 *
 * Uso:
 *   pnpm --filter api ts-node src/cli/seed-template-responsibilities.ts
 *   o vite-node src/cli/seed-template-responsibilities.ts
 */
import 'dotenv/config';
import { AppDataSource } from '../data-source';
import { createDefaultScheduleTemplate } from '../data/scheduleTemplateSeeder';

(async () => {
	console.log('Inicializando data source...');
	await AppDataSource.initialize();
	console.log('Corriendo seeder (idempotente)...');
	await createDefaultScheduleTemplate();
	await AppDataSource.destroy();
	console.log('✅ Done');
})().catch((err) => {
	console.error('❌ Error:', err);
	process.exit(1);
});
