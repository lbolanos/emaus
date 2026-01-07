import { AppDataSource, DataSource } from '../data-source';
import { UserRetreat } from '../entities/userRetreat.entity';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { Retreat } from '../entities/retreat.entity';
import { authorizationService } from '../middleware/authorization';
import { AuditService } from './auditService';
import { Request } from 'express';
import { getRepositories } from '../utils/repositoryHelpers';

export class RetreatRoleService {
	private static instance: RetreatRoleService;
	private auditService: AuditService;

	private constructor() {
		this.auditService = new AuditService(AppDataSource);
	}

	public static getInstance(): RetreatRoleService {
		if (!RetreatRoleService.instance) {
			RetreatRoleService.instance = new RetreatRoleService();
		}
		return RetreatRoleService.instance;
	}

	public async inviteUserToRetreat(
		retreatId: string,
		userEmail: string,
		roleName: string,
		invitedBy: string,
		expiresAt?: Date,
		req?: Request,
		dataSource?: DataSource,
	): Promise<UserRetreat> {
		const repos = getRepositories(dataSource);
		const ds = dataSource || AppDataSource;

		// Find the user by email
		const user = await repos.user.findOne({ where: { email: userEmail } });
		if (!user) {
			throw new Error('User not found');
		}

		// Find the role by name
		const role = await repos.role.findOne({ where: { name: roleName } });
		if (!role) {
			throw new Error('Role not found');
		}

		// Check if the inviter has permission to invite users to this retreat
		const isCreator = await authorizationService.isRetreatCreator(invitedBy, retreatId);
		if (!isCreator) {
			throw new Error('Only retreat creator can invite users');
		}

		// Check if user already has a role in this retreat
		const existingUserRetreat = await repos.userRetreat.findOne({
			where: {
				userId: user.id,
				retreatId,
			},
		});

		let userRetreat: UserRetreat;
		const auditOptions = {
			ipAddress: req?.ip,
			userAgent: req?.headers['user-agent'],
		};

		if (existingUserRetreat) {
			// Update existing role
			const oldRole = existingUserRetreat.role?.name;
			existingUserRetreat.roleId = role.id;
			existingUserRetreat.status = 'active';
			existingUserRetreat.invitedBy = invitedBy;
			existingUserRetreat.invitedAt = new Date();
			existingUserRetreat.expiresAt = expiresAt;
			userRetreat = await repos.userRetreat.save(existingUserRetreat);

			// Log role assignment/change
			const auditSvc = dataSource ? new AuditService(dataSource) : this.auditService;
			await auditSvc.logRoleAssignment(
				userRetreat.id.toString(),
				invitedBy,
				user.id,
				retreatId,
				oldRole,
				role.name,
				auditOptions,
			);
		} else {
			// Create new role assignment
			userRetreat = await authorizationService.assignRetreatRole(
				user.id,
				retreatId,
				role.id,
				invitedBy,
				expiresAt,
				dataSource,
			);

			// Log role invitation and assignment
			const auditSvc = dataSource ? new AuditService(dataSource) : this.auditService;
			await auditSvc.logRoleInvitation(
				userRetreat.id.toString(),
				invitedBy,
				userEmail,
				retreatId,
				role.name,
				auditOptions,
			);

			await auditSvc.logRoleAssignment(
				userRetreat.id.toString(),
				invitedBy,
				user.id,
				retreatId,
				undefined,
				role.name,
				auditOptions,
			);
		}

		return userRetreat;
	}

	public async removeUserFromRetreat(
		retreatId: string,
		userId: string,
		removedBy: string,
		req?: Request,
		dataSource?: DataSource,
	): Promise<boolean> {
		const repos = getRepositories(dataSource);

		// Check if the remover has permission
		const isCreator = await authorizationService.isRetreatCreator(removedBy, retreatId);
		if (!isCreator) {
			throw new Error('Only retreat creator can remove users');
		}

		// Find all user roles in this retreat and revoke them
		const userRoles = await repos.userRetreat.find({
			where: {
				userId,
				retreatId,
				status: 'active',
			},
			relations: ['role'],
		});

		const auditOptions = {
			ipAddress: req?.ip,
			userAgent: req?.headers['user-agent'],
		};

		const auditSvc = dataSource ? new AuditService(dataSource) : this.auditService;

		for (const userRole of userRoles) {
			const roleName = userRole.role?.name || 'unknown';

			// Log role removal
			await auditSvc.logRoleRemoval(
				userRole.id.toString(),
				removedBy,
				userId,
				retreatId,
				roleName,
				auditOptions,
			);

			await authorizationService.revokeRetreatRole(userId, retreatId, userRole.roleId, dataSource);
		}

		return true;
	}

	public async getRetreatUsers(retreatId: string): Promise<
		Array<{
			user: User;
			role: Role;
			inviter?: User;
			status: string;
			invitedAt?: Date;
			expiresAt?: Date;
		}>
	> {
		const userRetreatRepository = AppDataSource.getRepository(UserRetreat);
		const userRetreats = await userRetreatRepository
			.createQueryBuilder('userRetreat')
			.leftJoinAndSelect('userRetreat.user', 'user')
			.leftJoinAndSelect('userRetreat.role', 'role')
			.leftJoinAndSelect('userRetreat.inviter', 'inviter')
			.where('userRetreat.retreatId = :retreatId', { retreatId })
			.andWhere('userRetreat.status IN (:...statuses)', { statuses: ['pending', 'active'] })
			.getMany();

		return userRetreats.map((ur) => ({
			user: ur.user,
			role: ur.role,
			inviter: ur.inviter,
			status: ur.status,
			invitedAt: ur.invitedAt,
			expiresAt: ur.expiresAt,
		}));
	}

	public async getUserRetreats(userId: string): Promise<
		Array<{
			retreat: Retreat;
			role: Role;
			status: string;
			invitedAt?: Date;
			expiresAt?: Date;
		}>
	> {
		const userRetreatRepository = AppDataSource.getRepository(UserRetreat);
		const userRetreats = await userRetreatRepository
			.createQueryBuilder('userRetreat')
			.leftJoinAndSelect('userRetreat.retreat', 'retreat')
			.leftJoinAndSelect('userRetreat.role', 'role')
			.where('userRetreat.userId = :userId', { userId })
			.andWhere('userRetreat.status IN (:...statuses)', { statuses: ['pending', 'active'] })
			.getMany();

		return userRetreats.map((ur) => ({
			retreat: ur.retreat,
			role: ur.role,
			status: ur.status,
			invitedAt: ur.invitedAt,
			expiresAt: ur.expiresAt,
		}));
	}

	public async approveRetreatInvitation(
		retreatId: string,
		userId: string,
		approvedBy: string,
	): Promise<UserRetreat> {
		// Check if approver has permission
		const isCreator = await authorizationService.isRetreatCreator(approvedBy, retreatId);
		if (!isCreator) {
			throw new Error('Only retreat creator can approve invitations');
		}

		const userRetreatRepository = AppDataSource.getRepository(UserRetreat);
		const userRetreat = await userRetreatRepository.findOne({
			where: {
				userId,
				retreatId,
				status: 'pending',
			},
		});

		if (!userRetreat) {
			throw new Error('Pending invitation not found');
		}

		userRetreat.status = 'active';
		return userRetreatRepository.save(userRetreat);
	}

	public async rejectRetreatInvitation(
		retreatId: string,
		userId: string,
		rejectedBy: string,
	): Promise<boolean> {
		// Check if rejector has permission
		const isCreator = await authorizationService.isRetreatCreator(rejectedBy, retreatId);
		if (!isCreator) {
			throw new Error('Only retreat creator can reject invitations');
		}

		const userRetreatRepository = AppDataSource.getRepository(UserRetreat);
		const result = await userRetreatRepository
			.createQueryBuilder()
			.update(UserRetreat)
			.set({ status: 'revoked' })
			.where('userId = :userId', { userId })
			.andWhere('retreatId = :retreatId', { retreatId })
			.andWhere('status = :status', { status: 'pending' })
			.execute();

		return (result.affected || 0) > 0;
	}
}

export const retreatRoleService = RetreatRoleService.getInstance();
