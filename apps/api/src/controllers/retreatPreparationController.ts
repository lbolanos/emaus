import { Request, Response } from 'express';
import {
	retreatPreparationService,
	PreparationValidationError,
	PreparationNotFoundError,
} from '../services/retreatPreparationService';
import { authorizationService } from '../middleware/authorization';

function mapError(res: Response, err: unknown) {
	if (err instanceof PreparationValidationError) {
		return res.status(400).json({ message: err.message });
	}
	if (err instanceof PreparationNotFoundError) {
		return res.status(404).json({ message: err.message });
	}
	console.error('[retreatPreparationController]', err);
	return res.status(500).json({ message: 'Internal server error' });
}

/**
 * Guard anti-IDOR para rutas item-level (/:id): carga la preparación y valida
 * que el usuario tenga acceso al retiro dueño (mismo patrón que pre-retreat tasks).
 */
async function loadPreparationWithAccess(req: Request, res: Response) {
	const prep = await retreatPreparationService.get(req.params.id);
	if (!prep) {
		res.status(404).json({ message: 'Preparación no encontrada' });
		return null;
	}
	const userId = (req.user as any)?.id;
	const ok = userId && (await authorizationService.hasRetreatAccess(userId, prep.retreatId));
	if (!ok) {
		res.status(403).json({ message: 'Forbidden' });
		return null;
	}
	return prep;
}

export const listPreparations = async (req: Request, res: Response) => {
	const preparations = await retreatPreparationService.listForRetreat(req.params.retreatId);
	res.json(preparations);
};

export const generatePreparations = async (req: Request, res: Response) => {
	try {
		const preparations = await retreatPreparationService.generate(req.params.retreatId, req.body);
		res.status(201).json(preparations);
	} catch (err) {
		mapError(res, err);
	}
};

export const createPreparation = async (req: Request, res: Response) => {
	try {
		const prep = await retreatPreparationService.create(req.params.retreatId, req.body);
		res.status(201).json(prep);
	} catch (err) {
		mapError(res, err);
	}
};

export const updatePreparation = async (req: Request, res: Response) => {
	if (!(await loadPreparationWithAccess(req, res))) return;
	try {
		const prep = await retreatPreparationService.update(req.params.id, req.body);
		res.json(prep);
	} catch (err) {
		mapError(res, err);
	}
};

export const deletePreparation = async (req: Request, res: Response) => {
	if (!(await loadPreparationWithAccess(req, res))) return;
	const ok = await retreatPreparationService.remove(req.params.id);
	if (!ok) return res.status(404).json({ message: 'Preparación no encontrada' });
	res.status(204).send();
};

export const skipPreparation = async (req: Request, res: Response) => {
	if (!(await loadPreparationWithAccess(req, res))) return;
	try {
		const preparations = await retreatPreparationService.skipForHoliday(
			req.params.id,
			req.body?.reason,
		);
		res.json(preparations);
	} catch (err) {
		mapError(res, err);
	}
};

export const uploadPreparationDocument = async (req: Request, res: Response) => {
	if (!(await loadPreparationWithAccess(req, res))) return;
	try {
		const doc = await retreatPreparationService.addDocument(req.params.id, req.body);
		res.status(201).json(doc);
	} catch (err) {
		mapError(res, err);
	}
};

/**
 * Guard anti-IDOR para rutas de documento (/documents/:docId): resuelve el
 * retiro dueño vía la preparation del documento.
 */
async function loadDocumentWithAccess(req: Request, res: Response) {
	const doc = await retreatPreparationService.getDocument(req.params.docId);
	if (!doc || !doc.preparation) {
		res.status(404).json({ message: 'Documento no encontrado' });
		return null;
	}
	const userId = (req.user as any)?.id;
	const ok =
		userId && (await authorizationService.hasRetreatAccess(userId, doc.preparation.retreatId));
	if (!ok) {
		res.status(403).json({ message: 'Forbidden' });
		return null;
	}
	return doc;
}

export const createPreparationMarkdown = async (req: Request, res: Response) => {
	if (!(await loadPreparationWithAccess(req, res))) return;
	try {
		const doc = await retreatPreparationService.createMarkdownDocument(req.params.id, req.body);
		res.status(201).json(doc);
	} catch (err) {
		mapError(res, err);
	}
};

export const updatePreparationMarkdown = async (req: Request, res: Response) => {
	if (!(await loadDocumentWithAccess(req, res))) return;
	try {
		const doc = await retreatPreparationService.updateMarkdownDocument(
			req.params.docId,
			req.body,
		);
		res.json(doc);
	} catch (err) {
		mapError(res, err);
	}
};

export const deletePreparationDocument = async (req: Request, res: Response) => {
	if (!(await loadDocumentWithAccess(req, res))) return;
	await retreatPreparationService.removeDocument(req.params.docId);
	res.status(204).send();
};

// -- Public handlers --

export const publicGetPreparations = async (req: Request, res: Response) => {
	const data = await retreatPreparationService.getPublicBySlug(req.params.slug);
	if (!data) return res.status(404).json({ message: 'Retreat not found' });
	res.json(data);
};
