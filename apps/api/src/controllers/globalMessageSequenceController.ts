import { Request, Response } from 'express';
import { globalMessageSequenceService } from '../services/globalMessageSequenceService';
import { messageSequenceService } from '../services/messageSequenceService';
import { authorizationService } from '../middleware/authorization';
import {
	createGlobalMessageSequenceSchema,
	updateGlobalMessageSequenceSchema,
} from '@repo/types';

async function callerHasRetreatAccess(req: Request, retreatId: string): Promise<boolean> {
	const userId = (req.user as any)?.id;
	if (!userId || !retreatId) return false;
	return authorizationService.hasRetreatAccess(userId, retreatId);
}

/**
 * Plantillas globales de secuencias. La gestión (CRUD) está gated por el
 * permiso `globalMessageTemplate:*` en las rutas; la importación a un retiro
 * exige además acceso al retiro destino (verificado aquí).
 */
export class GlobalMessageSequenceController {
	// GET /global-message-sequences
	getAll = async (_req: Request, res: Response) => {
		try {
			res.json(await globalMessageSequenceService.getAll());
		} catch (error) {
			console.error('Error fetching global sequences:', error);
			res.status(500).json({ error: 'Error al obtener las plantillas de secuencias' });
		}
	};

	// GET /global-message-sequences/:id
	getById = async (req: Request, res: Response) => {
		try {
			const seq = await globalMessageSequenceService.getById(req.params.id);
			if (!seq) return res.status(404).json({ error: 'Plantilla de secuencia no encontrada' });
			res.json(seq);
		} catch (error) {
			console.error('Error fetching global sequence:', error);
			res.status(500).json({ error: 'Error al obtener la plantilla de secuencia' });
		}
	};

	// POST /global-message-sequences
	create = async (req: Request, res: Response) => {
		try {
			const parsed = createGlobalMessageSequenceSchema.safeParse({ body: req.body });
			if (!parsed.success) {
				return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
			}
			const seq = await globalMessageSequenceService.create(parsed.data.body);
			res.status(201).json(seq);
		} catch (error) {
			console.error('Error creating global sequence:', error);
			res.status(500).json({ error: 'Error al crear la plantilla de secuencia' });
		}
	};

	// PUT /global-message-sequences/:id
	update = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const parsed = updateGlobalMessageSequenceSchema.safeParse({ body: req.body, params: { id } });
			if (!parsed.success) {
				return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
			}
			const updated = await globalMessageSequenceService.update(id, parsed.data.body);
			if (!updated) return res.status(404).json({ error: 'Plantilla de secuencia no encontrada' });
			res.json(updated);
		} catch (error) {
			console.error('Error updating global sequence:', error);
			res.status(500).json({ error: 'Error al actualizar la plantilla de secuencia' });
		}
	};

	// DELETE /global-message-sequences/:id
	delete = async (req: Request, res: Response) => {
		try {
			const ok = await globalMessageSequenceService.delete(req.params.id);
			if (!ok) return res.status(404).json({ error: 'Plantilla de secuencia no encontrada' });
			res.json({ message: 'Plantilla de secuencia eliminada exitosamente' });
		} catch (error) {
			console.error('Error deleting global sequence:', error);
			res.status(500).json({ error: 'Error al eliminar la plantilla de secuencia' });
		}
	};

	// POST /global-message-sequences/:id/toggle-active
	toggleActive = async (req: Request, res: Response) => {
		try {
			const updated = await globalMessageSequenceService.toggleActive(req.params.id);
			if (!updated) return res.status(404).json({ error: 'Plantilla de secuencia no encontrada' });
			res.json(updated);
		} catch (error) {
			console.error('Error toggling global sequence:', error);
			res.status(500).json({ error: 'Error al cambiar el estado' });
		}
	};

	// POST /global-message-sequences/:id/copy-to-retreat  { retreatId }
	copyToRetreat = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const retreatId = req.body?.retreatId;
			if (!retreatId) return res.status(400).json({ error: 'retreatId es requerido' });
			if (!(await callerHasRetreatAccess(req, retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			const created = await globalMessageSequenceService.copyToRetreat(
				id,
				retreatId,
				(req.user as any)?.id,
			);
			if (!created) return res.status(404).json({ error: 'Plantilla de secuencia no encontrada' });
			// Devuelve la secuencia completa (con pasos) del retiro.
			const full = await messageSequenceService.findById(created.id);
			res.status(201).json(full ?? created);
		} catch (error) {
			console.error('Error copying global sequence to retreat:', error);
			res.status(500).json({ error: 'Error al importar la plantilla al retiro' });
		}
	};
}
