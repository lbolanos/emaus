import { Request, Response } from 'express';
import {
	santisimoService,
	SantisimoCapacityError,
	SantisimoDisabledError,
	SantisimoNotFoundError,
	SantisimoPastError,
} from '../services/santisimoService';
import { authorizationService } from '../middleware/authorization';
import RecaptchaService from '../services/recaptchaService';
import { AppDataSource } from '../data-source';
import { SantisimoSignup } from '../entities/santisimoSignup.entity';

const recaptcha = new RecaptchaService();

const checkRetreatAccess = async (req: Request, retreatId: string): Promise<boolean> => {
	const userId = (req.user as any)?.id;
	if (!userId) return false;
	return authorizationService.hasRetreatAccess(userId, retreatId);
};

const mapError = (res: Response, err: unknown) => {
	if (err instanceof SantisimoNotFoundError) return res.status(404).json({ message: err.message });
	if (err instanceof SantisimoCapacityError)
		return res.status(409).json({ message: err.message, error: 'CAPACITY' });
	if (err instanceof SantisimoDisabledError)
		return res.status(409).json({ message: err.message, error: 'DISABLED' });
	if (err instanceof SantisimoPastError)
		return res.status(409).json({ message: err.message, error: 'PAST' });
	const msg = err instanceof Error ? err.message : 'Unexpected error';
	return res.status(500).json({ message: msg });
};

// -- Admin handlers --

export const listSlots = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	const slots = await santisimoService.listSlotsForRetreat(retreatId);
	res.json(slots);
};

export const createSlot = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	try {
		const slot = await santisimoService.createSlot(retreatId, req.body);
		res.status(201).json(slot);
	} catch (err) {
		mapError(res, err);
	}
};

export const updateSlot = async (req: Request, res: Response) => {
	const slot = await santisimoService.getSlot(req.params.id);
	if (!slot) return res.status(404).json({ message: 'Slot not found' });
	if (!(await checkRetreatAccess(req, slot.retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	const updated = await santisimoService.updateSlot(req.params.id, req.body);
	res.json(updated);
};

export const deleteSlot = async (req: Request, res: Response) => {
	const slot = await santisimoService.getSlot(req.params.id);
	if (!slot) return res.status(404).json({ message: 'Slot not found' });
	if (!(await checkRetreatAccess(req, slot.retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	await santisimoService.deleteSlot(req.params.id);
	res.status(204).send();
};

export const generateSlots = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	try {
		const slots = await santisimoService.generateSlots(retreatId, req.body);
		res.status(201).json(slots);
	} catch (err) {
		mapError(res, err);
	}
};

export const listSignupsForSlot = async (req: Request, res: Response) => {
	const slot = await santisimoService.getSlot(req.params.id);
	if (!slot) return res.status(404).json({ message: 'Slot not found' });
	if (!(await checkRetreatAccess(req, slot.retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	const signups = await santisimoService.listSignupsForSlot(req.params.id);
	res.json(signups);
};

export const adminCreateSignup = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	try {
		const signup = await santisimoService.adminCreateSignup(retreatId, req.body);
		res.status(201).json(signup);
	} catch (err) {
		mapError(res, err);
	}
};

export const deleteSignup = async (req: Request, res: Response) => {
	const { id } = req.params;
	const signup = await AppDataSource.getRepository(SantisimoSignup).findOne({
		where: { id },
		relations: ['slot'],
	});
	if (!signup) return res.status(404).json({ message: 'Signup not found' });
	if (!signup.slot) return res.status(404).json({ message: 'Signup slot missing' });
	if (!(await checkRetreatAccess(req, signup.slot.retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	await santisimoService.deleteSignup(id);
	res.status(204).send();
};

// -- Public handlers --

export const publicGetSchedule = async (req: Request, res: Response) => {
	const { slug } = req.params;
	const data = await santisimoService.getPublicSchedule(slug);
	if (!data) return res.status(404).json({ message: 'Retreat not found' });
	res.json(data);
};

export const publicCreateSignup = async (req: Request, res: Response) => {
	const { slug } = req.params;
	const retreat = await santisimoService.getRetreatBySlug(slug);
	if (!retreat || !retreat.isPublic || !retreat.santisimoEnabled) {
		return res.status(404).json({ message: 'Retreat not found' });
	}

	const { recaptchaToken, slotIds, name, phone, email } = req.body ?? {};
	const captcha = await recaptcha.verifyToken(recaptchaToken, { minScore: 0.5 });
	if (!captcha.valid) {
		return res.status(400).json({ message: captcha.error || 'reCAPTCHA failed' });
	}

	try {
		const signups = await santisimoService.publicSignup(retreat.id, {
			slotIds,
			name,
			phone,
			email,
			ipAddress: req.ip,
		});
		res.status(201).json({
			signups: signups.map((s) => ({
				id: s.id,
				slotId: s.slotId,
				cancelToken: s.cancelToken,
			})),
		});
	} catch (err) {
		mapError(res, err);
	}
};

export const publicCancelSignup = async (req: Request, res: Response) => {
	const { token } = req.params;
	const ok = await santisimoService.cancelByToken(token);
	if (!ok) return res.status(404).json({ message: 'Not found' });
	res.status(204).send();
};
