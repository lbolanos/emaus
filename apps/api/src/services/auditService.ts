import { Repository, DataSource } from 'typeorm';
import { AuditLog, AuditActionType, AuditResourceType } from '../entities/auditLog.entity';
import { User } from '../entities/user.entity';
import { Retreat } from '../entities/retreat.entity';
import { UserRetreat } from '../entities/userRetreat.entity';
import { RoleRequest } from '../entities/roleRequest.entity';
import { PermissionOverride } from '../entities/permissionOverride.entity';
import { AppDataSource } from '../data-source';

export interface AuditLogOptions {
	userId?: string;
	targetUserId?: string;
	retreatId?: string;
	description?: string;
	oldValues?: Record<string, any>;
	newValues?: Record<string, any>;
	ipAddress?: string;
	userAgent?: string;
}

export class AuditService {
	private dataSource: DataSource;

	constructor(dataSource?: DataSource) {
		this.dataSource = dataSource || AppDataSource;
	}

	private get auditLogRepository(): Repository<AuditLog> {
		return this.dataSource.getRepository(AuditLog);
	}

	async logRoleAssignment(
		userRetreatId: string,
		userId: string,
		targetUserId: string,
		retreatId: string,
		oldRole?: string,
		newRole?: string,
		options: Omit<AuditLogOptions, 'targetUserId' | 'retreatId'> = {},
	): Promise<void> {
		await this.createAuditLog({
			actionType: AuditActionType.ROLE_ASSIGNED,
			resourceType: AuditResourceType.USER_RETREAT_ROLE,
			resourceId: userRetreatId,
			userId,
			targetUserId,
			retreatId,
			description: oldRole ? `Rol cambiado de ${oldRole} a ${newRole}` : `Rol asignado: ${newRole}`,
			oldValues: oldRole ? { role: oldRole } : undefined,
			newValues: newRole ? { role: newRole } : undefined,
			...options,
		});
	}

	async logRoleRemoval(
		userRetreatId: string,
		userId: string,
		targetUserId: string,
		retreatId: string,
		removedRole: string,
		options: Omit<AuditLogOptions, 'targetUserId' | 'retreatId'> = {},
	): Promise<void> {
		await this.createAuditLog({
			actionType: AuditActionType.ROLE_REMOVED,
			resourceType: AuditResourceType.USER_RETREAT_ROLE,
			resourceId: userRetreatId,
			userId,
			targetUserId,
			retreatId,
			description: `Rol removido: ${removedRole}`,
			oldValues: { role: removedRole },
			...options,
		});
	}

	async logRoleInvitation(
		invitationId: string,
		userId: string,
		targetUserEmail: string,
		retreatId: string,
		roleName: string,
		options: Omit<AuditLogOptions, 'retreatId'> = {},
	): Promise<void> {
		await this.createAuditLog({
			actionType: AuditActionType.ROLE_INVITED,
			resourceType: AuditResourceType.ROLE_INVITATION,
			resourceId: invitationId,
			userId,
			retreatId,
			description: `Invitación enviada a ${targetUserEmail} para rol: ${roleName}`,
			newValues: { email: targetUserEmail, role: roleName },
			...options,
		});
	}

	async logRoleInvitationAccepted(
		invitationId: string,
		userId: string,
		retreatId: string,
		roleName: string,
		options: Omit<AuditLogOptions, 'retreatId'> = {},
	): Promise<void> {
		await this.createAuditLog({
			actionType: AuditActionType.ROLE_INVITATION_ACCEPTED,
			resourceType: AuditResourceType.ROLE_INVITATION,
			resourceId: invitationId,
			userId,
			targetUserId: userId,
			retreatId,
			description: `Invitación aceptada para rol: ${roleName}`,
			...options,
		});
	}

	async logRoleInvitationRevoked(
		invitationId: string,
		userId: string,
		targetUserEmail: string,
		retreatId: string,
		roleName: string,
		options: Omit<AuditLogOptions, 'retreatId'> = {},
	): Promise<void> {
		await this.createAuditLog({
			actionType: AuditActionType.ROLE_INVITATION_REVOKED,
			resourceType: AuditResourceType.ROLE_INVITATION,
			resourceId: invitationId,
			userId,
			retreatId,
			description: `Invitación revocada para ${targetUserEmail} (${roleName})`,
			...options,
		});
	}

	async logRoleInvitationExpired(
		invitationId: string,
		targetUserEmail: string,
		retreatId: string,
		roleName: string,
		options: Omit<AuditLogOptions, 'retreatId'> = {},
	): Promise<void> {
		await this.createAuditLog({
			actionType: AuditActionType.ROLE_INVITATION_EXPIRED,
			resourceType: AuditResourceType.ROLE_INVITATION,
			resourceId: invitationId,
			retreatId,
			description: `Invitación expirada para ${targetUserEmail} (${roleName})`,
			...options,
		});
	}

	async logRoleRequestCreated(
		requestId: string,
		userId: string,
		retreatId: string,
		requestedRole: string,
		message?: string,
		options: Omit<AuditLogOptions, 'retreatId'> = {},
	): Promise<void> {
		await this.createAuditLog({
			actionType: AuditActionType.ROLE_REQUEST_CREATED,
			resourceType: AuditResourceType.ROLE_REQUEST,
			resourceId: requestId,
			userId,
			targetUserId: userId,
			retreatId,
			description: `Solicitud de rol creada: ${requestedRole}`,
			newValues: { requestedRole, message },
			...options,
		});
	}

	async logRoleRequestApproved(
		requestId: string,
		approvedByUserId: string,
		requesterUserId: string,
		retreatId: string,
		requestedRole: string,
		options: Omit<AuditLogOptions, 'targetUserId' | 'retreatId'> = {},
	): Promise<void> {
		await this.createAuditLog({
			actionType: AuditActionType.ROLE_REQUEST_APPROVED,
			resourceType: AuditResourceType.ROLE_REQUEST,
			resourceId: requestId,
			userId: approvedByUserId,
			targetUserId: requesterUserId,
			retreatId,
			description: `Solicitud de rol aprobada: ${requestedRole}`,
			...options,
		});
	}

	async logRoleRequestRejected(
		requestId: string,
		rejectedByUserId: string,
		requesterUserId: string,
		retreatId: string,
		requestedRole: string,
		reason?: string,
		options: Omit<AuditLogOptions, 'targetUserId' | 'retreatId'> = {},
	): Promise<void> {
		await this.createAuditLog({
			actionType: AuditActionType.ROLE_REQUEST_REJECTED,
			resourceType: AuditResourceType.ROLE_REQUEST,
			resourceId: requestId,
			userId: rejectedByUserId,
			targetUserId: requesterUserId,
			retreatId,
			description: `Solicitud de rol rechazada: ${requestedRole}`,
			newValues: { reason },
			...options,
		});
	}

	async logPermissionOverrideAdded(
		overrideId: string,
		userId: string,
		targetUserId: string,
		retreatId: string,
		permissions: string[],
		options: Omit<AuditLogOptions, 'targetUserId' | 'retreatId'> = {},
	): Promise<void> {
		await this.createAuditLog({
			actionType: AuditActionType.PERMISSION_OVERRIDE_ADDED,
			resourceType: AuditResourceType.PERMISSION_OVERRIDE,
			resourceId: overrideId,
			userId,
			targetUserId,
			retreatId,
			description: `Override de permisos añadido: ${permissions.join(', ')}`,
			newValues: { permissions },
			...options,
		});
	}

	async logPermissionOverrideRemoved(
		overrideId: string,
		userId: string,
		targetUserId: string,
		retreatId: string,
		permissions: string[],
		options: Omit<AuditLogOptions, 'targetUserId' | 'retreatId'> = {},
	): Promise<void> {
		await this.createAuditLog({
			actionType: AuditActionType.PERMISSION_OVERRIDE_REMOVED,
			resourceType: AuditResourceType.PERMISSION_OVERRIDE,
			resourceId: overrideId,
			userId,
			targetUserId,
			retreatId,
			description: `Override de permisos removido: ${permissions.join(', ')}`,
			oldValues: { permissions },
			...options,
		});
	}

	async logRetreatAccessGranted(
		userRetreatId: string,
		userId: string,
		targetUserId: string,
		retreatId: string,
		accessType: string,
		options: Omit<AuditLogOptions, 'targetUserId' | 'retreatId'> = {},
	): Promise<void> {
		await this.createAuditLog({
			actionType: AuditActionType.RETREAT_ACCESS_GRANTED,
			resourceType: AuditResourceType.RETREAT_ACCESS,
			resourceId: userRetreatId,
			userId,
			targetUserId,
			retreatId,
			description: `Acceso al retiro concedido: ${accessType}`,
			newValues: { accessType },
			...options,
		});
	}

	async logRetreatAccessRevoked(
		userRetreatId: string,
		userId: string,
		targetUserId: string,
		retreatId: string,
		accessType: string,
		options: Omit<AuditLogOptions, 'targetUserId' | 'retreatId'> = {},
	): Promise<void> {
		await this.createAuditLog({
			actionType: AuditActionType.RETREAT_ACCESS_REVOKED,
			resourceType: AuditResourceType.RETREAT_ACCESS,
			resourceId: userRetreatId,
			userId,
			targetUserId,
			retreatId,
			description: `Acceso al retiro revocado: ${accessType}`,
			oldValues: { accessType },
			...options,
		});
	}

	async getAuditLogs(options: {
		retreatId?: string;
		userId?: string;
		targetUserId?: string;
		actionType?: AuditActionType;
		resourceType?: AuditResourceType;
		resourceId?: string;
		limit?: number;
		offset?: number;
		startDate?: Date;
		endDate?: Date;
	}): Promise<{ logs: AuditLog[]; total: number }> {
		const queryBuilder = this.auditLogRepository
			.createQueryBuilder('auditLog')
			.leftJoinAndSelect('auditLog.user', 'user')
			.leftJoinAndSelect('auditLog.targetUser', 'targetUser')
			.leftJoinAndSelect('auditLog.retreat', 'retreat')
			.orderBy('auditLog.createdAt', 'DESC');

		if (options.retreatId) {
			queryBuilder.andWhere('auditLog.retreatId = :retreatId', { retreatId: options.retreatId });
		}

		if (options.userId) {
			queryBuilder.andWhere('auditLog.userId = :userId', { userId: options.userId });
		}

		if (options.targetUserId) {
			queryBuilder.andWhere('auditLog.targetUserId = :targetUserId', {
				targetUserId: options.targetUserId,
			});
		}

		if (options.actionType) {
			queryBuilder.andWhere('auditLog.actionType = :actionType', {
				actionType: options.actionType,
			});
		}

		if (options.resourceType) {
			queryBuilder.andWhere('auditLog.resourceType = :resourceType', {
				resourceType: options.resourceType,
			});
		}

		if (options.resourceId) {
			queryBuilder.andWhere('auditLog.resourceId = :resourceId', {
				resourceId: options.resourceId,
			});
		}

		if (options.startDate) {
			queryBuilder.andWhere('auditLog.createdAt >= :startDate', { startDate: options.startDate });
		}

		if (options.endDate) {
			queryBuilder.andWhere('auditLog.createdAt <= :endDate', { endDate: options.endDate });
		}

		const limit = options.limit || 50;
		const offset = options.offset || 0;

		const [logs, total] = await queryBuilder.take(limit).skip(offset).getManyAndCount();

		return { logs, total };
	}

	private async createAuditLog(
		options: AuditLogOptions & {
			actionType: AuditActionType;
			resourceType: AuditResourceType;
			resourceId: string;
		},
	): Promise<void> {
		const auditLog = this.auditLogRepository.create({
			actionType: options.actionType,
			resourceType: options.resourceType,
			resourceId: options.resourceId,
			userId: options.userId,
			targetUserId: options.targetUserId,
			retreatId: options.retreatId,
			description: options.description,
			oldValues: options.oldValues,
			newValues: options.newValues,
			ipAddress: options.ipAddress,
			userAgent: options.userAgent,
		});

		await this.auditLogRepository.save(auditLog);
	}
}
