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
		// Check cache for user retreats
		const cachedUserRetreats = await performanceOptimizationService.getCachedUserRetreats(userId);

		let userRetreats: UserRetreat[];
		if (cachedUserRetreats) {
			// Transform cached data back to entities for processing
			userRetreats = cachedUserRetreats
				.filter((ur) => ur.status === 'active')
				.map((ur) => {
					const entity = new UserRetreat();
					entity.userId = userId;
					entity.retreatId = ur.retreatId;
					entity.status = ur.status;
					// Note: role object would need to be reconstructed or fetched
					return entity;
				});
		} else {
			// Fetch from database
			userRetreats = await AppDataSource.getRepository(UserRetreat)
				.createQueryBuilder('userRetreat')
				.leftJoinAndSelect('userRetreat.role', 'role')
				.where('userRetreat.userId = :userId', { userId })
				.andWhere('userRetreat.status IN (:...statuses)', { statuses: ['active', 'pending'] })
				.getMany();

			// Cache the results
			const cacheData = userRetreats.map((ur) => ({
				retreatId: ur.retreatId,
				role: ur.role.name,
				status: ur.status,
			}));
			await performanceOptimizationService.setCachedUserRetreats(userId, cacheData);
		}

		const userRoles = await AppDataSource.getRepository(UserRole)
			.createQueryBuilder('userRole')
			.leftJoinAndSelect('userRole.role', 'role')
			.where('userRole.userId = :userId', { userId })
			.getMany();

		const roleIds = userRoles.map((ur) => ur.role.id);
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
		const roles = userRoles.map((ur) => ur.role.name);
		const retreats = userRetreats.map((ur) => ({
			retreatId: ur.retreatId,
			role: ur.role.name,
		}));

		return {
			permissions: [...new Set(permissions)],
			roles: [...new Set(roles)],
			retreats,
		};
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
		// Check cache first
		const userRetreats = await performanceOptimizationService.getCachedUserRetreats(userId);
		if (userRetreats) {
			return userRetreats.some((ur) => ur.retreatId === retreatId && ur.status === 'active');
		}

		// Fallback to database query
		const userRetreat = await AppDataSource.getRepository(UserRetreat)
			.createQueryBuilder('userRetreat')
			.leftJoin('userRetreat.role', 'role')
			.where('userRetreat.userId = :userId', { userId })
			.andWhere('userRetreat.retreatId = :retreatId', { retreatId })
			.andWhere('userRetreat.status = :status', { status: 'active' })
			.getOne();

		return !!userRetreat;
	}

	public async hasRetreatRole(userId: string, retreatId: string, role: string): Promise<boolean> {
		// Check cache first
		const userRetreats = await performanceOptimizationService.getCachedUserRetreats(userId);
		if (userRetreats) {
			return userRetreats.some(
				(ur) => ur.retreatId === retreatId && ur.role === role && ur.status === 'active',
			);
		}

		// Fallback to database query
		const userRetreat = await AppDataSource.getRepository(UserRetreat)
			.createQueryBuilder('userRetreat')
			.leftJoin('userRetreat.role', 'role')
			.where('userRetreat.userId = :userId', { userId })
			.andWhere('userRetreat.retreatId = :retreatId', { retreatId })
			.andWhere('role.name = :role', { role })
			.andWhere('userRetreat.status = :status', { status: 'active' })
			.getOne();

		return !!userRetreat;
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
			if (!req.user) {
				return res.status(401).json({ message: 'Unauthorized' });
			}

			const hasPermission = await authorizationService.hasPermission(req.user.id, permission);
			if (!hasPermission) {
				return res.status(403).json({ message: 'Forbidden' });
			}

			next();
		} catch (error) {
			console.error('Permission check error:', error);
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
			if (!req.user) {
				return res.status(401).json({ message: 'Unauthorized' });
			}

			const retreatId = req.params[retreatIdParam];
			if (!retreatId) {
				return res.status(400).json({ message: 'Retreat ID is required' });
			}

			const hasAccess = await authorizationService.hasRetreatAccess(req.user.id, retreatId);
			if (!hasAccess) {
				return res.status(403).json({ message: 'Forbidden' });
			}

			next();
		} catch (error) {
			console.error('Retreat access check error:', error);
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
	res: Response,
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
