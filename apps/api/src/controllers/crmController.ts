import { Request, Response } from 'express';
import { crmService } from '../services/crmService';
import { authorizationService } from '../middleware/authorization';
import {
	upsertFollowUpSchema,
	createCrmTaskSchema,
	updateCrmTaskSchema,
	createParticipantNoteSchema,
	updateParticipantNoteSchema,
} from '@repo/types';

async function callerHasRetreatAccess(req: Request, retreatId: string): Promise<boolean> {
	const userId = (req.user as any)?.id;
	if (!userId || !retreatId) return false;
	return authorizationService.hasRetreatAccess(userId, retreatId);
}

export class CrmController {
	// POST /crm/retreat/:retreatId/participants/:participantId/do-not-contact { value }
	setDoNotContact = async (req: Request, res: Response) => {
		try {
			const { retreatId, participantId } = req.params;
			// La ruta valida acceso a :retreatId, pero `doNotContact` es un flag global
			// del participante. Verificar que el participante pertenezca a este retiro
			// evita mutar a participantes ajenos (IDOR cross-retiro).
			if (!(await crmService.participantBelongsToRetreat(participantId, retreatId))) {
				return res.status(404).json({ error: 'Participante no encontrado en este retiro' });
			}
			const updated = await crmService.setDoNotContact(participantId, req.body?.value !== false);
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
			if (
				body.participantId &&
				!(await crmService.participantBelongsToRetreat(body.participantId, body.retreatId))
			) {
				return res.status(404).json({ error: 'Participante no encontrado en este retiro' });
			}
			const row = await crmService.upsertFollowUp({ ...body, updatedBy: (req.user as any)?.id });
			res.status(201).json(row);
		} catch (error) {
			console.error('Error upserting follow-up:', error);
			res.status(500).json({ error: 'Error al guardar el seguimiento' });
		}
	};

	// --- Hilo de notas ---

	// GET /crm/retreat/:retreatId/participants/:participantId/notes
	listNotes = async (req: Request, res: Response) => {
		try {
			const { retreatId, participantId } = req.params;
			// La ruta valida acceso a :retreatId, pero :participantId llega aparte:
			// sin esta comprobación se leerían notas de otro retiro (IDOR cross-retiro).
			if (!(await crmService.participantBelongsToRetreat(participantId, retreatId))) {
				return res.status(404).json({ error: 'Participante no encontrado en este retiro' });
			}
			res.json(await crmService.listNotes(participantId, retreatId));
		} catch (error) {
			console.error('Error listing notes:', error);
			res.status(500).json({ error: 'Error al obtener las notas' });
		}
	};

	// GET /crm/retreat/:retreatId/participants/:participantId/timeline
	getTimeline = async (req: Request, res: Response) => {
		try {
			const { retreatId, participantId } = req.params;
			if (!(await crmService.participantBelongsToRetreat(participantId, retreatId))) {
				return res.status(404).json({ error: 'Participante no encontrado en este retiro' });
			}
			res.json(await crmService.getParticipantTimeline(participantId, retreatId));
		} catch (error) {
			console.error('Error building timeline:', error);
			res.status(500).json({ error: 'Error al obtener el historial' });
		}
	};

	// POST /crm/notes
	createNote = async (req: Request, res: Response) => {
		try {
			const parsed = createParticipantNoteSchema.safeParse({ body: req.body });
			if (!parsed.success) {
				return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
			}
			const body = parsed.data.body;
			if (!(await callerHasRetreatAccess(req, body.retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			if (!(await crmService.participantBelongsToRetreat(body.participantId, body.retreatId))) {
				return res.status(404).json({ error: 'Participante no encontrado en este retiro' });
			}
			const note = await crmService.createNote({
				participantId: body.participantId,
				retreatId: body.retreatId,
				body: body.body,
				createdBy: (req.user as any)?.id,
			});
			res.status(201).json(note);
		} catch (error) {
			console.error('Error creating note:', error);
			res.status(500).json({ error: 'Error al guardar la nota' });
		}
	};

	// PUT /crm/notes/:id
	updateNote = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const parsed = updateParticipantNoteSchema.safeParse({ body: req.body, params: { id } });
			if (!parsed.success) {
				return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
			}
			const existing = await crmService.findNoteById(id);
			if (!existing) return res.status(404).json({ error: 'Nota no encontrada' });
			if (!(await callerHasRetreatAccess(req, existing.retreatId ?? ''))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			const userId = (req.user as any)?.id;
			const updated = await crmService.updateNote(id, parsed.data.body.body, userId);
			// null = existe pero no procede: es de otro autor, o es una entrada
			// del sistema (los cambios de etapa son inmutables).
			if (!updated) {
				return res.status(403).json({ error: 'Solo el autor puede editar su nota' });
			}
			res.json(updated);
		} catch (error) {
			console.error('Error updating note:', error);
			res.status(500).json({ error: 'Error al actualizar la nota' });
		}
	};

	// DELETE /crm/notes/:id
	deleteNote = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const existing = await crmService.findNoteById(id);
			if (!existing) return res.status(404).json({ error: 'Nota no encontrada' });
			if (!(await callerHasRetreatAccess(req, existing.retreatId ?? ''))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			const userId = (req.user as any)?.id;
			const ok = await crmService.deleteNote(id, userId);
			if (!ok) {
				return res.status(403).json({ error: 'Solo el autor puede borrar su nota' });
			}
			res.json({ message: 'Nota eliminada exitosamente' });
		} catch (error) {
			console.error('Error deleting note:', error);
			res.status(500).json({ error: 'Error al eliminar la nota' });
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
			if (
				body.participantId &&
				!(await crmService.participantBelongsToRetreat(body.participantId, body.retreatId))
			) {
				return res.status(404).json({ error: 'Participante no encontrado en este retiro' });
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
