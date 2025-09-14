import { Request, Response } from 'express';
import { roleRequestService } from '../services/roleRequestService';
import { authorizationService, AuthenticatedRequest } from '../middleware/authorization';

export const createRoleRequest = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId, requestedRole, message } = req.body;
		const userId = req.user?.id;

		if (!userId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		if (!retreatId || !requestedRole) {
			return res.status(400).json({ message: 'Retreat ID and requested role are required' });
		}

		// Check if user can request access to this retreat
		const hasAccess = await authorizationService.hasRetreatAccess(userId, retreatId);
		if (hasAccess) {
			return res.status(400).json({ message: 'You already have access to this retreat' });
		}

		const roleRequest = await roleRequestService.createRoleRequest(
			userId,
			retreatId,
			requestedRole,
			message,
			req,
		);

		res.status(201).json({
			message: 'Role request submitted successfully',
			roleRequest,
		});
	} catch (error) {
		console.error('Error in role request:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const getRetreatRoleRequests = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId } = req.params;
		const userId = req.user?.id;

		if (!userId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Only retreat creators can view role requests
		const isCreator = await authorizationService.isRetreatCreator(userId, retreatId);
		if (!isCreator) {
			return res.status(403).json({ message: 'Only retreat creators can view role requests' });
		}

		const requests = await roleRequestService.getRetreatRoleRequests(retreatId);
		res.json(requests);
	} catch (error) {
		console.error('Error getting retreat role requests:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const getUserRoleRequests = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { userId } = req.params;
		const requestUserId = req.user?.id;

		if (!requestUserId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Users can only see their own requests unless they have admin permissions
		if (userId !== requestUserId) {
			const hasAdminPermission = await authorizationService.hasPermission(
				requestUserId,
				'user:read',
			);
			if (!hasAdminPermission) {
				return res.status(403).json({ message: 'Forbidden' });
			}
		}

		const requests = await roleRequestService.getUserRoleRequests(userId);
		res.json(requests);
	} catch (error) {
		console.error('Error getting user role requests:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const approveRoleRequest = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { requestId } = req.params;
		const approvedBy = req.user?.id;

		if (!approvedBy) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		const roleRequest = await roleRequestService.approveRoleRequest(requestId, approvedBy, req);
		res.json({
			message: 'Role request approved successfully',
			roleRequest,
		});
	} catch (error) {
		console.error('Error approving role request:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const rejectRoleRequest = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { requestId } = req.params;
		const { rejectionReason } = req.body;
		const rejectedBy = req.user?.id;

		if (!rejectedBy) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		const roleRequest = await roleRequestService.rejectRoleRequest(
			requestId,
			rejectedBy,
			rejectionReason,
			req,
		);
		res.json({
			message: 'Role request rejected successfully',
			roleRequest,
		});
	} catch (error) {
		console.error('Error rejecting role request:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const getActiveUserRequest = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId } = req.params;
		const userId = req.user?.id;

		if (!userId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		const request = await roleRequestService.getActiveRequest(userId, retreatId);
		if (!request) {
			return res.status(404).json({ message: 'No active role request found' });
		}

		res.json(request);
	} catch (error) {
		console.error('Error getting active user request:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};
