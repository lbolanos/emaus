import { Response } from 'express';
import { RETREAT_ROLES } from '@repo/types';
import { AppDataSource } from '../data-source';
import { DomainAuditLog } from '../entities/domainAuditLog.entity';
import { Retreat } from '../entities/retreat.entity';
import { User } from '../entities/user.entity';
import { authorizationService, AuthenticatedRequest } from '../middleware/authorization';
import { makeDateInTimezone } from '../utils/date.transformer';

/**
 * Lectura de la auditoría de dominio (`domain_audit_log`), scoped por retiro.
 * El trail de auditoría expone diffs de TODOS los recursos del retiro (pagos,
 * deudas, datos de participantes), así que la lectura se restringe a:
 * admin del retiro (rol coordinador), creador del retiro, o `audit:read` (superadmin).
 */

/**
 * Timezone efectiva del retiro: retreat.timezone ?? house.timezone ?? CDMX.
 * Las fronteras del filtro de fecha (YYYY-MM-DD) se interpretan en esta zona.
 */
async function resolveRetreatTimezone(retreatId: string): Promise<string> {
	const retreat = await AppDataSource.getRepository(Retreat).findOne({
		where: { id: retreatId },
		relations: ['house'],
	});
	return retreat?.timezone || retreat?.house?.timezone || 'America/Mexico_City';
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Inicio (o fin exclusivo, dayOffset=1) de un día YYYY-MM-DD en la tz dada. */
function dayBoundaryInTz(ymd: string, tz: string, dayOffset: 0 | 1): Date | null {
	const m = YMD_RE.exec(ymd);
	if (!m) {
		// Fallback para clientes viejos que manden un datetime completo.
		const d = new Date(ymd);
		return isNaN(d.getTime()) ? null : d;
	}
	return makeDateInTimezone(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dayOffset, 0, 0, tz);
}
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

		const hasAuditRead = await authorizationService.hasPermission(userId, 'audit:read');
		const isCreator = hasAuditRead
			? true
			: await authorizationService.isRetreatCreator(userId, retreatId);
		const isRetreatAdmin =
			hasAuditRead || isCreator
				? true
				: await authorizationService.hasRetreatRole(userId, retreatId, RETREAT_ROLES.admin);

		if (!hasAuditRead && !isCreator && !isRetreatAdmin) {
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
		// Las fechas llegan como YYYY-MM-DD planos y se interpretan como fronteras de
		// día en la timezone del retiro (createdAt se guarda en UTC).
		if (startDate || endDate) {
			const tz = await resolveRetreatTimezone(retreatId);
			if (startDate) {
				const from = dayBoundaryInTz(startDate as string, tz, 0);
				if (from) qb.andWhere('log.createdAt >= :startDate', { startDate: from });
			}
			if (endDate) {
				// Fin de día exclusivo: inicio del día siguiente en la tz del retiro.
				const to = dayBoundaryInTz(endDate as string, tz, 1);
				if (to) qb.andWhere('log.createdAt < :endDate', { endDate: to });
			}
		}

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
