import { Request, Response, NextFunction } from 'express';
import {
	getRetreatsForUser,
	createRetreat as createRetreatService,
	findById,
	update,
} from '../services/retreatService';
import { AuthenticatedRequest } from '../middleware/authorization';
import { AppDataSource } from '../data-source';
import { Retreat } from '../entities/retreat.entity';
import { Participant } from '../entities/participant.entity';
import { avatarStorageService } from '../services/avatarStorageService';
import { s3Service } from '../services/s3Service';
import { imageService } from '../services/imageService';

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

export const getPublicRetreats = async (req: Request, res: Response, next: NextFunction) => {
	try {
		// Find all public retreats starting in the future
		const { findPublicRetreats } = await import('../services/retreatService');
		const retreats = await findPublicRetreats();
		res.json(retreats);
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
		// Return all flyer data needed for registration form
		res.json({
			id: retreat.id,
			parish: retreat.parish,
			isPublic: retreat.isPublic,
			startDate: retreat.startDate,
			endDate: retreat.endDate,
			flyer_options: retreat.flyer_options || {},
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

export const exportRoomLabelsToDocx = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { id: retreatId } = req.params;

		// Validate retreatId is a valid UUID
		if (
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(retreatId)
		) {
			return res.status(400).json({ message: 'Invalid retreat ID' });
		}

		// Import the service function to avoid circular dependencies
		const { exportRoomLabelsToDocx } = await import('../services/roomService');
		const buffer = await exportRoomLabelsToDocx(retreatId);

		// Set headers for file download
		res.setHeader(
			'Content-Type',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		);
		res.setHeader(
			'Content-Disposition',
			`attachment; filename="etiquetas-habitaciones-${retreatId}.docx"`,
		);
		res.setHeader('Content-Length', buffer.length);

		// Send the file
		res.send(buffer);
	} catch (error: any) {
		console.error('Error exporting room labels to DOCX:', error);
		next(error);
	}
};

export const exportBadgesToDocx = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { id: retreatId } = req.params;

		// Validate retreatId is a valid UUID
		if (
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(retreatId)
		) {
			return res.status(400).json({ message: 'Invalid retreat ID' });
		}

		// Import the service function to avoid circular dependencies
		const { exportBadgesToDocx } = await import('../services/badgeService');
		const buffer = await exportBadgesToDocx(retreatId);

		if (!buffer) {
			return res.status(404).json({
				message: 'No se pudieron generar los gafetes. Verifica que hay participantes asignados.',
			});
		}

		// Set headers for file download
		res.setHeader(
			'Content-Type',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		);
		res.setHeader(
			'Content-Disposition',
			`attachment; filename="gafetes-participantes-${retreatId}.docx"`,
		);
		res.setHeader('Content-Length', buffer.length);

		// Send the file
		res.send(buffer);
	} catch (error: any) {
		console.error('Error exporting badges to DOCX:', error);
		next(error);
	}
};

export const uploadRetreatMemoryPhoto = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { id: retreatId } = req.params;
		const { photoData } = req.body;

		if (!photoData) {
			return res.status(400).json({ message: 'photoData is required' });
		}

		const retreat = await findById(retreatId);
		if (!retreat) {
			return res.status(404).json({ message: 'Retreat not found' });
		}

		// Delete old photo if exists
		if (retreat.memoryPhotoUrl && avatarStorageService.isS3Storage()) {
			await s3Service.deleteRetreatMemoryPhoto(retreatId);
		}

		let photoUrl: string;
		if (avatarStorageService.isS3Storage()) {
			const buffer = imageService.base64ToBuffer(photoData);
			const processed = await imageService.processAvatar(buffer, 'image/*');
			const result = await s3Service.uploadRetreatMemoryPhoto(
				retreatId,
				processed.buffer,
				processed.contentType,
			);
			photoUrl = result.url;
		} else {
			photoUrl = photoData;
		}

		const updated = await update(retreatId, { memoryPhotoUrl: photoUrl });
		res.json({ memoryPhotoUrl: updated?.memoryPhotoUrl });
	} catch (error) {
		next(error);
	}
};

export const updateRetreatMemory = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { id: retreatId } = req.params;
		const { musicPlaylistUrl } = req.body;

		const retreat = await update(retreatId, { musicPlaylistUrl });
		if (!retreat) {
			return res.status(404).json({ message: 'Retreat not found' });
		}

		res.json({
			musicPlaylistUrl: retreat.musicPlaylistUrl,
			memoryPhotoUrl: retreat.memoryPhotoUrl,
		});
	} catch (error) {
		next(error);
	}
};

export const getAttendedRetreats = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const userId = (req as any).user?.id;
		if (!userId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		const participantRepo = AppDataSource.getRepository(Participant);

		const participants = await participantRepo.find({
			where: { userId },
			relations: ['retreat'],
		});

		const retreats = participants
			.map((p) => p.retreat)
			.filter((r): r is Retreat => r !== undefined && r !== null);

		res.json(retreats);
	} catch (error) {
		next(error);
	}
};
