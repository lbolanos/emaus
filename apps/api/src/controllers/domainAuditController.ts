import { Response } from 'express';
import { AppDataSource } from '../data-source';
import { DomainAuditLog } from '../entities/domainAuditLog.entity';
import { User } from '../entities/user.entity';
import { authorizationService, AuthenticatedRequest } from '../middleware/authorization';

/**
 * Lectura de la auditoría de dominio (`domain_audit_log`), scoped por retiro.
 * Reusa los mismos chequeos de acceso que `auditController` (acceso al retiro,
 * creador, o permiso `audit:read`).
 */
export const getDomainAuditLogs = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId } = req.params;
		const userId = req.user?.id;
		const {
			action,
			resourceType,
			resourceId,
			actorUserId,
			limit = 50,
			offset = 0,
			startDate,
			endDate,
		} = req.query;

		if (!userId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		const hasAccess = await authorizationService.hasRetreatAccess(userId, retreatId);
		const isCreator = await authorizationService.isRetreatCreator(userId, retreatId);
		const hasAdminPermission = await authorizationService.hasPermission(userId, 'audit:read');

		if (!hasAccess && !isCreator && !hasAdminPermission) {
			return res.status(403).json({ message: 'Forbidden' });
		}

		const take = Math.min(Number(limit) || 50, 200);
		const skip = Number(offset) || 0;

		const qb = AppDataSource.getRepository(DomainAuditLog)
			.createQueryBuilder('log')
			.where('log.retreatId = :retreatId', { retreatId })
			.orderBy('log.createdAt', 'DESC')
			.take(take)
			.skip(skip);

		if (action) qb.andWhere('log.action = :action', { action: action as string });
		if (resourceType)
			qb.andWhere('log.resourceType = :resourceType', { resourceType: resourceType as string });
		if (resourceId)
			qb.andWhere('log.resourceId = :resourceId', { resourceId: resourceId as string });
		if (actorUserId)
			qb.andWhere('log.actorUserId = :actorUserId', { actorUserId: actorUserId as string });
		if (startDate) qb.andWhere('log.createdAt >= :startDate', { startDate: new Date(startDate as string) });
		if (endDate) qb.andWhere('log.createdAt <= :endDate', { endDate: new Date(endDate as string) });

		const [rows, total] = await qb.getManyAndCount();

		// Enriquecer con el nombre/email del actor (la tabla guarda solo el id histórico).
		const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter(Boolean))] as string[];
		const actorMap = new Map<string, { displayName: string; email: string }>();
		if (actorIds.length > 0) {
			const users = await AppDataSource.getRepository(User).find({
				where: actorIds.map((id) => ({ id })),
				select: ['id', 'displayName', 'email'],
			});
			for (const u of users) {
				actorMap.set(u.id, { displayName: u.displayName, email: u.email });
			}
		}

		const parse = (v: string | null | undefined) => {
			if (!v) return null;
			try {
				return JSON.parse(v);
			} catch {
				return v;
			}
		};

		const logs = rows.map((r) => ({
			id: r.id,
			action: r.action,
			resourceType: r.resourceType,
			resourceId: r.resourceId,
			retreatId: r.retreatId,
			actorUserId: r.actorUserId,
			actor: r.actorUserId ? (actorMap.get(r.actorUserId) ?? null) : null,
			oldValues: parse(r.oldValues),
			newValues: parse(r.newValues),
			metadata: parse(r.metadata),
			ipAddress: r.ipAddress,
			userAgent: r.userAgent,
			createdAt: r.createdAt,
		}));

		res.json({
			logs,
			total,
			limit: take,
			offset: skip,
			hasMore: skip + take < total,
		});
	} catch (error) {
		console.error('Error getting domain audit logs:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};
