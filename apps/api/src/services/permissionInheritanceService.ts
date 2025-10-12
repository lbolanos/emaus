import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { UserRetreat } from '../entities/userRetreat.entity';
import { RolePermission } from '../entities/rolePermission.entity';
import { Permission } from '../entities/permission.entity';
import { Retreat } from '../entities/retreat.entity';

export interface PermissionInheritanceRule {
	parentRole: string;
	childRole: string;
	inheritPermissions: boolean;
	inheritDelegation: boolean;
	conditions?: PermissionCondition[];
}

export interface PermissionCondition {
	resource: string;
	operation: string;
	required: boolean;
}

export interface DelegationRule {
	fromRole: string;
	toRole: string;
	permissions: string[];
	maxDuration?: number; // in hours
	requiresApproval?: boolean;
}

export class PermissionInheritanceService {
	private static instance: PermissionInheritanceService;
	private inheritanceRules: PermissionInheritanceRule[] = [];
	private delegationRules: DelegationRule[] = [];

	private constructor() {
		this.initializeDefaultRules();
	}

	public static getInstance(): PermissionInheritanceService {
		if (!PermissionInheritanceService.instance) {
			PermissionInheritanceService.instance = new PermissionInheritanceService();
		}
		return PermissionInheritanceService.instance;
	}

	private initializeDefaultRules(): void {
		// Default role hierarchy for retreats
		this.inheritanceRules = [
			{
				parentRole: 'admin',
				childRole: 'treasurer',
				inheritPermissions: true,
				inheritDelegation: true,
				conditions: [{ resource: 'payment', operation: 'manage', required: true }],
			},
			{
				parentRole: 'admin',
				childRole: 'logistics',
				inheritPermissions: true,
				inheritDelegation: true,
				conditions: [{ resource: 'retreatInventory', operation: 'manage', required: true }],
			},
			{
				parentRole: 'admin',
				childRole: 'regular_server',
				inheritPermissions: true,
				inheritDelegation: true,
			},
			{
				parentRole: 'treasurer',
				childRole: 'regular_server',
				inheritPermissions: false,
				inheritDelegation: true,
			},
			{
				parentRole: 'logistics',
				childRole: 'regular_server',
				inheritPermissions: false,
				inheritDelegation: true,
			},
			{
				parentRole: 'communications',
				childRole: 'regular_server',
				inheritPermissions: false,
				inheritDelegation: true,
			},
		];

		// Default delegation rules
		this.delegationRules = [
			{
				fromRole: 'admin',
				toRole: 'treasurer',
				permissions: ['payment:read', 'payment:create', 'payment:update'],
				maxDuration: 168, // 1 week
				requiresApproval: false,
			},
			{
				fromRole: 'admin',
				toRole: 'logistics',
				permissions: [
					'retreatInventory:read',
					'retreatInventory:create',
					'retreatInventory:update',
				],
				maxDuration: 168,
				requiresApproval: false,
			},
			{
				fromRole: 'admin',
				toRole: 'communications',
				permissions: ['messageTemplate:read', 'messageTemplate:create', 'messageTemplate:update'],
				maxDuration: 168,
				requiresApproval: false,
			},
			{
				fromRole: 'treasurer',
				toRole: 'regular_server',
				permissions: ['payment:read'],
				maxDuration: 24, // 1 day
				requiresApproval: true,
			},
			{
				fromRole: 'logistics',
				toRole: 'regular_server',
				permissions: ['retreatInventory:read'],
				maxDuration: 24,
				requiresApproval: true,
			},
			{
				fromRole: 'communications',
				toRole: 'regular_server',
				permissions: ['messageTemplate:read'],
				maxDuration: 24,
				requiresApproval: true,
			},
		];
	}

	public async getInheritedPermissions(userId: string, retreatId: string): Promise<string[]> {
		const userRetreatRepository = AppDataSource.getRepository(UserRetreat);
		const roleRepository = AppDataSource.getRepository(Role);
		const rolePermissionRepository = AppDataSource.getRepository(RolePermission);

		// Get user's current role in this retreat
		const userRetreat = await userRetreatRepository.findOne({
			where: { userId, retreatId, status: 'active' },
			relations: ['role'],
		});

		if (!userRetreat) {
			return [];
		}

		const allPermissions = new Set<string>();
		const visitedRoles = new Set<string>();

		// Get permissions from current role and inherited roles
		await this.collectInheritedPermissions(
			userRetreat.role.name,
			allPermissions,
			visitedRoles,
			retreatId,
		);

		return Array.from(allPermissions);
	}

	private async collectInheritedPermissions(
		roleName: string,
		permissions: Set<string>,
		visitedRoles: Set<string>,
		retreatId: string,
	): Promise<void> {
		if (visitedRoles.has(roleName)) {
			return; // Prevent circular inheritance
		}

		visitedRoles.add(roleName);

		// Get direct permissions for this role
		const role = await AppDataSource.getRepository(Role).findOne({
			where: { name: roleName },
			relations: ['rolePermissions'],
		});

		if (role) {
			role.rolePermissions.forEach((rolePermission) => {
				permissions.add(
					`${rolePermission.permission.resource}:${rolePermission.permission.operation}`,
				);
			});
		}

		// Find inheritance rules where this role is a parent
		const childRules = this.inheritanceRules.filter((rule) => rule.parentRole === roleName);

		for (const rule of childRules) {
			if (rule.inheritPermissions) {
				// Check conditions
				const conditionsMet = await this.checkPermissionConditions(rule.conditions, retreatId);

				if (conditionsMet) {
					await this.collectInheritedPermissions(
						rule.childRole,
						permissions,
						visitedRoles,
						retreatId,
					);
				}
			}
		}
	}

	private async checkPermissionConditions(
		conditions: PermissionCondition[] | undefined,
		retreatId: string,
	): Promise<boolean> {
		if (!conditions || conditions.length === 0) {
			return true;
		}

		for (const condition of conditions) {
			const hasPermission = await this.checkRetreatPermission(
				retreatId,
				condition.resource,
				condition.operation,
			);

			if (condition.required && !hasPermission) {
				return false;
			}
		}

		return true;
	}

	private async checkRetreatPermission(
		retreatId: string,
		resource: string,
		operation: string,
	): Promise<boolean> {
		// Check if any user in this retreat has the required permission
		const result = await AppDataSource.query(
			`
			SELECT COUNT(*) as count
			FROM user_retreats ur
			JOIN role_permissions rp ON ur.role_id = rp.role_id
			JOIN permissions p ON rp.permission_id = p.id
			WHERE ur.retreat_id = ? AND ur.status = 'active'
			AND p.resource = ? AND p.operation = ?
		`,
			[retreatId, resource, operation],
		);

		return result[0].count > 0;
	}

	public async canDelegatePermissions(
		fromUserId: string,
		toUserId: string,
		retreatId: string,
		permissions: string[],
	): Promise<{ canDelegate: boolean; requiresApproval: boolean; maxDuration?: number }> {
		const userRetreatRepository = AppDataSource.getRepository(UserRetreat);

		// Get both users' roles in this retreat
		const [fromUserRetreat, toUserRetreat] = await Promise.all([
			userRetreatRepository.findOne({
				where: { userId: fromUserId, retreatId, status: 'active' },
				relations: ['role'],
			}),
			userRetreatRepository.findOne({
				where: { userId: toUserId, retreatId, status: 'active' },
				relations: ['role'],
			}),
		]);

		if (!fromUserRetreat || !toUserRetreat) {
			return { canDelegate: false, requiresApproval: false };
		}

		// Find applicable delegation rules
		const delegationRule = this.delegationRules.find(
			(rule) =>
				rule.fromRole === fromUserRetreat.role.name && rule.toRole === toUserRetreat.role.name,
		);

		if (!delegationRule) {
			return { canDelegate: false, requiresApproval: false };
		}

		// Check if requested permissions are allowed by the rule
		const canDelegateAll = permissions.every((permission) =>
			delegationRule.permissions.includes(permission),
		);

		return {
			canDelegate: canDelegateAll,
			requiresApproval: delegationRule.requiresApproval || false,
			maxDuration: delegationRule.maxDuration,
		};
	}

	public async createPermissionDelegation(
		fromUserId: string,
		toUserId: string,
		retreatId: string,
		permissions: string[],
		duration?: number,
	): Promise<string> {
		const delegationCheck = await this.canDelegatePermissions(
			fromUserId,
			toUserId,
			retreatId,
			permissions,
		);

		if (!delegationCheck.canDelegate) {
			throw new Error('Permission delegation not allowed between these roles');
		}

		// Calculate expiration
		const delegationDuration = duration || delegationCheck.maxDuration || 24;
		const expiresAt = new Date();
		expiresAt.setHours(expiresAt.getHours() + delegationDuration);

		// Create delegation record
		const delegationId = require('uuid').v4();

		await AppDataSource.query(
			`
			INSERT INTO permission_delegations (
				id, from_user_id, to_user_id, retreat_id, 
				permissions, expires_at, created_at, status
			) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'active')
		`,
			[delegationId, fromUserId, toUserId, retreatId, JSON.stringify(permissions), expiresAt],
		);

		return delegationId;
	}

	public async getActiveDelegations(
		userId: string,
		retreatId?: string,
	): Promise<
		Array<{
			id: string;
			fromUserId: string;
			toUserId: string;
			retreatId: string;
			permissions: string[];
			expiresAt: Date;
		}>
	> {
		let query = `
			SELECT id, from_user_id, to_user_id, retreat_id, 
			       permissions, expires_at
			FROM permission_delegations 
			WHERE status = 'active' AND expires_at > datetime('now')
			AND (from_user_id = ? OR to_user_id = ?)
		`;
		const params = [userId, userId];

		if (retreatId) {
			query += ' AND retreat_id = ?';
			params.push(retreatId);
		}

		const result = await AppDataSource.query(query, params);

		return result.map((row: any) => ({
			id: row.id,
			fromUserId: row.from_user_id,
			toUserId: row.to_user_id,
			retreatId: row.retreat_id,
			permissions: JSON.parse(row.permissions),
			expiresAt: new Date(row.expiresAt),
		}));
	}

	public async revokeDelegation(delegationId: string, revokedBy: string): Promise<boolean> {
		const result = await AppDataSource.query(
			`
			UPDATE permission_delegations 
			SET status = 'revoked', revoked_at = datetime('now'), revoked_by = ?
			WHERE id = ? AND status = 'active'
		`,
			[revokedBy, delegationId],
		);

		return (result.affected || 0) > 0;
	}

	public async cleanupExpiredDelegations(): Promise<number> {
		const result = await AppDataSource.query(`
			UPDATE permission_delegations 
			SET status = 'expired'
			WHERE expires_at <= datetime('now') AND status = 'active'
		`);

		return result.affected || 0;
	}

	public async getEffectivePermissions(userId: string, retreatId: string): Promise<string[]> {
		const basePermissions = await this.getInheritedPermissions(userId, retreatId);

		// Get delegated permissions
		const delegations = await this.getActiveDelegations(userId, retreatId);
		const delegatedPermissions = new Set<string>();

		for (const delegation of delegations) {
			if (delegation.toUserId === userId) {
				delegation.permissions.forEach((permission) => delegatedPermissions.add(permission));
			}
		}

		// Combine base and delegated permissions
		return [...new Set([...basePermissions, ...delegatedPermissions])];
	}

	public addInheritanceRule(rule: PermissionInheritanceRule): void {
		this.inheritanceRules.push(rule);
	}

	public removeInheritanceRule(parentRole: string, childRole: string): boolean {
		const index = this.inheritanceRules.findIndex(
			(rule) => rule.parentRole === parentRole && rule.childRole === childRole,
		);

		if (index >= 0) {
			this.inheritanceRules.splice(index, 1);
			return true;
		}

		return false;
	}

	public addDelegationRule(rule: DelegationRule): void {
		this.delegationRules.push(rule);
	}

	public removeDelegationRule(fromRole: string, toRole: string): boolean {
		const index = this.delegationRules.findIndex(
			(rule) => rule.fromRole === fromRole && rule.toRole === toRole,
		);

		if (index >= 0) {
			this.delegationRules.splice(index, 1);
			return true;
		}

		return false;
	}

	public getInheritanceRules(): PermissionInheritanceRule[] {
		return [...this.inheritanceRules];
	}

	public getDelegationRules(): DelegationRule[] {
		return [...this.delegationRules];
	}
}

export const permissionInheritanceService = PermissionInheritanceService.getInstance();
