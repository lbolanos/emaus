import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/userRole.entity';
import { UserRetreat } from '../entities/userRetreat.entity';
import { Role } from '../entities/role.entity';
import { RolePermission } from '../entities/rolePermission.entity';
import { Permission } from '../entities/permission.entity';
import { UserProfile, UserRoleDetail } from '@repo/types';

export class UserService {
	async getUserProfile(userId: string): Promise<UserProfile> {
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

		const permissions = rolePermissions.map((rp) => ({
			resource: rp.permission.resource,
			operation: rp.permission.operation,
		}));

		const roleDetails = await Promise.all(
			userRoles.map(async (userRole) => {
				const retreatsForRole = userRetreats
					.filter((ur) => ur.roleId === userRole.roleId)
					.map((ur) => ({
						retreatId: ur.retreatId,
						role: ur.role,
					}));

				const rolePermissionsForRole = rolePermissions
					.filter((rp) => rp.roleId === userRole.roleId)
					.map((rp) => ({
						resource: rp.permission.resource,
						operation: rp.permission.operation,
					}));

				return {
					role: userRole.role,
					retreats: retreatsForRole,
					globalPermissions: rolePermissionsForRole,
				};
			}),
		);

		return {
			roles: roleDetails,
			permissions,
		};
	}

	async hasPermission(userId: string, permission: string): Promise<boolean> {
		const profile = await this.getUserProfile(userId);
		return profile.permissions.some((p) => `${p.resource}:${p.operation}` === permission);
	}

	async hasRole(userId: string, roleName: string): Promise<boolean> {
		const profile = await this.getUserProfile(userId);
		return profile.roles.some((r: UserRoleDetail) => r.role.name === roleName);
	}

	async hasRetreatAccess(userId: string, retreatId: string): Promise<boolean> {
		const userRetreat = await AppDataSource.getRepository(UserRetreat)
			.createQueryBuilder('userRetreat')
			.leftJoin('userRetreat.role', 'role')
			.where('userRetreat.userId = :userId', { userId })
			.andWhere('userRetreat.retreatId = :retreatId', { retreatId })
			.getOne();

		return !!userRetreat;
	}

	async hasRetreatRole(userId: string, retreatId: string, roleName: string): Promise<boolean> {
		const userRetreat = await AppDataSource.getRepository(UserRetreat)
			.createQueryBuilder('userRetreat')
			.leftJoin('userRetreat.role', 'role')
			.where('userRetreat.userId = :userId', { userId })
			.andWhere('userRetreat.retreatId = :retreatId', { retreatId })
			.andWhere('role.name = :roleName', { roleName })
			.getOne();

		return !!userRetreat;
	}
}
