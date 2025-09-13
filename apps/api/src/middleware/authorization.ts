import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/userRole.entity';
import { UserRetreat } from '../entities/userRetreat.entity';
import { Role } from '../entities/role.entity';
import { RolePermission } from '../entities/rolePermission.entity';
import { Permission } from '../entities/permission.entity';
import { ROLES } from '@repo/types';

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
		const userRoles = await AppDataSource.getRepository(UserRole)
			.createQueryBuilder('userRole')
			.leftJoinAndSelect('userRole.role', 'role')
			.where('userRole.userId = :userId', { userId })
			.getMany();

		const userRetreats = await AppDataSource.getRepository(UserRetreat)
			.createQueryBuilder('userRetreat')
			.leftJoinAndSelect('userRetreat.role', 'role')
			.where('userRetreat.userId = :userId', { userId })
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
		const userRetreats = await AppDataSource.getRepository(UserRetreat)
			.createQueryBuilder('userRetreat')
			.leftJoin('userRetreat.role', 'role')
			.where('userRetreat.userId = :userId', { userId })
			.andWhere('userRetreat.retreatId = :retreatId', { retreatId })
			.getOne();

		return !!userRetreats;
	}

	public async hasRetreatRole(userId: string, retreatId: string, role: string): Promise<boolean> {
		const userRetreat = await AppDataSource.getRepository(UserRetreat)
			.createQueryBuilder('userRetreat')
			.leftJoin('userRetreat.role', 'role')
			.where('userRetreat.userId = :userId', { userId })
			.andWhere('userRetreat.retreatId = :retreatId', { retreatId })
			.andWhere('role.name = :role', { role })
			.getOne();

		return !!userRetreat;
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
