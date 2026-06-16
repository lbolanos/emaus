import { Request, Response } from 'express';
import { messageSequenceService } from '../services/messageSequenceService';
import { authorizationService } from '../middleware/authorization';
import { createMessageSequenceSchema, updateMessageSequenceSchema } from '@repo/types';

async function callerHasRetreatAccess(req: Request, retreatId: string): Promise<boolean> {
	const userId = (req.user as any)?.id;
	if (!userId || !retreatId) return false;
	return authorizationService.hasRetreatAccess(userId, retreatId);
}

export class MessageSequenceController {
	// GET /message-sequences/retreat/:retreatId  (gated por requireRetreatAccess)
	getRetreatSequences = async (req: Request, res: Response) => {
		try {
			const { retreatId } = req.params;
			res.json(await messageSequenceService.findByRetreat(retreatId));
		} catch (error) {
			console.error('Error fetching sequences:', error);
			res.status(500).json({ error: 'Error al obtener las secuencias' });
		}
	};

	// POST /message-sequences
	createSequence = async (req: Request, res: Response) => {
		try {
			const parsed = createMessageSequenceSchema.safeParse({ body: req.body });
			if (!parsed.success) {
				return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
			}
			const body = parsed.data.body;
			if (!(await callerHasRetreatAccess(req, body.retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			const seq = await messageSequenceService.createSequence({
				...body,
				createdBy: (req.user as any)?.id,
			});
			res.status(201).json(seq);
		} catch (error) {
			console.error('Error creating sequence:', error);
			res.status(500).json({ error: 'Error al crear la secuencia' });
		}
	};

	// PUT /message-sequences/:id
	updateSequence = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const parsed = updateMessageSequenceSchema.safeParse({ body: req.body, params: { id } });
			if (!parsed.success) {
				return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
			}
			const existing = await messageSequenceService.findById(id);
			if (!existing) return res.status(404).json({ error: 'Secuencia no encontrada' });
			if (!(await callerHasRetreatAccess(req, existing.retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			res.json(await messageSequenceService.updateSequence(id, parsed.data.body));
		} catch (error) {
			console.error('Error updating sequence:', error);
			res.status(500).json({ error: 'Error al actualizar la secuencia' });
		}
	};

	// DELETE /message-sequences/:id
	deleteSequence = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const existing = await messageSequenceService.findById(id);
			if (!existing) return res.status(404).json({ error: 'Secuencia no encontrada' });
			if (!(await callerHasRetreatAccess(req, existing.retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			await messageSequenceService.deleteSequence(id);
			res.json({ message: 'Secuencia eliminada exitosamente' });
		} catch (error) {
			console.error('Error deleting sequence:', error);
			res.status(500).json({ error: 'Error al eliminar la secuencia' });
		}
	};

	// GET /message-sequences/retreat/:retreatId/stats — métricas + problemas por secuencia
	getStats = async (req: Request, res: Response) => {
		try {
			const { retreatId } = req.params;
			const [stats, issues] = await Promise.all([
				messageSequenceService.getStatsByRetreat(retreatId),
				messageSequenceService.getIssuesByRetreat(retreatId),
			]);
			res.json({ stats, issues });
		} catch (error) {
			console.error('Error fetching sequence stats:', error);
			res.status(500).json({ error: 'Error al obtener las métricas de secuencias' });
		}
	};

	// GET /message-sequences/retreat/:retreatId/queue — bandeja de pendientes WhatsApp
	getQueue = async (req: Request, res: Response) => {
		try {
			const { retreatId } = req.params;
			res.json(await messageSequenceService.listQueued(retreatId));
		} catch (error) {
			console.error('Error fetching queue:', error);
			res.status(500).json({ error: 'Error al obtener la bandeja de pendientes' });
		}
	};

	// GET /message-sequences/scheduled/:id/detail — detalle del participante del pendiente
	getQueueItemDetail = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const detail = await messageSequenceService.getQueueItemDetail(id);
			if (!detail) return res.status(404).json({ error: 'Mensaje programado no encontrado' });
			if (!(await callerHasRetreatAccess(req, detail.message.retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			res.json(detail);
		} catch (error) {
			console.error('Error fetching queue item detail:', error);
			res.status(500).json({ error: 'Error al obtener el detalle del pendiente' });
		}
	};

	// POST /message-sequences/scheduled/:id/dispatch — marcar pendiente WhatsApp como enviado
	markDispatched = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const updated = await messageSequenceService.markDispatched(id, (req.user as any)?.id);
			if (!updated) return res.status(404).json({ error: 'Mensaje programado no encontrado' });
			if (!(await callerHasRetreatAccess(req, updated.retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			res.json(updated);
		} catch (error) {
			console.error('Error marking dispatched:', error);
			res.status(500).json({ error: 'Error al marcar como enviado' });
		}
	};

	// POST /message-sequences/scheduled/:id/open — registrar que se abrió el deep-link
	markOpened = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const updated = await messageSequenceService.markOpened(id);
			if (!updated) return res.status(404).json({ error: 'Mensaje programado no encontrado' });
			if (!(await callerHasRetreatAccess(req, updated.retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			res.json(updated);
		} catch (error) {
			console.error('Error marking opened:', error);
			res.status(500).json({ error: 'Error al registrar la apertura' });
		}
	};

	// POST /message-sequences/scheduled/:id/assign  { userId }
	assign = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const userId = req.body?.userId ?? null;
			// Cargar y validar acceso ANTES de mutar (no asignar y validar después).
			const sm = await messageSequenceService.getScheduledById(id);
			if (!sm) return res.status(404).json({ error: 'Mensaje programado no encontrado' });
			if (!(await callerHasRetreatAccess(req, sm.retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			// El responsable asignado debe tener acceso al retiro (evita asignar a un
			// userId arbitrario sin vínculo con el retiro).
			if (userId && !(await authorizationService.hasRetreatAccess(userId, sm.retreatId))) {
				return res.status(400).json({ error: 'El usuario asignado no tiene acceso a este retiro' });
			}
			const updated = await messageSequenceService.assign(id, userId);
			res.json(updated);
		} catch (error) {
			console.error('Error assigning scheduled message:', error);
			res.status(500).json({ error: 'Error al asignar el mensaje' });
		}
	};

	// POST /message-sequences/scheduled/:id/skip — omitir un pendiente (no se envía)
	markSkipped = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const updated = await messageSequenceService.markSkipped(id, (req.user as any)?.id);
			if (!updated) return res.status(404).json({ error: 'Mensaje programado no encontrado' });
			if (!(await callerHasRetreatAccess(req, updated.retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			res.json(updated);
		} catch (error) {
			console.error('Error skipping scheduled message:', error);
			res.status(500).json({ error: 'Error al omitir el mensaje' });
		}
	};

	// POST /message-sequences/scheduled/:id/retry — re-encolar un fallido
	retry = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const updated = await messageSequenceService.retryScheduled(id, (req.user as any)?.id);
			if (!updated) return res.status(404).json({ error: 'Mensaje programado no encontrado' });
			if (!(await callerHasRetreatAccess(req, updated.retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			res.json(updated);
		} catch (error) {
			console.error('Error retrying scheduled message:', error);
			res.status(500).json({ error: 'Error al reintentar el mensaje' });
		}
	};

	// POST /message-sequences/scheduled/:id/discard — descartar (no se enviará ni reaparece)
	discard = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const updated = await messageSequenceService.discardScheduled(id, (req.user as any)?.id);
			if (!updated) return res.status(404).json({ error: 'Mensaje programado no encontrado' });
			if (!(await callerHasRetreatAccess(req, updated.retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			res.json(updated);
		} catch (error) {
			console.error('Error discarding scheduled message:', error);
			res.status(500).json({ error: 'Error al descartar el mensaje' });
		}
	};

	// POST /message-sequences/retreat/:retreatId/run — ejecutar enrolamiento + proceso ahora
	runNow = async (req: Request, res: Response) => {
		try {
			const { retreatId } = req.params;
			const sequences = await messageSequenceService.findByRetreat(retreatId);
			let enrolled = 0;
			for (const seq of sequences) {
				if (seq.isActive) enrolled += await messageSequenceService.enrollSequence(seq);
			}
			// Solo procesar este retiro: el disparo manual no debe enviar mensajes de
			// otros retiros (la ruta solo valida acceso a :retreatId).
			const processed = await messageSequenceService.processDue(new Date(), undefined, retreatId);
			res.json({ enrolled, processed });
		} catch (error) {
			console.error('Error running sequences:', error);
			res.status(500).json({ error: 'Error al ejecutar las secuencias' });
		}
	};

	// POST /message-sequences/retreat/:retreatId/issues/bulk — reenviar/descartar
	// en masa todos los mensajes con problema (failed/skipped) del retiro.
	bulkIssues = async (req: Request, res: Response) => {
		try {
			const { retreatId } = req.params;
			const action = req.body?.action;
			if (action !== 'retry' && action !== 'discard') {
				return res.status(400).json({ error: 'Acción inválida (retry|discard)' });
			}
			const affected = await messageSequenceService.bulkResolveIssues(retreatId, action);
			res.json({ affected });
		} catch (error) {
			console.error('Error in bulk issues:', error);
			res.status(500).json({ error: 'Error al procesar los mensajes con problema' });
		}
	};

	// POST /message-sequences/retreat/:retreatId/regenerate-queue — refresca el
	// snapshot de los pendientes de la bandeja con la plantilla vigente.
	regenerateQueue = async (req: Request, res: Response) => {
		try {
			const { retreatId } = req.params;
			const regenerated = await messageSequenceService.regenerateQueuedForRetreat(retreatId);
			res.json({ regenerated });
		} catch (error) {
			console.error('Error regenerating queue:', error);
			res.status(500).json({ error: 'Error al regenerar la bandeja' });
		}
	};
}
