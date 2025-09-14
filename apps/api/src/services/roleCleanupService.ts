import cron from 'node-cron';
import { authorizationService } from '../middleware/authorization';
import { retreatRoleService } from './retreatRoleService';

export class RoleCleanupService {
	private static instance: RoleCleanupService;
	private isRunning: boolean = false;

	private constructor() {}

	public static getInstance(): RoleCleanupService {
		if (!RoleCleanupService.instance) {
			RoleCleanupService.instance = new RoleCleanupService();
		}
		return RoleCleanupService.instance;
	}

	public startScheduledTasks(): void {
		if (this.isRunning) {
			console.log('Role cleanup tasks are already running');
			return;
		}

		// Run every hour at minute 0
		cron.schedule('0 * * * *', async () => {
			console.log('🔄 Running scheduled role cleanup...');
			await this.performCleanup();
		});

		// Run every day at 2 AM for comprehensive cleanup
		cron.schedule('0 2 * * *', async () => {
			console.log('🧹 Running comprehensive daily cleanup...');
			await this.performComprehensiveCleanup();
		});

		this.isRunning = true;
		console.log('✅ Role cleanup scheduled tasks started');
	}

	public async performCleanup(): Promise<void> {
		try {
			const expiredCount = await authorizationService.expireOverdueInvitations();
			if (expiredCount > 0) {
				console.log(`📅 Expired ${expiredCount} overdue retreat invitations`);
			}
		} catch (error) {
			console.error('❌ Error in role cleanup:', error);
		}
	}

	public async performComprehensiveCleanup(): Promise<void> {
		try {
			console.log('🔍 Starting comprehensive role cleanup...');

			// 1. Expire overdue invitations
			const expiredCount = await authorizationService.expireOverdueInvitations();
			if (expiredCount > 0) {
				console.log(`📅 Expired ${expiredCount} overdue retreat invitations`);
			}

			// 2. Log system status
			console.log('✅ Comprehensive cleanup completed successfully');
		} catch (error) {
			console.error('❌ Error in comprehensive cleanup:', error);
		}
	}

	public async cleanupRetreatInvitations(retreatId: string): Promise<number> {
		try {
			const expiredCount = await authorizationService.expireOverdueInvitations();
			return expiredCount;
		} catch (error) {
			console.error(`❌ Error cleaning up invitations for retreat ${retreatId}:`, error);
			throw error;
		}
	}

	public async getCleanupStats(): Promise<{
		pendingInvitations: number;
		activeInvitations: number;
		expiredInvitations: number;
		revokedInvitations: number;
	}> {
		// This would require additional queries to get counts by status
		// For now, returning placeholder structure
		return {
			pendingInvitations: 0,
			activeInvitations: 0,
			expiredInvitations: 0,
			revokedInvitations: 0,
		};
	}
}

export const roleCleanupService = RoleCleanupService.getInstance();
