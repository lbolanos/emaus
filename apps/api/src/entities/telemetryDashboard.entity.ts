import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	CreateDateColumn,
	UpdateDateColumn,
	Index,
} from 'typeorm';
import { User } from './user.entity';

export enum DashboardType {
	SYSTEM_OVERVIEW = 'system_overview',
	PERFORMANCE = 'performance',
	BUSINESS_INTELLIGENCE = 'business_intelligence',
	USER_ANALYTICS = 'user_analytics',
	SECURITY_MONITORING = 'security_monitoring',
	CUSTOM = 'custom',
}

export enum WidgetType {
	LINE_CHART = 'line_chart',
	BAR_CHART = 'bar_chart',
	PIE_CHART = 'pie_chart',
	NUMBER_CARD = 'number_card',
	GAUGE = 'gauge',
	TABLE = 'table',
	HEATMAP = 'heatmap',
	HISTOGRAM = 'histogram',
}

@Entity('telemetry_dashboards')
@Index(['userId', 'isDefault'])
@Index(['dashboardType'])
@Index(['isActive'])
export class TelemetryDashboard {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'text' })
	name!: string;

	@Column({ type: 'text', nullable: true })
	description?: string;

	@Column({ type: 'varchar' })
	dashboardType!: DashboardType;

	@Column({ type: 'json' })
	layout!: {
		widgets: DashboardWidget[];
		grid: {
			cols: number;
			rows: number;
			gap: number;
		};
	};

	@Column({ type: 'json', nullable: true })
	filters?: {
		dateRange?: {
			start: string;
			end: string;
		};
		retreatIds?: string[];
		userIds?: string[];
		tags?: Record<string, string>;
	};

	@Column({ type: 'json', nullable: true })
	refreshInterval?: {
		enabled: boolean;
		interval: number; // in seconds
	};

	@Column({ type: 'boolean', default: false })
	isDefault!: boolean;

	@Column({ type: 'boolean', default: true })
	isActive!: boolean;

	@Column({ type: 'boolean', default: false })
	isPublic!: boolean;

	@ManyToOne(() => User)
	user!: User;

	@Column({ type: 'uuid' })
	userId!: string;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}

export interface DashboardWidget {
	id: string;
	type: WidgetType;
	title: string;
	position: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
	config: {
		metricType?: string;
		eventType?: string;
		aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
		timeRange?: string;
		groupBy?: string;
		filters?: Record<string, any>;
		chartOptions?: Record<string, any>;
	};
	dataSource: 'telemetry_metrics' | 'telemetry_events' | 'custom_query';
}
