import { Repository, DataSource, LessThan, MoreThan } from 'typeorm';
import { TelemetryMetric, TelemetryMetricType } from '../entities/telemetryMetric.entity';
import { TelemetryEvent, TelemetryEventType } from '../entities/telemetryEvent.entity';
import { TelemetrySession } from '../entities/telemetrySession.entity';

export interface AggregatedMetrics {
	totalRequests: number;
	averageResponseTime: number;
	errorRate: number;
	memoryUsage: number;
	cacheHitRate: number;
	activeUsers: number;
	period: {
		start: Date;
		end: Date;
	};
}

export interface BusinessMetrics {
	participantRegistrations: number;
	paymentSuccessRate: number;
	retreatCapacityUtilization: number;
	userRoleChanges: number;
	period: {
		start: Date;
		end: Date;
	};
}

export interface UserBehaviorMetrics {
	totalPageViews: number;
	averageSessionDuration: number;
	mostVisitedPages: Array<{ page: string; views: number }>;
	mostUsedFeatures: Array<{ feature: string; usage: number }>;
	period: {
		start: Date;
		end: Date;
	};
}

export interface SystemHealthMetrics {
	authenticationSuccessRate: number;
	systemErrors: number;
	permissionChecks: number;
	databaseQueries: number;
	period: {
		start: Date;
		end: Date;
	};
}

export class TelemetryAggregationService {
	private telemetryMetricRepository: Repository<TelemetryMetric>;
	private telemetryEventRepository: Repository<TelemetryEvent>;
	private telemetrySessionRepository: Repository<TelemetrySession>;

	constructor(dataSource: DataSource) {
		this.telemetryMetricRepository = dataSource.getRepository(TelemetryMetric);
		this.telemetryEventRepository = dataSource.getRepository(TelemetryEvent);
		this.telemetrySessionRepository = dataSource.getRepository(TelemetrySession);
	}

	// Get aggregated performance metrics for a time period
	async getAggregatedMetrics(startDate: Date, endDate: Date): Promise<AggregatedMetrics> {
		try {
			// Total requests (from API response time metrics)
			const totalRequestsResult = await this.telemetryMetricRepository
				.createQueryBuilder('metric')
				.select('COUNT(*)', 'count')
				.where('metric.metricType = :type', { type: TelemetryMetricType.API_RESPONSE_TIME })
				.andWhere('metric.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
				.getRawOne();

			const totalRequests = parseInt(totalRequestsResult?.count || '0');

			// Average response time
			const avgResponseTimeResult = await this.telemetryMetricRepository
				.createQueryBuilder('metric')
				.select('AVG(metric.value)', 'avg')
				.where('metric.metricType = :type', { type: TelemetryMetricType.API_RESPONSE_TIME })
				.andWhere('metric.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
				.getRawOne();

			const averageResponseTime = parseFloat(avgResponseTimeResult?.avg || '0');

			// Error rate
			const errorCountResult = await this.telemetryEventRepository
				.createQueryBuilder('event')
				.select('COUNT(*)', 'count')
				.where('event.severity IN (:...severities)', { severities: ['error', 'critical'] })
				.andWhere('event.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
				.getRawOne();

			const errorCount = parseInt(errorCountResult?.count || '0');
			const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;

			// Current memory usage (latest)
			const memoryUsageResult = await this.telemetryMetricRepository
				.createQueryBuilder('metric')
				.select('metric.value', 'value')
				.where('metric.metricType = :type', { type: TelemetryMetricType.MEMORY_USAGE })
				.orderBy('metric.createdAt', 'DESC')
				.limit(1)
				.getRawOne();

			const memoryUsage = parseFloat(memoryUsageResult?.value || '0');

			// Average cache hit rate
			const cacheHitRateResult = await this.telemetryMetricRepository
				.createQueryBuilder('metric')
				.select('AVG(metric.value)', 'avg')
				.where('metric.metricType = :type', { type: TelemetryMetricType.CACHE_HIT_RATE })
				.andWhere('metric.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
				.getRawOne();

			const cacheHitRate = parseFloat(cacheHitRateResult?.avg || '0');

			// Active users (sessions that were active in this period)
			const activeUsersResult = await this.telemetrySessionRepository
				.createQueryBuilder('session')
				.select('COUNT(DISTINCT session.userId)', 'count')
				.where('session.lastActivity BETWEEN :start AND :end', { start: startDate, end: endDate })
				.andWhere('session.isActive = :active', { active: true })
				.getRawOne();

			const activeUsers = parseInt(activeUsersResult?.count || '0');

			return {
				totalRequests,
				averageResponseTime,
				errorRate,
				memoryUsage,
				cacheHitRate,
				activeUsers,
				period: { start: startDate, end: endDate },
			};
		} catch (error) {
			console.error('Failed to get aggregated metrics:', error);
			return {
				totalRequests: 0,
				averageResponseTime: 0,
				errorRate: 0,
				memoryUsage: 0,
				cacheHitRate: 0,
				activeUsers: 0,
				period: { start: startDate, end: endDate },
			};
		}
	}

	// Get business metrics for a time period
	async getBusinessMetrics(startDate: Date, endDate: Date): Promise<BusinessMetrics> {
		try {
			// Participant registrations
			const participantRegistrationsResult = await this.telemetryEventRepository
				.createQueryBuilder('event')
				.select('COUNT(*)', 'count')
				.where('event.eventType = :type', { type: TelemetryEventType.PARTICIPANT_CREATED })
				.andWhere('event.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
				.getRawOne();

			const participantRegistrations = parseInt(participantRegistrationsResult?.count || '0');

			// Payment success rate
			const paymentSuccessResult = await this.telemetryEventRepository
				.createQueryBuilder('event')
				.select('COUNT(*)', 'count')
				.where('event.eventType = :type', { type: TelemetryEventType.PAYMENT_PROCESSED })
				.andWhere('event.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
				.getRawOne();

			const paymentFailedResult = await this.telemetryEventRepository
				.createQueryBuilder('event')
				.select('COUNT(*)', 'count')
				.where('event.eventType = :type', { type: TelemetryEventType.PAYMENT_FAILED })
				.andWhere('event.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
				.getRawOne();

			const paymentSuccess = parseInt(paymentSuccessResult?.count || '0');
			const paymentFailed = parseInt(paymentFailedResult?.count || '0');
			const totalPayments = paymentSuccess + paymentFailed;
			const paymentSuccessRate = totalPayments > 0 ? (paymentSuccess / totalPayments) * 100 : 0;

			// Retreat capacity utilization (latest value)
			const capacityUtilizationResult = await this.telemetryMetricRepository
				.createQueryBuilder('metric')
				.select('metric.value', 'value')
				.where('metric.metricType = :type', {
					type: TelemetryMetricType.RETREAT_CAPACITY_UTILIZATION,
				})
				.orderBy('metric.createdAt', 'DESC')
				.limit(1)
				.getRawOne();

			const retreatCapacityUtilization = parseFloat(capacityUtilizationResult?.value || '0');

			// User role changes
			const roleChangesResult = await this.telemetryEventRepository
				.createQueryBuilder('event')
				.select('COUNT(*)', 'count')
				.where('event.eventType IN (:...types)', {
					types: [TelemetryEventType.ROLE_CHANGE],
				})
				.andWhere('event.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
				.getRawOne();

			const userRoleChanges = parseInt(roleChangesResult?.count || '0');

			return {
				participantRegistrations,
				paymentSuccessRate,
				retreatCapacityUtilization,
				userRoleChanges,
				period: { start: startDate, end: endDate },
			};
		} catch (error) {
			console.error('Failed to get business metrics:', error);
			return {
				participantRegistrations: 0,
				paymentSuccessRate: 0,
				retreatCapacityUtilization: 0,
				userRoleChanges: 0,
				period: { start: startDate, end: endDate },
			};
		}
	}

	// Get user behavior metrics for a time period
	async getUserBehaviorMetrics(startDate: Date, endDate: Date): Promise<UserBehaviorMetrics> {
		try {
			// Total page views
			const totalPageViewsResult = await this.telemetryEventRepository
				.createQueryBuilder('event')
				.select('COUNT(*)', 'count')
				.where('event.eventType = :type', { type: TelemetryEventType.PAGE_VIEW })
				.andWhere('event.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
				.getRawOne();

			const totalPageViews = parseInt(totalPageViewsResult?.count || '0');

			// Average session duration
			const avgSessionDurationResult = await this.telemetrySessionRepository
				.createQueryBuilder('session')
				.select('AVG(session.duration)', 'avg')
				.where('session.endedAt BETWEEN :start AND :end', { start: startDate, end: endDate })
				.andWhere('session.endedAt IS NOT NULL')
				.getRawOne();

			const averageSessionDuration = parseFloat(avgSessionDurationResult?.avg || '0');

			// Most visited pages
			const mostVisitedPagesResult = await this.telemetryEventRepository
				.createQueryBuilder('event')
				.select("event.eventData->>'page'", 'page')
				.addSelect('COUNT(*)', 'views')
				.where('event.eventType = :type', { type: TelemetryEventType.PAGE_VIEW })
				.andWhere('event.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
				.groupBy("event.eventData->>'page'")
				.orderBy('views', 'DESC')
				.limit(10)
				.getRawMany();

			const mostVisitedPages = mostVisitedPagesResult.map((row) => ({
				page: row.page || 'unknown',
				views: parseInt(row.views),
			}));

			// Most used features
			const mostUsedFeaturesResult = await this.telemetryEventRepository
				.createQueryBuilder('event')
				.select("event.eventData->>'feature'", 'feature')
				.addSelect('COUNT(*)', 'usage')
				.where('event.eventType = :type', { type: TelemetryEventType.FEATURE_USAGE })
				.andWhere('event.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
				.groupBy("event.eventData->>'feature'")
				.orderBy('usage', 'DESC')
				.limit(10)
				.getRawMany();

			const mostUsedFeatures = mostUsedFeaturesResult.map((row) => ({
				feature: row.feature || 'unknown',
				usage: parseInt(row.usage),
			}));

			return {
				totalPageViews,
				averageSessionDuration,
				mostVisitedPages,
				mostUsedFeatures,
				period: { start: startDate, end: endDate },
			};
		} catch (error) {
			console.error('Failed to get user behavior metrics:', error);
			return {
				totalPageViews: 0,
				averageSessionDuration: 0,
				mostVisitedPages: [],
				mostUsedFeatures: [],
				period: { start: startDate, end: endDate },
			};
		}
	}

	// Get system health metrics for a time period
	async getSystemHealthMetrics(startDate: Date, endDate: Date): Promise<SystemHealthMetrics> {
		try {
			// Authentication success rate
			const authSuccessResult = await this.telemetryEventRepository
				.createQueryBuilder('event')
				.select('COUNT(*)', 'count')
				.where('event.eventType = :type', { type: TelemetryEventType.USER_LOGIN })
				.andWhere('event.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
				.getRawOne();

			const authFailedResult = await this.telemetryEventRepository
				.createQueryBuilder('event')
				.select('COUNT(*)', 'count')
				.where('event.eventType = :type', { type: TelemetryEventType.SECURITY_ALERT })
				.andWhere("event.eventData->>'reason' = :reason", { reason: 'authentication_failed' })
				.andWhere('event.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
				.getRawOne();

			const authSuccess = parseInt(authSuccessResult?.count || '0');
			const authFailed = parseInt(authFailedResult?.count || '0');
			const totalAuthAttempts = authSuccess + authFailed;
			const authenticationSuccessRate =
				totalAuthAttempts > 0 ? (authSuccess / totalAuthAttempts) * 100 : 100;

			// System errors
			const systemErrorsResult = await this.telemetryEventRepository
				.createQueryBuilder('event')
				.select('COUNT(*)', 'count')
				.where('event.eventType = :type', { type: TelemetryEventType.SYSTEM_ERROR })
				.andWhere('event.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
				.getRawOne();

			const systemErrors = parseInt(systemErrorsResult?.count || '0');

			// Permission checks
			const permissionChecksResult = await this.telemetryMetricRepository
				.createQueryBuilder('metric')
				.select('SUM(metric.value)', 'total')
				.where('metric.metricType = :type', { type: TelemetryMetricType.PERMISSION_CHECK })
				.andWhere('metric.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
				.getRawOne();

			const permissionChecks = parseInt(permissionChecksResult?.total || '0');

			// Database queries
			const databaseQueriesResult = await this.telemetryMetricRepository
				.createQueryBuilder('metric')
				.select('SUM(metric.value)', 'total')
				.where('metric.metricType = :type', { type: TelemetryMetricType.DATABASE_QUERY_TIME })
				.andWhere('metric.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
				.getRawOne();

			const databaseQueries = parseInt(databaseQueriesResult?.total || '0');

			return {
				authenticationSuccessRate,
				systemErrors,
				permissionChecks,
				databaseQueries,
				period: { start: startDate, end: endDate },
			};
		} catch (error) {
			console.error('Failed to get system health metrics:', error);
			return {
				authenticationSuccessRate: 0,
				systemErrors: 0,
				permissionChecks: 0,
				databaseQueries: 0,
				period: { start: startDate, end: endDate },
			};
		}
	}

	// Get metrics by time intervals (for charts)
	async getMetricsByInterval(
		metricType: TelemetryMetricType,
		startDate: Date,
		endDate: Date,
		interval: 'hour' | 'day' | 'week' | 'month' = 'hour',
	): Promise<Array<{ timestamp: Date; value: number; count: number }>> {
		try {
			let dateFormat: string;
			switch (interval) {
				case 'hour':
					dateFormat = '%Y-%m-%d %H:00:00';
					break;
				case 'day':
					dateFormat = '%Y-%m-%d';
					break;
				case 'week':
					dateFormat = '%Y-%u';
					break;
				case 'month':
					dateFormat = '%Y-%m';
					break;
			}

			const results = await this.telemetryMetricRepository
				.createQueryBuilder('metric')
				.select(`strftime('${dateFormat}', metric.createdAt)`, 'timestamp')
				.addSelect('AVG(metric.value)', 'value')
				.addSelect('COUNT(*)', 'count')
				.where('metric.metricType = :type', { type: metricType })
				.andWhere('metric.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
				.groupBy(`strftime('${dateFormat}', metric.createdAt)`)
				.orderBy('timestamp', 'ASC')
				.getRawMany();

			return results.map((row) => ({
				timestamp: new Date(row.timestamp),
				value: parseFloat(row.value),
				count: parseInt(row.count),
			}));
		} catch (error) {
			console.error('Failed to get metrics by interval:', error);
			return [];
		}
	}

	// Clean up old telemetry data
	async cleanupOldData(retentionDays: number = 90): Promise<void> {
		try {
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

			// Delete old metrics
			const metricsDeleteResult = await this.telemetryMetricRepository
				.createQueryBuilder()
				.delete()
				.where('createdAt < :cutoffDate', { cutoffDate })
				.execute();

			// Delete old events
			const eventsDeleteResult = await this.telemetryEventRepository
				.createQueryBuilder()
				.delete()
				.where('createdAt < :cutoffDate', { cutoffDate })
				.execute();

			// Delete old inactive sessions
			const sessionsDeleteResult = await this.telemetrySessionRepository
				.createQueryBuilder()
				.delete()
				.where('createdAt < :cutoffDate', { cutoffDate })
				.andWhere('isActive = :active', { active: false })
				.execute();

			console.log(`Cleaned up telemetry data:`, {
				metrics: metricsDeleteResult.affected || 0,
				events: eventsDeleteResult.affected || 0,
				sessions: sessionsDeleteResult.affected || 0,
			});
		} catch (error) {
			console.error('Failed to cleanup old telemetry data:', error);
		}
	}
}

// Export singleton instance
let telemetryAggregationServiceInstance: TelemetryAggregationService | null = null;

export const getTelemetryAggregationService = (
	dataSource: DataSource,
): TelemetryAggregationService => {
	if (!telemetryAggregationServiceInstance) {
		telemetryAggregationServiceInstance = new TelemetryAggregationService(dataSource);
	}
	return telemetryAggregationServiceInstance;
};
