import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/userRole.entity';
import { UserRetreat } from '../entities/userRetreat.entity';
import { Role } from '../entities/role.entity';
import { RolePermission } from '../entities/rolePermission.entity';
import { Permission } from '../entities/permission.entity';
import { Retreat } from '../entities/retreat.entity';
import { ROLES } from '@repo/types';
import { performanceOptimizationService } from '../services/performanceOptimizationService';

export interface AuthenticatedRequest extends Request {
	user?: User;
	userPermissions?: string[];
	userRoles?: string[];
	userRetreats?: Array<{
		retreatId: string;
		role: string;
	}>;
}

export class AuthorizationService {
	private static instance: AuthorizationService;

	private constructor() {}

	public static getInstance(): AuthorizationService {
		if (!AuthorizationService.instance) {
			AuthorizationService.instance = new AuthorizationService();
		}
		return AuthorizationService.instance;
	}

	public async getUserPermissions(userId: string): Promise<{
		permissions: string[];
		roles: string[];
		retreats: Array<{
			retreatId: string;
			role: string;
		}>;
	}> {
		// Check if we have cached final permissions
		const cachedPermissionsResult =
			await performanceOptimizationService.getCachedUserPermissionsResult(userId);
		if (cachedPermissionsResult) {
			return cachedPermissionsResult;
		}

		// Check cache for user retreats
		const cachedUserRetreats = await performanceOptimizationService.getCachedUserRetreats(userId);

		let userRetreats: UserRetreat[];
		if (cachedUserRetreats) {
			// Transform cached data back to entities for processing
			// We need to fetch the actual role data since it's not fully cached
			const activeCachedRetreats = cachedUserRetreats.filter((ur) => ur.status === 'active');
			const roleNames = [...new Set(activeCachedRetreats.map((ur) => ur.role))];

			// Fetch roles by name
			const roles =
				roleNames.length > 0
					? await AppDataSource.getRepository(Role)
							.createQueryBuilder('role')
							.where('role.name IN (:...roleNames)', { roleNames })
							.getMany()
					: [];

			const roleMap = new Map(roles.map((r) => [r.name, r]));

			userRetreats = activeCachedRetreats
				.map((ur) => {
					const entity = new UserRetreat();
					entity.userId = userId;
					entity.retreatId = ur.retreatId;
					entity.status = ur.status;
					// Reconstruct the role object
					const role = roleMap.get(ur.role);
					if (role) {
						entity.role = role;
					}
					return entity;
				})
				.filter((ur) => ur.role); // Filter out any entries without valid roles
		} else {
			// Fetch from database
			userRetreats = await AppDataSource.getRepository(UserRetreat)
				.createQueryBuilder('userRetreat')
				.leftJoinAndSelect('userRetreat.role', 'role')
				.where('userRetreat.userId = :userId', { userId })
				.andWhere('userRetreat.status IN (:...statuses)', { statuses: ['active', 'pending'] })
				.getMany();

			// Cache the results (only if we have valid role data)
			const validUserRetreats = userRetreats.filter((ur) => ur.role);
			const cacheData = validUserRetreats.map((ur) => ({
				retreatId: ur.retreatId,
				role: ur.role.name,
				status: ur.status,
			}));
			await performanceOptimizationService.setCachedUserRetreats(userId, cacheData);

			// Filter out any userRetreats without valid roles
			userRetreats = validUserRetreats;
		}

		const userRoles = await AppDataSource.getRepository(UserRole)
			.createQueryBuilder('userRole')
			.leftJoinAndSelect('userRole.role', 'role')
			.where('userRole.userId = :userId', { userId })
			.getMany();

		// Filter out any userRoles without valid roles
		const validUserRoles = userRoles.filter((ur) => ur.role);
		const roleIds = validUserRoles.map((ur) => ur.role.id);
		const retreatRoleIds = userRetreats.map((ur) => ur.role.id);
		const allRoleIds = [...new Set([...roleIds, ...retreatRoleIds])];

		const rolePermissions = await AppDataSource.getRepository(RolePermission)
			.createQueryBuilder('rolePermission')
			.leftJoinAndSelect('rolePermission.permission', 'permission')
			.where('rolePermission.roleId IN (:...roleIds)', { roleIds: allRoleIds })
			.getMany();

		const permissions = rolePermissions.map(
			(rp) => `${rp.permission.resource}:${rp.permission.operation}`,
		);
		const roles = validUserRoles.map((ur) => ur.role.name);
		const retreats = userRetreats.map((ur) => ({
			retreatId: ur.retreatId,
			role: ur.role.name,
		}));

		const result = {
			permissions: [...new Set(permissions)],
			roles: [...new Set(roles)],
			retreats,
		};

		// Cache the final computed permissions
		await performanceOptimizationService.setCachedUserPermissionsResult(userId, result);
		performanceOptimizationService.logCacheOperation(
			'MISS',
			'userPermissionsResult',
			userId,
			false,
		);
		performanceOptimizationService.logCacheOperation('SET', 'userPermissionsResult', userId, false);

		return result;
	}

	public async getUserPermissionsForRetreat(userId: string, retreatId: string): Promise<{
		permissions: string[];
		roles: string[];
		retreats: Array<{
			retreatId: string;
			role: string;
		}>;
		retreatSpecificRole?: string;
	}> {
		// Check cache for retreat-specific permissions
		const cacheKey = `${userId}:${retreatId}`;
		const cachedPermissionsResult =
			await performanceOptimizationService.getCachedUserPermissionsResult(cacheKey);
		if (cachedPermissionsResult) {
			performanceOptimizationService.logCacheOperation(
				'HIT',
				'userPermissionsResult',
				cacheKey,
				true,
			);
			return cachedPermissionsResult;
		}

		// Get global permissions first (reuse existing logic)
		const globalPermissions = await this.getUserPermissions(userId);

		// Filter user retreats to only include the specific retreat
		const filteredRetreats = globalPermissions.retreats.filter(
			retreat => retreat.retreatId === retreatId
		);

		// Get the specific role for this retreat
		const retreatSpecificRole = filteredRetreats.length > 0 ? filteredRetreats[0].role : undefined;

		// If user has no access to this retreat, return minimal permissions
		if (filteredRetreats.length === 0) {
			const result = {
				permissions: globalPermissions.permissions, // Keep global permissions
				roles: globalPermissions.roles, // Keep global roles
				retreats: [], // No retreat access
				retreatSpecificRole: undefined,
			};

			// Cache the negative result for shorter time
			await performanceOptimizationService.setCachedUserPermissionsResult(cacheKey, result);
			return result;
		}

		// User has access to this retreat, get full permissions
		// Fetch role permissions for both global roles and retreat-specific role
		const userRoles = await AppDataSource.getRepository(UserRole)
			.createQueryBuilder('userRole')
			.leftJoinAndSelect('userRole.role', 'role')
			.where('userRole.userId = :userId', { userId })
			.getMany();

		// Get retreat-specific role data
		const userRetreat = await AppDataSource.getRepository(UserRetreat)
			.createQueryBuilder('userRetreat')
			.leftJoinAndSelect('userRetreat.role', 'role')
			.where('userRetreat.userId = :userId', { userId })
			.andWhere('userRetreat.retreatId = :retreatId', { retreatId })
			.andWhere('userRetreat.status IN (:...statuses)', { statuses: ['active', 'pending'] })
			.getOne();

		// Collect all role IDs (global + retreat-specific)
		const globalRoleIds = userRoles
			.filter(ur => ur.role)
			.map(ur => ur.role.id);

		const retreatRoleId = userRetreat?.role?.id;

		const allRoleIds = [...new Set([...globalRoleIds, retreatRoleId].filter(Boolean))];

		// Get permissions for all relevant roles
		const rolePermissions = await AppDataSource.getRepository(RolePermission)
			.createQueryBuilder('rolePermission')
			.leftJoinAndSelect('rolePermission.permission', 'permission')
			.where('rolePermission.roleId IN (:...roleIds)', { roleIds: allRoleIds })
			.getMany();

		const permissions = rolePermissions.map(
			(rp) => `${rp.permission.resource}:${rp.permission.operation}`,
		);

		const roles = [
			...userRoles.filter(ur => ur.role).map(ur => ur.role.name),
			...(userRetreat?.role ? [userRetreat.role.name] : [])
		];

		const result = {
			permissions: [...new Set(permissions)],
			roles: [...new Set(roles)],
			retreats: filteredRetreats,
			retreatSpecificRole,
		};

		// Cache the result
		await performanceOptimizationService.setCachedUserPermissionsResult(cacheKey, result);
		performanceOptimizationService.logCacheOperation(
			'MISS',
			'userPermissionsResult',
			cacheKey,
			false,
		);
		performanceOptimizationService.logCacheOperation('SET', 'userPermissionsResult', cacheKey, false);

		return result;
	}

	public async hasPermission(userId: string, permission: string): Promise<boolean> {
		const userPermissions = await this.getUserPermissions(userId);
		return userPermissions.permissions.includes(permission);
	}

	public async hasRole(userId: string, role: string): Promise<boolean> {
		const userRoles = await this.getUserPermissions(userId);
		return userRoles.roles.includes(role);
	}

	public async hasRetreatAccess(userId: string, retreatId: string): Promise<boolean> {
		// Check if user is superadmin first - superadmins have access to all retreats
		const isSuperadmin = await this.hasRole(userId, 'superadmin');
		if (isSuperadmin) {
			return true;
		}

		// Check retreat access cache first
		const cachedAccess = await performanceOptimizationService.getCachedRetreatAccess(
			userId,
			retreatId,
		);
		if (cachedAccess !== null) {
			performanceOptimizationService.logCacheOperation(
				'HIT',
				'retreatAccess',
				`${userId}:${retreatId}`,
				true,
			);
			return cachedAccess;
		}

		// Check user retreats cache
		const userRetreats = await performanceOptimizationService.getCachedUserRetreats(userId);
		let hasAccess = false;

		if (userRetreats) {
			hasAccess = userRetreats.some((ur) => ur.retreatId === retreatId && ur.status === 'active');
		} else {
			// Fallback to database query
			const userRetreat = await AppDataSource.getRepository(UserRetreat)
				.createQueryBuilder('userRetreat')
				.leftJoin('userRetreat.role', 'role')
				.where('userRetreat.userId = :userId', { userId })
				.andWhere('userRetreat.retreatId = :retreatId', { retreatId })
				.andWhere('userRetreat.status = :status', { status: 'active' })
				.getOne();

			hasAccess = !!userRetreat;
		}

		// Cache the result for future queries
		await performanceOptimizationService.setCachedRetreatAccess(userId, retreatId, hasAccess);
		performanceOptimizationService.logCacheOperation(
			'MISS',
			'retreatAccess',
			`${userId}:${retreatId}`,
			false,
		);
		performanceOptimizationService.logCacheOperation(
			'SET',
			'retreatAccess',
			`${userId}:${retreatId}`,
			false,
		);

		return hasAccess;
	}

	public async hasRetreatRole(userId: string, retreatId: string, role: string): Promise<boolean> {
		// Check retreat role cache first
		const cachedRole = await performanceOptimizationService.getCachedRetreatRole(
			userId,
			retreatId,
			role,
		);
		if (cachedRole !== null) {
			return cachedRole;
		}

		// Check user retreats cache
		const userRetreats = await performanceOptimizationService.getCachedUserRetreats(userId);
		let hasRole = false;

		if (userRetreats) {
			hasRole = userRetreats.some(
				(ur) => ur.retreatId === retreatId && ur.role === role && ur.status === 'active',
			);
		} else {
			// Fallback to database query
			const userRetreat = await AppDataSource.getRepository(UserRetreat)
				.createQueryBuilder('userRetreat')
				.leftJoin('userRetreat.role', 'role')
				.where('userRetreat.userId = :userId', { userId })
				.andWhere('userRetreat.retreatId = :retreatId', { retreatId })
				.andWhere('role.name = :role', { role })
				.andWhere('userRetreat.status = :status', { status: 'active' })
				.getOne();

			hasRole = !!userRetreat;
		}

		// Cache the result for future queries
		await performanceOptimizationService.setCachedRetreatRole(userId, retreatId, role, hasRole);

		return hasRole;
	}

	public async isRetreatCreator(userId: string, retreatId: string): Promise<boolean> {
		const retreat = await AppDataSource.getRepository(Retreat)
			.createQueryBuilder('retreat')
			.where('retreat.id = :retreatId', { retreatId })
			.andWhere('retreat.createdBy = :userId', { userId })
			.getOne();

		return !!retreat;
	}

	public async assignRetreatRole(
		userId: string,
		retreatId: string,
		roleId: number,
		invitedBy?: string,
		expiresAt?: Date,
	): Promise<UserRetreat> {
		const userRetreatRepository = AppDataSource.getRepository(UserRetreat);

		// Check if assignment already exists
		const existingAssignment = await userRetreatRepository.findOne({
			where: {
				userId,
				retreatId,
				roleId,
			},
		});

		if (existingAssignment) {
			// Update existing assignment
			existingAssignment.status = 'active';
			existingAssignment.invitedBy = invitedBy;
			existingAssignment.invitedAt = new Date();
			existingAssignment.expiresAt = expiresAt;
			const result = await userRetreatRepository.save(existingAssignment);

			// Invalidate cache
			performanceOptimizationService.invalidateUserRetreatCache(userId);
			performanceOptimizationService.invalidateUserPermissionCache(userId);
			performanceOptimizationService.invalidateRetreatPermissionCache(retreatId);
			performanceOptimizationService.invalidateRetreatAccessCache(userId, retreatId);
			performanceOptimizationService.invalidateUserPermissionsResultCache(userId);

			return result;
		}

		// Create new assignment
		const userRetreat = userRetreatRepository.create({
			userId,
			retreatId,
			roleId,
			invitedBy,
			invitedAt: invitedBy ? new Date() : undefined,
			expiresAt,
			status: 'active',
		});

		const result = await userRetreatRepository.save(userRetreat);

		// Invalidate cache
		performanceOptimizationService.invalidateUserRetreatCache(userId);
		performanceOptimizationService.invalidateUserPermissionCache(userId);
		performanceOptimizationService.invalidateRetreatPermissionCache(retreatId);
		performanceOptimizationService.invalidateRetreatAccessCache(userId, retreatId);
		performanceOptimizationService.invalidateUserPermissionsResultCache(userId);

		return result;
	}

	public async revokeRetreatRole(
		userId: string,
		retreatId: string,
		roleId: number,
	): Promise<boolean> {
		const result = await AppDataSource.getRepository(UserRetreat)
			.createQueryBuilder()
			.update(UserRetreat)
			.set({ status: 'revoked' })
			.where('userId = :userId', { userId })
			.andWhere('retreatId = :retreatId', { retreatId })
			.andWhere('roleId = :roleId', { roleId })
			.execute();

		// Invalidate cache if any records were affected
		if ((result.affected || 0) > 0) {
			performanceOptimizationService.invalidateUserRetreatCache(userId);
			performanceOptimizationService.invalidateUserPermissionCache(userId);
			performanceOptimizationService.invalidateRetreatPermissionCache(retreatId);
			performanceOptimizationService.invalidateRetreatAccessCache(userId, retreatId);
			performanceOptimizationService.invalidateUserPermissionsResultCache(userId);
		}

		return (result.affected || 0) > 0;
	}

	public async getRetreatInvitations(retreatId: string): Promise<UserRetreat[]> {
		return AppDataSource.getRepository(UserRetreat)
			.createQueryBuilder('userRetreat')
			.leftJoinAndSelect('userRetreat.user', 'user')
			.leftJoinAndSelect('userRetreat.role', 'role')
			.leftJoinAndSelect('userRetreat.inviter', 'inviter')
			.where('userRetreat.retreatId = :retreatId', { retreatId })
			.andWhere('userRetreat.status IN (:...statuses)', { statuses: ['pending', 'active'] })
			.getMany();
	}

	public async expireOverdueInvitations(): Promise<number> {
		const result = await AppDataSource.getRepository(UserRetreat)
			.createQueryBuilder()
			.update(UserRetreat)
			.set({ status: 'expired' })
			.where('expiresAt IS NOT NULL')
			.andWhere('expiresAt < :now', { now: new Date() })
			.andWhere('status = :status', { status: 'active' })
			.execute();

		return result.affected || 0;
	}
}

export const authorizationService = AuthorizationService.getInstance();

export const requirePermission = (permission: string): any => {
	return async (req: any, res: Response, next: NextFunction) => {
		try {
			//console.log('🔍 [PERMISSION CHECK] Starting permission check');
			//console.log('🔍 [PERMISSION CHECK] Required permission:', permission);
			//console.log('🔍 [PERMISSION CHECK] User:', req.user ? { id: req.user.id, email: req.user.email } : 'No user');
			//console.log('🔍 [PERMISSION CHECK] URL:', req.originalUrl);
			//console.log('🔍 [PERMISSION CHECK] Method:', req.method);

			if (!req.user) {
				console.log('❌ [PERMISSION CHECK] No user found in request');
				return res.status(401).json({ message: 'Unauthorized' });
			}

			//console.log('🔍 [PERMISSION CHECK] Checking if user has permission...');
			const userPermissions = await authorizationService.getUserPermissions(req.user.id);
			//console.log('🔍 [PERMISSION CHECK] User permissions:', userPermissions.permissions);
			//console.log('🔍 [PERMISSION CHECK] User roles:', userPermissions.roles);
			//console.log('🔍 [PERMISSION CHECK] User retreats:', userPermissions.retreats);

			const hasPermission = await authorizationService.hasPermission(req.user.id, permission);
			//console.log('🔍 [PERMISSION CHECK] Has permission result:', hasPermission);

			if (!hasPermission) {
				console.log('❌ [PERMISSION CHECK] Permission denied for:', permission);
				return res.status(403).json({
					message: 'Forbidden',
					details: {
						requiredPermission: permission,
						userPermissions: userPermissions.permissions,
						userRoles: userPermissions.roles
					}
				});
			}

			console.log('✅ [PERMISSION CHECK] Permission granted for:', permission);
			next();
		} catch (error) {
			console.error('❌ [PERMISSION CHECK] Permission check error:', error);
			return res.status(500).json({ message: 'Internal server error' });
		}
	};
};

export const requireRole = (role: string): any => {
	return async (req: any, res: Response, next: NextFunction) => {
		try {
			if (!req.user) {
				return res.status(401).json({ message: 'Unauthorized' });
			}

			const hasRole = await authorizationService.hasRole(req.user.id, role);
			if (!hasRole) {
				return res.status(403).json({ message: 'Forbidden' });
			}

			next();
		} catch (error) {
			console.error('Role check error:', error);
			return res.status(500).json({ message: 'Internal server error' });
		}
	};
};

export const requireRetreatAccess = (retreatIdParam: string = 'retreatId'): any => {
	return async (req: any, res: Response, next: NextFunction) => {
		try {
			//console.log('🏠 [RETREAT ACCESS CHECK] Starting retreat access check');
			//console.log('🏠 [RETREAT ACCESS CHECK] User:', req.user ? { id: req.user.id, email: req.user.email } : 'No user');
			//console.log('🏠 [RETREAT ACCESS CHECK] URL:', req.originalUrl);
			//console.log('🏠 [RETREAT ACCESS CHECK] Method:', req.method);
			//console.log('🏠 [RETREAT ACCESS CHECK] Retreat ID param:', retreatIdParam);
			//console.log('🏠 [RETREAT ACCESS CHECK] All params:', req.params);

			if (!req.user) {
				//console.log('❌ [RETREAT ACCESS CHECK] No user found in request');
				return res.status(401).json({ message: 'Unauthorized' });
			}

			const retreatId = req.params[retreatIdParam];
			if (!retreatId) {
				//console.log('❌ [RETREAT ACCESS CHECK] No retreat ID found in params');
				return res.status(400).json({ message: 'Retreat ID is required' });
			}

			//console.log('🏠 [RETREAT ACCESS CHECK] Retreat ID:', retreatId);
			//console.log('🏠 [RETREAT ACCESS CHECK] Checking retreat access...');

			const hasAccess = await authorizationService.hasRetreatAccess(req.user.id, retreatId);
			//console.log('🏠 [RETREAT ACCESS CHECK] Has retreat access result:', hasAccess);

			// Get detailed user retreat info for debugging
			const userPermissions = await authorizationService.getUserPermissions(req.user.id);
			//console.log('🏠 [RETREAT ACCESS CHECK] User retreats from permissions:', userPermissions.retreats);
			//console.log('🏠 [RETREAT ACCESS CHECK] User has access to this retreat?', userPermissions.retreats.some(r => r.retreatId === retreatId));

			if (!hasAccess) {
				//console.log('❌ [RETREAT ACCESS CHECK] Retreat access denied for retreat:', retreatId);
				return res.status(403).json({
					message: 'Forbidden - No retreat access',
					details: {
						retreatId,
						userRetreats: userPermissions.retreats,
						userPermissions: userPermissions.permissions,
						userRoles: userPermissions.roles
					}
				});
			}

			//console.log('✅ [RETREAT ACCESS CHECK] Retreat access granted for retreat:', retreatId);
			next();
		} catch (error) {
			console.error('❌ [RETREAT ACCESS CHECK] Retreat access check error:', error);
			return res.status(500).json({ message: 'Internal server error' });
		}
	};
};

export const requireRetreatRole = (role: string, retreatIdParam: string = 'retreatId'): any => {
	return async (req: any, res: Response, next: NextFunction) => {
		try {
			if (!req.user) {
				return res.status(401).json({ message: 'Unauthorized' });
			}

			const retreatId = req.params[retreatIdParam];
			if (!retreatId) {
				return res.status(400).json({ message: 'Retreat ID is required' });
			}

			const hasRole = await authorizationService.hasRetreatRole(req.user.id, retreatId, role);
			if (!hasRole) {
				return res.status(403).json({ message: 'Forbidden' });
			}

			next();
		} catch (error) {
			console.error('Retreat role check error:', error);
			return res.status(500).json({ message: 'Internal server error' });
		}
	};
};

export const requireRetreatCreator = (retreatIdParam: string = 'retreatId'): any => {
	return async (req: any, res: Response, next: NextFunction) => {
		try {
			if (!req.user) {
				return res.status(401).json({ message: 'Unauthorized' });
			}

			const retreatId = req.params[retreatIdParam];
			if (!retreatId) {
				return res.status(400).json({ message: 'Retreat ID is required' });
			}

			const isCreator = await authorizationService.isRetreatCreator(req.user.id, retreatId);
			if (!isCreator) {
				return res
					.status(403)
					.json({ message: 'Forbidden - Only retreat creator can perform this action' });
			}

			next();
		} catch (error) {
			console.error('Retreat creator check error:', error);
			return res.status(500).json({ message: 'Internal server error' });
		}
	};
};

export const requireRetreatAccessOrCreator = (retreatIdParam: string = 'retreatId'): any => {
	return async (req: any, res: Response, next: NextFunction) => {
		try {
			if (!req.user) {
				return res.status(401).json({ message: 'Unauthorized' });
			}

			const retreatId = req.params[retreatIdParam];
			if (!retreatId) {
				return res.status(400).json({ message: 'Retreat ID is required' });
			}

			const [hasAccess, isCreator] = await Promise.all([
				authorizationService.hasRetreatAccess(req.user.id, retreatId),
				authorizationService.isRetreatCreator(req.user.id, retreatId),
			]);

			if (!hasAccess && !isCreator) {
				return res.status(403).json({ message: 'Forbidden' });
			}

			next();
		} catch (error) {
			console.error('Retreat access/creator check error:', error);
			return res.status(500).json({ message: 'Internal server error' });
		}
	};
};

export const loadUserPermissions = async (
	req: AuthenticatedRequest,
	_res: Response,
	next: NextFunction,
) => {
	try {
		if (!req.user) {
			return next();
		}

		const userPermissions = await authorizationService.getUserPermissions(req.user.id);
		req.userPermissions = userPermissions.permissions;
		req.userRoles = userPermissions.roles;
		req.userRetreats = userPermissions.retreats;

		next();
	} catch (error) {
		console.error('Error loading user permissions:', error);
		next();
	}
};
