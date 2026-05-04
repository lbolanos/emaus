import cron from 'node-cron';
import { AppDataSource } from '../data-source';
import { ResponsabilityAttachmentHistory } from '../entities/responsabilityAttachmentHistory.entity';

/**
 * Retention policy for `responsability_attachment_history`.
 *
 * Why this exists: every edit of a markdown attachment snapshots the previous
 * content into the history table. Without retention, a coordinator who edits
 * the same guion 100 times (typo fixes, rewording) leaves 100 forever-rows.
 * Across 10 retreats this becomes thousands of rows of low-value historical
 * snapshots — the vast majority older than the last 5–10 versions are never
 * restored.
 *
 * Policy: keep the **last MAX_VERSIONS_PER_ATTACHMENT versions per attachmentId**;
 * delete older ones. We do NOT cap by total table size or by age — both
 * heuristics lose value (the 30th version is just as restorable as the 5th if
 * the user kept editing). Per-attachment cap is what matches the UI: the
 * history panel shows 20 entries, so any version beyond that is invisible.
 */
const MAX_VERSIONS_PER_ATTACHMENT = 20;

export class AttachmentHistoryCleanupService {
	private static instance: AttachmentHistoryCleanupService;
	private isRunning = false;
	private historyRepo = AppDataSource.getRepository(ResponsabilityAttachmentHistory);

	public static getInstance(): AttachmentHistoryCleanupService {
		if (!AttachmentHistoryCleanupService.instance) {
			AttachmentHistoryCleanupService.instance = new AttachmentHistoryCleanupService();
		}
		return AttachmentHistoryCleanupService.instance;
	}

	public startScheduledTasks(): void {
		if (this.isRunning) {
			console.log('Attachment history cleanup already running');
			return;
		}

		// Daily at 03:15 UTC (off-peak; staggered 15 min after the daily role
		// cleanup at 02:00 to avoid contention on shared DB cycles).
		cron.schedule('15 3 * * *', async () => {
			console.log('🧹 Running attachment history cleanup...');
			await this.performCleanup();
		});

		this.isRunning = true;
		console.log('✅ Attachment history cleanup scheduled tasks started');
	}

	/**
	 * Find every attachment with > MAX_VERSIONS_PER_ATTACHMENT history rows;
	 * delete the rows beyond the most-recent MAX_VERSIONS_PER_ATTACHMENT.
	 *
	 * Returns count of rows deleted (for tests + logging).
	 */
	public async performCleanup(): Promise<{ deleted: number; attachmentsAffected: number }> {
		try {
			const overflows = await this.findOverflowingAttachments();
			if (!overflows.length) {
				console.log('✅ No history rows to prune');
				return { deleted: 0, attachmentsAffected: 0 };
			}

			let deleted = 0;
			for (const { attachmentId, total } of overflows) {
				const dropCount = total - MAX_VERSIONS_PER_ATTACHMENT;
				const oldRows = await this.historyRepo.find({
					where: { attachmentId },
					order: { savedAt: 'ASC' },
					take: dropCount,
					select: ['id'],
				});
				if (!oldRows.length) continue;
				const ids = oldRows.map((r) => r.id);
				const result = await this.historyRepo.delete(ids);
				deleted += result.affected ?? 0;
			}
			console.log(
				`🧹 Pruned ${deleted} history rows across ${overflows.length} attachments`,
			);
			return { deleted, attachmentsAffected: overflows.length };
		} catch (error) {
			console.error('❌ Error in attachment history cleanup:', error);
			return { deleted: 0, attachmentsAffected: 0 };
		}
	}

	/**
	 * Returns the list of attachmentIds that have more than MAX rows in
	 * history, with their current row count. Lets `performCleanup` know
	 * exactly how many to drop per attachment without scanning the whole table.
	 */
	private async findOverflowingAttachments(): Promise<
		Array<{ attachmentId: string; total: number }>
	> {
		const rows: Array<{ attachmentId: string; total: string | number }> =
			await this.historyRepo
				.createQueryBuilder('h')
				.select('h.attachmentId', 'attachmentId')
				.addSelect('COUNT(*)', 'total')
				.groupBy('h.attachmentId')
				.having('COUNT(*) > :max', { max: MAX_VERSIONS_PER_ATTACHMENT })
				.getRawMany();
		return rows.map((r) => ({
			attachmentId: r.attachmentId,
			total: typeof r.total === 'string' ? parseInt(r.total, 10) : r.total,
		}));
	}

	public getMaxVersions(): number {
		return MAX_VERSIONS_PER_ATTACHMENT;
	}
}

export const attachmentHistoryCleanupService = AttachmentHistoryCleanupService.getInstance();
