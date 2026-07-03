import { Request, Response } from 'express';
import {
	retreatPreRetreatTaskService,
	PreRetreatTaskNotFoundError,
} from '../services/retreatPreRetreatTaskService';
import { authorizationService } from '../middleware/authorization';

const mapError = (res: Response, err: unknown) => {
	if (err instanceof PreRetreatTaskNotFoundError) {
		return res.status(404).json({ message: err.message });
	}
	const msg = err instanceof Error ? err.message : 'Unexpected error';
	return res.status(400).json({ message: msg });
};

/**
 * Guard anti-IDOR de las rutas item-level (/tasks/:id): carga la tarea y
 * valida que el usuario tenga acceso al retiro dueño. El middleware por
 * parámetro de ruta no alcanza aquí (lección incidente IDOR 2026-05-15).
 */
const loadTaskWithAccess = async (req: Request, res: Response) => {
	const task = await retreatPreRetreatTaskService.get(req.params.id);
	if (!task) {
		res.status(404).json({ message: 'Tarea no encontrada' });
		return null;
	}
	const userId = (req.user as any)?.id;
	const ok = userId && (await authorizationService.hasRetreatAccess(userId, task.retreatId));
	if (!ok) {
		res.status(403).json({ message: 'Forbidden' });
		return null;
	}
	return task;
};

export const listTasks = async (req: Request, res: Response) => {
	const tasks = await retreatPreRetreatTaskService.listForRetreat(req.params.retreatId);
	res.json(tasks);
};

export const createTask = async (req: Request, res: Response) => {
	try {
		const task = await retreatPreRetreatTaskService.create(req.params.retreatId, req.body);
		res.status(201).json(task);
	} catch (err) {
		mapError(res, err);
	}
};

export const updateTask = async (req: Request, res: Response) => {
	if (!(await loadTaskWithAccess(req, res))) return;
	try {
		const task = await retreatPreRetreatTaskService.update(req.params.id, req.body);
		if (!task) return res.status(404).json({ message: 'Tarea no encontrada' });
		res.json(task);
	} catch (err) {
		mapError(res, err);
	}
};

export const setTaskStatus = async (req: Request, res: Response) => {
	if (!(await loadTaskWithAccess(req, res))) return;
	try {
		const task = await retreatPreRetreatTaskService.setStatus(req.params.id, req.body.status);
		res.json(task);
	} catch (err) {
		mapError(res, err);
	}
};

export const deleteTask = async (req: Request, res: Response) => {
	if (!(await loadTaskWithAccess(req, res))) return;
	const ok = await retreatPreRetreatTaskService.remove(req.params.id);
	if (!ok) return res.status(404).json({ message: 'Tarea no encontrada' });
	res.status(204).send();
};

export const materialize = async (req: Request, res: Response) => {
	try {
		const tasks = await retreatPreRetreatTaskService.materializeFromTemplate(
			req.params.retreatId,
			req.body.templateSetId,
			!!req.body.clearExisting,
			req.body.baseDate,
		);
		res.json(tasks);
	} catch (err) {
		mapError(res, err);
	}
};

export const addMissing = async (req: Request, res: Response) => {
	try {
		const result = await retreatPreRetreatTaskService.addMissingTemplateItems(
			req.params.retreatId,
			req.body.templateSetId,
			req.body.baseDate,
		);
		res.json(result);
	} catch (err) {
		mapError(res, err);
	}
};
