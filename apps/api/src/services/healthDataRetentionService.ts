import cron from 'node-cron';
import { AppDataSource } from '../data-source';
import { Participant } from '../entities/participant.entity';
import { clearHealthFields, clearEmergencyContactFields } from './participantService';
import { domainAuditService, DomainAuditAction } from './domainAuditService';

/**
 * Purga automática de salud/contactos de emergencia 30 días después de que
 * termina el retiro al que pertenece el participante. Fase 3 del plan de
 * protección de datos de salud (docs/features/health-data-protection.md).
 *
 * Por qué: antes de esto, un participante que nunca pide su borrado ARCO
 * conserva medicación/dieta/discapacidad/contactos de emergencia
 * indefinidamente, aunque el retiro ya haya terminado hace meses o años.
 *
 * Qué NO toca: nombre, correo, historial de participación, `notes` (texto
 * libre operativo, no necesariamente de salud — ver `clearHealthFields`).
 * Ver `docs/features/privacy-data-delete.md` para el borrado ARCO completo,
 * que es un flujo distinto (a pedido de la persona, wipe total).
 *
 * SEGURIDAD: esto borra datos reales sin que nadie lo pida explícitamente
 * caso por caso. Por defecto corre en **modo dry-run** (solo cuenta y audita
 * la intención, no escribe) hasta que `HEALTH_DATA_RETENTION_ENABLED=true`
 * esté puesto explícitamente — un operador tiene que decidir activarlo
 * después de revisar los números de una corrida en dry-run.
 */
const DEFAULT_RETENTION_DAYS = 30;

export interface HealthRetentionResult {
	scanned: number;
	purged: number;
	dryRun: boolean;
	participantIds: string[];
}

export class HealthDataRetentionService {
	private static instance: HealthDataRetentionService;
	private isRunning = false;

	public static getInstance(): HealthDataRetentionService {
		if (!HealthDataRetentionService.instance) {
			HealthDataRetentionService.instance = new HealthDataRetentionService();
		}
		return HealthDataRetentionService.instance;
	}

	public startScheduledTasks(): void {
		if (this.isRunning) {
			console.log('Health data retention cleanup already running');
			return;
		}

		// Diario a las 03:45 UTC — después del backup, adjuntos y auditoría.
		cron.schedule('45 3 * * *', async () => {
			console.log('🧹 Running health data retention cleanup...');
			await this.performCleanup();
		});

		this.isRunning = true;
		console.log(
			`✅ Health data retention scheduled tasks started (${this.isDryRunByDefault() ? 'DRY-RUN' : 'ACTIVO'})`,
		);
	}

	private isDryRunByDefault(): boolean {
		return process.env.HEALTH_DATA_RETENTION_ENABLED !== 'true';
	}

	/**
	 * Selecciona participantes cuyo retiro terminó hace ≥ `retentionDays` días,
	 * que no fueron ya purgados ni anonimizados por ARCO (`dataDeletedAt`
	 * IS NULL — ahí ya no queda nada que purgar), y anula sus campos de salud.
	 *
	 * `dryRun` explícito siempre gana; si se omite, se decide por
	 * `HEALTH_DATA_RETENTION_ENABLED` (ver clase). En dry-run no escribe nada:
	 * solo cuenta y deja un evento de auditoría con `dryRun: true`.
	 */
	public async performCleanup(options: {
		retentionDays?: number;
		dryRun?: boolean;
	} = {}): Promise<HealthRetentionResult> {
		const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
		const dryRun = options.dryRun ?? this.isDryRunByDefault();

		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - retentionDays);
		const cutoffYmd = cutoff.toISOString().slice(0, 10);

		const repo = AppDataSource.getRepository(Participant);
		const candidates = await repo
			.createQueryBuilder('p')
			.innerJoin('p.retreat', 'r')
			.where('r.endDate <= :cutoff', { cutoff: cutoffYmd })
			.andWhere('p.healthDataPurgedAt IS NULL')
			.andWhere('p.dataDeletedAt IS NULL')
			.getMany();

		let purged = 0;
		const participantIds: string[] = [];

		for (const p of candidates) {
			try {
				if (!dryRun) {
					clearHealthFields(p);
					clearEmergencyContactFields(p);
					p.healthDataPurgedAt = new Date();
					await repo.save(p);
				}
				purged++;
				participantIds.push(p.id);
				void domainAuditService.log({
					action: DomainAuditAction.PARTICIPANT_HEALTH_DATA_PURGED,
					resourceType: 'participant',
					resourceId: p.id,
					retreatId: p.retreatId ?? null,
					metadata: { retentionDays, dryRun },
				});
			} catch (error) {
				console.error(`❌ Error purging health data for participant ${p.id}:`, error);
			}
		}

		console.log(
			`🧹 Health data retention${dryRun ? ' (DRY-RUN)' : ''}: scanned=${candidates.length} purged=${purged}`,
		);

		return { scanned: candidates.length, purged, dryRun, participantIds };
	}
}

export const healthDataRetentionService = HealthDataRetentionService.getInstance();
