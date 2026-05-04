import { Request, Response } from 'express';
import {
	retreatScheduleService,
	ScheduleNotFoundError,
} from '../services/retreatScheduleService';
import { authorizationService } from '../middleware/authorization';
import { emitScheduleBell } from '../realtime';
import { suggestForItems } from '../services/responsabilityMatcher';
import { AppDataSource } from '../data-source';
import { Responsability } from '../entities/responsability.entity';
import { getDefaultCharlas } from '../services/responsabilityService';

const checkRetreatAccess = async (req: Request, retreatId: string): Promise<boolean> => {
	const userId = (req.user as any)?.id;
	if (!userId) return false;
	return authorizationService.hasRetreatAccess(userId, retreatId);
};

const mapError = (res: Response, err: unknown) => {
	if (err instanceof ScheduleNotFoundError)
		return res.status(404).json({ message: err.message });
	const msg = err instanceof Error ? err.message : 'Unexpected error';
	return res.status(500).json({ message: msg });
};

export const listItems = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	const items = await retreatScheduleService.listForRetreat(retreatId);
	res.json(items);
};

export const createItem = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	try {
		const item = await retreatScheduleService.create(retreatId, req.body);
		res.status(201).json(item);
	} catch (err) {
		mapError(res, err);
	}
};

export const updateItem = async (req: Request, res: Response) => {
	try {
		const item = await retreatScheduleService.update(req.params.id, req.body);
		if (!item) return res.status(404).json({ message: 'Item not found' });
		res.json(item);
	} catch (err) {
		mapError(res, err);
	}
};

export const deleteItem = async (req: Request, res: Response) => {
	const ok = await retreatScheduleService.delete(req.params.id);
	if (!ok) return res.status(404).json({ message: 'Item not found' });
	res.status(204).send();
};

export const startItem = async (req: Request, res: Response) => {
	try {
		const item = await retreatScheduleService.startItem(req.params.id);
		res.json(item);
	} catch (err) {
		mapError(res, err);
	}
};

export const completeItem = async (req: Request, res: Response) => {
	try {
		const item = await retreatScheduleService.completeItem(req.params.id);
		res.json(item);
	} catch (err) {
		mapError(res, err);
	}
};

export const shiftItem = async (req: Request, res: Response) => {
	try {
		const items = await retreatScheduleService.shiftDownstream(
			req.params.id,
			req.body.minutesDelta,
			req.body.propagate !== false,
		);
		res.json(items);
	} catch (err) {
		mapError(res, err);
	}
};

export const downloadRetreatBundle = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	try {
		// Stream the zip directly to the response. archiver pushes data as soon
		// as it's available; the client gets the file progressively.
		res.setHeader('Content-Type', 'application/zip');
		// Filename will be set after streamRetreatBundle resolves; meanwhile,
		// give the browser a sensible default.
		res.setHeader(
			'Content-Disposition',
			`attachment; filename="MaM_bundle.zip"`,
		);
		const result = await retreatScheduleService.streamRetreatBundle(retreatId, res);
		// Streaming already finalized the archive; the response is closed.
		// Logging only, no further writes.
		console.log(
			`[retreat-bundle] ${retreatId}: ${result.itemCount} items, ${result.attachmentCount} attachments → ${result.fileName}`,
		);
	} catch (err) {
		// If headers are already sent (mid-stream), we can't change to JSON.
		if (!res.headersSent) {
			mapError(res, err);
		} else {
			res.end();
		}
	}
};

export const publicGetSchedule = async (req: Request, res: Response) => {
	try {
		const { slug } = req.params;
		const data = await retreatScheduleService.getPublicSchedule(slug);
		if (!data) return res.status(404).json({ message: 'Retreat not found' });
		// Soft cache: clients poll every 30s anyway, but a short Cache-Control
		// helps when many phones in the salon refresh at the same time.
		res.set('Cache-Control', 'public, max-age=10');
		res.json(data);
	} catch (err) {
		mapError(res, err);
	}
};

export const shiftDay = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	const day = Number(req.params.day);
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	try {
		const items = await retreatScheduleService.shiftDay(
			retreatId,
			day,
			req.body.minutesDelta,
		);
		res.json(items);
	} catch (err) {
		mapError(res, err);
	}
};

export const reorderDay = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	const day = Number(req.params.day);
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	try {
		const items = await retreatScheduleService.reorderDay(
			retreatId,
			day,
			req.body.itemIds,
		);
		res.json(items);
	} catch (err) {
		if (err instanceof Error && err.message.startsWith('reorder mismatch')) {
			return res.status(400).json({ message: err.message });
		}
		mapError(res, err);
	}
};

export const materialize = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	try {
		const items = await retreatScheduleService.materializeFromTemplate(
			retreatId,
			new Date(req.body.baseDate),
			!!req.body.clearExisting,
			req.body.templateSetId,
		);
		res.json(items);
	} catch (err) {
		mapError(res, err);
	}
};

export const resolveSantisimo = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	try {
		const r = await retreatScheduleService.resolveSantisimoConflicts(retreatId);
		res.json(r);
	} catch (err) {
		mapError(res, err);
	}
};

export const dashboardStats = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	try {
		const r = await retreatScheduleService.dashboardStats(retreatId);
		res.json(r);
	} catch (err) {
		mapError(res, err);
	}
};

export const ringBell = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	emitScheduleBell({ retreatId, message: req.body?.message });
	res.json({ ok: true });
};

export const suggestResponsables = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	try {
		const items = await retreatScheduleService.listForRetreat(retreatId);
		const responsabilities = await AppDataSource.getRepository(Responsability).find({
			where: { retreatId },
		});
		const responsabilitiesLite = responsabilities.map((r) => ({
			id: r.id,
			name: r.name,
			hasParticipant: !!r.participantId,
		}));
		const itemsLite = items.map((i) => ({ id: i.id, name: i.name, type: i.type }));
		const suggestions = suggestForItems(itemsLite, responsabilitiesLite);
		res.json(suggestions);
	} catch (err) {
		mapError(res, err);
	}
};

export const relinkResponsibilities = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	try {
		const force = req.query.force === 'true';
		const result = await retreatScheduleService.relinkResponsibilities(retreatId, force);
		res.json(result);
	} catch (err) {
		mapError(res, err);
	}
};

/**
 * Lista los nombres canónicos de Responsabilidades fijas.
 * Se usa en el editor del template global para llenar el dropdown.
 * Idéntica a la lista que crea `createDefaultResponsibilitiesForRetreat`.
 */
const CANONICAL_RESPONSABILITIES = [
	'Palanquero 1',
	'Palanquero 2',
	'Palanquero 3',
	'Logistica',
	'Inventario',
	'Tesorero',
	'Sacerdotes',
	'Mantelitos',
	'Snacks',
	'Compras',
	'Transporte',
	'Música',
	'Comedor',
	'Salón',
	'Cuartos',
	'Oración de Intercesión',
	'Palanquitas',
	'Santísimo',
	'Campanero',
	'Continua',
	'Biblias',
	'Explicación Rosario y entrega',
	'Bolsas',
	'Resumen del día',
	'Recepción',
	'Reglamento de la Casa',
	'Moderador',
	'Diario',
];

export const canonicalResponsabilities = async (_req: Request, res: Response) => {
	const charlas = getDefaultCharlas().map((c) => c.name);
	res.json({
		fixed: CANONICAL_RESPONSABILITIES,
		charlas,
	});
};

export const bulkAssignResponsables = async (req: Request, res: Response) => {
	const { retreatId } = req.params;
	if (!(await checkRetreatAccess(req, retreatId))) {
		return res.status(403).json({ message: 'Forbidden' });
	}
	const assignments = req.body?.assignments;
	if (!Array.isArray(assignments)) {
		return res.status(400).json({ message: 'assignments[] requerido' });
	}
	try {
		const result = await retreatScheduleService.bulkAssignResponsables(retreatId, assignments);
		res.json(result);
	} catch (err) {
		mapError(res, err);
	}
};
