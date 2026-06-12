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

	// POST /message-sequences/scheduled/:id/dispatch — marcar pendiente WhatsApp como enviado
	markDispatched = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const updated = await messageSequenceService.markDispatched(id);
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

	// POST /message-sequences/retreat/:retreatId/run — ejecutar enrolamiento + proceso ahora
	runNow = async (req: Request, res: Response) => {
		try {
			const { retreatId } = req.params;
			const sequences = await messageSequenceService.findByRetreat(retreatId);
			let enrolled = 0;
			for (const seq of sequences) {
				if (seq.isActive) enrolled += await messageSequenceService.enrollSequence(seq);
			}
			const processed = await messageSequenceService.processDue();
			res.json({ enrolled, processed });
		} catch (error) {
			console.error('Error running sequences:', error);
			res.status(500).json({ error: 'Error al ejecutar las secuencias' });
		}
	};
}
