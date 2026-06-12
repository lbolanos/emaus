import { Request, Response } from 'express';
import { savedSegmentService } from '../services/savedSegmentService';
import { SavedSegment } from '../entities/savedSegment.entity';
import { authorizationService } from '../middleware/authorization';
import { AppDataSource } from '../data-source';
import { createSavedSegmentSchema, updateSavedSegmentSchema } from '@repo/types';

/**
 * Acceso a comunidad: superadmin pasa siempre; en otro caso debe ser
 * `CommunityAdmin` activo. Replica `requireCommunityAccess` para validaciones
 * que dependen del scope guardado en el registro (PUT/DELETE por :id).
 */
async function callerHasCommunityAccess(req: Request, communityId: string): Promise<boolean> {
	const userId = (req.user as any)?.id;
	if (!userId || !communityId) return false;
	if (await authorizationService.hasRole(userId, 'superadmin')) return true;
	const { CommunityAdmin } = await import('../entities/communityAdmin.entity');
	const adminRecord = await AppDataSource.getRepository(CommunityAdmin).findOne({
		where: { communityId, userId, status: 'active' },
	});
	return !!adminRecord;
}

/** Valida que el caller pueda acceder al segmento según su scope. */
async function callerCanAccessSegment(req: Request, segment: SavedSegment): Promise<boolean> {
	const userId = (req.user as any)?.id;
	if (!userId) return false;
	if (segment.scope === 'community' && segment.communityId) {
		return callerHasCommunityAccess(req, segment.communityId);
	}
	if (segment.scope === 'retreat' && segment.retreatId) {
		return authorizationService.hasRetreatAccess(userId, segment.retreatId);
	}
	return false;
}

export class SavedSegmentController {
	// GET /saved-segments/retreat/:retreatId  (gated por requireRetreatAccess)
	getRetreatSegments = async (req: Request, res: Response) => {
		try {
			const { retreatId } = req.params;
			const segments = await savedSegmentService.findByRetreat(retreatId);
			res.json(segments);
		} catch (error) {
			console.error('Error fetching retreat segments:', error);
			res.status(500).json({ error: 'Error al obtener los segmentos del retiro' });
		}
	};

	// GET /saved-segments/community/:communityId  (gated por requireCommunityAccess)
	getCommunitySegments = async (req: Request, res: Response) => {
		try {
			const { communityId } = req.params;
			const segments = await savedSegmentService.findByCommunity(communityId);
			res.json(segments);
		} catch (error) {
			console.error('Error fetching community segments:', error);
			res.status(500).json({ error: 'Error al obtener los segmentos de la comunidad' });
		}
	};

	// POST /saved-segments
	createSegment = async (req: Request, res: Response) => {
		try {
			const parsed = createSavedSegmentSchema.safeParse({ body: req.body });
			if (!parsed.success) {
				return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
			}
			const body = parsed.data.body;

			// Autorización por recurso (retiro o comunidad indicados en el body).
			const userId = (req.user as any)?.id;
			const authorized =
				body.scope === 'community'
					? await callerHasCommunityAccess(req, body.communityId!)
					: await authorizationService.hasRetreatAccess(userId, body.retreatId!);
			if (!authorized) {
				return res.status(403).json({ error: 'Forbidden' });
			}

			const segment = await savedSegmentService.create({
				name: body.name,
				scope: body.scope,
				retreatId: body.retreatId ?? null,
				communityId: body.communityId ?? null,
				filters: body.filters,
				createdBy: userId,
			});
			res.status(201).json(segment);
		} catch (error) {
			console.error('Error creating segment:', error);
			res.status(500).json({ error: 'Error al crear el segmento' });
		}
	};

	// PUT /saved-segments/:id
	updateSegment = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const parsed = updateSavedSegmentSchema.safeParse({ body: req.body, params: { id } });
			if (!parsed.success) {
				return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
			}

			const existing = await savedSegmentService.findById(id);
			if (!existing) {
				return res.status(404).json({ error: 'Segmento no encontrado' });
			}
			if (!(await callerCanAccessSegment(req, existing))) {
				return res.status(403).json({ error: 'Forbidden' });
			}

			const updated = await savedSegmentService.update(id, parsed.data.body);
			res.json(updated);
		} catch (error) {
			console.error('Error updating segment:', error);
			res.status(500).json({ error: 'Error al actualizar el segmento' });
		}
	};

	// POST /saved-segments/preview — evalúa filtros en vivo y devuelve cuántos matchean
	previewSegment = async (req: Request, res: Response) => {
		try {
			const { retreatId, filters } = req.body ?? {};
			if (!retreatId) {
				return res.status(400).json({ error: 'retreatId requerido' });
			}
			const userId = (req.user as any)?.id;
			if (!(await authorizationService.hasRetreatAccess(userId, retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			const participants = await savedSegmentService.evaluateFilters(retreatId, filters ?? {});
			res.json({ count: participants.length, participantIds: participants.map((p) => p.id) });
		} catch (error) {
			console.error('Error previewing segment:', error);
			res.status(500).json({ error: 'Error al previsualizar el segmento' });
		}
	};

	// DELETE /saved-segments/:id
	deleteSegment = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const existing = await savedSegmentService.findById(id);
			if (!existing) {
				return res.status(404).json({ error: 'Segmento no encontrado' });
			}
			if (!(await callerCanAccessSegment(req, existing))) {
				return res.status(403).json({ error: 'Forbidden' });
			}
			await savedSegmentService.delete(id);
			res.json({ message: 'Segmento eliminado exitosamente' });
		} catch (error) {
			console.error('Error deleting segment:', error);
			res.status(500).json({ error: 'Error al eliminar el segmento' });
		}
	};
}
