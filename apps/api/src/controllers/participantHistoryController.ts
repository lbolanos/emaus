import { Request, Response } from 'express';
import { getUserFromRequest } from '../utils/auth';
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
} from '../services/participantHistoryService';

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
		res.json(history);
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
		res.json(history);
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

		res.json(primaryRetreat);
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
		res.json(history);
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

		res.json(history);
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
		res.json(participants);
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
		res.json(history);
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
		res.json(participants);
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
		res.json(charlistas);
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
		res.status(201).json(history);
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
		res.json(history);
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
		res.json(history);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};
