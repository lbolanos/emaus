import { Response } from 'express';
import { authorizationService, AuthenticatedRequest } from '../middleware/authorization';
import { retreatRoleService } from '../services/retreatRoleService';
import { Role } from '../entities/role.entity';
import { AppDataSource } from '../data-source';
import { In } from 'typeorm';

const ASSIGNABLE_ROLES = ['admin', 'treasurer', 'logistics', 'communications', 'regular_server'];

export const inviteUserToRetreat = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId } = req.params;
		const { email, roleName, expiresAt } = req.body;
		const invitedBy = req.user?.id;

		if (!invitedBy) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		if (!email || !roleName) {
			return res.status(400).json({ message: 'Email and role name are required' });
		}

		if (!ASSIGNABLE_ROLES.includes(roleName)) {
			return res.status(400).json({ message: 'Invalid role' });
		}

		const userRetreat = await retreatRoleService.inviteUserToRetreat(
			retreatId,
			email,
			roleName,
			invitedBy,
			expiresAt ? new Date(expiresAt) : undefined,
			req,
		);

		res.status(201).json({
			message: 'User invited successfully',
			userRetreat: {
				id: userRetreat.id,
				userId: userRetreat.userId,
				retreatId: userRetreat.retreatId,
				role: userRetreat.role,
				status: userRetreat.status,
				invitedAt: userRetreat.invitedAt,
				expiresAt: userRetreat.expiresAt,
			},
		});
	} catch (error) {
		console.error('Error inviting user to retreat:', error);
		const msg = error instanceof Error ? error.message : '';
		if (msg === 'User not found') {
			return res.status(404).json({ message: 'Resource not found' });
		}
		if (msg === 'Role not found') {
			return res.status(400).json({ message: 'Invalid request' });
		}
		if (msg.includes('Only retreat creator')) {
			return res.status(403).json({ message: 'Forbidden' });
		}
		res.status(500).json({ message: 'Internal server error' });
	}
};

export const removeUserFromRetreat = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId, userId } = req.params;
		const removedBy = req.user?.id;

		if (!removedBy) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		await retreatRoleService.removeUserFromRetreat(retreatId, userId, removedBy, req);
		res.json({ message: 'User removed from retreat successfully' });
	} catch (error) {
		console.error('Error removing user from retreat:', error);
		const msg = error instanceof Error ? error.message : '';
		if (msg === 'User not found') {
			return res.status(404).json({ message: 'Resource not found' });
		}
		if (msg.includes('Only retreat creator')) {
			return res.status(403).json({ message: 'Forbidden' });
		}
		res.status(500).json({ message: 'Internal server error' });
	}
};

export const getRetreatUsers = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId } = req.params;
		const requestUserId = req.user?.id;

		if (!requestUserId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Authorization is handled by middleware (requireRetreatAccessOrCreator)
		const users = await retreatRoleService.getRetreatUsers(retreatId);
		res.json(users);
	} catch (error) {
		console.error('Error getting retreat users:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
};

export const getUserRetreats = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { userId } = req.params;
		const requestUserId = req.user?.id;

		if (!requestUserId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Users can only see their own retreats unless they have admin permissions
		if (userId !== requestUserId) {
			const hasAdminPermission = await authorizationService.hasPermission(
				requestUserId,
				'user:read',
			);
			if (!hasAdminPermission) {
				return res.status(403).json({ message: 'Forbidden' });
			}
		}

		const retreats = await retreatRoleService.getUserRetreats(userId);
		res.json(retreats);
	} catch (error) {
		console.error('Error getting user retreats:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
};

export const approveRetreatInvitation = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId, userId } = req.params;
		const approvedBy = req.user?.id;

		if (!approvedBy) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		const userRetreat = await retreatRoleService.approveRetreatInvitation(
			retreatId,
			userId,
			approvedBy,
		);
		res.json({
			message: 'Invitation approved successfully',
			userRetreat: {
				id: userRetreat.id,
				status: userRetreat.status,
			},
		});
	} catch (error) {
		console.error('Error approving retreat invitation:', error);
		const msg = error instanceof Error ? error.message : '';
		if (msg === 'User not found' || msg === 'Pending invitation not found') {
			return res.status(404).json({ message: 'Resource not found' });
		}
		if (msg.includes('Only retreat creator')) {
			return res.status(403).json({ message: 'Forbidden' });
		}
		res.status(500).json({ message: 'Internal server error' });
	}
};

export const rejectRetreatInvitation = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId, userId } = req.params;
		const rejectedBy = req.user?.id;

		if (!rejectedBy) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		await retreatRoleService.rejectRetreatInvitation(retreatId, userId, rejectedBy);
		res.json({ message: 'Invitation rejected successfully' });
	} catch (error) {
		console.error('Error rejecting retreat invitation:', error);
		const msg = error instanceof Error ? error.message : '';
		if (msg === 'User not found' || msg === 'Pending invitation not found') {
			return res.status(404).json({ message: 'Resource not found' });
		}
		if (msg.includes('Only retreat creator')) {
			return res.status(403).json({ message: 'Forbidden' });
		}
		res.status(500).json({ message: 'Internal server error' });
	}
};

export const getAvailableRoles = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const roleRepository = AppDataSource.getRepository(Role);
		const roles = await roleRepository.find({
			where: {
				name: In(['admin', 'treasurer', 'logistics', 'communications', 'regular_server']),
			},
			select: ['id', 'name', 'description'],
		});

		res.json(roles);
	} catch (error) {
		console.error('Error getting available roles:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
};
