import { Repository, DataSource } from 'typeorm';
import {
	TelemetryMetric,
	TelemetryMetricType,
	TelemetryMetricUnit,
} from '../entities/telemetryMetric.entity';
import {
	TelemetryEvent,
	TelemetryEventType,
	TelemetryEventSeverity,
} from '../entities/telemetryEvent.entity';
import { TelemetrySession } from '../entities/telemetrySession.entity';
import { influxdbService } from './influxdbService';

export interface MetricData {
	metricType: TelemetryMetricType;
	unit: TelemetryMetricUnit;
	value: number;
	tags?: Record<string, string>;
	metadata?: Record<string, any>;
	userId?: string;
	retreatId?: string;
	endpoint?: string;
	component?: string;
}

export interface EventData {
	eventType: TelemetryEventType;
	severity: TelemetryEventSeverity;
	description: string;
	resourceType?: string;
	resourceId?: string;
	eventData?: Record<string, any>;
	oldValues?: Record<string, any>;
	newValues?: Record<string, any>;
	ipAddress?: string;
	userAgent?: string;
	userId?: string;
	retreatId?: string;
	endpoint?: string;
	component?: string;
}

export interface SessionData {
	sessionId: string;
	userId: string;
	ipAddress?: string;
	userAgent?: string;
	referrer?: string;
	browserInfo?: {
		name: string;
		version: string;
		os: string;
		device?: string;
	};
	geolocation?: {
		country?: string;
		city?: string;
		timezone?: string;
	};
	sessionData?: Record<string, any>;
}

export class TelemetryCollectionService {
	private telemetryMetricRepository: Repository<TelemetryMetric>;
	private telemetryEventRepository: Repository<TelemetryEvent>;
	private telemetrySessionRepository: Repository<TelemetrySession>;

	constructor(dataSource: DataSource) {
		this.telemetryMetricRepository = dataSource.getRepository(TelemetryMetric);
		this.telemetryEventRepository = dataSource.getRepository(TelemetryEvent);
		this.telemetrySessionRepository = dataSource.getRepository(TelemetrySession);
	}

	// Collect a single metric
	async collectMetric(metricData: MetricData): Promise<void> {
		try {
			// Store in local database
			const metric = this.telemetryMetricRepository.create({
				...metricData,
				createdAt: new Date(),
			});
			await this.telemetryMetricRepository.save(metric);

			// Send to InfluxDB
			await influxdbService.writeMetric(metric);
		} catch (error) {
			console.error('Failed to collect metric:', error);
			// Don't throw - telemetry failures shouldn't affect the main application
		}
	}

	// Collect multiple metrics in batch
	async collectMetrics(metricsData: MetricData[]): Promise<void> {
		try {
			// Store in local database
			const metrics = metricsData.map((data) =>
				this.telemetryMetricRepository.create({
					...data,
					createdAt: new Date(),
				}),
			);
			await this.telemetryMetricRepository.save(metrics);

			// Send to InfluxDB
			await influxdbService.writeMetrics(metrics);
		} catch (error) {
			console.error('Failed to collect metrics:', error);
			// Don't throw - telemetry failures shouldn't affect the main application
		}
	}

	// Collect a single event
	async collectEvent(eventData: EventData): Promise<void> {
		try {
			// Store in local database
			const event = this.telemetryEventRepository.create({
				...eventData,
				createdAt: new Date(),
			});
			await this.telemetryEventRepository.save(event);

			// Send to InfluxDB
			await influxdbService.writeEvent(event);
		} catch (error) {
			console.error('Failed to collect event:', error);
			// Don't throw - telemetry failures shouldn't affect the main application
		}
	}

	// Collect multiple events in batch
	async collectEvents(eventsData: EventData[]): Promise<void> {
		try {
			// Store in local database
			const events = eventsData.map((data) =>
				this.telemetryEventRepository.create({
					...data,
					createdAt: new Date(),
				}),
			);
			await this.telemetryEventRepository.save(events);

			// Send to InfluxDB
			await influxdbService.writeEvents(events);
		} catch (error) {
			console.error('Failed to collect events:', error);
			// Don't throw - telemetry failures shouldn't affect the main application
		}
	}

	// Start a new telemetry session
	async startSession(sessionData: SessionData): Promise<TelemetrySession> {
		try {
			const session = this.telemetrySessionRepository.create({
				...sessionData,
				isActive: true,
				pageViews: 0,
				interactions: 0,
				errors: 0,
				duration: 0,
				createdAt: new Date(),
				lastActivity: new Date(),
			});

			const savedSession = await this.telemetrySessionRepository.save(session);

			// Collect session start event
			await this.collectEvent({
				eventType: TelemetryEventType.USER_LOGIN,
				severity: TelemetryEventSeverity.INFO,
				description: `User session started: ${sessionData.sessionId}`,
				resourceType: 'session',
				resourceId: savedSession.id,
				eventData: {
					sessionId: sessionData.sessionId,
					browserInfo: sessionData.browserInfo,
					geolocation: sessionData.geolocation,
				},
				userId: sessionData.userId,
				ipAddress: sessionData.ipAddress,
				userAgent: sessionData.userAgent,
				component: 'auth',
			});

			return savedSession;
		} catch (error) {
			console.error('Failed to start session:', error);
			throw error; // Session creation is critical
		}
	}

	// Update an existing session
	async updateSession(
		sessionId: string,
		updates: {
			pageViews?: number;
			interactions?: number;
			errors?: number;
			duration?: number;
			lastActivity?: Date;
		},
	): Promise<void> {
		try {
			await this.telemetrySessionRepository.update(sessionId, {
				...updates,
				lastActivity: updates.lastActivity || new Date(),
			});
		} catch (error) {
			console.error('Failed to update session:', error);
			// Don't throw - telemetry failures shouldn't affect the main application
		}
	}

	// End a telemetry session
	async endSession(sessionId: string): Promise<void> {
		try {
			const session = await this.telemetrySessionRepository.findOne({ where: { id: sessionId } });
			if (session) {
				const duration = session.lastActivity
					? (session.lastActivity.getTime() - session.createdAt.getTime()) / 1000
					: 0;

				await this.telemetrySessionRepository.update(sessionId, {
					isActive: false,
					duration,
					endedAt: new Date(),
				});

				// Collect session end event
				await this.collectEvent({
					eventType: TelemetryEventType.USER_LOGOUT,
					severity: TelemetryEventSeverity.INFO,
					description: `User session ended: ${sessionId}`,
					resourceType: 'session',
					resourceId: sessionId,
					eventData: {
						duration,
						pageViews: session.pageViews,
						interactions: session.interactions,
						errors: session.errors,
					},
					userId: session.userId,
					component: 'auth',
				});
			}
		} catch (error) {
			console.error('Failed to end session:', error);
			// Don't throw - telemetry failures shouldn't affect the main application
		}
	}

	// Convenience methods for common telemetry types

	// Track user authentication events
	async trackUserLogin(
		userId: string,
		sessionId: string,
		ipAddress?: string,
		userAgent?: string,
	): Promise<void> {
		await this.collectEvent({
			eventType: TelemetryEventType.USER_LOGIN,
			severity: TelemetryEventSeverity.INFO,
			description: 'User logged in',
			resourceType: 'user',
			resourceId: userId,
			eventData: { sessionId },
			userId,
			ipAddress,
			userAgent,
			component: 'auth',
		});
	}

	async trackUserLogout(userId: string, sessionId?: string): Promise<void> {
		await this.collectEvent({
			eventType: TelemetryEventType.USER_LOGOUT,
			severity: TelemetryEventSeverity.INFO,
			description: 'User logged out',
			resourceType: 'user',
			resourceId: userId,
			eventData: { sessionId },
			userId,
			component: 'auth',
		});
	}

	async trackAuthenticationFailure(
		ipAddress?: string,
		userAgent?: string,
		reason?: string,
	): Promise<void> {
		await this.collectEvent({
			eventType: TelemetryEventType.SECURITY_ALERT,
			severity: TelemetryEventSeverity.WARNING,
			description: 'Authentication failed',
			eventData: { reason },
			ipAddress,
			userAgent,
			component: 'auth',
		});
	}

	// Track business events
	async trackParticipantRegistration(
		userId: string,
		retreatId: string,
		participantId: string,
	): Promise<void> {
		await this.collectEvent({
			eventType: TelemetryEventType.PARTICIPANT_CREATED,
			severity: TelemetryEventSeverity.INFO,
			description: 'New participant registered',
			resourceType: 'participant',
			resourceId: participantId,
			eventData: { participantId },
			userId,
			retreatId,
			component: 'participants',
		});
	}

	async trackPaymentProcessing(
		userId: string,
		retreatId: string,
		paymentId: string,
		amount: number,
		status: string,
	): Promise<void> {
		await this.collectEvent({
			eventType:
				status === 'success'
					? TelemetryEventType.PAYMENT_PROCESSED
					: TelemetryEventType.PAYMENT_FAILED,
			severity: status === 'success' ? TelemetryEventSeverity.INFO : TelemetryEventSeverity.WARNING,
			description: `Payment ${status}: ${amount}`,
			resourceType: 'payment',
			resourceId: paymentId,
			eventData: { amount, status },
			userId,
			retreatId,
			component: 'payments',
		});
	}

	// Track performance metrics
	async trackDatabaseQueryTime(
		queryTime: number,
		queryType: string,
		userId?: string,
	): Promise<void> {
		await this.collectMetric({
			metricType: TelemetryMetricType.DATABASE_QUERY_TIME,
			unit: TelemetryMetricUnit.MILLISECONDS,
			value: queryTime,
			tags: { queryType },
			metadata: { queryType },
			userId,
			component: 'database',
		});
	}

	async trackCacheHitRate(hitRate: number, cacheType: string): Promise<void> {
		await this.collectMetric({
			metricType: TelemetryMetricType.CACHE_HIT_RATE,
			unit: TelemetryMetricUnit.PERCENTAGE,
			value: hitRate,
			tags: { cacheType },
			metadata: { cacheType },
			component: 'cache',
		});
	}

	// Track user behavior
	async trackPageView(
		userId: string,
		sessionId: string,
		page: string,
		ipAddress?: string,
	): Promise<void> {
		await this.collectEvent({
			eventType: TelemetryEventType.PAGE_VIEW,
			severity: TelemetryEventSeverity.INFO,
			description: `Page viewed: ${page}`,
			resourceType: 'page',
			eventData: { page, sessionId },
			userId,
			ipAddress,
			component: 'frontend',
		});
	}

	async trackFeatureUsage(
		userId: string,
		feature: string,
		action: string,
		metadata?: Record<string, any>,
	): Promise<void> {
		await this.collectEvent({
			eventType: TelemetryEventType.FEATURE_USAGE,
			severity: TelemetryEventSeverity.INFO,
			description: `Feature used: ${feature} - ${action}`,
			eventData: { feature, action, ...metadata },
			userId,
			component: 'frontend',
		});
	}

	// Health check method
	async checkHealth(): Promise<{ database: boolean; influxdb: boolean }> {
		try {
			const databaseHealth = await this.telemetryMetricRepository
				.count()
				.then(() => true)
				.catch(() => false);
			const influxdbHealth = await influxdbService.checkConnection();

			return {
				database: databaseHealth,
				influxdb: influxdbHealth,
			};
		} catch (error) {
			console.error('Health check failed:', error);
			return { database: false, influxdb: false };
		}
	}
}

// Export singleton instance
let telemetryCollectionServiceInstance: TelemetryCollectionService | null = null;

export const getTelemetryCollectionService = (
	dataSource: DataSource,
): TelemetryCollectionService => {
	if (!telemetryCollectionServiceInstance) {
		telemetryCollectionServiceInstance = new TelemetryCollectionService(dataSource);
	}
	return telemetryCollectionServiceInstance;
};
