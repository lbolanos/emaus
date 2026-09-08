import { Request, Response } from 'express';
import {
	retreatPreparationService,
	PreparationValidationError,
	PreparationNotFoundError,
} from '../services/retreatPreparationService';
import { authorizationService } from '../middleware/authorization';
import { AppDataSource } from '../data-source';
import { Retreat } from '../entities/retreat.entity';
import { CommunityService } from '../services/communityService';
import {
	PreparationSyncError,
	syncPreparationsToCommunityMeetings,
	syncSinglePreparationToCommunity,
} from '../services/preparationCommunitySync';

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

/**
 * Migra un retiro existente de los .docx de fábrica a las plantillas markdown.
 * Ver `resyncDefaultDocuments` para el criterio de match (fail-safe).
 */
export const resyncPreparationDefaultDocs = async (req: Request, res: Response) => {
	try {
		const result = await retreatPreparationService.resyncDefaultDocuments(req.params.retreatId, {
			removeLegacy: req.body?.removeLegacy === true,
		});
		res.json(result);
	} catch (err) {
		mapError(res, err);
	}
};

/**
 * Materializa el calendario de preparaciones como reuniones de la comunidad
 * vinculada, para poder pasar lista.
 *
 * SECURITY: `requireRetreatAccess` ya cubrió el retiro, pero esto ESCRIBE en la
 * comunidad, así que además exige administrarla. Sin esa segunda comprobación,
 * quien coordina un retiro podría inyectar reuniones en el calendario de una
 * comunidad ajena — el recurso a validar es el más específico de la operación,
 * no el de la ruta.
 */
export const syncPreparationsToCommunity = async (req: Request, res: Response) => {
	try {
		const { retreatId } = req.params;
		const userId = (req.user as any)?.id;
		if (!userId) return res.status(401).json({ message: 'Unauthorized' });

		const retreat = await AppDataSource.getRepository(Retreat).findOne({
			where: { id: retreatId },
			select: ['id', 'communityId'],
		});
		if (!retreat) return res.status(404).json({ message: 'Retiro no encontrado' });
		if (!retreat.communityId) {
			return res.status(400).json({
				message: 'Vincula el retiro a una comunidad antes de sincronizar las preparaciones',
			});
		}
		const isSuperadmin = await authorizationService.hasRole(userId, 'superadmin');
		const role = await new CommunityService().getViewerRoleForCommunity(
			userId,
			retreat.communityId,
			isSuperadmin,
		);
		if (!role) {
			return res
				.status(403)
				.json({ message: 'No administras la comunidad vinculada a este retiro' });
		}

		const result = await syncPreparationsToCommunityMeetings(retreatId);
		res.json(result);
	} catch (err) {
		if (err instanceof PreparationSyncError) {
			return res.status(400).json({ message: err.message });
		}
		mapError(res, err);
	}
};

/**
 * Crea (o engancha) la reunión de UNA preparación.
 *
 * SECURITY: `loadPreparationWithAccess` cubre el retiro dueño; como esto ESCRIBE
 * en la comunidad, además exige administrarla — mismo criterio que la
 * sincronización completa.
 */
export const syncOnePreparationToCommunity = async (req: Request, res: Response) => {
	const prep = await loadPreparationWithAccess(req, res);
	if (!prep) return;
	try {
		const userId = (req.user as any)?.id;
		if (!userId) return res.status(401).json({ message: 'Unauthorized' });

		const retreat = await AppDataSource.getRepository(Retreat).findOne({
			where: { id: prep.retreatId },
			select: ['id', 'communityId'],
		});
		if (!retreat?.communityId) {
			return res.status(400).json({
				message: 'Vincula el retiro a una comunidad antes de crear la reunión',
			});
		}
		const isSuperadmin = await authorizationService.hasRole(userId, 'superadmin');
		const role = await new CommunityService().getViewerRoleForCommunity(
			userId,
			retreat.communityId,
			isSuperadmin,
		);
		if (!role) {
			return res
				.status(403)
				.json({ message: 'No administras la comunidad vinculada a este retiro' });
		}

		const result = await syncSinglePreparationToCommunity(req.params.id);
		res.json(result);
	} catch (err) {
		if (err instanceof PreparationSyncError) {
			return res.status(400).json({ message: err.message });
		}
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
