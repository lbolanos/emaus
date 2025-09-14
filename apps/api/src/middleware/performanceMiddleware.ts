import { Request, Response, NextFunction } from 'express';
import { performanceOptimizationService } from '../services/performanceOptimizationService';
import { AuthenticatedRequest } from '../middleware/authorization';

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
		// Check memory usage periodically
		if (Math.random() < 0.01) {
			// 1% chance to check on each request
			performanceOptimizationService
				.performCleanupIfNeeded()
				.then(() => next())
				.catch((error) => {
					console.error('Error performing memory cleanup:', error);
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
}

// Utility functions for performance monitoring
export class PerformanceMonitor {
	private static metrics = {
		totalRequests: 0,
		slowRequests: 0,
		cachedRequests: 0,
		averageResponseTime: 0,
	};

	public static recordRequest(duration: number, cached: boolean = false): void {
		this.metrics.totalRequests++;

		if (duration > 1000) {
			this.metrics.slowRequests++;
		}

		if (cached) {
			this.metrics.cachedRequests++;
		}

		// Update average response time
		this.metrics.averageResponseTime =
			(this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + duration) /
			this.metrics.totalRequests;
	}

	public static getMetrics() {
		return {
			...this.metrics,
			cacheHitRate:
				this.metrics.totalRequests > 0
					? (this.metrics.cachedRequests / this.metrics.totalRequests) * 100
					: 0,
			slowRequestRate:
				this.metrics.totalRequests > 0
					? (this.metrics.slowRequests / this.metrics.totalRequests) * 100
					: 0,
		};
	}

	public static resetMetrics(): void {
		this.metrics = {
			totalRequests: 0,
			slowRequests: 0,
			cachedRequests: 0,
			averageResponseTime: 0,
		};
	}
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
