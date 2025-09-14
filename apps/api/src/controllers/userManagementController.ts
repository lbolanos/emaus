import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { UserManagementMailer } from '../services/userManagementMailer';
import { User } from '../entities/user.entity';
import { Retreat } from '../entities/retreat.entity';

const userRepository = AppDataSource.getRepository(User);
const retreatRepository = AppDataSource.getRepository(Retreat);

export class UserManagementController {
	private mailer: UserManagementMailer;

	constructor() {
		this.mailer = new UserManagementMailer();
	}

	async inviteUserToRetreat(req: Request, res: Response) {
		try {
			const { email, retreatId, inviterName, shareLink } = req.body;
			const userId = (req.user as any)?.id;

			if (!email || !retreatId || !inviterName || !shareLink) {
				return res.status(400).json({
					error: 'Email, retreatId, inviterName, and shareLink are required',
				});
			}

			// Get user details (this would typically come from the database)
			const user = await userRepository.findOne({ where: { id: userId } });
			const retreat = await retreatRepository.findOne({ where: { id: retreatId } });

			if (!user || !retreat) {
				return res.status(404).json({ error: 'User or retreat not found' });
			}

			const emailData = {
				user,
				retreat,
				inviterName,
				shareLink,
			};

			const success = await this.mailer.sendUserInvitation(email, retreatId, emailData);

			if (success) {
				return res.json({ message: 'Invitation sent successfully' });
			} else {
				return res.status(500).json({ error: 'Failed to send invitation' });
			}
		} catch (error) {
			console.error('Error in inviteUserToRetreat:', error);
			return res.status(500).json({ error: 'Internal server error' });
		}
	}

	async sendPasswordReset(req: Request, res: Response) {
		try {
			const { email, retreatId, resetToken } = req.body;
			const userId = (req.user as any)?.id;

			if (!email || !retreatId || !resetToken) {
				return res.status(400).json({
					error: 'Email, retreatId, and resetToken are required',
				});
			}

			// Get user and retreat details
			const user = await userRepository.findOne({ where: { id: userId } });
			const retreat = await retreatRepository.findOne({ where: { id: retreatId } });

			if (!user || !retreat) {
				return res.status(404).json({ error: 'User or retreat not found' });
			}

			const emailData = {
				user,
				retreat,
				resetToken,
			};

			const success = await this.mailer.sendPasswordReset(email, retreatId, emailData);

			if (success) {
				return res.json({ message: 'Password reset email sent successfully' });
			} else {
				return res.status(500).json({ error: 'Failed to send password reset email' });
			}
		} catch (error) {
			console.error('Error in sendPasswordReset:', error);
			return res.status(500).json({ error: 'Internal server error' });
		}
	}

	async notifyRetreatShared(req: Request, res: Response) {
		try {
			const { email, retreatId, inviterName, shareLink } = req.body;
			const userId = (req.user as any)?.id;

			if (!email || !retreatId || !inviterName || !shareLink) {
				return res.status(400).json({
					error: 'Email, retreatId, inviterName, and shareLink are required',
				});
			}

			// Get user and retreat details
			const user = await userRepository.findOne({ where: { id: userId } });
			const retreat = await retreatRepository.findOne({ where: { id: retreatId } });

			if (!user || !retreat) {
				return res.status(404).json({ error: 'User or retreat not found' });
			}

			const emailData = {
				user,
				retreat,
				inviterName,
				shareLink,
			};

			const success = await this.mailer.sendRetreatSharedNotification(email, retreatId, emailData);

			if (success) {
				return res.json({ message: 'Retreat shared notification sent successfully' });
			} else {
				return res.status(500).json({ error: 'Failed to send retreat shared notification' });
			}
		} catch (error) {
			console.error('Error in notifyRetreatShared:', error);
			return res.status(500).json({ error: 'Internal server error' });
		}
	}

	async verifySmtpConnection(req: Request, res: Response) {
		try {
			const isConnected = await this.mailer.verifyConnection();

			if (isConnected) {
				return res.json({ message: 'SMTP connection verified successfully' });
			} else {
				return res.status(500).json({ error: 'Failed to verify SMTP connection' });
			}
		} catch (error) {
			console.error('Error in verifySmtpConnection:', error);
			return res.status(500).json({ error: 'Internal server error' });
		}
	}
}
