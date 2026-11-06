import cron, { type ScheduledTask } from 'node-cron';
import { AppDataSource } from '../../data-source';
import { WhatsappBridgeLink } from '../../entities/whatsappBridgeLink.entity';
import { WhatsappInboxMessage } from '../../entities/whatsappInboxMessage.entity';
import { Retreat } from '../../entities/retreat.entity';
import { domainAuditService } from '../domainAuditService';
import { DomainAuditAction } from '@repo/types';
import { civilTodayInTimezone, isLinkPurgeDue, waBridgeService } from './waBridgeService';
import { resolveSafeTimeZone } from '../../utils/date.transformer';
import { wacliLogout } from './wacliClient';

/**
 * Retención del puente WhatsApp (specs/whatsapp-inbox FR7 / D5): para cada
 * link cuyo retiro ya cumplió `endDate + WA_BRIDGE_RETENTION_DAYS`, cierra la
 * sesión (logout), borra el store en disco y hace DELETE del link — el
 * CASCADE arrastra mensajes y read-state. Un link huérfano (retiro borrado)
 * se purga también.
 *
 * Corre INDEPENDIENTE del kill switch (WA_BRIDGE_ENABLED=false): la purga es
 * la dirección privacy-safe y nunca debe dejar de ejecutarse. Misma forma que
 * auditRetentionService: cron + `performRetention()` testeable por separado.
 */

const CRON_EXPRESSION = '45 3 * * *';

export class WaBridgeRetentionService {
	private task: ScheduledTask | null = null;
	private isRunning = false;

	startScheduledTasks(): void {
		if (this.task) return;
		// 03:45 UTC: después del backup de la base (03:00) y de la retención de
		// auditoría (03:30) — la noche ya está despejada de trabajos pesados.
		this.task = cron.schedule(CRON_EXPRESSION, () => {
			void this.performRetention();
		});
	}

	stopScheduledTasks(): void {
		// El tipo de ScheduledTask.stop() devolvió a ser promesa en las types
		// nuevas de node-cron; la parada del cron en shutdown no necesita await.
		void this.task?.stop();
		this.task = null;
	}

	/** Separado del cron para tests y para invocación manual desde QA. */
	async performRetention(): Promise<{ purged: number }> {
		if (this.isRunning) return { purged: 0 };
		this.isRunning = true;
		try {
			const linkRepo = AppDataSource.getRepository(WhatsappBridgeLink);
			const links = await linkRepo.find();
			if (links.length === 0) return { purged: 0 };

			// Datos del retiro por link (una query por retiro distinto, no por link).
			const endDateByRetreat = new Map<string, string>();
			const todayByRetreat = new Map<string, string>();
			for (const link of links) {
				if (endDateByRetreat.has(link.retreatId)) continue;
				const retreat = await AppDataSource.getRepository(Retreat).findOneBy({
					id: link.retreatId,
				});
				if (!retreat) continue; // null = huérfano; se purga abajo.
				const tz = resolveSafeTimeZone(retreat.timezone);
				endDateByRetreat.set(link.retreatId, String(retreat.endDate));
				todayByRetreat.set(link.retreatId, civilTodayInTimezone(tz));
			}

			let purged = 0;
			for (const link of links) {
				const endDate = endDateByRetreat.get(link.retreatId);
				const today = todayByRetreat.get(link.retreatId);
				const orphan = endDate === undefined || today === undefined;
				const due = orphan || isLinkPurgeDue(endDate, today);
				if (!due) continue;

				const messageCount = await AppDataSource.getRepository(WhatsappInboxMessage).count({
					where: { linkId: link.id },
				});

				await waBridgeService.stopSupervisorById(link.id);
				try {
					await wacliLogout(link.storePath);
				} catch {
					// Best-effort: con el store ya ido o la sesión muerta, el rm y el
					// DELETE garantizan el borrado local de todos modos.
				}
				await linkRepo.remove(link);

				void domainAuditService.log({
					action: DomainAuditAction.WA_BRIDGE_PURGED,
					resourceType: 'whatsapp_bridge_link',
					resourceId: link.id,
					retreatId: link.retreatId,
					metadata: { system: true, messageCount, orphan },
				});
				purged += 1;
			}
			return { purged };
		} finally {
			this.isRunning = false;
		}
	}
}

export const waBridgeRetentionService = new WaBridgeRetentionService();
