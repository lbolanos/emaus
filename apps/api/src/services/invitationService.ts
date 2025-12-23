import { AppDataSource } from '../data-source';
import { In } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserRetreat } from '../entities/userRetreat.entity';
import { UserRole } from '../entities/userRole.entity';
import { Retreat } from '../entities/retreat.entity';
import { Role } from '../entities/role.entity';
import { UserManagementMailer } from './userManagementMailer';
import { v4 as uuidv4 } from 'uuid';

interface InvitationRequest {
	email: string;
	roleId: number;
	retreatId: string;
}

interface InvitationResult {
	success: boolean;
	email: string;
	message?: string;
	userId?: string;
}

export class InvitationService {
	private userRepository = AppDataSource.getRepository(User);
	private userRetreatRepository = AppDataSource.getRepository(UserRetreat);
	private userRoleRepository = AppDataSource.getRepository(UserRole);
	private retreatRepository = AppDataSource.getRepository(Retreat);
	private roleRepository = AppDataSource.getRepository(Role);
	private mailer = new UserManagementMailer();

	async inviteUsers(
		ownerId: string,
		invitations: InvitationRequest[],
	): Promise<{
		usersInvited: InvitationResult[];
		usersCreated: string[];
	}> {
		const usersInvited: InvitationResult[] = [];
		const usersCreated: string[] = [];
		const usersToInvite = new Map<string, { userId: string; isNew: boolean }>();

		// Separate new users from existing users
		const emails = invitations.map((inv) => inv.email);
		const existingUsers = await this.userRepository.find({
			where: emails.map((email) => ({ email })),
		});

		const existingUserEmails = new Set(existingUsers.map((u) => u.email));
		const newEmails = emails.filter((email) => !existingUserEmails.has(email));

		// Create new users in transaction
		if (newEmails.length > 0) {
			await AppDataSource.transaction(async (transactionalEntityManager) => {
				const transactionalUserRepository = transactionalEntityManager.getRepository(User);

				for (const email of newEmails) {
					const invitationToken = uuidv4();
					const expiresAt = new Date();
					expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

					const newUser = transactionalUserRepository.create({
						id: uuidv4(),
						email,
						displayName: email.split('@')[0], // Default display name
						isPending: true,
						invitationToken,
						invitationExpiresAt: expiresAt,
					});

					await transactionalUserRepository.save(newUser);
					usersToInvite.set(email, { userId: newUser.id, isNew: true });
					usersCreated.push(email);
				}
			});
		}

		// Add all existing users (both pending and active)
		for (const user of existingUsers) {
			usersToInvite.set(user.email, { userId: user.id, isNew: false });
		}

		// Send invitation emails and create UserRetreat records
		const retreatIds = [...new Set(invitations.map((inv) => inv.retreatId))];
		const roleIds = [...new Set(invitations.map((inv) => inv.roleId))];

		const retreats = await this.retreatRepository.find({
			where: retreatIds.map((id) => ({ id })),
		});
		const roles = await this.roleRepository.find({
			where: roleIds.map((id) => ({ id })),
		});

		const retreatMap = new Map(retreats.map((r) => [r.id, r]));
		const roleMap = new Map(roles.map((r) => [r.id, r]));

		for (const invitation of invitations) {
			if (!usersToInvite.has(invitation.email)) {
				usersInvited.push({
					success: false,
					email: invitation.email,
					message: 'User not found - please try again',
				});
				continue;
			}

			const { userId } = usersToInvite.get(invitation.email)!;
			const retreat = retreatMap.get(invitation.retreatId);
			const role = roleMap.get(invitation.roleId);

			if (!retreat) {
				usersInvited.push({
					success: false,
					email: invitation.email,
					message: 'Retreat not found',
				});
				continue;
			}

			if (!role) {
				usersInvited.push({
					success: false,
					email: invitation.email,
					message: 'Role not found',
				});
				continue;
			}

			// Check if user already has an active or pending UserRetreat record for this retreat
			const existingUserRetreat = await this.userRetreatRepository.findOne({
				where: {
					userId,
					retreatId: invitation.retreatId,
					status: In(['active', 'pending']),
				},
			});

			if (existingUserRetreat) {
				usersInvited.push({
					success: false,
					email: invitation.email,
					message: 'User already has access to this retreat',
				});
				continue;
			}

			const invitationToken = uuidv4();
			const expiresAt = new Date();
			expiresAt.setDate(expiresAt.getDate() + 7);

			const userRetreat = this.userRetreatRepository.create({
				userId,
				retreatId: invitation.retreatId,
				roleId: invitation.roleId,
				invitedBy: ownerId,
				invitedAt: new Date(),
				expiresAt,
				status: 'pending',
				invitationToken,
			});

			await this.userRetreatRepository.save(userRetreat);

			// Assign regular UserRole for administrative purposes
			const regularRole = await this.roleRepository.findOne({
				where: { name: 'regular' },
			});

			if (regularRole) {
				// Check if user already has this role
				const existingUserRole = await this.userRoleRepository.findOne({
					where: { userId, roleId: regularRole.id },
				});

				if (!existingUserRole) {
					const userRole = this.userRoleRepository.create({
						userId,
						roleId: regularRole.id,
					});

					await this.userRoleRepository.save(userRole);
				}
			}

			// Send invitation email
			const emailData = {
				user: {
					id: userId,
					email: invitation.email,
					displayName: invitation.email.split('@')[0],
				} as User,
				retreat,
				role,
				resetToken: invitationToken,
				inviterName:
					(await this.userRepository.findOne({ where: { id: ownerId } }))?.displayName ||
					'Equipo de Emaús',
				shareLink: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invitation/${invitationToken}`,
			};

			const emailSent = await this.mailer.sendUserInvitation(
				invitation.email,
				invitation.retreatId,
				emailData,
			);

			usersInvited.push({
				success: emailSent,
				email: invitation.email,
				message: emailSent ? 'Invitation sent successfully' : 'Failed to send invitation email',
				userId,
			});
		}

		return { usersInvited, usersCreated };
	}

	async acceptInvitation(
		userId: string,
		displayName: string,
		password: string,
		inviterId?: string,
	): Promise<{ success: boolean; message?: string; user?: any }> {
		const user = await this.userRepository.findOne({
			where: { id: userId },
			relations: ['userRetreats'],
		});

		if (!user) {
			return { success: false, message: 'User not found' };
		}

		const isNewUser = user.isPending;

		// For new users (pending), check invitation expiration
		if (user.isPending) {
			if (user.invitationExpiresAt && user.invitationExpiresAt < new Date()) {
				return { success: false, message: 'Invitation has expired' };
			}

			// Validate inviter if provided for new users
			if (inviterId) {
				const inviter = await this.userRepository.findOne({
					where: { id: inviterId },
					relations: ['userRetreats'],
				});

				if (!inviter) {
					return { success: false, message: 'Inviter not found' };
				}

				// Check if inviter and invitee share at least one retreat
				const inviterRetreatIds = inviter.userRetreats.map((ur) => ur.retreatId);
				const inviteeRetreatIds = user.userRetreats.map((ur) => ur.retreatId);
				const sharedRetreats = inviterRetreatIds.filter((id) => inviteeRetreatIds.includes(id));

				if (sharedRetreats.length === 0) {
					return { success: false, message: 'Invalid inviter - no shared retreats' };
				}
			}

			// Update user (password will be hashed automatically by User entity)
			user.displayName = displayName;
			user.password = password;
			user.isPending = false;
			user.invitationToken = undefined;
			user.invitationExpiresAt = undefined;

			await this.userRepository.save(user);
		}

		// Update UserRetreat records to active (for both new and existing users)
		await this.userRetreatRepository.update({ userId, status: 'pending' }, { status: 'active' });

		return {
			success: true,
			message: isNewUser ? 'Account created and invitation accepted' : 'Invitation accepted successfully',
			user: {
				id: user.id,
				email: user.email,
				displayName: user.displayName,
				photo: user.photo,
			},
		};
	}

	async validateInvitationToken(token: string): Promise<{
		valid: boolean;
		user?: User;
		message?: string;
	}> {
		// First check user_retreats table for the token
		const userRetreat = await this.userRetreatRepository.findOne({
			where: { invitationToken: token, status: 'pending' },
			relations: ['user'],
		});

		if (userRetreat) {
			// Check if the invitation has expired
			if (userRetreat.expiresAt && userRetreat.expiresAt < new Date()) {
				return { valid: false, message: 'Invitation has expired' };
			}

			// Also check if the user is still pending
			if (!userRetreat.user.isPending) {
				return { valid: false, message: 'Invitation already accepted' };
			}

			return { valid: true, user: userRetreat.user };
		}

		// Fallback to checking users table for backward compatibility
		const user = await this.userRepository.findOne({
			where: { invitationToken: token },
		});

		if (!user) {
			return { valid: false, message: 'Invalid invitation token' };
		}

		if (!user.isPending) {
			return { valid: false, message: 'Invitation already accepted' };
		}

		if (user.invitationExpiresAt && user.invitationExpiresAt < new Date()) {
			return { valid: false, message: 'Invitation has expired' };
		}

		return { valid: true, user };
	}

	async getInvitationStatus(token: string): Promise<{
		valid: boolean;
		user?: {
			id: string;
			email: string;
			displayName: string;
		};
		retreats?: Array<{
			id: string;
			parish: string;
			startDate: Date;
			endDate: Date;
		}>;
		message?: string;
	}> {
		const validation = await this.validateInvitationToken(token);

		if (!validation.valid || !validation.user) {
			return { valid: false, message: validation.message };
		}

		const userRetreats = await this.userRetreatRepository.find({
			where: { userId: validation.user.id, status: 'pending' },
			relations: ['retreat'],
		});

		const retreats = userRetreats.map((ur) => ({
			id: ur.retreat.id,
			parish: ur.retreat.parish,
			startDate: ur.retreat.startDate,
			endDate: ur.retreat.endDate,
		}));

		return {
			valid: true,
			user: {
				id: validation.user.id,
				email: validation.user.email,
				displayName: validation.user.displayName,
			},
			retreats,
		};
	}
}
