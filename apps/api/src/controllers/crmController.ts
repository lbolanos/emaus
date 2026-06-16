import { Request, Response } from 'express';
import { crmService } from '../services/crmService';
import { authorizationService } from '../middleware/authorization';
import { upsertFollowUpSchema, createCrmTaskSchema, updateCrmTaskSchema } from '@repo/types';

async function callerHasRetreatAccess(req: Request, retreatId: string): Promise<boolean> {
	const userId = (req.user as any)?.id;
	if (!userId || !retreatId) return false;
	return authorizationService.hasRetreatAccess(userId, retreatId);
}

export class CrmController {
	// POST /crm/retreat/:retreatId/participants/:participantId/do-not-contact { value }
	setDoNotContact = async (req: Request, res: Response) => {
		try {
			const updated = await crmService.setDoNotContact(
				req.params.participantId,
				req.body?.value !== false,
			);
			if (!updated) return res.status(404).json({ error: 'Participante no encontrado' });
			res.json({ id: updated.id, doNotContact: updated.doNotContact });
		} catch (error) {
			console.error('Error setting do-not-contact:', error);
			res.status(500).json({ error: 'Error al actualizar la lista de no-contacto' });
		}
	};

	// --- Follow-up ---

	// GET /crm/retreat/:retreatId/follow-ups  (gated por requireRetreatAccess)
	listFollowUps = async (req: Request, res: Response) => {
		try {
			res.json(await crmService.listFollowUps(req.params.retreatId));
		} catch (error) {
			console.error('Error listing follow-ups:', error);
			res.status(500).json({ error: 'Error al obtener el seguimiento' });
		}
	};

	// POST /crm/follow-ups  (upsert)
	upsertFollowUp = async (req: Request, res: Response) => {
		try {
			const parsed = upsertFollowUpSchema.safeParse({ body: req.body });
			if (!parsed.success) {
				return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
			}
			const body = parsed.data.body;
			if (!(await callerHasRetreatAccess(req, body.retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			const row = await crmService.upsertFollowUp({ ...body, updatedBy: (req.user as any)?.id });
			res.status(201).json(row);
		} catch (error) {
			console.error('Error upserting follow-up:', error);
			res.status(500).json({ error: 'Error al guardar el seguimiento' });
		}
	};

	// --- Tareas ---

	// GET /crm/retreat/:retreatId/tasks?status=open  (gated por requireRetreatAccess)
	listTasks = async (req: Request, res: Response) => {
		try {
			const status = req.query.status as 'open' | 'done' | undefined;
			res.json(await crmService.listTasks(req.params.retreatId, status));
		} catch (error) {
			console.error('Error listing tasks:', error);
			res.status(500).json({ error: 'Error al obtener las tareas' });
		}
	};

	// POST /crm/tasks
	createTask = async (req: Request, res: Response) => {
		try {
			const parsed = createCrmTaskSchema.safeParse({ body: req.body });
			if (!parsed.success) {
				return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
			}
			const body = parsed.data.body;
			if (!(await callerHasRetreatAccess(req, body.retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			const task = await crmService.createTask({ ...body, createdBy: (req.user as any)?.id });
			res.status(201).json(task);
		} catch (error) {
			console.error('Error creating task:', error);
			res.status(500).json({ error: 'Error al crear la tarea' });
		}
	};

	// PUT /crm/tasks/:id
	updateTask = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const parsed = updateCrmTaskSchema.safeParse({ body: req.body, params: { id } });
			if (!parsed.success) {
				return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
			}
			const existing = await crmService.findTaskById(id);
			if (!existing) return res.status(404).json({ error: 'Tarea no encontrada' });
			if (!(await callerHasRetreatAccess(req, existing.retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			res.json(await crmService.updateTask(id, parsed.data.body));
		} catch (error) {
			console.error('Error updating task:', error);
			res.status(500).json({ error: 'Error al actualizar la tarea' });
		}
	};

	// DELETE /crm/tasks/:id
	deleteTask = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const existing = await crmService.findTaskById(id);
			if (!existing) return res.status(404).json({ error: 'Tarea no encontrada' });
			if (!(await callerHasRetreatAccess(req, existing.retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			await crmService.deleteTask(id);
			res.json({ message: 'Tarea eliminada exitosamente' });
		} catch (error) {
			console.error('Error deleting task:', error);
			res.status(500).json({ error: 'Error al eliminar la tarea' });
		}
	};
}
