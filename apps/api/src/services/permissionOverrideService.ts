import { AppDataSource } from '../data-source';
import { AuditService } from './auditService';
import { Request } from 'express';

export interface PermissionOverride {
	resource: string;
	operation: string;
	granted: boolean;
	reason?: string;
	expiresAt?: Date;
}

export class PermissionOverrideService {
	private static instance: PermissionOverrideService;
	private auditService: AuditService;

	private constructor() {
		this.auditService = new AuditService(AppDataSource);
	}

	public static getInstance(): PermissionOverrideService {
		if (!PermissionOverrideService.instance) {
			PermissionOverrideService.instance = new PermissionOverrideService();
		}
		return PermissionOverrideService.instance;
	}

	public async setPermissionOverride(
		userId: string,
		retreatId: string,
		overrides: PermissionOverride[],
		setBy: string,
		reason?: string,
		req?: Request,
	): Promise<void> {
		const overridesJson = JSON.stringify(overrides);

		// Check if user has retreat access first
		const { authorizationService } = await import('../middleware/authorization');
		const hasAccess = await authorizationService.hasRetreatAccess(userId, retreatId);

		if (!hasAccess) {
			throw new Error('User must have retreat access before permission overrides can be set');
		}

		// Update or insert permission override
		const result = await AppDataSource.query(
			`UPDATE user_retreats
			 SET permissions_override = ?, updated_at = datetime('now')
			 WHERE user_id = ? AND retreat_id = ?`,
			[overridesJson, userId, retreatId],
		);

		if (result.affected === 0) {
			throw new Error('User retreat assignment not found');
		}

		// Log the permission override change using new audit service
		const auditOptions = {
			ipAddress: req?.ip,
			userAgent: req?.headers['user-agent'],
			description: reason,
		};

		const overrideId = require('uuid').v4();
		const permissions = overrides.map(
			(o) => `${o.resource}:${o.operation} (${o.granted ? 'granted' : 'denied'})`,
		);

		await this.auditService.logPermissionOverrideAdded(
			overrideId,
			setBy,
			userId,
			retreatId,
			permissions,
			auditOptions,
		);
	}

	public async getPermissionOverrides(
		userId: string,
		retreatId: string,
	): Promise<PermissionOverride[]> {
		const result = await AppDataSource.query(
			`SELECT permissions_override FROM user_retreats
			 WHERE user_id = ? AND retreat_id = ? AND status = 'active'`,
			[userId, retreatId],
		);

		if (result.length === 0 || !result[0].permissions_override) {
			return [];
		}

		try {
			return JSON.parse(result[0].permissions_override);
		} catch (error) {
			console.error('Error parsing permission overrides:', error);
			return [];
		}
	}

	public async applyPermissionOverrides(
		userPermissions: string[],
		userId: string,
		retreatId: string,
	): Promise<string[]> {
		const overrides = await this.getPermissionOverrides(userId, retreatId);

		if (overrides.length === 0) {
			return userPermissions;
		}

		const now = new Date();
		const finalPermissions = new Set(userPermissions);

		for (const override of overrides) {
			// Check if override is expired
			if (override.expiresAt && new Date(override.expiresAt) < now) {
				continue;
			}

			const permission = `${override.resource}:${override.operation}`;

			if (override.granted) {
				finalPermissions.add(permission);
			} else {
				finalPermissions.delete(permission);
			}
		}

		return Array.from(finalPermissions);
	}

	public async clearPermissionOverrides(
		userId: string,
		retreatId: string,
		clearedBy: string,
		req?: Request,
	): Promise<void> {
		await AppDataSource.query(
			`UPDATE user_retreats
			 SET permissions_override = NULL, updated_at = datetime('now')
			 WHERE user_id = ? AND retreat_id = ?`,
			[userId, retreatId],
		);

		// Log the clearance using new audit service
		const auditOptions = {
			ipAddress: req?.ip,
			userAgent: req?.headers['user-agent'],
			description: 'Cleared all permission overrides',
		};

		const overrideId = require('uuid').v4();

		// Get current overrides before clearing for logging
		const currentOverrides = await this.getPermissionOverrides(userId, retreatId);
		const permissions = currentOverrides.map(
			(o) => `${o.resource}:${o.operation} (${o.granted ? 'granted' : 'denied'})`,
		);

		await this.auditService.logPermissionOverrideRemoved(
			overrideId,
			clearedBy,
			userId,
			retreatId,
			permissions,
			auditOptions,
		);
	}

	public async getRetreatPermissionOverrides(retreatId: string): Promise<
		Array<{
			userId: string;
			userName: string;
			userEmail: string;
			overrides: PermissionOverride[];
			setAt: Date;
		}>
	> {
		const result = await AppDataSource.query(
			`SELECT
				ur.user_id,
				u.display_name as user_name,
				u.email as user_email,
				ur.permissions_override,
				ur.updated_at as set_at
			 FROM user_retreats ur
			 LEFT JOIN users u ON ur.user_id = u.id
			 WHERE ur.retreat_id = ?
			 AND ur.permissions_override IS NOT NULL
			 AND ur.status = 'active'`,
			[retreatId],
		);

		return result.map((row: any) => ({
			userId: row.user_id,
			userName: row.user_name,
			userEmail: row.user_email,
			overrides: row.permissions_override ? JSON.parse(row.permissions_override) : [],
			setAt: new Date(row.set_at),
		}));
	}

	private async logPermissionChange(
		userId: string,
		retreatId: string,
		overrides: PermissionOverride[],
		setBy: string,
		reason?: string,
	): Promise<void> {
		try {
			const logId = require('uuid').v4();
			await AppDataSource.query(
				`INSERT INTO permission_override_logs (
					id, user_id, retreat_id, overrides, set_by, reason, created_at
				) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
				[logId, userId, retreatId, JSON.stringify(overrides), setBy, reason],
			);
		} catch (error) {
			console.error('Error logging permission change:', error);
		}
	}
}

export const permissionOverrideService = PermissionOverrideService.getInstance();
