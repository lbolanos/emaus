import cron, { type ScheduledTask } from 'node-cron';
import { AppDataSource } from '../../data-source';
import { WhatsappBridgeLink } from '../../entities/whatsappBridgeLink.entity';
import { Retreat } from '../../entities/retreat.entity';
import { DomainAuditAction } from '@repo/types';
import { civilTodayInTimezone, isLinkPurgeDue, waBridgeService } from './waBridgeService';
import { resolveSafeTimeZone } from '../../utils/date.transformer';

/**
 * WhatsApp bridge retention (specs/whatsapp-inbox FR7 / D5): for every link
 * whose retreat reached `endDate + WA_BRIDGE_RETENTION_DAYS`, logs the session
 * out and deletes the store on disk, the messages and the link through
 * `waBridgeService.teardownLink` (explicit deletes: the runtime does not
 * guarantee PRAGMA foreign_keys). An orphan link (deleted retreat) is purged
 * too.
 *
 * Runs REGARDLESS of the kill switch (WA_BRIDGE_ENABLED=false): purging is the
 * privacy-safe direction and must never stop. Same shape as
 * auditRetentionService: cron + `performRetention()` testable on its own.
 */

const CRON_EXPRESSION = '45 3 * * *';

export class WaBridgeRetentionService {
	private task: ScheduledTask | null = null;
	private isRunning = false;

	startScheduledTasks(): void {
		if (this.task) return;
		// 03:45 UTC: after the DB backup (03:00) and the audit retention (03:30)
		// — the night is clear of heavy jobs by then.
		this.task = cron.schedule(CRON_EXPRESSION, () => {
			void this.performRetention();
		});
	}

	stopScheduledTasks(): void {
		// ScheduledTask.stop() is a promise again in the newer node-cron types;
		// stopping the cron on shutdown needs no await.
		void this.task?.stop();
		this.task = null;
	}

	/** Separate from the cron for tests and manual runs during QA. */
	async performRetention(): Promise<{ purged: number }> {
		if (this.isRunning) return { purged: 0 };
		this.isRunning = true;
		try {
			// Messages whose link is already gone: left behind by deletes that
			// relied on the FK CASCADE while PRAGMA foreign_keys was off. They no
			// longer belong to any consented session — purge them first.
			await AppDataSource.query(
				`DELETE FROM whatsapp_inbox_message
				  WHERE linkId NOT IN (SELECT id FROM whatsapp_bridge_link)`,
			);

			const linkRepo = AppDataSource.getRepository(WhatsappBridgeLink);
			const links = await linkRepo.find();
			if (links.length === 0) return { purged: 0 };

			// Retreat data per link (one query per distinct retreat, not per link).
			const endDateByRetreat = new Map<string, string>();
			const todayByRetreat = new Map<string, string>();
			for (const link of links) {
				if (endDateByRetreat.has(link.retreatId)) continue;
				const retreat = await AppDataSource.getRepository(Retreat).findOneBy({
					id: link.retreatId,
				});
				if (!retreat) continue; // null = orphan; purged below.
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

				// Same teardown as unlink: it also rm's the store on disk (session
				// keys + message DB) and deletes the messages explicitly — this path
				// used to skip both.
				await waBridgeService.teardownLink(link, {
					system: true,
					action: DomainAuditAction.WA_BRIDGE_PURGED,
					metadata: { orphan },
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
