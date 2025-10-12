import { Request, Response, NextFunction } from 'express';
import {
	findAllResponsibilities,
	findResponsabilityById,
	createResponsability as createResponsabilityService,
	updateResponsability as updateResponsabilityService,
	deleteResponsability as deleteResponsabilityService,
	assignResponsabilityToParticipant as assignResponsabilityToParticipantService,
	removeResponsabilityFromParticipant as removeResponsabilityFromParticipantService,
} from '../services/responsabilityService';
import { authorizationService } from '../middleware/authorization';

// Helper function to check retreat access
const checkRetreatAccess = async (req: Request, retreatId: string): Promise<boolean> => {
	if (!req.user) {
		return false;
	}
	const userId = (req.user as any)?.id;
	if (!userId) {
		return false;
	}
	return await authorizationService.hasRetreatAccess(userId, retreatId);
};

export const getAllResponsibilities = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId } = req.query;

		// If retreatId is provided, check retreat access
		if (retreatId) {
			const hasAccess = await checkRetreatAccess(req, retreatId as string);
			if (!hasAccess) {
				return res.status(403).json({ message: 'Forbidden - No access to this retreat' });
			}
		}

		const responsibilities = await findAllResponsibilities(retreatId as string | undefined);
		res.json(responsibilities);
	} catch (error) {
		next(error);
	}
};

export const getResponsabilityById = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const responsability = await findResponsabilityById(req.params.id);
		if (responsability) {
			// Check retreat access
			const hasAccess = await checkRetreatAccess(req, responsability.retreatId);
			if (!hasAccess) {
				return res.status(403).json({ message: 'Forbidden - No access to this retreat' });
			}

			res.json(responsability);
		} else {
			res.status(404).json({ message: 'Retreat responsability not found' });
		}
	} catch (error) {
		next(error);
	}
};

export const createResponsability = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId } = req.body;

		// Check retreat access
		const hasAccess = await checkRetreatAccess(req, retreatId);
		if (!hasAccess) {
			return res.status(403).json({ message: 'Forbidden - No access to this retreat' });
		}

		const newResponsability = await createResponsabilityService(req.body);
		res.status(201).json(newResponsability);
	} catch (error) {
		next(error);
	}
};

export const updateResponsability = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const updatedResponsability = await updateResponsabilityService(req.params.id, req.body);
		if (updatedResponsability) {
			res.json(updatedResponsability);
		} else {
			res.status(404).json({ message: 'Retreat responsability not found' });
		}
	} catch (error) {
		next(error);
	}
};

export const deleteResponsability = async (req: Request, res: Response, next: NextFunction) => {
	try {
		await deleteResponsabilityService(req.params.id);
		res.status(204).send();
	} catch (error) {
		next(error);
	}
};

export const assignResponsability = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { id } = req.params;
		const { participantId } = req.body;
		if (!participantId) {
			return res.status(400).json({ message: 'Participant ID is required' });
		}
		const responsability = await assignResponsabilityToParticipantService(id, participantId);
		if (!responsability) {
			return res.status(404).json({ message: 'Responsability or participant not found' });
		}
		res.status(200).json(responsability);
	} catch (error) {
		next(error);
	}
};

export const removeResponsability = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { id, participantId } = req.params;
		const responsability = await removeResponsabilityFromParticipantService(id, participantId);
		if (!responsability) {
			return res.status(404).json({
				message:
					'Responsability or participant not found, or participant not assigned to this responsability',
			});
		}
		res.status(200).json(responsability);
	} catch (error) {
		next(error);
	}
};
