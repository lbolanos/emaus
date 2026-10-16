import { Request, Response } from 'express';
import { getUserFromRequest } from '../utils/auth';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { canViewHealthData, stripSensitiveHealthFields } from './participantController';
import {
	getUserRetreatHistory,
	getUserRetreatHistoryByRole,
	getHistoryById,
	getUserHistoryForRetreat,
	getParticipantsByRetreat,
	getHistoryByParticipantId,
	createHistoryEntry,
	updateHistoryEntry,
	deleteHistoryEntry,
	markPrimaryRetreat,
	getPrimaryRetreat,
	getParticipantsByRole,
	getCharlistas,
	syncRetreatFields,
} from '../services/retreatParticipantService';
import { emitReceptionBagMade } from '../realtime';

/**
 * SECURITY: `RetreatParticipant.participant` (relación cargada por
 * `getParticipantsByRetreat`/`getParticipantsByRole`) trae la ficha completa
 * del participante — medicación, dieta, discapacidad, notas y los 12 campos
 * de contacto de emergencia — sin el mismo gate `participant:health` que ya
 * protege `/participants` (ver `stripSensitiveHealthFields` en
 * `participantController.ts`). Estos dos endpoints solo estaban gateados por
 * acceso genérico al retiro (`requireRetreatAccess`), que cualquier rol —
 * incluido el más limitado — cumple.
 *
 * La propia fila `retreat_participants` también trae campos del régimen de
 * salud (`notes` y el caso especial `specialCase*`), así que se strippan del
 * item además de su `.participant`. Por eso pasan por aquí TODOS los handlers
 * que devuelven filas rp: `/history/participant/*`, `/history/user/*` y
 * `/history/charlistas` solo exigen `participant:read` (lo tiene
 * `regular_server`), y `/history/my-retreats*` le devolvería al propio
 * caminante la marca y el motivo que el palanquero dejó para el coordinador.
 */
async function stripHealthFromRetreatParticipants<
	T extends RetreatParticipant | RetreatParticipant[] | null,
>(req: Request, data: T): Promise<T> {
	if (data == null || (await canViewHealthData(req))) return data;
	const strip = (item: RetreatParticipant): RetreatParticipant => {
		const stripped = stripSensitiveHealthFields(item);
		return item.participant
			? ({
					...stripped,
					participant: stripSensitiveHealthFields(item.participant),
				} as RetreatParticipant)
			: stripped;
	};
	return (Array.isArray(data) ? data.map(strip) : strip(data)) as T;
}

// ==================== USER RETREAT HISTORY ====================

/**
 * Get complete retreat history for the authenticated user
 */
export const getUserRetreatHistoryController = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const history = await getUserRetreatHistory(user.id);
		res.json(await stripHealthFromRetreatParticipants(req, history));
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

/**
 * Get retreat history for the authenticated user filtered by role
 */
export const getUserRetreatHistoryByRoleController = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { role } = req.params;
		const history = await getUserRetreatHistoryByRole(user.id, role as any);
		res.json(await stripHealthFromRetreatParticipants(req, history));
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

/**
 * Get the authenticated user's primary retreat
 */
export const getPrimaryRetreatController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const primaryRetreat = await getPrimaryRetreat(user.id);
		if (!primaryRetreat) {
			res.status(404).json({ message: 'No se encontró retiro primario' });
			return;
		}

		res.json(await stripHealthFromRetreatParticipants(req, primaryRetreat));
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

// ==================== ADMIN/COORDINATOR ENDPOINTS ====================

/**
 * Get retreat history for a specific user (admin/coordinator only)
 */
export const getUserRetreatHistoryByIdController = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { userId } = req.params;
		const history = await getUserRetreatHistory(userId);
		res.json(await stripHealthFromRetreatParticipants(req, history));
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

/**
 * Get history for a specific user and retreat
 */
export const getUserHistoryForRetreatController = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { userId, retreatId } = req.params;
		const history = await getUserHistoryForRetreat(userId, retreatId);
		if (!history) {
			res.status(404).json({ message: 'Historial no encontrado' });
			return;
		}

		res.json(await stripHealthFromRetreatParticipants(req, history));
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

/**
 * Get all participants (history) for a specific retreat
 */
export const getParticipantsByRetreatController = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { retreatId } = req.params;
		const participants = await getParticipantsByRetreat(retreatId);
		res.json(await stripHealthFromRetreatParticipants(req, participants));
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

/**
 * Get all history entries for a specific participant
 */
export const getHistoryByParticipantIdController = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { participantId } = req.params;
		const history = await getHistoryByParticipantId(participantId);
		res.json(await stripHealthFromRetreatParticipants(req, history));
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

/**
 * Get participants by role for a specific retreat
 */
export const getParticipantsByRoleController = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { retreatId, role } = req.params;
		const participants = await getParticipantsByRole(retreatId, role as any);
		res.json(await stripHealthFromRetreatParticipants(req, participants));
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

// ==================== CHARLISTAS ENDPOINTS ====================

/**
 * Get charlistas (speakers) for a retreat or globally
 */
export const getCharlistasController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { retreatId } = req.query;
		const charlistas = await getCharlistas(retreatId as string | undefined);
		res.json(await stripHealthFromRetreatParticipants(req, charlistas));
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

// ==================== CRUD OPERATIONS (ADMIN ONLY) ====================

/**
 * Create a new history entry (admin only)
 */
export const createHistoryEntryController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const history = await createHistoryEntry(req.body);
		res.status(201).json(await stripHealthFromRetreatParticipants(req, history));
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

/**
 * Update a history entry (admin only)
 */
export const updateHistoryEntryController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { id } = req.params;
		const history = await updateHistoryEntry(id, req.body);
		res.json(await stripHealthFromRetreatParticipants(req, history));
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

/**
 * Delete a history entry (admin only)
 */
export const deleteHistoryEntryController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { id } = req.params;
		await deleteHistoryEntry(id);
		res.json({ message: 'Historial eliminado' });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

/**
 * Mark a retreat as the user's primary retreat (admin only)
 */
export const markPrimaryRetreatController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { userId, historyId } = req.params;
		const history = await markPrimaryRetreat(userId, historyId);
		res.json(await stripHealthFromRetreatParticipants(req, history));
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

/**
 * Update the bagMade flag for a participant in a retreat
 */
export const updateBagMadeController = async (req: Request, res: Response): Promise<void> => {
	try {
		const { participantId, retreatId } = req.params;
		const { bagMade } = req.body;
		if (typeof bagMade !== 'boolean') {
			res.status(400).json({ message: 'bagMade debe ser un booleano' });
			return;
		}
		await syncRetreatFields(participantId, retreatId, { bagMade });
		emitReceptionBagMade({ retreatId, participantId, bagMade });
		res.json({ ok: true });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

/**
 * Update the shirt-order confirmation flag (SERVER_SHIRT_CONFIRMATION flow) for
 * a participant in a retreat. `true` stamps now, `false` clears back to NULL.
 * No realtime emit: unlike reception's bagMade, the shirt report is a
 * single-coordinator tool (see specs/shirt-order-confirmation).
 */
export const updateShirtOrderConfirmationController = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const { participantId, retreatId } = req.params;
		// Body validated by setShirtOrderConfirmationSchema in the route
		// (validateRequest): a missing/non-boolean `confirmed` never reaches here.
		const { confirmed } = req.body;
		await syncRetreatFields(participantId, retreatId, {
			shirtOrderConfirmedAt: confirmed ? new Date() : null,
		});
		res.json({ ok: true });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};
