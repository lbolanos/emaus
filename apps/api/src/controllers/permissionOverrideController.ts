import { Response } from 'express';
import {
	permissionOverrideService,
	PermissionOverride,
} from '../services/permissionOverrideService';
import { authorizationService, AuthenticatedRequest } from '../middleware/authorization';

export const setPermissionOverrides = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId, userId } = req.params;
		const { overrides, reason } = req.body;
		const setBy = req.user?.id;

		if (!req.user || !setBy) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Only retreat creators can set permission overrides
		const isCreator = await authorizationService.isRetreatCreator(setBy, retreatId);
		if (!isCreator) {
			return res
				.status(403)
				.json({ message: 'Only retreat creators can set permission overrides' });
		}

		if (!Array.isArray(overrides)) {
			return res.status(400).json({ message: 'Overrides must be an array' });
		}

		// Validate override structure
		for (const override of overrides) {
			if (!override.resource || !override.operation || typeof override.granted !== 'boolean') {
				return res.status(400).json({
					message: 'Each override must have resource, operation, and granted fields',
				});
			}
		}

		await permissionOverrideService.setPermissionOverride(
			userId,
			retreatId,
			overrides,
			setBy,
			reason,
		);

		res.json({ message: 'Permission overrides set successfully' });
	} catch (error) {
		console.error('Error setting permission overrides:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const getPermissionOverrides = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId, userId } = req.params;
		const requestUserId = req.user?.id;

		if (!req.user || !requestUserId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Users can view their own overrides, retreat creators can view all
		if (userId !== requestUserId) {
			const isCreator = await authorizationService.isRetreatCreator(requestUserId, retreatId);
			if (!isCreator) {
				return res.status(403).json({ message: 'Forbidden' });
			}
		}

		const overrides = await permissionOverrideService.getPermissionOverrides(userId, retreatId);
		res.json(overrides);
	} catch (error) {
		console.error('Error getting permission overrides:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const clearPermissionOverrides = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId, userId } = req.params;
		const clearedBy = req.user?.id;

		if (!req.user || !clearedBy) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Only retreat creators can clear permission overrides
		const isCreator = await authorizationService.isRetreatCreator(clearedBy, retreatId);
		if (!isCreator) {
			return res
				.status(403)
				.json({ message: 'Only retreat creators can clear permission overrides' });
		}

		await permissionOverrideService.clearPermissionOverrides(userId, retreatId, clearedBy);
		res.json({ message: 'Permission overrides cleared successfully' });
	} catch (error) {
		console.error('Error clearing permission overrides:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const getRetreatPermissionOverrides = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId } = req.params;
		const userId = req.user?.id;

		if (!req.user || !userId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Only retreat creators can view all retreat permission overrides
		const isCreator = await authorizationService.isRetreatCreator(userId, retreatId);
		if (!isCreator) {
			return res.status(403).json({ message: 'Forbidden' });
		}

		const overrides = await permissionOverrideService.getRetreatPermissionOverrides(retreatId);
		res.json(overrides);
	} catch (error) {
		console.error('Error getting retreat permission overrides:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const getUserPermissionsWithOverrides = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId, userId } = req.params;
		const requestUserId = req.user?.id;

		if (!req.user || !requestUserId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Users can view their own effective permissions, retreat creators can view others
		if (userId !== requestUserId) {
			const isCreator = await authorizationService.isRetreatCreator(requestUserId, retreatId);
			if (!isCreator) {
				return res.status(403).json({ message: 'Forbidden' });
			}
		}

		// Get base permissions
		const userPermissions = await authorizationService.getUserPermissions(userId);

		// Apply permission overrides
		const effectivePermissions = await permissionOverrideService.applyPermissionOverrides(
			userPermissions.permissions,
			userId,
			retreatId,
		);

		// Get the overrides for reference
		const overrides = await permissionOverrideService.getPermissionOverrides(userId, retreatId);

		res.json({
			basePermissions: userPermissions.permissions,
			permissionOverrides: overrides,
			effectivePermissions,
			roles: userPermissions.roles,
		});
	} catch (error) {
		console.error('Error getting user permissions with overrides:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};
