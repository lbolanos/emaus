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

export enum TelemetryMetricType {
	// Performance Metrics
	API_RESPONSE_TIME = 'api_response_time',
	DATABASE_QUERY_TIME = 'database_query_time',
	MEMORY_USAGE = 'memory_usage',
	CACHE_HIT_RATE = 'cache_hit_rate',
	ERROR_RATE = 'error_rate',

	// Business Metrics
	PARTICIPANT_REGISTRATION = 'participant_registration',
	RETREAT_CAPACITY_UTILIZATION = 'retreat_capacity_utilization',
	PAYMENT_PROCESSING = 'payment_processing',
	USER_ROLE_ASSIGNMENT = 'user_role_assignment',

	// User Behavior Metrics
	PAGE_VIEW = 'page_view',
	FEATURE_USAGE = 'feature_usage',
	SESSION_DURATION = 'session_duration',
	USER_INTERACTION = 'user_interaction',

	// System Health Metrics
	AUTHENTICATION_SUCCESS = 'authentication_success',
	AUTHENTICATION_FAILURE = 'authentication_failure',
	PERMISSION_CHECK = 'permission_check',
	SYSTEM_ERROR = 'system_error',
}

export enum TelemetryMetricUnit {
	MILLISECONDS = 'ms',
	PERCENTAGE = '%',
	COUNT = 'count',
	BYTES = 'bytes',
	EVENTS_PER_SECOND = 'eps',
}

@Entity('telemetry_metrics')
@Index(['metricType', 'createdAt'])
@Index(['userId'])
@Index(['retreatId'])
@Index(['tags'])
export class TelemetryMetric {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar' })
	metricType!: TelemetryMetricType;

	@Column({ type: 'varchar' })
	unit!: TelemetryMetricUnit;

	@Column({ type: 'decimal', precision: 10, scale: 3 })
	value!: number;

	@Column({ type: 'json', nullable: true })
	tags?: Record<string, string>;

	@Column({ type: 'json', nullable: true })
	metadata?: Record<string, any>;

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
