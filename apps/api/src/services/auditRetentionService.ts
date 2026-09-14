import cron from 'node-cron';
import { AppDataSource } from '../data-source';
import { AuditLog } from '../entities/auditLog.entity';
import { DomainAuditLog } from '../entities/domainAuditLog.entity';
import { CommunityAuditLog } from '../entities/communityAuditLog.entity';
import { config } from '../config';

/**
 * Retention policy for the three DB audit tables (`audit_logs` — RBAC,
 * `domain_audit_log` — dominio, `community_audit_log` — comunidad).
 *
 * Por qué existe: las tres crecían sin límite — a diferencia del sink NDJSON
 * (`auditLogger`), que ya rota a `config.audit.retentionDays` (default 90d)
 * vía winston-daily-rotate-file. Mismo plazo aquí, mismo env var
 * (`AUDIT_LOG_RETENTION_DAYS`), para que "cuánto conservamos los logs" sea
 * una sola respuesta y no dos configuraciones que puedan divergir.
 *
 * Igual que `attachmentHistoryCleanupService`: nunca lanza (fire-and-forget
 * desde el cron), y expone `performCleanup()` para poder probarlo/dispararlo
 * a mano sin esperar al cron.
 */
export class AuditRetentionService {
	private static instance: AuditRetentionService;
	private isRunning = false;

	public static getInstance(): AuditRetentionService {
		if (!AuditRetentionService.instance) {
			AuditRetentionService.instance = new AuditRetentionService();
		}
		return AuditRetentionService.instance;
	}

	public startScheduledTasks(): void {
		if (this.isRunning) {
			console.log('Audit retention cleanup already running');
			return;
		}

		// Diario a las 03:30 UTC — después del backup (03:00) y del cleanup de
		// adjuntos (03:15), para no competir por la misma DB al mismo tiempo.
		cron.schedule('30 3 * * *', async () => {
			console.log('🧹 Running audit log retention cleanup...');
			await this.performCleanup();
		});

		this.isRunning = true;
		console.log('✅ Audit retention cleanup scheduled tasks started');
	}

	/**
	 * Borra filas de las tres tablas de auditoría más viejas que
	 * `config.audit.dbRetentionDays`. Retorna el conteo por tabla (para tests
	 * y logging).
	 */
	public async performCleanup(
		retentionDays: number = config.audit.dbRetentionDays,
	): Promise<{ auditLogs: number; domainAuditLog: number; communityAuditLog: number }> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

		let auditLogs = 0;
		let domainAuditLog = 0;
		let communityAuditLog = 0;

		try {
			const result = await AppDataSource.getRepository(AuditLog)
				.createQueryBuilder()
				.delete()
				.where('createdAt < :cutoffDate', { cutoffDate })
				.execute();
			auditLogs = result.affected || 0;
		} catch (error) {
			console.error('❌ Error cleaning up audit_logs:', error);
		}

		try {
			const result = await AppDataSource.getRepository(DomainAuditLog)
				.createQueryBuilder()
				.delete()
				.where('createdAt < :cutoffDate', { cutoffDate })
				.execute();
			domainAuditLog = result.affected || 0;
		} catch (error) {
			console.error('❌ Error cleaning up domain_audit_log:', error);
		}

		try {
			const result = await AppDataSource.getRepository(CommunityAuditLog)
				.createQueryBuilder()
				.delete()
				.where('createdAt < :cutoffDate', { cutoffDate })
				.execute();
			communityAuditLog = result.affected || 0;
		} catch (error) {
			console.error('❌ Error cleaning up community_audit_log:', error);
		}

		console.log('🧹 Audit retention cleanup:', {
			auditLogs,
			domainAuditLog,
			communityAuditLog,
			retentionDays,
		});

		return { auditLogs, domainAuditLog, communityAuditLog };
	}
}

export const auditRetentionService = AuditRetentionService.getInstance();
