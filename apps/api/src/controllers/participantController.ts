import { Request, Response, NextFunction } from 'express';
import * as participantService from '../services/participantService';
import { RecaptchaService } from '../services/recaptchaService';

const recaptchaService = new RecaptchaService();

export const getAllParticipants = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId, type, isCancelled: isCancelled, includePayments, tagIds } = req.query;

		// Parse tagIds from query if present
		let parsedTagIds: string[] | undefined;
		if (tagIds) {
			if (Array.isArray(tagIds)) {
				parsedTagIds = tagIds as string[];
			} else if (typeof tagIds === 'string') {
				parsedTagIds = tagIds.split(',').filter(Boolean);
			}
		}

		const participants = await participantService.findAllParticipants(
			retreatId as string | undefined,
			type as 'walker' | 'server' | 'waiting' | undefined,
			isCancelled === 'true',
			['tableMesa', 'retreatBed'], // Include table and bed relations
			includePayments === 'true', // Include payment details when requested
			parsedTagIds,
		);
		res.json(participants);
	} catch (error) {
		next(error);
	}
};

export const getParticipantById = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { includePayments } = req.query;
		const participant = await participantService.findParticipantById(
			req.params.id,
			includePayments === 'true',
		);
		if (participant) {
			res.json(participant);
		} else {
			res.status(404).json({ message: 'Participant not found' });
		}
	} catch (error) {
		next(error);
	}
};

export const createParticipant = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { recaptchaToken, ...participantData } = req.body;

		// Verify reCAPTCHA token for public registration
		const recaptchaResult = await recaptchaService.verifyToken(recaptchaToken, {
			minScore: 0.5,
		});

		if (!recaptchaResult.valid) {
			return res
				.status(400)
				.json({ message: recaptchaResult.error || 'reCAPTCHA verification failed' });
		}

		const newParticipant = await participantService.createParticipant(participantData);
		res.status(201).json(newParticipant);
	} catch (error) {
		if (error instanceof Error) {
			if (error.message.includes('already exists')) {
				return res.status(409).json({ message: error.message });
			}
		}
		next(error);
	}
};

export const updateParticipant = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const updatedParticipant = await participantService.updateParticipant(req.params.id, req.body);
		if (updatedParticipant) {
			res.json(updatedParticipant);
		} else {
			res.status(404).json({ message: 'Participant not found' });
		}
	} catch (error) {
		next(error);
	}
};

export const deleteParticipant = async (req: Request, res: Response, next: NextFunction) => {
	try {
		await participantService.deleteParticipant(req.params.id);
		res.status(204).send();
	} catch (error) {
		next(error);
	}
};

export const importParticipants = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId } = req.params;
		const { participants } = req.body;
		const user = req.user as any;

		const result = await participantService.importParticipants(retreatId, participants, user);

		res.status(200).json(result);
	} catch (error) {
		next(error);
	}
};

/**
 * Confirm an existing participant's registration for a retreat (no form needed).
 * The participant's personal data stays unchanged — only retreatId + RetreatParticipant are set.
 */
export const confirmExistingParticipantEmail = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const { email, retreatId, type, recaptchaToken } = req.body;

		if (!email || !retreatId) {
			return res.status(400).json({ message: 'Email and retreatId are required' });
		}

		// Verify reCAPTCHA token for public access
		const recaptchaResult = await recaptchaService.verifyToken(recaptchaToken, {
			minScore: 0.5,
		});

		if (!recaptchaResult.valid) {
			return res
				.status(400)
				.json({ message: recaptchaResult.error || 'reCAPTCHA verification failed' });
		}

		const result = await participantService.confirmExistingParticipant(
			email,
			retreatId,
			type || 'server',
		);
		res.json(result);
	} catch (error) {
		if (error instanceof Error && error.message === 'Participant not found') {
			return res.status(404).json({ message: 'Participant not found' });
		}
		next(error);
	}
};

/**
 * Check if a participant exists by email (for server registration flow)
 * This endpoint allows checking if a participant already exists before registering
 */
export const checkParticipantEmail = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { email } = req.params;
		const { recaptchaToken } = req.query;

		if (!email) {
			return res.status(400).json({ message: 'Email is required' });
		}

		// Verify reCAPTCHA token for public access
		const recaptchaResult = await recaptchaService.verifyToken(recaptchaToken as string, {
			minScore: 0.5,
		});

		if (!recaptchaResult.valid) {
			return res
				.status(400)
				.json({ message: recaptchaResult.error || 'reCAPTCHA verification failed' });
		}

		const result = await participantService.checkParticipantExists(email);
		res.json(result);
	} catch (error) {
		next(error);
	}
};
