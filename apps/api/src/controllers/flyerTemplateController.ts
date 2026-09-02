import type { NextFunction, Request, Response } from 'express';
import {
	FlyerTemplateForbiddenError,
	FlyerTemplateNotFoundError,
	FlyerTemplateValidationError,
	create,
	listForUser,
	remove,
	update,
} from '../services/flyerTemplateService';

const userIdOf = (req: Request): string | undefined => (req.user as any)?.id;

/** Maps the service's typed errors onto status codes; anything else is a real fault. */
const handle = (error: unknown, res: Response, next: NextFunction) => {
	if (error instanceof FlyerTemplateNotFoundError) {
		return res.status(404).json({ message: error.message });
	}
	if (error instanceof FlyerTemplateForbiddenError) {
		return res.status(403).json({ message: error.message });
	}
	if (error instanceof FlyerTemplateValidationError) {
		return res.status(400).json({ message: error.message });
	}
	next(error);
};

export const getFlyerTemplates = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const userId = userIdOf(req);
		if (!userId) return res.status(401).json({ message: 'No autenticado' });
		res.json(await listForUser(userId));
	} catch (error) {
		handle(error, res, next);
	}
};

export const createFlyerTemplate = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const userId = userIdOf(req);
		if (!userId) return res.status(401).json({ message: 'No autenticado' });
		res.status(201).json(await create(userId, req.body));
	} catch (error) {
		handle(error, res, next);
	}
};

export const updateFlyerTemplate = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const userId = userIdOf(req);
		if (!userId) return res.status(401).json({ message: 'No autenticado' });
		res.json(await update(req.params.id, userId, req.body));
	} catch (error) {
		handle(error, res, next);
	}
};

export const deleteFlyerTemplate = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const userId = userIdOf(req);
		if (!userId) return res.status(401).json({ message: 'No autenticado' });
		await remove(req.params.id, userId);
		res.status(204).send();
	} catch (error) {
		handle(error, res, next);
	}
};
