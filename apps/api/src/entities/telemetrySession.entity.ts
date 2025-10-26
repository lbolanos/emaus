import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	CreateDateColumn,
	Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('telemetry_sessions')
@Index(['userId', 'isActive'])
@Index(['createdAt'])
@Index(['lastActivity'])
export class TelemetrySession {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@ManyToOne(() => User)
	user!: User;

	@Column({ type: 'uuid' })
	userId!: string;

	@Column({ type: 'text', nullable: true })
	sessionId!: string;

	@Column({ type: 'text', nullable: true })
	ipAddress?: string;

	@Column({ type: 'text', nullable: true })
	userAgent?: string;

	@Column({ type: 'text', nullable: true })
	referrer?: string;

	@Column({ type: 'json', nullable: true })
	browserInfo?: {
		name: string;
		version: string;
		os: string;
		device?: string;
	};

	@Column({ type: 'json', nullable: true })
	geolocation?: {
		country?: string;
		city?: string;
		timezone?: string;
	};

	@Column({ type: 'json', nullable: true })
	sessionData?: Record<string, any>;

	@Column({ type: 'boolean', default: true })
	isActive!: boolean;

	@Column({ type: 'int', default: 0 })
	pageViews!: number;

	@Column({ type: 'int', default: 0 })
	interactions!: number;

	@Column({ type: 'int', default: 0 })
	errors!: number;

	@Column({ type: 'decimal', precision: 10, scale: 3, default: 0 })
	duration!: number; // in seconds

	@CreateDateColumn()
	createdAt!: Date;

	@Column({ type: 'datetime', nullable: true })
	lastActivity?: Date;

	@Column({ type: 'datetime', nullable: true })
	endedAt?: Date;
}
