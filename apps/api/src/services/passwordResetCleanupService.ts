import cron from 'node-cron';
import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { IsNull, LessThan, Not } from 'typeorm';

class PasswordResetCleanupService {
	/**
	 * Clean up expired password reset tokens (unused)
	 */
	public async cleanupExpiredTokens(): Promise<number> {
		const userRepository = AppDataSource.getRepository(User);

		const result = await userRepository.update(
			{
				passwordResetTokenExpiresAt: LessThan(new Date()),
				passwordResetTokenUsedAt: IsNull(),
			},
			{
				passwordResetToken: null,
				passwordResetTokenExpiresAt: null,
			}
		);

		const count = result.affected || 0;
		if (count > 0) {
			console.log(`🧹 Cleaned up ${count} expired password reset tokens`);
		}

		return count;
	}

	/**
	 * Clean up used password reset tokens older than 24 hours
	 */
	public async cleanupUsedTokens(): Promise<number> {
		const userRepository = AppDataSource.getRepository(User);
		const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

		const result = await userRepository.update(
			{
				passwordResetTokenUsedAt: LessThan(twentyFourHoursAgo),
			},
			{
				passwordResetToken: null,
				passwordResetTokenExpiresAt: null,
				passwordResetTokenUsedAt: null,
			}
		);

		const count = result.affected || 0;
		if (count > 0) {
			console.log(`🧹 Cleaned up ${count} used password reset tokens`);
		}

		return count;
	}

	/**
	 * Start scheduled cleanup tasks
	 */
	public startScheduledTasks(): void {
		// Run every hour
		cron.schedule('0 * * * *', async () => {
			console.log('🔄 Running password reset token cleanup...');
			try {
				await this.cleanupExpiredTokens();
				await this.cleanupUsedTokens();
			} catch (error) {
				console.error('Error during password reset cleanup:', error);
			}
		});

		console.log('✅ Password reset token cleanup scheduled (hourly)');
	}
}

export const passwordResetCleanupService = new PasswordResetCleanupService();
