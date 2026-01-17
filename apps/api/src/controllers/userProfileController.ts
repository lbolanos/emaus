import { Request, Response } from 'express';
import {
	getUserProfile,
	updateUserProfile,
	getPublicProfile,
	searchUsers,
	linkUserToParticipant,
	unlinkUserFromParticipant,
} from '../services/userProfileService';
import { getUserFromRequest } from '../utils/auth';
import { avatarStorageService } from '../services/avatarStorageService';

export const getMyProfile = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const profile = await getUserProfile(user.id);
		res.json(profile);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const updateMyProfile = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const {
			bio,
			location,
			website,
			showEmail,
			showPhone,
			showRetreats,
			interests,
			skills,
			avatarUrl,
		} = req.body;

		const profile = await updateUserProfile(user.id, {
			bio,
			location,
			website,
			showEmail,
			showPhone,
			showRetreats,
			interests,
			skills,
			avatarUrl,
		});

		res.json(profile);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const updateAvatar = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { avatarUrl } = req.body;

		if (!avatarUrl) {
			res.status(400).json({ message: 'avatarUrl es requerido' });
			return;
		}

		// Get current profile to delete old avatar if using S3
		const currentProfile = await getUserProfile(user.id);

		// Delete old avatar from S3 if needed
		if (currentProfile?.avatarUrl) {
			await avatarStorageService.deleteAvatar(user.id, currentProfile.avatarUrl);
		}

		// Upload new avatar (chooses base64 or S3 based on flag)
		const result = await avatarStorageService.uploadAvatar(user.id, avatarUrl);

		// Update profile with new URL
		const profile = await updateUserProfile(user.id, { avatarUrl: result.url });

		res.json(profile);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const removeAvatar = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		// Get current profile to delete avatar from S3 if needed
		const currentProfile = await getUserProfile(user.id);

		// Delete avatar from S3 if needed
		if (currentProfile?.avatarUrl) {
			await avatarStorageService.deleteAvatar(user.id, currentProfile.avatarUrl);
		}

		// Update profile to remove avatar
		const profile = await updateUserProfile(user.id, { avatarUrl: null });
		res.json(profile);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const getPublicProfileById = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		const { userId } = req.params;

		const profile = await getPublicProfile(userId, user?.id);

		if (!profile) {
			res.status(404).json({ message: 'Perfil no encontrado' });
			return;
		}

		res.json(profile);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const searchUsersController = async (req: Request, res: Response): Promise<void> => {
	try {
		const { q, interests, skills, location, retreatId } = req.query;

		if (!q || typeof q !== 'string') {
			res.status(400).json({ message: 'Query parameter "q" is required' });
			return;
		}

		const results = await searchUsers(q, {
			interests: interests
				? Array.isArray(interests)
					? interests
					: [interests as string]
				: undefined,
			skills: skills ? (Array.isArray(skills) ? skills : [skills as string]) : undefined,
			location: location as string | undefined,
			retreatId: retreatId as string | undefined,
		});

		res.json(results);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const linkUserToParticipantController = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { participantId } = req.params;

		const result = await linkUserToParticipant(user.id, participantId);
		res.json(result);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const unlinkUserFromParticipantController = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		await unlinkUserFromParticipant(user.id);
		res.json({ message: 'Vínculo eliminado exitosamente' });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};
