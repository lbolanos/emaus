import { AppDataSource } from '../data-source';
import { UserRetreat } from '../entities/userRetreat.entity';
import { Retreat } from '../entities/retreat.entity';
import { User } from '../entities/user.entity';
import { Cache } from 'cache-manager';
import NodeCache from 'node-cache';

export interface CacheConfig {
	ttl: number; // Time to live in seconds
	checkperiod: number; // Check period for expired items
	useClones: boolean;
}

export interface PerformanceMetrics {
	cacheHitRate: number;
	averageQueryTime: number;
	totalQueries: number;
	cacheHits: number;
	cacheMisses: number;
}

export class PerformanceOptimizationService {
	private static instance: PerformanceOptimizationService;
	// Retreat-specific caches for better isolation
	private retreatCaches: Map<string, NodeCache> = new Map();
	private globalCache: NodeCache; // For user-global data
	private metrics: PerformanceMetrics;
	private metricsInterval: NodeJS.Timeout | null = null;

	private constructor() {
		const cacheConfig: CacheConfig = {
			ttl: 300, // 5 minutes
			checkperiod: 60, // 1 minute
			useClones: false,
		};

		this.globalCache = new NodeCache(cacheConfig);

		this.metrics = {
			cacheHitRate: 0,
			averageQueryTime: 0,
			totalQueries: 0,
			cacheHits: 0,
			cacheMisses: 0,
		};

		this.startMetricsCollection();
	}

	public static getInstance(): PerformanceOptimizationService {
		if (!PerformanceOptimizationService.instance) {
			PerformanceOptimizationService.instance = new PerformanceOptimizationService();
		}
		return PerformanceOptimizationService.instance;
	}

	// Helper methods for retreat-specific cache management
	private getRetreatCache(retreatId: string): NodeCache {
		if (!this.retreatCaches.has(retreatId)) {
			const cacheConfig: CacheConfig = {
				ttl: 300, // 5 minutes
				checkperiod: 60, // 1 minute
				useClones: false,
			};
			this.retreatCaches.set(retreatId, new NodeCache(cacheConfig));
		}
		return this.retreatCaches.get(retreatId)!;
	}

	// Permission caching with retreat-specific caches
	public async getCachedPermissions(userId: string, retreatId: string): Promise<string[] | null> {
		const retreatCache = this.getRetreatCache(retreatId);
		const cacheKey = `permissions:${userId}`;
		const cached = retreatCache.get<string[]>(cacheKey);

		if (cached) {
			this.recordCacheHit();
			this.logCacheOperation('HIT', 'retreatPermissions', `${retreatId}:${userId}`, true);
			return cached;
		}

		this.recordCacheMiss();
		this.logCacheOperation('MISS', 'retreatPermissions', `${retreatId}:${userId}`, false);
		return null;
	}

	public async setCachedPermissions(
		userId: string,
		retreatId: string,
		permissions: string[],
		ttl: number = 300,
	): Promise<void> {
		const retreatCache = this.getRetreatCache(retreatId);
		const cacheKey = `permissions:${userId}`;
		retreatCache.set(cacheKey, permissions, ttl);
		this.logCacheOperation('SET', 'retreatPermissions', `${retreatId}:${userId}`, false);
	}

	public invalidatePermissionCache(userId: string, retreatId: string): void {
		const retreatCache = this.getRetreatCache(retreatId);
		const cacheKey = `permissions:${userId}`;
		retreatCache.del(cacheKey);
		this.logCacheOperation('INVALIDATE', 'retreatPermissions', `${retreatId}:${userId}`, false);
	}

	public invalidateUserPermissionCache(userId: string): void {
		// Invalidate user permissions in all retreat caches
		for (const [retreatId, retreatCache] of this.retreatCaches.entries()) {
			const cacheKey = `permissions:${userId}`;
			retreatCache.del(cacheKey);
			this.logCacheOperation('INVALIDATE', 'retreatPermissions', `${retreatId}:${userId}`, false);
		}
	}

	public invalidateRetreatPermissionCache(retreatId: string): void {
		const retreatCache = this.retreatCaches.get(retreatId);
		if (retreatCache) {
			// Clear all permission-related keys for this retreat
			const keys = retreatCache.keys().filter((key) => key.startsWith('permissions:'));
			retreatCache.del(keys);
			this.logCacheOperation('INVALIDATE', 'retreatPermissions', `${retreatId}:*`, false);
		}
	}

	// Retreat access and role caching (retreat-specific)
	public async getCachedRetreatAccess(userId: string, retreatId: string): Promise<boolean | null> {
		const retreatCache = this.getRetreatCache(retreatId);
		const cacheKey = `access:${userId}`;
		const cached = retreatCache.get<boolean>(cacheKey);

		if (cached !== undefined) {
			this.recordCacheHit();
			this.logCacheOperation('HIT', 'retreatAccess', `${retreatId}:${userId}`, true);
			return cached;
		}

		this.recordCacheMiss();
		this.logCacheOperation('MISS', 'retreatAccess', `${retreatId}:${userId}`, false);
		return null;
	}

	public async setCachedRetreatAccess(
		userId: string,
		retreatId: string,
		hasAccess: boolean,
		ttl: number = 300,
	): Promise<void> {
		const retreatCache = this.getRetreatCache(retreatId);
		const cacheKey = `access:${userId}`;
		retreatCache.set(cacheKey, hasAccess, ttl);
		this.logCacheOperation('SET', 'retreatAccess', `${retreatId}:${userId}`, false);
	}

	public invalidateRetreatAccessCache(userId: string, retreatId: string): void {
		const retreatCache = this.retreatCaches.get(retreatId);
		if (retreatCache) {
			const cacheKey = `access:${userId}`;
			retreatCache.del(cacheKey);
			this.logCacheOperation('INVALIDATE', 'retreatAccess', `${retreatId}:${userId}`, false);
		}
	}

	// Retreat role caching (retreat-specific)
	public async getCachedRetreatRole(
		userId: string,
		retreatId: string,
		role: string,
	): Promise<boolean | null> {
		const retreatCache = this.getRetreatCache(retreatId);
		const cacheKey = `role:${userId}:${role}`;
		const cached = retreatCache.get<boolean>(cacheKey);

		if (cached !== undefined) {
			this.recordCacheHit();
			this.logCacheOperation('HIT', 'retreatRole', `${retreatId}:${userId}:${role}`, true);
			return cached;
		}

		this.recordCacheMiss();
		this.logCacheOperation('MISS', 'retreatRole', `${retreatId}:${userId}:${role}`, false);
		return null;
	}

	public async setCachedRetreatRole(
		userId: string,
		retreatId: string,
		role: string,
		hasRole: boolean,
		ttl: number = 300,
	): Promise<void> {
		const retreatCache = this.getRetreatCache(retreatId);
		const cacheKey = `role:${userId}:${role}`;
		retreatCache.set(cacheKey, hasRole, ttl);
		this.logCacheOperation('SET', 'retreatRole', `${retreatId}:${userId}:${role}`, false);
	}

	public invalidateRetreatRoleCache(userId: string, retreatId: string, role: string): void {
		const retreatCache = this.retreatCaches.get(retreatId);
		if (retreatCache) {
			const cacheKey = `role:${userId}:${role}`;
			retreatCache.del(cacheKey);
			this.logCacheOperation('INVALIDATE', 'retreatRole', `${retreatId}:${userId}:${role}`, false);
		}
	}

	// User retreats caching (global cache since it spans multiple retreats)
	public async getCachedUserRetreats(
		userId: string,
	): Promise<Array<{ retreatId: string; role: string; status: string }> | null> {
		const cacheKey = `user_retreats:${userId}`;
		const cached =
			this.globalCache.get<Array<{ retreatId: string; role: string; status: string }>>(cacheKey);

		if (cached) {
			this.recordCacheHit();
			this.logCacheOperation('HIT', 'userRetreats', userId, true);
			return cached;
		}

		this.recordCacheMiss();
		this.logCacheOperation('MISS', 'userRetreats', userId, false);
		return null;
	}

	public async setCachedUserRetreats(
		userId: string,
		userRetreats: Array<{ retreatId: string; role: string; status: string }>,
		ttl: number = 300,
	): Promise<void> {
		const cacheKey = `user_retreats:${userId}`;
		this.globalCache.set(cacheKey, userRetreats, ttl);
		this.logCacheOperation('SET', 'userRetreats', userId, false);
	}

	public invalidateUserRetreatCache(userId: string): void {
		const cacheKey = `user_retreats:${userId}`;
		this.globalCache.del(cacheKey);
		this.logCacheOperation('INVALIDATE', 'userRetreats', userId, false);
	}

	// User permissions result caching (global cache since it spans multiple retreats)
	public async getCachedUserPermissionsResult(userId: string): Promise<{
		permissions: string[];
		roles: string[];
		retreats: Array<{ retreatId: string; role: string }>;
	} | null> {
		const cacheKey = `user_permissions_result:${userId}`;
		const cached = this.globalCache.get<any>(cacheKey);

		if (cached) {
			this.recordCacheHit();
			this.logCacheOperation('HIT', 'userPermissionsResult', userId, true);
			return cached;
		}

		this.recordCacheMiss();
		this.logCacheOperation('MISS', 'userPermissionsResult', userId, false);
		return null;
	}

	public async setCachedUserPermissionsResult(
		userId: string,
		result: {
			permissions: string[];
			roles: string[];
			retreats: Array<{ retreatId: string; role: string }>;
		},
		ttl: number = 300,
	): Promise<void> {
		const cacheKey = `user_permissions_result:${userId}`;
		this.globalCache.set(cacheKey, result, ttl);
		this.logCacheOperation('SET', 'userPermissionsResult', userId, false);
	}

	public invalidateUserPermissionsResultCache(userId: string): void {
		const cacheKey = `user_permissions_result:${userId}`;
		this.globalCache.del(cacheKey);
		this.logCacheOperation('INVALIDATE', 'userPermissionsResult', userId, false);
	}

	// Retreat information caching (retreat-specific)
	public async getCachedRetreat(retreatId: string): Promise<Retreat | null> {
		const retreatCache = this.getRetreatCache(retreatId);
		const cacheKey = `retreat_info`;
		const cached = retreatCache.get<Retreat>(cacheKey);

		if (cached) {
			this.recordCacheHit();
			this.logCacheOperation('HIT', 'retreatInfo', retreatId, true);
			return cached;
		}

		this.recordCacheMiss();
		this.logCacheOperation('MISS', 'retreatInfo', retreatId, false);
		return null;
	}

	public async setCachedRetreat(
		retreatId: string,
		retreat: Retreat,
		ttl: number = 300,
	): Promise<void> {
		const retreatCache = this.getRetreatCache(retreatId);
		const cacheKey = `retreat_info`;
		retreatCache.set(cacheKey, retreat, ttl);
		this.logCacheOperation('SET', 'retreatInfo', retreatId, false);
	}

	public invalidateRetreatCache(retreatId: string): void {
		const retreatCache = this.retreatCaches.get(retreatId);
		if (retreatCache) {
			const cacheKey = `retreat_info`;
			retreatCache.del(cacheKey);
			this.logCacheOperation('INVALIDATE', 'retreatInfo', retreatId, false);
		}
	}

	// Batch operations for performance
	public async batchGetUserPermissions(
		userIds: string[],
		retreatId: string,
	): Promise<Map<string, string[]>> {
		const results = new Map<string, string[]>();
		const uncachedUserIds: string[] = [];

		// First, check cache for all users
		for (const userId of userIds) {
			const cached = await this.getCachedPermissions(userId, retreatId);
			if (cached) {
				results.set(userId, cached);
			} else {
				uncachedUserIds.push(userId);
			}
		}

		// For uncached users, fetch from database in batch
		if (uncachedUserIds.length > 0) {
			const batchResults = await this.batchFetchUserPermissions(uncachedUserIds, retreatId);

			for (const [userId, permissions] of batchResults) {
				results.set(userId, permissions);
				await this.setCachedPermissions(userId, retreatId, permissions);
			}
		}

		return results;
	}

	private async batchFetchUserPermissions(
		userIds: string[],
		retreatId: string,
	): Promise<Map<string, string[]>> {
		const query = `
			SELECT ur.user_id, rp.permission_id, p.resource, p.operation
			FROM user_retreats ur
			JOIN role_permissions rp ON ur.role_id = rp.role_id
			JOIN permissions p ON rp.permission_id = p.id
			WHERE ur.user_id IN (${userIds.map(() => '?').join(',')})
			AND ur.retreat_id = ?
			AND ur.status = 'active'
		`;

		const result = await AppDataSource.query(query, [...userIds, retreatId]);
		const userPermissions = new Map<string, string[]>();

		// Initialize with empty arrays
		for (const userId of userIds) {
			userPermissions.set(userId, []);
		}

		// Populate permissions
		for (const row of result) {
			const permission = `${row.resource}:${row.operation}`;
			const currentPermissions = userPermissions.get(row.user_id) || [];
			currentPermissions.push(permission);
			userPermissions.set(row.user_id, currentPermissions);
		}

		return userPermissions;
	}

	// Retreat user management optimization (retreat-specific)
	public async getRetreatUserCount(retreatId: string): Promise<number> {
		const retreatCache = this.getRetreatCache(retreatId);
		const cacheKey = `user_count`;
		const cached = retreatCache.get<number>(cacheKey);

		if (cached !== undefined) {
			this.recordCacheHit();
			this.logCacheOperation('HIT', 'retreatUserCount', retreatId, true);
			return cached;
		}

		this.recordCacheMiss();
		this.logCacheOperation('MISS', 'retreatUserCount', retreatId, false);

		const result = await AppDataSource.query(
			`
			SELECT COUNT(*) as count
			FROM user_retreats
			WHERE retreat_id = ? AND status = 'active'
		`,
			[retreatId],
		);

		const count = result[0].count;
		retreatCache.set(cacheKey, count, 60); // Cache for 1 minute
		this.logCacheOperation('SET', 'retreatUserCount', retreatId, false);

		return count;
	}

	public async getRetreatUsersByRole(retreatId: string, role: string): Promise<string[]> {
		const retreatCache = this.getRetreatCache(retreatId);
		const cacheKey = `users_by_role:${role}`;
		const cached = retreatCache.get<string[]>(cacheKey);

		if (cached) {
			this.recordCacheHit();
			this.logCacheOperation('HIT', 'retreatUsersByRole', `${retreatId}:${role}`, true);
			return cached;
		}

		this.recordCacheMiss();
		this.logCacheOperation('MISS', 'retreatUsersByRole', `${retreatId}:${role}`, false);

		const result = await AppDataSource.query(
			`
			SELECT user_id
			FROM user_retreats ur
			JOIN roles r ON ur.role_id = r.id
			WHERE ur.retreat_id = ? AND r.name = ? AND ur.status = 'active'
		`,
			[retreatId, role],
		);

		const userIds = result.map((row: any) => row.user_id);
		retreatCache.set(cacheKey, userIds, 120); // Cache for 2 minutes
		this.logCacheOperation('SET', 'retreatUsersByRole', `${retreatId}:${role}`, false);

		return userIds;
	}

	// Query optimization helpers (global cache since it spans multiple retreats)
	public async getUserRetreatsWithDetails(userId: string): Promise<
		Array<{
			retreatId: string;
			retreatName: string;
			role: string;
			status: string;
			joinedAt: Date;
		}>
	> {
		const cacheKey = `user_retreats_details:${userId}`;
		const cached = this.globalCache.get<any[]>(cacheKey);

		if (cached) {
			this.recordCacheHit();
			this.logCacheOperation('HIT', 'userRetreatsWithDetails', userId, true);
			return cached;
		}

		this.recordCacheMiss();
		this.logCacheOperation('MISS', 'userRetreatsWithDetails', userId, false);

		const result = await AppDataSource.query(
			`
			SELECT
				ur.retreat_id,
				r.parish as retreat_name,
				rl.name as role,
				ur.status,
				ur.invited_at as joinedAt
			FROM user_retreats ur
			JOIN retreats r ON ur.retreat_id = r.id
			JOIN roles rl ON ur.role_id = rl.id
			WHERE ur.user_id = ? AND ur.status IN ('active', 'pending')
			ORDER BY ur.invited_at DESC
		`,
			[userId],
		);

		this.globalCache.set(cacheKey, result, 180); // Cache for 3 minutes
		this.logCacheOperation('SET', 'userRetreatsWithDetails', userId, false);
		return result;
	}

	// Cache management
	public clearAllCaches(): void {
		// Clear all retreat-specific caches
		for (const [retreatId, retreatCache] of this.retreatCaches.entries()) {
			retreatCache.flushAll();
			this.logCacheOperation('CLEAR', 'retreatCache', retreatId, false);
		}
		// Clear global cache
		this.globalCache.flushAll();
		this.logCacheOperation('CLEAR', 'globalCache', 'all', false);
	}

	public clearRetreatCache(retreatId: string): void {
		const retreatCache = this.retreatCaches.get(retreatId);
		if (retreatCache) {
			retreatCache.flushAll();
			this.logCacheOperation('CLEAR', 'retreatCache', retreatId, false);
		}
	}

	public getCacheStats(): {
		globalCache: any;
		retreatCaches: Map<string, any>;
		totalRetreatCaches: number;
		metrics: PerformanceMetrics;
	} {
		const retreatStats = new Map<string, any>();
		for (const [retreatId, retreatCache] of this.retreatCaches.entries()) {
			retreatStats.set(retreatId, retreatCache.getStats());
		}

		return {
			globalCache: this.globalCache.getStats(),
			retreatCaches: retreatStats,
			totalRetreatCaches: this.retreatCaches.size,
			metrics: this.metrics,
		};
	}

	// Metrics collection
	private recordCacheHit(): void {
		this.metrics.cacheHits++;
		this.metrics.totalQueries++;
		this.updateCacheHitRate();
	}

	private recordCacheMiss(): void {
		this.metrics.cacheMisses++;
		this.metrics.totalQueries++;
		this.updateCacheHitRate();
	}

	private updateCacheHitRate(): void {
		if (this.metrics.totalQueries > 0) {
			this.metrics.cacheHitRate = this.metrics.cacheHits / this.metrics.totalQueries;
		}
	}

	private startMetricsCollection(): void {
		// Periodically log metrics
		this.metricsInterval = setInterval(() => {
			this.logMetrics();
		}, 300000); // Every 5 minutes
	}

	private logMetrics(): void {
		const stats = this.getCacheStats();
		let totalRetreatKeys = 0;
		for (const retreatStats of stats.retreatCaches.values()) {
			totalRetreatKeys += retreatStats.keys;
		}

		console.log('📊 Performance Metrics:', {
			cacheHitRate: `${(this.metrics.cacheHitRate * 100).toFixed(2)}%`,
			totalQueries: this.metrics.totalQueries,
			globalCacheKeys: stats.globalCache.keys,
			totalRetreatCaches: stats.totalRetreatCaches,
			totalRetreatKeys,
			memoryUsage: process.memoryUsage(),
		});
	}

	// Enhanced debugging for cache operations
	public logCacheOperation(operation: string, cacheType: string, key: string, hit: boolean): void {
		if (process.env.NODE_ENV === 'development') {
			const icon = hit ? '✅' : '❌';
			console.log(`${icon} Cache ${operation}: ${cacheType} - ${key}`);
		}
	}

	// Cache health check
	public getCacheHealth(): {
		isHealthy: boolean;
		issues: string[];
		recommendations: string[];
		stats: any;
	} {
		const stats = this.getCacheStats();
		const issues: string[] = [];
		const recommendations: string[] = [];

		// Calculate total keys across all retreat caches
		let totalRetreatKeys = 0;
		for (const retreatStats of stats.retreatCaches.values()) {
			totalRetreatKeys += retreatStats.keys;
		}

		// Check hit rate
		if (this.metrics.cacheHitRate < 0.5 && this.metrics.totalQueries > 100) {
			issues.push('Low cache hit rate (< 50%)');
			recommendations.push(
				'Consider increasing cache TTL or reviewing cache invalidation strategy',
			);
		}

		// Check memory usage
		const totalKeys = stats.globalCache.keys + totalRetreatKeys;
		if (totalKeys > 50000) {
			issues.push('High number of cache keys');
			recommendations.push('Consider reducing cache TTL or implementing cache size limits');
		}

		// Check for too many retreat caches (might indicate memory leak)
		if (stats.totalRetreatCaches > 500) {
			issues.push('High number of retreat caches');
			recommendations.push('Consider implementing cache cleanup for inactive retreats');
		}

		// Check for stale cache (no recent activity)
		const memoryUsage = process.memoryUsage();
		const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
		if (memoryUsageMB > 1000) {
			issues.push('High memory usage');
			recommendations.push('Consider more aggressive cache cleanup');
		}

		return {
			isHealthy: issues.length === 0,
			issues,
			recommendations,
			stats: {
				hitRate: `${(this.metrics.cacheHitRate * 100).toFixed(2)}%`,
				totalQueries: this.metrics.totalQueries,
				totalKeys,
				totalRetreatCaches: stats.totalRetreatCaches,
				globalCacheKeys: stats.globalCache.keys,
				retreatCacheKeys: totalRetreatKeys,
				memoryUsageMB: Math.round(memoryUsageMB),
			},
		};
	}

	// Debug specific cache entries
	public async debugCacheEntry(
		cacheType: string,
		key: string,
		retreatId?: string,
	): Promise<{
		found: boolean;
		value?: any;
		ttl?: number;
		age?: number;
		cacheInfo?: string;
	}> {
		let cache: NodeCache | undefined;
		let actualKey = key;
		let cacheInfo = '';

		if (cacheType === 'global') {
			cache = this.globalCache;
			cacheInfo = 'Global Cache';
		} else if (cacheType === 'retreat' && retreatId) {
			cache = this.retreatCaches.get(retreatId);
			cacheInfo = `Retreat Cache: ${retreatId}`;
		} else if (retreatId) {
			// Try to find in specific retreat cache
			cache = this.retreatCaches.get(retreatId);
			cacheInfo = `Retreat Cache: ${retreatId}`;
		} else {
			// Search in all retreat caches if no specific retreatId provided
			for (const [rId, retreatCache] of this.retreatCaches.entries()) {
				const value = retreatCache.get<any>(key);
				if (value !== undefined) {
					const ttl = retreatCache.getTtl(key);
					return {
						found: true,
						value,
						ttl: ttl && ttl > 0 ? ttl / 1000 : undefined,
						age: ttl && ttl > 0 ? 300 - ttl / 1000 : undefined,
						cacheInfo: `Found in Retreat Cache: ${rId}`,
					};
				}
			}
			// Also check global cache
			const globalValue = this.globalCache.get<any>(key);
			if (globalValue !== undefined) {
				const ttl = this.globalCache.getTtl(key);
				return {
					found: true,
					value: globalValue,
					ttl: ttl && ttl > 0 ? ttl / 1000 : undefined,
					age: ttl && ttl > 0 ? 300 - ttl / 1000 : undefined,
					cacheInfo: 'Found in Global Cache',
				};
			}
			return { found: false };
		}

		if (!cache) {
			return { found: false, cacheInfo: 'Cache not found' };
		}

		const value = cache.get<any>(key);
		const ttl = cache.getTtl(key);

		if (value !== undefined) {
			return {
				found: true,
				value,
				ttl: ttl && ttl > 0 ? ttl / 1000 : undefined, // Convert to seconds
				age: ttl && ttl > 0 ? 300 - ttl / 1000 : undefined, // Assuming 5 min default TTL
				cacheInfo,
			};
		}

		return { found: false, cacheInfo };
	}

	// Database query optimization
	public async optimizeHeavyQueries(): Promise<void> {
		try {
			// Check if user_retreats table exists before creating indexes
			const tableCheck = await AppDataSource.query(`
				SELECT name FROM sqlite_master
				WHERE type='table' AND name='user_retreats'
			`);

			if (tableCheck.length === 0) {
				console.log('user_retreats table does not exist yet, skipping index creation');
				return;
			}

			// Create optimized indexes for common queries
			const indexes = [
				'CREATE INDEX IF NOT EXISTS idx_user_retreat_composite ON user_retreats(userId, retreatId, status)',
				'CREATE INDEX IF NOT EXISTS idx_role_permissions_composite ON role_permissions(roleId, permissionId)',
				'CREATE INDEX IF NOT EXISTS idx_retreat_users_status ON user_retreats(retreatId, status)',
				'CREATE INDEX IF NOT EXISTS idx_user_retreats_created ON user_retreats(createdAt)',
			];

			for (const index of indexes) {
				try {
					await AppDataSource.query(index);
				} catch (error) {
					console.warn(`Index creation failed: ${index}`, error);
				}
			}
		} catch (error) {
			console.warn('Failed to check table existence for index creation:', error);
		}
	}

	// Memory management
	public async checkMemoryUsage(): Promise<{
		used: number;
		total: number;
		percentage: number;
		shouldCleanup: boolean;
		totalRetreatCaches: number;
	}> {
		const stats = this.getCacheStats();

		// Calculate total keys across all retreat caches
		let totalRetreatKeys = 0;
		for (const retreatStats of stats.retreatCaches.values()) {
			totalRetreatKeys += retreatStats.keys;
		}

		const totalKeys = stats.globalCache.keys + totalRetreatKeys;

		const memoryUsage = process.memoryUsage();
		const usedMB = memoryUsage.heapUsed / 1024 / 1024;
		const totalMB = memoryUsage.heapTotal / 1024 / 1024;
		const percentage = (usedMB / totalMB) * 100;

		// More lenient cleanup thresholds to prevent aggressive cache clearing
		const shouldCleanup =
			percentage > 90 || // Only cleanup if memory usage is very high
			totalKeys > 50000 || // Much higher key threshold
			stats.totalRetreatCaches > 500; // Much higher retreat cache threshold

		return {
			used: Math.round(usedMB),
			total: Math.round(totalMB),
			percentage: Math.round(percentage),
			totalRetreatCaches: stats.totalRetreatCaches,
			shouldCleanup,
		};
	}

	public async performCleanupIfNeeded(): Promise<boolean> {
		const memoryCheck = await this.checkMemoryUsage();

		if (memoryCheck.shouldCleanup) {
			console.log('🧹 Performing cache cleanup due to high memory usage');
			this.clearAllCaches();
			return true;
		}

		return false;
	}

	// Additional cleanup method for removing inactive retreat caches
	public cleanupInactiveRetreatCaches(maxInactiveTime: number = 3600000): number {
		// 1 hour default
		let cleanedCount = 0;

		for (const [retreatId, retreatCache] of this.retreatCaches.entries()) {
			const stats = retreatCache.getStats();
			// If cache has no keys, consider cleanup
			if (stats.keys === 0) {
				retreatCache.flushAll();
				this.retreatCaches.delete(retreatId);
				cleanedCount++;
				this.logCacheOperation('CLEANUP', 'retreatCache', retreatId, false);
			}
		}

		if (cleanedCount > 0) {
			console.log(`🧹 Cleaned up ${cleanedCount} inactive retreat caches`);
		}

		return cleanedCount;
	}

	/**
	 * Cleanup method for tests
	 */
	cleanup(): void {
		if (this.metricsInterval) {
			clearInterval(this.metricsInterval);
			this.metricsInterval = null;
		}
	}
}

export const performanceOptimizationService = PerformanceOptimizationService.getInstance();
