import { Request, Response } from 'express';
import { AuditService } from '../services/auditService';
import { AuditActionType, AuditResourceType } from '../entities/auditLog.entity';
import { AppDataSource } from '../data-source';
import { authorizationService, AuthenticatedRequest } from '../middleware/authorization';

const auditService = new AuditService(AppDataSource);

export const getAuditLogs = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId } = req.params;
		const userId = req.user?.id;
		const {
			actionType,
			resourceType,
			resourceId,
			targetUserId,
			limit = 50,
			offset = 0,
			startDate,
			endDate,
		} = req.query;

		if (!userId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Check if user has access to this retreat or has admin permissions
		const hasAccess = await authorizationService.hasRetreatAccess(userId, retreatId);
		const isCreator = await authorizationService.isRetreatCreator(userId, retreatId);
		const hasAdminPermission = await authorizationService.hasPermission(userId, 'audit:read');

		if (!hasAccess && !isCreator && !hasAdminPermission) {
			return res.status(403).json({ message: 'Forbidden' });
		}

		const options: any = {
			retreatId,
			limit: Number(limit),
			offset: Number(offset),
		};

		if (actionType) {
			options.actionType = actionType as AuditActionType;
		}

		if (resourceType) {
			options.resourceType = resourceType as AuditResourceType;
		}

		if (resourceId) {
			options.resourceId = resourceId as string;
		}

		if (targetUserId) {
			options.targetUserId = targetUserId as string;
		}

		if (startDate) {
			options.startDate = new Date(startDate as string);
		}

		if (endDate) {
			options.endDate = new Date(endDate as string);
		}

		const { logs, total } = await auditService.getAuditLogs(options);

		res.json({
			logs,
			total,
			limit: Number(limit),
			offset: Number(offset),
			hasMore: Number(offset) + Number(limit) < total,
		});
	} catch (error) {
		console.error('Error getting audit logs:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const getUserAuditLogs = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { userId } = req.params;
		const requestUserId = req.user?.id;
		const { limit = 50, offset = 0, startDate, endDate } = req.query;

		if (!requestUserId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Users can only see their own audit logs unless they have admin permissions
		if (userId !== requestUserId) {
			const hasAdminPermission = await authorizationService.hasPermission(
				requestUserId,
				'audit:read',
			);
			if (!hasAdminPermission) {
				return res.status(403).json({ message: 'Forbidden' });
			}
		}

		const options: any = {
			targetUserId: userId,
			limit: Number(limit),
			offset: Number(offset),
		};

		if (startDate) {
			options.startDate = new Date(startDate as string);
		}

		if (endDate) {
			options.endDate = new Date(endDate as string);
		}

		const { logs, total } = await auditService.getAuditLogs(options);

		res.json({
			logs,
			total,
			limit: Number(limit),
			offset: Number(offset),
			hasMore: Number(offset) + Number(limit) < total,
		});
	} catch (error) {
		console.error('Error getting user audit logs:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};

export const getAuditLogStats = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { retreatId } = req.params;
		const userId = req.user?.id;

		if (!userId) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Check if user has access to this retreat or has admin permissions
		const hasAccess = await authorizationService.hasRetreatAccess(userId, retreatId);
		const isCreator = await authorizationService.isRetreatCreator(userId, retreatId);
		const hasAdminPermission = await authorizationService.hasPermission(userId, 'audit:read');

		if (!hasAccess && !isCreator && !hasAdminPermission) {
			return res.status(403).json({ message: 'Forbidden' });
		}

		// Get audit log statistics for the last 30 days
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

		const { logs } = await auditService.getAuditLogs({
			retreatId,
			startDate: thirtyDaysAgo,
			limit: 1000, // Get more logs for better statistics
		});

		// Group by action type
		const actionTypeStats = logs.reduce(
			(acc, log) => {
				acc[log.actionType] = (acc[log.actionType] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		);

		// Group by date (last 7 days)
		const last7Days = [];
		const dailyStats: Record<string, number> = {};

		for (let i = 6; i >= 0; i--) {
			const date = new Date();
			date.setDate(date.getDate() - i);
			const dateStr = date.toISOString().split('T')[0];
			last7Days.push(dateStr);
			dailyStats[dateStr] = 0;
		}

		logs.forEach((log) => {
			const logDate = new Date(log.createdAt).toISOString().split('T')[0];
			if (Object.prototype.hasOwnProperty.call(dailyStats, logDate)) {
				dailyStats[logDate]++;
			}
		});

		// Get top users by activity
		const userActivity = logs.reduce(
			(acc, log) => {
				if (log.targetUserId) {
					acc[log.targetUserId] = (acc[log.targetUserId] || 0) + 1;
				}
				return acc;
			},
			{} as Record<string, number>,
		);

		const topUsers = Object.entries(userActivity)
			.sort(([, a], [, b]) => b - a)
			.slice(0, 5)
			.map(([userId, count]) => ({ userId, count }));

		res.json({
			actionTypeStats,
			dailyStats: last7Days.map((date) => ({
				date,
				count: dailyStats[date],
			})),
			topUsers,
			totalLogs: logs.length,
		});
	} catch (error) {
		console.error('Error getting audit log stats:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		res.status(500).json({ message: 'Internal server error', error: errorMessage });
	}
};
