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
	private permissionCache: NodeCache;
	private userRetreatCache: NodeCache;
	private retreatCache: NodeCache;
	private metrics: PerformanceMetrics;

	private constructor() {
		const cacheConfig: CacheConfig = {
			ttl: 300, // 5 minutes
			checkperiod: 60, // 1 minute
			useClones: false,
		};

		this.permissionCache = new NodeCache(cacheConfig);
		this.userRetreatCache = new NodeCache(cacheConfig);
		this.retreatCache = new NodeCache(cacheConfig);

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

	// Permission caching with retreat-scoped keys
	public async getCachedPermissions(userId: string, retreatId: string): Promise<string[] | null> {
		const cacheKey = `permissions:${userId}:${retreatId}`;
		const cached = this.permissionCache.get<string[]>(cacheKey);

		if (cached) {
			this.recordCacheHit();
			return cached;
		}

		this.recordCacheMiss();
		return null;
	}

	public async setCachedPermissions(
		userId: string,
		retreatId: string,
		permissions: string[],
		ttl: number = 300,
	): Promise<void> {
		const cacheKey = `permissions:${userId}:${retreatId}`;
		this.permissionCache.set(cacheKey, permissions, ttl);
	}

	public invalidatePermissionCache(userId: string, retreatId: string): void {
		const cacheKey = `permissions:${userId}:${retreatId}`;
		this.permissionCache.del(cacheKey);
	}

	public invalidateUserPermissionCache(userId: string): void {
		const keys = this.permissionCache
			.keys()
			.filter((key) => key.startsWith(`permissions:${userId}:`));
		this.permissionCache.del(keys);
	}

	public invalidateRetreatPermissionCache(retreatId: string): void {
		const keys = this.permissionCache.keys().filter((key) => key.endsWith(`:${retreatId}`));
		this.permissionCache.del(keys);
	}

	// User retreat caching
	public async getCachedUserRetreats(
		userId: string,
	): Promise<Array<{ retreatId: string; role: string; status: string }> | null> {
		const cacheKey = `user_retreats:${userId}`;
		const cached =
			this.userRetreatCache.get<Array<{ retreatId: string; role: string; status: string }>>(
				cacheKey,
			);

		if (cached) {
			this.recordCacheHit();
			return cached;
		}

		this.recordCacheMiss();
		return null;
	}

	public async setCachedUserRetreats(
		userId: string,
		userRetreats: Array<{ retreatId: string; role: string; status: string }>,
		ttl: number = 300,
	): Promise<void> {
		const cacheKey = `user_retreats:${userId}`;
		this.userRetreatCache.set(cacheKey, userRetreats, ttl);
	}

	public invalidateUserRetreatCache(userId: string): void {
		const cacheKey = `user_retreats:${userId}`;
		this.userRetreatCache.del(cacheKey);
	}

	// Retreat information caching
	public async getCachedRetreat(retreatId: string): Promise<Retreat | null> {
		const cacheKey = `retreat:${retreatId}`;
		const cached = this.retreatCache.get<Retreat>(cacheKey);

		if (cached) {
			this.recordCacheHit();
			return cached;
		}

		this.recordCacheMiss();
		return null;
	}

	public async setCachedRetreat(
		retreatId: string,
		retreat: Retreat,
		ttl: number = 300,
	): Promise<void> {
		const cacheKey = `retreat:${retreatId}`;
		this.retreatCache.set(cacheKey, retreat, ttl);
	}

	public invalidateRetreatCache(retreatId: string): void {
		const cacheKey = `retreat:${retreatId}`;
		this.retreatCache.del(cacheKey);
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

	// Retreat user management optimization
	public async getRetreatUserCount(retreatId: string): Promise<number> {
		const cacheKey = `retreat_user_count:${retreatId}`;
		const cached = this.userRetreatCache.get<number>(cacheKey);

		if (cached !== undefined) {
			this.recordCacheHit();
			return cached;
		}

		this.recordCacheMiss();

		const result = await AppDataSource.query(
			`
			SELECT COUNT(*) as count
			FROM user_retreats
			WHERE retreat_id = ? AND status = 'active'
		`,
			[retreatId],
		);

		const count = result[0].count;
		this.userRetreatCache.set(cacheKey, count, 60); // Cache for 1 minute

		return count;
	}

	public async getRetreatUsersByRole(retreatId: string, role: string): Promise<string[]> {
		const cacheKey = `retreat_users_by_role:${retreatId}:${role}`;
		const cached = this.userRetreatCache.get<string[]>(cacheKey);

		if (cached) {
			this.recordCacheHit();
			return cached;
		}

		this.recordCacheMiss();

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
		this.userRetreatCache.set(cacheKey, userIds, 120); // Cache for 2 minutes

		return userIds;
	}

	// Query optimization helpers
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
		const cached = this.userRetreatCache.get<any[]>(cacheKey);

		if (cached) {
			this.recordCacheHit();
			return cached;
		}

		this.recordCacheMiss();

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

		this.userRetreatCache.set(cacheKey, result, 180); // Cache for 3 minutes
		return result;
	}

	// Cache management
	public clearAllCaches(): void {
		this.permissionCache.flushAll();
		this.userRetreatCache.flushAll();
		this.retreatCache.flushAll();
	}

	public getCacheStats(): {
		permissionCache: any;
		userRetreatCache: any;
		retreatCache: any;
		metrics: PerformanceMetrics;
	} {
		return {
			permissionCache: this.permissionCache.getStats(),
			userRetreatCache: this.userRetreatCache.getStats(),
			retreatCache: this.retreatCache.getStats(),
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
		setInterval(() => {
			this.logMetrics();
		}, 300000); // Every 5 minutes
	}

	private logMetrics(): void {
		const stats = this.getCacheStats();
		console.log('📊 Performance Metrics:', {
			cacheHitRate: `${(this.metrics.cacheHitRate * 100).toFixed(2)}%`,
			totalQueries: this.metrics.totalQueries,
			permissionCacheKeys: stats.permissionCache.keys,
			userRetreatCacheKeys: stats.userRetreatCache.keys,
			retreatCacheKeys: stats.retreatCache.keys,
		});
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
	}> {
		const stats = this.getCacheStats();
		const totalKeys =
			stats.permissionCache.keys + stats.userRetreatCache.keys + stats.retreatCache.keys;

		const memoryUsage = process.memoryUsage();
		const usedMB = memoryUsage.heapUsed / 1024 / 1024;
		const totalMB = memoryUsage.heapTotal / 1024 / 1024;
		const percentage = (usedMB / totalMB) * 100;

		return {
			used: Math.round(usedMB),
			total: Math.round(totalMB),
			percentage: Math.round(percentage),
			shouldCleanup: percentage > 80 || totalKeys > 10000,
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
}

export const performanceOptimizationService = PerformanceOptimizationService.getInstance();
