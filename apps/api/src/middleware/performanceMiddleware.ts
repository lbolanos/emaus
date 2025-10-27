import { Request, Response, NextFunction } from 'express';
import { performanceOptimizationService } from '../services/performanceOptimizationService';
import { AuthenticatedRequest } from '../middleware/authorization';
import { influxdbService } from '../services/influxdbService';
import { TelemetryMetricType, TelemetryMetricUnit } from '../entities/telemetryMetric.entity';

export interface PerformanceRequest extends AuthenticatedRequest {
	performance?: {
		startTime: number;
		cached?: boolean;
		cacheKey?: string;
	};
}

export class PerformanceMiddleware {
	// Middleware to track request performance
	public static trackPerformance(req: PerformanceRequest, res: Response, next: NextFunction): void {
		req.performance = {
			startTime: Date.now(),
		};

		const originalSend = res.send;
		res.send = function (data) {
			const duration = Date.now() - req.performance!.startTime;

			// Log slow requests (> 1000ms)
			if (duration > 1000) {
				console.warn(`⚠️ Slow request: ${req.method} ${req.path} took ${duration}ms`);
			}

			// Collect telemetry data
			void PerformanceMiddleware.collectPerformanceTelemetry(req, res, duration);

			return originalSend.call(this, data);
		};

		next();
	}

	// Middleware to optimize permission checks
	public static optimizePermissionCheck(
		req: PerformanceRequest,
		res: Response,
		next: NextFunction,
	): void {
		if (req.user && req.params.retreatId) {
			const userId = req.user.id;
			const retreatId = req.params.retreatId;

			// Check cache first (async operation)
			performanceOptimizationService
				.getCachedPermissions(userId, retreatId)
				.then((cachedPermissions) => {
					if (cachedPermissions) {
						req.performance!.cached = true;
						req.performance!.cacheKey = `permissions:${userId}:${retreatId}`;

						// Attach cached permissions to request
						(req as any).cachedPermissions = cachedPermissions;
					}
					next();
				})
				.catch((error) => {
					console.error('Error checking cached permissions:', error);
					next();
				});
		} else {
			next();
		}
	}

	// Middleware to optimize retreat user queries
	public static optimizeRetreatUserQuery(
		req: PerformanceRequest,
		res: Response,
		next: NextFunction,
	): void {
		if (req.params.retreatId) {
			const retreatId = req.params.retreatId;

			// Cache retreat user count (async operation)
			performanceOptimizationService
				.getRetreatUserCount(retreatId)
				.then((userCount) => {
					(req as any).retreatUserCount = userCount;
					next();
				})
				.catch((error) => {
					console.error('Error getting retreat user count:', error);
					next();
				});
		} else {
			next();
		}
	}

	// Cache invalidation middleware
	public static invalidateCacheOnChanges(
		req: PerformanceRequest,
		res: Response,
		next: NextFunction,
	): void {
		const originalSend = res.send;
		res.send = function (data) {
			// Invalidate caches based on the type of change
			if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
				if (req.user && req.params.retreatId) {
					// Invalidate user-specific cache
					performanceOptimizationService.invalidateUserPermissionCache(req.user.id);

					// Invalidate retreat-specific cache
					performanceOptimizationService.invalidateRetreatPermissionCache(req.params.retreatId);
					performanceOptimizationService.invalidateRetreatCache(req.params.retreatId);
				}

				// If changing user roles, invalidate broader caches
				if (req.path.includes('/retreat-roles') || req.path.includes('/permission-overrides')) {
					if (req.params.userId) {
						performanceOptimizationService.invalidateUserPermissionCache(req.params.userId);
						performanceOptimizationService.invalidateUserRetreatCache(req.params.userId);
					}
				}
			}

			return originalSend.call(this, data);
		};

		next();
	}

	// Memory monitoring middleware
	public static monitorMemory(req: PerformanceRequest, res: Response, next: NextFunction): void {
		// Check memory usage much less frequently and only log warnings
		if (Math.random() < 0.001) {
			// 0.1% chance to check on each request (much less frequent)
			performanceOptimizationService
				.checkMemoryUsage()
				.then((memoryCheck) => {
					// Collect memory telemetry
					void PerformanceMiddleware.collectMemoryTelemetry(req, memoryCheck);

					// Only perform cleanup if absolutely necessary (very high memory usage)
					if (memoryCheck.shouldCleanup) {
						console.warn('⚠️ High memory usage detected:', memoryCheck);
						return performanceOptimizationService.performCleanupIfNeeded();
					}
				})
				.then(() => next())
				.catch((error) => {
					console.error('Error checking memory usage:', error);
					next();
				});
		} else {
			next();
		}
	}

	// Database query optimization middleware
	public static optimizeDatabaseQueries(
		req: PerformanceRequest,
		res: Response,
		next: NextFunction,
	): void {
		// Add database query hints and optimizations
		const originalQuery = req.app.get?.('query');

		if (originalQuery) {
			// Override query method to add optimizations
			req.app.set('query', async function (sql: string, params?: any[]) {
				// Add query optimization hints
				let optimizedSql = sql;

				// Add USE INDEX hints for common patterns
				if (sql.includes('user_retreats') && sql.includes('WHERE')) {
					optimizedSql = optimizedSql.replace(
						'FROM user_retreats',
						'FROM user_retreats USE INDEX (idx_user_retreat_composite)',
					);
				}

				// Use the original query function with proper context
				return originalQuery.call(req.app, optimizedSql, params);
			});
		}

		next();
	}

	// Collect performance telemetry data
	private static async collectPerformanceTelemetry(
		req: PerformanceRequest,
		res: Response,
		duration: number,
	): Promise<void> {
		try {
			// Create InfluxDB point for API response time
			const responseTimeMetric = {
				metricType: TelemetryMetricType.API_RESPONSE_TIME,
				unit: TelemetryMetricUnit.MILLISECONDS,
				value: duration,
				tags: {
					method: req.method,
					route: req.path,
					status: res.statusCode.toString(),
				},
				metadata: {
					cached: req.performance?.cached || false,
					userAgent: req.get('User-Agent'),
					ip: req.ip || req.connection.remoteAddress,
				},
				userId: req.user?.id,
				retreatId: req.params.retreatId,
				endpoint: req.path,
				component: 'api',
				createdAt: new Date(),
			};

			await influxdbService.writeMetric(responseTimeMetric as any);

			// Track error rates
			if (res.statusCode >= 400) {
				const errorMetric = {
					metricType: TelemetryMetricType.ERROR_RATE,
					unit: TelemetryMetricUnit.PERCENTAGE,
					value: 1, // 1 error
					tags: {
						method: req.method,
						route: req.path,
						status: res.statusCode.toString(),
					},
					metadata: {
						errorMessage: res.locals.error?.message,
						errorType: res.locals.error?.name,
					},
					userId: req.user?.id,
					retreatId: req.params.retreatId,
					endpoint: req.path,
					component: 'api',
					createdAt: new Date(),
				};

				await influxdbService.writeMetric(errorMetric as any);
			}

			// Update performance monitor metrics
			PerformanceMiddleware.recordRequest(duration, req.performance?.cached || false);

			// Periodically flush InfluxDB writes
			if (Math.random() < 0.01) {
				await influxdbService.flush();
			}
		} catch (error) {
			console.error('Failed to collect performance telemetry:', error);
			// Don't throw - telemetry failures shouldn't affect the main application
		}
	}

	// Collect memory telemetry data
	private static async collectMemoryTelemetry(
		req: PerformanceRequest,
		memoryCheck: any,
	): Promise<void> {
		try {
			const memoryMetric = {
				metricType: TelemetryMetricType.MEMORY_USAGE,
				unit: TelemetryMetricUnit.BYTES,
				value: memoryCheck.heapUsed || 0,
				tags: {
					component: 'api',
					type: 'heap_used',
				},
				metadata: {
					heapTotal: memoryCheck.heapTotal,
					external: memoryCheck.external,
					rss: memoryCheck.rss,
					shouldCleanup: memoryCheck.shouldCleanup,
				},
				userId: req.user?.id,
				retreatId: req.params.retreatId,
				component: 'api',
				createdAt: new Date(),
			};

			await influxdbService.writeMetric(memoryMetric as any);
		} catch (error) {
			console.error('Failed to collect memory telemetry:', error);
			// Don't throw - telemetry failures shouldn't affect the main application
		}
	}

	// Utility functions for performance monitoring
	public static recordRequest(duration: number, cached: boolean = false): void {
		PerformanceMiddleware.metrics.totalRequests++;

		if (duration > 1000) {
			PerformanceMiddleware.metrics.slowRequests++;
		}

		if (cached) {
			PerformanceMiddleware.metrics.cachedRequests++;
		}

		// Update average response time
		PerformanceMiddleware.metrics.averageResponseTime =
			(PerformanceMiddleware.metrics.averageResponseTime *
				(PerformanceMiddleware.metrics.totalRequests - 1) +
				duration) /
			PerformanceMiddleware.metrics.totalRequests;
	}

	public static getMetrics() {
		return {
			...PerformanceMiddleware.metrics,
			cacheHitRate:
				PerformanceMiddleware.metrics.totalRequests > 0
					? (PerformanceMiddleware.metrics.cachedRequests /
							PerformanceMiddleware.metrics.totalRequests) *
						100
					: 0,
			slowRequestRate:
				PerformanceMiddleware.metrics.totalRequests > 0
					? (PerformanceMiddleware.metrics.slowRequests /
							PerformanceMiddleware.metrics.totalRequests) *
						100
					: 0,
		};
	}

	public static resetMetrics(): void {
		PerformanceMiddleware.metrics = {
			totalRequests: 0,
			slowRequests: 0,
			cachedRequests: 0,
			averageResponseTime: 0,
		};
	}

	private static metrics = {
		totalRequests: 0,
		slowRequests: 0,
		cachedRequests: 0,
		averageResponseTime: 0,
	};
}

// Export middleware functions with proper context
export const trackPerformance = (
	req: PerformanceRequest,
	res: Response,
	next: NextFunction,
): void => {
	PerformanceMiddleware.trackPerformance(req, res, next);
};

export const optimizePermissionCheck = (
	req: PerformanceRequest,
	res: Response,
	next: NextFunction,
): void => {
	PerformanceMiddleware.optimizePermissionCheck(req, res, next);
};

export const optimizeRetreatUserQuery = (
	req: PerformanceRequest,
	res: Response,
	next: NextFunction,
): void => {
	PerformanceMiddleware.optimizeRetreatUserQuery(req, res, next);
};

export const invalidateCacheOnChanges = (
	req: PerformanceRequest,
	res: Response,
	next: NextFunction,
): void => {
	PerformanceMiddleware.invalidateCacheOnChanges(req, res, next);
};

export const monitorMemory = (req: PerformanceRequest, res: Response, next: NextFunction): void => {
	PerformanceMiddleware.monitorMemory(req, res, next);
};

export const optimizeDatabaseQueries = (
	req: PerformanceRequest,
	res: Response,
	next: NextFunction,
): void => {
	PerformanceMiddleware.optimizeDatabaseQueries(req, res, next);
};
