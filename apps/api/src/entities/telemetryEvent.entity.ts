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

export enum TelemetryEventType {
	// User Events
	USER_LOGIN = 'user_login',
	USER_LOGOUT = 'user_logout',
	USER_REGISTRATION = 'user_registration',
	PASSWORD_CHANGE = 'password_change',
	ROLE_CHANGE = 'role_change',

	// Business Events
	PARTICIPANT_CREATED = 'participant_created',
	PARTICIPANT_UPDATED = 'participant_updated',
	PARTICIPANT_DELETED = 'participant_deleted',
	RETREAT_CREATED = 'retreat_created',
	RETREAT_UPDATED = 'retreat_updated',
	PAYMENT_PROCESSED = 'payment_processed',
	PAYMENT_FAILED = 'payment_failed',
	ASSIGNMENT_CHANGED = 'assignment_changed',

	// System Events
	DATABASE_BACKUP = 'database_backup',
	DATABASE_RESTORE = 'database_restore',
	SYSTEM_ERROR = 'system_error',
	PERFORMANCE_ALERT = 'performance_alert',
	SECURITY_ALERT = 'security_alert',
	MAINTENANCE_MODE = 'maintenance_mode',

	// Feature Events
	FILE_UPLOADED = 'file_uploaded',
	FILE_DOWNLOADED = 'file_downloaded',
	REPORT_GENERATED = 'report_generated',
	DATA_EXPORTED = 'data_exported',
	DATA_IMPORTED = 'data_imported',

	// Frontend Events
	PAGE_VIEW = 'page_view',
	FEATURE_USAGE = 'feature_usage',
}

export enum TelemetryEventSeverity {
	INFO = 'info',
	WARNING = 'warning',
	ERROR = 'error',
	CRITICAL = 'critical',
}

@Entity('telemetry_events')
@Index(['eventType', 'severity', 'createdAt'])
@Index(['userId'])
@Index(['retreatId'])
@Index(['resourceType', 'resourceId'])
export class TelemetryEvent {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar' })
	eventType!: TelemetryEventType;

	@Column({ type: 'varchar' })
	severity!: TelemetryEventSeverity;

	@Column({ type: 'text' })
	description!: string;

	@Column({ type: 'text', nullable: true })
	resourceType?: string;

	@Column({ type: 'text', nullable: true })
	resourceId?: string;

	@Column({ type: 'json', nullable: true })
	eventData?: Record<string, any>;

	@Column({ type: 'json', nullable: true })
	oldValues?: Record<string, any>;

	@Column({ type: 'json', nullable: true })
	newValues?: Record<string, any>;

	@Column({ type: 'text', nullable: true })
	ipAddress?: string;

	@Column({ type: 'text', nullable: true })
	userAgent?: string;

	@ManyToOne(() => User, { nullable: true })
	user?: User;

	@Column({ type: 'uuid', nullable: true })
	userId?: string;

	@ManyToOne(() => Retreat, { nullable: true })
	retreat?: Retreat;

	@Column({ type: 'uuid', nullable: true })
	retreatId?: string;

	@Column({ type: 'text', nullable: true })
	endpoint?: string;

	@Column({ type: 'text', nullable: true })
	component?: string;

	@CreateDateColumn()
	createdAt!: Date;
}
