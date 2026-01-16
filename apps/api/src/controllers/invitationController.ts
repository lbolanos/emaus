import { Request, Response } from 'express';
import { InvitationService } from '../services/invitationService';
import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { authorizationService } from '../middleware/authorization';
import { RecaptchaService } from '../services/recaptchaService';

const recaptchaService = new RecaptchaService();

export class InvitationController {
	private invitationService: InvitationService;

	constructor() {
		this.invitationService = new InvitationService();
	}

	async inviteUsers(req: Request, res: Response) {
		try {
			const { invitations } = req.body;
			const userId = (req.user as any)?.id;

			if (!invitations || !Array.isArray(invitations)) {
				return res.status(400).json({
					error: 'Invitations array is required',
				});
			}

			if (invitations.length > 10) {
				return res.status(400).json({
					error: 'Maximum 10 invitations per request',
				});
			}

			// Validate each invitation and check retreat access
			for (const invitation of invitations) {
				if (!invitation.email || !invitation.roleId || !invitation.retreatId) {
					return res.status(400).json({
						error: 'Each invitation must include email, roleId, and retreatId',
					});
				}

				// Check retreat access
				const hasAccess = await authorizationService.hasRetreatAccess(userId, invitation.retreatId);
				if (!hasAccess) {
					return res.status(403).json({
						error: `Forbidden - No access to retreat ${invitation.retreatId}`,
					});
				}
			}

			const result = await this.invitationService.inviteUsers(userId, invitations);

			return res.json({
				message: 'Invitation process completed',
				usersInvited: result.usersInvited,
				usersCreated: result.usersCreated,
			});
		} catch (error) {
			console.error('Error in inviteUsers:', error);
			return res.status(500).json({
				error: 'Internal server error',
			});
		}
	}

	async acceptInvitation(req: Request, res: Response) {
		try {
			const { id: userId } = req.params;
			const { displayName, password, inviterId, recaptchaToken } = req.body;

			// Verify reCAPTCHA token
			const recaptchaResult = await recaptchaService.verifyToken(recaptchaToken, {
				minScore: 0.5,
			});

			if (!recaptchaResult.valid) {
				return res.status(400).json({
					error: recaptchaResult.error || 'reCAPTCHA verification failed',
				});
			}

			if (!displayName || !password) {
				return res.status(400).json({
					error: 'Display name and password are required',
				});
			}

			if (password.length < 6) {
				return res.status(400).json({
					error: 'Password must be at least 6 characters long',
				});
			}

			const result = await this.invitationService.acceptInvitation(
				userId,
				displayName,
				password,
				inviterId,
			);

			if (!result.success) {
				return res.status(400).json({
					error: result.message,
				});
			}

			// Issue authentication token (you'll need to implement this based on your auth system)
			// For now, we'll just return success
			return res.json({
				message: 'Invitation accepted successfully',
				user: result.user,
			});
		} catch (error) {
			console.error('Error in acceptInvitation:', error);
			return res.status(500).json({
				error: 'Internal server error',
			});
		}
	}

	async getInvitationStatus(req: Request, res: Response) {
		try {
			const { token } = req.params;

			const result = await this.invitationService.getInvitationStatus(token);

			if (!result.valid) {
				return res.status(400).json({
					error: result.message,
				});
			}

			return res.json(result);
		} catch (error) {
			console.error('Error in getInvitationStatus:', error);
			return res.status(500).json({
				error: 'Internal server error',
			});
		}
	}

	async validateInvitationToken(req: Request, res: Response) {
		try {
			const { token } = req.body;

			if (!token) {
				return res.status(400).json({
					error: 'Token is required',
				});
			}

			const result = await this.invitationService.validateInvitationToken(token);

			return res.json(result);
		} catch (error) {
			console.error('Error in validateInvitationToken:', error);
			return res.status(500).json({
				error: 'Internal server error',
			});
		}
	}
}
