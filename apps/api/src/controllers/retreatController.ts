import { Request, Response, NextFunction } from 'express';
import {
	getRetreatsForUser,
	createRetreat as createRetreatService,
	findById,
	update,
} from '../services/retreatService';
import { AuthenticatedRequest } from '../middleware/authorization';

export const getAllRetreats = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const userId = (req as any).user?.id;
		if (!userId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Only return retreats the user has access to
		const retreats = await getRetreatsForUser(userId);
		res.json(retreats);
	} catch (error) {
		next(error);
	}
};

export const getRetreatById = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const retreat = await findById(req.params.id);
		if (!retreat) {
			return res.status(404).json({ message: 'Retreat not found' });
		}
		res.json(retreat);
	} catch (error) {
		next(error);
	}
};

export const getRetreatByIdPublic = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const retreat = await findById(req.params.id);
		if (!retreat) {
			return res.status(404).json({ message: 'Retreat not found' });
		}
		// Return only basic info needed for registration form validation
		res.json({
			id: retreat.id,
			parish: retreat.parish,
			isPublic: retreat.isPublic,
			startDate: retreat.startDate,
			endDate: retreat.endDate,
		});
	} catch (error) {
		next(error);
	}
};

export const updateRetreat = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const retreat = await update(req.params.id, req.body);
		if (!retreat) {
			return res.status(404).json({ message: 'Retreat not found' });
		}
		res.json(retreat);
	} catch (error) {
		next(error);
	}
};

export const createRetreat = async (
	req: AuthenticatedRequest,
	res: Response,
	next: NextFunction,
) => {
	try {
		const userId = req.user?.id;
		if (!userId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Add creator to the retreat data
		const retreatData = {
			...req.body,
			createdBy: userId,
		};

		const newRetreat = await createRetreatService(retreatData);

		// Automatically assign admin role to the creator for this retreat
		// Note: Temporarily disabled to isolate 500 error
		// try {
		// 	await retreatRoleService.inviteUserToRetreat(newRetreat.id, req.user!.email, 'admin', userId);
		// } catch (roleError) {
		// 	console.error('Error assigning admin role to retreat creator:', roleError);
		// 	// Don't fail the retreat creation if role assignment fails
		// }

		res.status(201).json(newRetreat);
	} catch (error) {
		next(error);
	}
};
