import { Request, Response } from 'express';
import { permissionInheritanceService } from '../services/permissionInheritanceService';
import { authorizationService, AuthenticatedRequest } from '../middleware/authorization';
import { AuditService } from '../services/auditService';
import { AppDataSource } from '../data-source';

const auditService = new AuditService(AppDataSource);

export const getInheritedPermissions = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId } = req.params;
		const userId = req.user?.id;

		if (!req.user || !userId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Check if user has access to this retreat
		const hasAccess = await authorizationService.hasRetreatAccess(userId, retreatId);
		if (!hasAccess) {
			return res.status(403).json({ message: 'Forbidden' });
		}

		const permissions = await permissionInheritanceService.getInheritedPermissions(
			userId,
			retreatId,
		);
		res.json({ permissions });
	} catch (error) {
		console.error('Error getting inherited permissions:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const getEffectivePermissions = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId } = req.params;
		const userId = req.user?.id;

		if (!req.user || !userId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Check if user has access to this retreat
		const hasAccess = await authorizationService.hasRetreatAccess(userId, retreatId);
		if (!hasAccess) {
			return res.status(403).json({ message: 'Forbidden' });
		}

		const permissions = await permissionInheritanceService.getEffectivePermissions(
			userId,
			retreatId,
		);
		res.json({ permissions });
	} catch (error) {
		console.error('Error getting effective permissions:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const checkDelegationPossibility = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId, toUserId } = req.params;
		const { permissions } = req.body;
		const fromUserId = req.user?.id;

		if (!req.user || !fromUserId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Check if user has access to this retreat
		const hasAccess = await authorizationService.hasRetreatAccess(fromUserId, retreatId);
		if (!hasAccess) {
			return res.status(403).json({ message: 'Forbidden' });
		}

		if (!permissions || !Array.isArray(permissions)) {
			return res.status(400).json({ message: 'Permissions array is required' });
		}

		const delegationCheck = await permissionInheritanceService.canDelegatePermissions(
			fromUserId,
			toUserId,
			retreatId,
			permissions,
		);

		res.json(delegationCheck);
	} catch (error) {
		console.error('Error checking delegation possibility:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const createPermissionDelegation = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId, toUserId } = req.params;
		const { permissions, duration } = req.body;
		const fromUserId = req.user?.id;

		if (!req.user || !fromUserId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Check if user has access to this retreat
		const hasAccess = await authorizationService.hasRetreatAccess(fromUserId, retreatId);
		if (!hasAccess) {
			return res.status(403).json({ message: 'Forbidden' });
		}

		if (!permissions || !Array.isArray(permissions)) {
			return res.status(400).json({ message: 'Permissions array is required' });
		}

		const delegationId = await permissionInheritanceService.createPermissionDelegation(
			fromUserId,
			toUserId,
			retreatId,
			permissions,
			duration,
		);

		// Log the delegation creation
		await auditService.logPermissionOverrideAdded(
			delegationId,
			fromUserId,
			toUserId,
			retreatId,
			permissions,
			{
				ipAddress: req.ip,
				userAgent: req.headers['user-agent'],
				description: `Permission delegation created for ${duration || 'default'} hours`,
			},
		);

		res.status(201).json({
			message: 'Permission delegation created successfully',
			delegationId,
		});
	} catch (error) {
		console.error('Error creating permission delegation:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const getActiveDelegations = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId } = req.params;
		const userId = req.user?.id;

		if (!req.user || !userId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Check if user has access to this retreat
		const hasAccess = await authorizationService.hasRetreatAccess(userId, retreatId);
		if (!hasAccess) {
			return res.status(403).json({ message: 'Forbidden' });
		}

		const delegations = await permissionInheritanceService.getActiveDelegations(userId, retreatId);
		res.json({ delegations });
	} catch (error) {
		console.error('Error getting active delegations:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const revokeDelegation = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { delegationId } = req.params;
		const revokedBy = req.user?.id;

		if (!req.user || !revokedBy) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		const success = await permissionInheritanceService.revokeDelegation(delegationId, revokedBy);

		if (!success) {
			return res.status(404).json({ message: 'Delegation not found or already revoked' });
		}

		// Log the delegation revocation
		await auditService.logPermissionOverrideRemoved(
			delegationId,
			revokedBy,
			'', // Will be filled with actual user ID in service
			'', // Will be filled with actual retreat ID in service
			['permission_delegation'],
			{
				ipAddress: req.ip,
				userAgent: req.headers['user-agent'],
				description: 'Permission delegation revoked',
			},
		);

		res.json({ message: 'Delegation revoked successfully' });
	} catch (error) {
		console.error('Error revoking delegation:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const getInheritanceRules = async (req: Request, res: Response) => {
	try {
		const rules = permissionInheritanceService.getInheritanceRules();
		res.json({ rules });
	} catch (error) {
		console.error('Error getting inheritance rules:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const getDelegationRules = async (req: Request, res: Response) => {
	try {
		const rules = permissionInheritanceService.getDelegationRules();
		res.json({ rules });
	} catch (error) {
		console.error('Error getting delegation rules:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const addInheritanceRule = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { parentRole, childRole, inheritPermissions, inheritDelegation, conditions } = req.body;
		const userId = req.user?.id;

		if (!req.user || !userId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Only system administrators can modify inheritance rules
		const hasAdminPermission = await authorizationService.hasPermission(userId, 'system:admin');
		if (!hasAdminPermission) {
			return res.status(403).json({ message: 'Forbidden - System administrator access required' });
		}

		permissionInheritanceService.addInheritanceRule({
			parentRole,
			childRole,
			inheritPermissions,
			inheritDelegation,
			conditions,
		});

		res.json({ message: 'Inheritance rule added successfully' });
	} catch (error) {
		console.error('Error adding inheritance rule:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const removeInheritanceRule = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { parentRole, childRole } = req.params;
		const userId = req.user?.id;

		if (!req.user || !userId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Only system administrators can modify inheritance rules
		const hasAdminPermission = await authorizationService.hasPermission(userId, 'system:admin');
		if (!hasAdminPermission) {
			return res.status(403).json({ message: 'Forbidden - System administrator access required' });
		}

		const success = permissionInheritanceService.removeInheritanceRule(parentRole, childRole);

		if (!success) {
			return res.status(404).json({ message: 'Inheritance rule not found' });
		}

		res.json({ message: 'Inheritance rule removed successfully' });
	} catch (error) {
		console.error('Error removing inheritance rule:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};
