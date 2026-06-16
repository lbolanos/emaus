import { DataSource } from 'typeorm';
import { House } from '../entities/house.entity';
import { Bed } from '../entities/bed.entity';
import { Retreat } from '../entities/retreat.entity';
import { RetreatBed } from '../entities/retreatBed.entity';
import { TableMesa } from '../entities/tableMesa.entity';
import { Participant } from '../entities/participant.entity';
import { User } from '../entities/user.entity';
import { Responsability } from '../entities/responsability.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { InventoryCategory } from '../entities/inventoryCategory.entity';
import { InventoryTeam } from '../entities/inventoryTeam.entity';
import { InventoryItem } from '../entities/inventoryItem.entity';
import { RetreatInventory } from '../entities/retreatInventory.entity';
import { RetreatInventoryHistory } from '../entities/retreatInventoryHistory.entity';
import { Role } from '../entities/role.entity';
import { UserRole } from '../entities/userRole.entity';
import { RolePermission } from '../entities/rolePermission.entity';
import { UserRetreat } from '../entities/userRetreat.entity';
import { Permission } from '../entities/permission.entity';
import { Migration } from '../entities/migration.entity';
import { Payment } from '../entities/payment.entity';
import { ParticipantDebt } from '../entities/participantDebt.entity';
import { GlobalMessageTemplate } from '../entities/globalMessageTemplate.entity';
import { ParticipantCommunication } from '../entities/participantCommunication.entity';
import { TelemetryMetric } from '../entities/telemetryMetric.entity';
import { TelemetryEvent } from '../entities/telemetryEvent.entity';
import { TelemetrySession } from '../entities/telemetrySession.entity';
import { TelemetryDashboard } from '../entities/telemetryDashboard.entity';
import { Tag } from '../entities/tag.entity';
import { ParticipantTag } from '../entities/participantTag.entity';
import { AuditLog } from '../entities/auditLog.entity';
import { CommunityAuditLog } from '../entities/communityAuditLog.entity';
import { DomainAuditLog } from '../entities/domainAuditLog.entity';
import { Community } from '../entities/community.entity';
import { CommunityMember } from '../entities/communityMember.entity';
import { CommunityMeeting } from '../entities/communityMeeting.entity';
import { CommunityAdmin } from '../entities/communityAdmin.entity';
import { CommunityAttendance } from '../entities/communityAttendance.entity';
import { NewsletterSubscriber } from '../entities/newsletterSubscriber.entity';

// Social system entities
import { UserProfile } from '../entities/userProfile.entity';
import { Friend } from '../entities/friend.entity';
import { Follow } from '../entities/follow.entity';
import { UserActivity } from '../entities/userActivity.entity';
import { Testimonial } from '../entities/testimonial.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { ServiceTeam } from '../entities/serviceTeam.entity';
import { ServiceTeamMember } from '../entities/serviceTeamMember.entity';

import { Session } from '../entities/session.entity';
import { ChatConversation } from '../entities/chatConversation.entity';
import { SantisimoSlot } from '../entities/santisimoSlot.entity';
import { SantisimoSignup } from '../entities/santisimoSignup.entity';
import { ParticipantAvailability } from '../entities/participantAvailability.entity';
import { ScheduleTemplate } from '../entities/scheduleTemplate.entity';
import { ScheduleTemplateSet } from '../entities/scheduleTemplateSet.entity';
import { ResponsabilityAttachment } from '../entities/responsabilityAttachment.entity';
import { ResponsabilityAttachmentHistory } from '../entities/responsabilityAttachmentHistory.entity';
import { RetreatScheduleItem } from '../entities/retreatScheduleItem.entity';
import { RetreatScheduleItemResponsable } from '../entities/retreatScheduleItemResponsable.entity';
import { RetreatShirtType } from '../entities/retreatShirtType.entity';
import { ParticipantShirtSize } from '../entities/participantShirtSize.entity';
import { RetreatMemoryPhoto } from '../entities/retreatMemoryPhoto.entity';
import { RetreatMemorySong } from '../entities/retreatMemorySong.entity';
import { SavedSegment } from '../entities/savedSegment.entity';
import { MessageSequence } from '../entities/messageSequence.entity';
import { SequenceStep } from '../entities/sequenceStep.entity';
import { ScheduledMessage } from '../entities/scheduledMessage.entity';
import { ParticipantFollowUp } from '../entities/participantFollowUp.entity';
import { CrmTask } from '../entities/crmTask.entity';
import { GlobalMessageSequence } from '../entities/globalMessageSequence.entity';
import { GlobalSequenceStep } from '../entities/globalSequenceStep.entity';

export function createDatabaseConfig() {
	const dbType = process.env.DB_TYPE || 'sqlite';

	const entities = [
		Session,
		House,
		Bed,
		Retreat,
		RetreatBed,
		TableMesa,
		Participant,
		User,
		Responsability,
		MessageTemplate,
		GlobalMessageTemplate,
		InventoryCategory,
		InventoryTeam,
		InventoryItem,
		RetreatInventory,
		RetreatInventoryHistory,
		Role,
		UserRole,
		RolePermission,
		UserRetreat,
		Permission,
		Migration,
		Payment,
		ParticipantDebt,
		ParticipantCommunication,
		// Telemetry entities
		TelemetryMetric,
		TelemetryEvent,
		TelemetrySession,
		TelemetryDashboard,
		// Tag entities
		Tag,
		ParticipantTag,
		// Audit entities
		AuditLog,
		CommunityAuditLog,
		DomainAuditLog,
		// Community entities
		Community,
		CommunityMember,
		CommunityMeeting,
		CommunityAdmin,
		CommunityAttendance,
		// Newsletter entities
		NewsletterSubscriber,
		// Social system entities
		UserProfile,
		Friend,
		Follow,
		UserActivity,
		Testimonial,
		RetreatParticipant,
		// Service Teams
		ServiceTeam,
		ServiceTeamMember,
		// Chat
		ChatConversation,
		// Santisimo
		SantisimoSlot,
		SantisimoSignup,
		ParticipantAvailability,
		// Minuto a Minuto
		ScheduleTemplateSet,
		ScheduleTemplate,
		ResponsabilityAttachment,
		ResponsabilityAttachmentHistory,
		RetreatScheduleItem,
		RetreatScheduleItemResponsable,
		// Shirt types per retreat
		RetreatShirtType,
		ParticipantShirtSize,
		// Retreat memories (galleries)
		RetreatMemoryPhoto,
		RetreatMemorySong,
		// CRM: segmentos guardados
		SavedSegment,
		// CRM: secuencias de mensajes (drip)
		MessageSequence,
		SequenceStep,
		ScheduledMessage,
		// CRM: plantillas globales de secuencias
		GlobalMessageSequence,
		GlobalSequenceStep,
		// CRM: pipeline de seguimiento + tareas
		ParticipantFollowUp,
		CrmTask,
		// Temporarily excluding entities with enum issues
		// PermissionOverride,
		// RoleRequest,
	];

	if (dbType === 'postgresql') {
		return {
			type: 'postgres' as const,
			host: process.env.DB_HOST || 'localhost',
			port: parseInt(process.env.DB_PORT || '5432'),
			username: process.env.DB_USERNAME || 'postgres',
			password: process.env.DB_PASSWORD || 'password',
			database: process.env.DB_DATABASE || 'emaus',
			synchronize: false,
			logging: false,
			entities,
			migrations: [],
			subscribers: [],
		};
	} else {
		return {
			type: 'sqlite' as const,
			database: process.env.DB_DATABASE || 'database.sqlite',
			synchronize: false,
			logging: false,
			entities,
			migrations: [],
			subscribers: [],
			// --- Prevención de "database is locked" / transacciones colgadas ---
			// WAL: lectores (backups del cron, db:pull con .backup, dashboards) ya NO
			// se bloquean por un escritor activo. Resuelve el reader/writer blocking.
			enableWAL: true,
			// busyTimeout: ante SQLITE_BUSY, esperar hasta 5s a que se libere el lock
			// en vez de fallar de inmediato (default del driver = 0 → falla al instante).
			busyTimeout: 5000,
			// busyErrorRetry: capa extra de TypeORM que reintenta el write ante SQLITE_BUSY.
			busyErrorRetry: 3000,
			// Loguea cualquier query/transacción que tarde >5s → detecta a tiempo una
			// transacción que se está colgando (la causa raíz del incidente 2026-06-04).
			maxQueryExecutionTime: 5000,
		};
	}
}
