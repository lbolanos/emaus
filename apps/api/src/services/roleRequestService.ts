import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { Retreat } from '../entities/retreat.entity';
import { Role } from '../entities/role.entity';
import { AuditService } from './auditService';
import { Request } from 'express';

export interface RoleRequest {
	id: string;
	userId: string;
	retreatId: string;
	requestedRoleId: number;
	requestedRole: string;
	message?: string;
	status: 'pending' | 'approved' | 'rejected';
	requestedAt: Date;
	approvedAt?: Date;
	rejectedAt?: Date;
	approvedBy?: string;
	rejectedBy?: string;
	rejectionReason?: string;
	user?: User;
	retreat?: Retreat;
}

export class RoleRequestService {
	private static instance: RoleRequestService;
	private auditService: AuditService;

	private constructor() {
		this.auditService = new AuditService(AppDataSource);
	}

	public static getInstance(): RoleRequestService {
		if (!RoleRequestService.instance) {
			RoleRequestService.instance = new RoleRequestService();
		}
		return RoleRequestService.instance;
	}

	public async createRoleRequest(
		userId: string,
		retreatId: string,
		requestedRole: string,
		message?: string,
		req?: Request,
	): Promise<RoleRequest> {
		const roleRepository = AppDataSource.getRepository(Role);
		const role = await roleRepository.findOne({ where: { name: requestedRole } });

		if (!role) {
			throw new Error('Role not found');
		}

		// Check if user already has a pending request for this retreat
		const existingRequest = await this.getActiveRequest(userId, retreatId);
		if (existingRequest) {
			throw new Error('You already have a pending role request for this retreat');
		}

		// Check if user already has access to this retreat
		// This would need to be implemented in authorization service
		// For now, we'll create the request

		const requestId = require('uuid').v4();
		const now = new Date();

		await AppDataSource.query(
			`INSERT INTO role_requests (
				id, user_id, retreat_id, requested_role_id, requested_role, 
				message, status, requested_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[requestId, userId, retreatId, role.id, requestedRole, message, 'pending', now],
		);

		// Log role request creation
		const auditOptions = {
			ipAddress: req?.ip,
			userAgent: req?.headers['user-agent'],
		};
		await this.auditService.logRoleRequestCreated(
			requestId,
			userId,
			retreatId,
			requestedRole,
			message,
			auditOptions,
		);

		return this.getRoleRequestById(requestId);
	}

	public async getActiveRequest(userId: string, retreatId: string): Promise<RoleRequest | null> {
		const result = await AppDataSource.query(
			`SELECT * FROM role_requests 
			 WHERE user_id = ? AND retreat_id = ? AND status = 'pending' 
			 ORDER BY requested_at DESC LIMIT 1`,
			[userId, retreatId],
		);

		return result.length > 0 ? this.mapToRoleRequest(result[0]) : null;
	}

	public async getRetreatRoleRequests(retreatId: string): Promise<RoleRequest[]> {
		const result = await AppDataSource.query(
			`SELECT rr.*, u.displayName as user_name, u.email as user_email,
			        r.parish as retreat_name
			 FROM role_requests rr
			 LEFT JOIN users u ON rr.user_id = u.id
			 LEFT JOIN retreat r ON rr.retreat_id = r.id
			 WHERE rr.retreat_id = ? AND rr.status = 'pending'
			 ORDER BY rr.requested_at DESC`,
			[retreatId],
		);

		return result.map((item: any) => this.mapToRoleRequest(item));
	}

	public async approveRoleRequest(
		requestId: string,
		approvedBy: string,
		req?: Request,
	): Promise<RoleRequest> {
		const request = await this.getRoleRequestById(requestId);
		if (!request) {
			throw new Error('Role request not found');
		}

		if (request.status !== 'pending') {
			throw new Error('Role request is no longer pending');
		}

		const now = new Date();

		await AppDataSource.query(
			`UPDATE role_requests 
			 SET status = 'approved', approved_at = ?, approved_by = ?
			 WHERE id = ?`,
			[now, approvedBy, requestId],
		);

		// Assign the role to the user
		const { retreatRoleService } = await import('./retreatRoleService');
		await retreatRoleService.inviteUserToRetreat(
			request.retreatId,
			request.userId,
			request.requestedRole,
			approvedBy,
			undefined,
			req,
		);

		// Log role request approval
		const auditOptions = {
			ipAddress: req?.ip,
			userAgent: req?.headers['user-agent'],
		};
		await this.auditService.logRoleRequestApproved(
			requestId,
			approvedBy,
			request.userId,
			request.retreatId,
			request.requestedRole,
			auditOptions,
		);

		return this.getRoleRequestById(requestId);
	}

	public async rejectRoleRequest(
		requestId: string,
		rejectedBy: string,
		rejectionReason?: string,
		req?: Request,
	): Promise<RoleRequest> {
		const request = await this.getRoleRequestById(requestId);
		if (!request) {
			throw new Error('Role request not found');
		}

		if (request.status !== 'pending') {
			throw new Error('Role request is no longer pending');
		}

		const now = new Date();

		await AppDataSource.query(
			`UPDATE role_requests 
			 SET status = 'rejected', rejected_at = ?, rejected_by = ?, rejection_reason = ?
			 WHERE id = ?`,
			[now, rejectedBy, rejectionReason, requestId],
		);

		// Log role request rejection
		const auditOptions = {
			ipAddress: req?.ip,
			userAgent: req?.headers['user-agent'],
		};
		await this.auditService.logRoleRequestRejected(
			requestId,
			rejectedBy,
			request.userId,
			request.retreatId,
			request.requestedRole,
			rejectionReason,
			auditOptions,
		);

		return this.getRoleRequestById(requestId);
	}

	public async getUserRoleRequests(userId: string): Promise<RoleRequest[]> {
		const result = await AppDataSource.query(
			`SELECT rr.*, r.parish as retreat_name
			 FROM role_requests rr
			 LEFT JOIN retreat r ON rr.retreat_id = r.id
			 WHERE rr.user_id = ?
			 ORDER BY rr.requested_at DESC`,
			[userId],
		);

		return result.map((item: any) => this.mapToRoleRequest(item));
	}

	private async getRoleRequestById(requestId: string): Promise<RoleRequest> {
		const result = await AppDataSource.query(
			`SELECT rr.*, u.displayName as user_name, u.email as user_email,
			        r.parish as retreat_name
			 FROM role_requests rr
			 LEFT JOIN users u ON rr.user_id = u.id
			 LEFT JOIN retreat r ON rr.retreat_id = r.id
			 WHERE rr.id = ?`,
			[requestId],
		);

		if (result.length === 0) {
			throw new Error('Role request not found');
		}

		return this.mapToRoleRequest(result[0]);
	}

	private mapToRoleRequest(item: any): RoleRequest {
		return {
			id: item.id,
			userId: item.user_id,
			retreatId: item.retreat_id,
			requestedRoleId: item.requested_role_id,
			requestedRole: item.requested_role,
			message: item.message,
			status: item.status,
			requestedAt: new Date(item.requested_at),
			approvedAt: item.approved_at ? new Date(item.approved_at) : undefined,
			rejectedAt: item.rejected_at ? new Date(item.rejected_at) : undefined,
			approvedBy: item.approved_by,
			rejectedBy: item.rejected_by,
			rejectionReason: item.rejection_reason,
			user:
				item.user_name || item.user_email
					? ({
							id: item.user_id,
							displayName: item.user_name,
							email: item.user_email,
							createdAt: new Date(),
							updatedAt: new Date(),
						} as User)
					: undefined,
			retreat: item.retreat_name
				? ({
						id: item.retreat_id,
						parish: item.retreat_name,
						startDate: new Date(),
						endDate: new Date(),
					} as Retreat)
				: undefined,
		};
	}
}

export const roleRequestService = RoleRequestService.getInstance();
