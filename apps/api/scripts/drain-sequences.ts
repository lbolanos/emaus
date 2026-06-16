/**
 * Utilidad de dev: drena la cola de secuencias llamando processDue en lotes
 * grandes hasta vaciar el backlog (ignora el tope SEQUENCE_PROCESS_LIMIT del cron).
 * Email → failed/sent según SMTP; WhatsApp vencido → queued (aparece en la bandeja).
 *
 * Uso (con el API detenido para evitar locks de SQLite):
 *   DB_DATABASE=database.sqlite pnpm --filter api exec vite-node --require dotenv/config scripts/drain-sequences.ts
 */
import { AppDataSource } from '../src/data-source';
import { messageSequenceService } from '../src/services/messageSequenceService';
import { ScheduledMessage } from '../src/entities/scheduledMessage.entity';

(async () => {
	await AppDataSource.initialize();
	const repo = AppDataSource.getRepository(ScheduledMessage);
	const eligibleDue = () =>
		repo
			.createQueryBuilder('sm')
			.innerJoin('sm.sequence', 'seq')
			.where('sm.scheduledFor <= :now', { now: new Date() })
			.andWhere('seq.isActive = 1')
			.andWhere("(sm.status = 'pending' OR (sm.status = 'failed' AND sm.attempts < 3))")
			.getCount();

	let total = 0;
	// Recorre hasta vaciar los vencidos elegibles (no corta por "0 enviados":
	// los email del candado no cuentan como enviados pero sí avanzan attempts).
	for (let i = 0; i < 40; i++) {
		const before = await eligibleDue();
		if (before === 0) break;
		const n = await messageSequenceService.processDue(new Date(), 1000);
		total += n;
		const after = await eligibleDue();
		console.log(`  lote ${i + 1}: enviados/encolados ${n} · elegibles ${before}→${after}`);
		if (after >= before) break; // sin avance → evitar loop infinito
	}
	console.log(`✅ processDue drenado: ${total} enviados/encolados`);
	await AppDataSource.destroy();
})().catch((err) => {
	console.error('Error draining sequences:', err);
	process.exit(1);
});
