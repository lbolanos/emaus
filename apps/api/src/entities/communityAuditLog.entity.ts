import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Audit log centralizado para acciones críticas en COMMUNITY.
 * Tabla separada de la `audit_logs` existente (retreat-scoped) — esta es community-scoped.
 *
 * Append-only: el service nunca update/delete; eventual retention policy se manejaría
 * con un cron separado.
 *
 * Acciones registradas (Action constants en communityAuditService):
 *  - community.update, community.delete
 *  - community.admin.invite, community.admin.revoke, community.admin.accept_token
 *  - community.member.remove, community.member.state_change
 *  - community.link.request_created (cuando un user con email matching se registra)
 */
@Entity('community_audit_log')
@Index('idx_community_audit_log_community', ['communityId'])
@Index('idx_community_audit_log_actor', ['actorUserId'])
@Index('idx_community_audit_log_action', ['action', 'createdAt'])
export class CommunityAuditLog {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar', length: 36, nullable: true })
	actorUserId?: string | null;

	@Column({ type: 'varchar', length: 100 })
	action!: string;

	@Column({ type: 'varchar', length: 50 })
	resourceType!: string;

	@Column({ type: 'varchar', length: 36, nullable: true })
	resourceId?: string | null;

	@Column({ type: 'varchar', length: 36, nullable: true })
	communityId?: string | null;

	@Column({ type: 'text', nullable: true })
	metadata?: string | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	ipAddress?: string | null;

	@Column({ type: 'varchar', length: 255, nullable: true })
	userAgent?: string | null;

	@CreateDateColumn()
	createdAt!: Date;
}
