import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	CreateDateColumn,
	Index,
} from 'typeorm';
import { User } from './user.entity';
import { Retreat } from './retreat.entity';

export enum AuditActionType {
	ROLE_ASSIGNED = 'role_assigned',
	ROLE_REMOVED = 'role_removed',
	ROLE_INVITED = 'role_invited',
	ROLE_INVITATION_ACCEPTED = 'role_invitation_accepted',
	ROLE_INVITATION_REVOKED = 'role_invitation_revoked',
	ROLE_INVITATION_EXPIRED = 'role_invitation_expired',
	ROLE_REQUEST_CREATED = 'role_request_created',
	ROLE_REQUEST_APPROVED = 'role_request_approved',
	ROLE_REQUEST_REJECTED = 'role_request_rejected',
	ROLE_REQUEST_CANCELLED = 'role_request_cancelled',
	PERMISSION_OVERRIDE_ADDED = 'permission_override_added',
	PERMISSION_OVERRIDE_REMOVED = 'permission_override_removed',
	PERMISSION_OVERRIDE_EXPIRED = 'permission_override_expired',
	RETREAT_ACCESS_GRANTED = 'retreat_access_granted',
	RETREAT_ACCESS_REVOKED = 'retreat_access_revoked',
}

export enum AuditResourceType {
	USER_RETREAT_ROLE = 'user_retreat_role',
	ROLE_INVITATION = 'role_invitation',
	ROLE_REQUEST = 'role_request',
	PERMISSION_OVERRIDE = 'permission_override',
	RETREAT_ACCESS = 'retreat_access',
}

@Entity('audit_logs')
@Index(['actionType', 'resourceType'])
@Index(['userId'])
@Index(['targetUserId'])
@Index(['retreatId'])
@Index(['createdAt'])
export class AuditLog {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar', length: 255 })
	actionType!: AuditActionType;

	@Column({ type: 'varchar', length: 255 })
	resourceType!: AuditResourceType;

	@Column({ type: 'uuid' })
	resourceId!: string;

	@Column({ type: 'uuid', nullable: true })
	userId?: string; // User who performed the action

	@Column({ type: 'uuid', nullable: true })
	targetUserId?: string; // User affected by the action

	@Column({ type: 'uuid', nullable: true })
	retreatId?: string;

	@Column({ type: 'text', nullable: true })
	description?: string;

	@Column({ type: 'json', nullable: true })
	oldValues?: Record<string, any>;

	@Column({ type: 'json', nullable: true })
	newValues?: Record<string, any>;

	@Column({ type: 'varchar', length: 255, nullable: true })
	ipAddress?: string;

	@Column({ type: 'varchar', length: 255, nullable: true })
	userAgent?: string;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;

	@ManyToOne(() => User, { nullable: true })
	user?: User;

	@ManyToOne(() => User, { nullable: true })
	targetUser?: User;

	@ManyToOne(() => Retreat, { nullable: true })
	retreat?: Retreat;
}
