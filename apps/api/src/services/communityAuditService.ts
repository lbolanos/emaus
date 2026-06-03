import { AppDataSource } from '../data-source';
import { CommunityAuditLog } from '../entities/communityAuditLog.entity';

/**
 * Wrapper para registrar eventos en `community_audit_log` sin que un fallo del log
 * rompa la operación de negocio. Fire-and-forget con try/catch interno.
 *
 * Action constants — usar uno de estos para consistencia:
 */
export const CommunityAuditAction = {
	UPDATE: 'community.update',
	DELETE: 'community.delete',
	ADMIN_INVITE: 'community.admin.invite',
	ADMIN_ADD: 'community.admin.add',
	ADMIN_REVOKE: 'community.admin.revoke',
	ADMIN_ACCEPT_TOKEN: 'community.admin.accept_token',
	MEMBER_REMOVE: 'community.member.remove',
	MEMBER_STATE_CHANGE: 'community.member.state_change',
	MEMBER_PROFILE_UPDATE: 'community.member.profile_update',
	LINK_REQUEST_CREATED: 'community.link.request_created',
} as const;

export type CommunityAuditActionType =
	(typeof CommunityAuditAction)[keyof typeof CommunityAuditAction];

export interface AuditEvent {
	// Accept any string but encourage callers to use CommunityAuditAction constants
	// via TypeScript completion. The string union is for documentation only.
	action: string;
	resourceType: string; // 'community' | 'community_admin' | 'community_member' | etc.
	actorUserId?: string | null;
	resourceId?: string | null;
	communityId?: string | null;
	metadata?: Record<string, any> | null;
	ipAddress?: string | null;
	userAgent?: string | null;
}

export class CommunityAuditService {
	// Lazy getter: resolver el repo en cada call para que funcione con el
	// monkey-patch de AppDataSource.getRepository que hace test-setup.ts.
	private get repo() {
		return AppDataSource.getRepository(CommunityAuditLog);
	}

	async log(event: AuditEvent): Promise<void> {
		try {
			const entry = this.repo.create({
				action: event.action,
				resourceType: event.resourceType,
				actorUserId: event.actorUserId || null,
				resourceId: event.resourceId || null,
				communityId: event.communityId || null,
				metadata: event.metadata ? JSON.stringify(event.metadata) : null,
				ipAddress: event.ipAddress || null,
				userAgent: event.userAgent ? event.userAgent.slice(0, 255) : null,
			});
			await this.repo.save(entry);
		} catch (err) {
			// Audit fallido no debe romper la operación principal
			console.error('[communityAuditService] Failed to log event:', err, (err as any)?.stack);
		}
	}
}

// Singleton helper para uso conveniente
export const communityAuditService = new CommunityAuditService();
