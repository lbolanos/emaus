import 'reflect-metadata';
import './types/session';
import express from 'express';
import 'express-async-errors';
import cors from 'cors';
import session from 'express-session';
import helmet from 'helmet';
import { AppDataSource } from './data-source';
export { AppDataSource } from './data-source';
import mainRouter from './routes';
import { passport } from './services/authService';
import tableMesaRoutes from './routes/tableMesaRoutes';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { MigrationVerifier } from './database/migration-verifier';
import { roleCleanupService } from './services/roleCleanupService';
import { PerformanceMiddleware } from './middleware/performanceMiddleware';
import { performanceOptimizationService } from './services/performanceOptimizationService';
import { csrfMiddleware } from './middleware/csrfAlternative';
import './entities/participantCommunication.entity';

const app = express();
const port = process.env.PORT || 3001;

app.use(
	cors({
		origin: config.frontend.url,
		credentials: true,
	}),
);
// Headers de seguridad con Helmet
app.use(
	helmet({
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				styleSrc: ["'self'", "'unsafe-inline'"],
				scriptSrc: ["'self'"],
				imgSrc: ["'self'", 'data:', 'https:'],
				fontSrc: ["'self'", 'https:'],
				connectSrc: ["'self'", 'https://*.googleapis.com', 'https://*.gstatic.com'],
			},
		},
		crossOriginEmbedderPolicy: false,
	}),
);

app.use(express.json({ limit: '2mb' }));

app.use(
	session({
		secret: config.session.secret,
		resave: false,
		saveUninitialized: false,
		cookie: {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
			maxAge: 24 * 60 * 60 * 1000, // 24 hours
		},
	}),
);

app.use(passport.initialize());
app.use(passport.session());

// Add performance optimization middleware
app.use((req, res, next) => PerformanceMiddleware.trackPerformance(req as any, res, next));
app.use((req, res, next) => PerformanceMiddleware.optimizePermissionCheck(req as any, res, next));
app.use((req, res, next) => PerformanceMiddleware.optimizeRetreatUserQuery(req as any, res, next));
app.use((req, res, next) => PerformanceMiddleware.invalidateCacheOnChanges(req as any, res, next));
app.use((req, res, next) => PerformanceMiddleware.monitorMemory(req as any, res, next));
app.use((req, res, next) => PerformanceMiddleware.optimizeDatabaseQueries(req as any, res, next));

// Generar token CSRF para todas las peticiones
app.use(csrfMiddleware.generateToken);

// Health check endpoint
app.get('/health', (req, res) => {
	res.json({
		status: 'ok',
		timestamp: new Date().toISOString(),
		service: 'emaus-api'
	});
});

// Ruta para obtener token CSRF
app.get('/api/csrf-token', (req, res) => {
	console.log('DEBUG: Generating CSRF token for path:', req.path);
	res.json({ csrfToken: req.session.csrfToken });
});

// Development-only cache monitoring endpoint
if (process.env.NODE_ENV === 'development') {
	app.get('/api/dev/cache-stats', (req, res) => {
		const stats = performanceOptimizationService.getCacheStats();
		const health = performanceOptimizationService.getCacheHealth();

		res.json({
			stats,
			health,
			timestamp: new Date().toISOString(),
		});
	});

	app.post('/api/dev/cache-debug', async (req, res) => {
		const { cacheType, key } = req.body;

		if (!cacheType || !key) {
			return res.status(400).json({ error: 'cacheType and key are required' });
		}

		const debugInfo = await performanceOptimizationService.debugCacheEntry(cacheType, key);
		res.json(debugInfo);
	});

	app.post('/api/dev/cache-clear', (req, res) => {
		const { cacheType } = req.body;

		if (cacheType) {
			// Clear specific cache type
			switch (cacheType) {
				case 'permission':
					performanceOptimizationService.clearAllCaches();
					break;
				case 'userRetreat':
					performanceOptimizationService.clearAllCaches();
					break;
				case 'retreat':
					performanceOptimizationService.clearAllCaches();
					break;
				default:
					return res.status(400).json({ error: 'Invalid cache type' });
			}
		} else {
			// Clear all caches
			performanceOptimizationService.clearAllCaches();
		}

		res.json({ message: 'Cache cleared successfully' });
	});

	app.get('/api/dev/cache-debug', async (req, res) => {
		const { userId, retreatId } = req.query;

		if (!userId) {
			return res.status(400).json({ error: 'userId is required' });
		}

		try {
			const userPermissionsResult = await performanceOptimizationService.getCachedUserPermissionsResult(userId as string);
			const userRetreats = await performanceOptimizationService.getCachedUserRetreats(userId as string);

			let retreatAccess = null;
			let retreatPermissions = null;

			if (retreatId) {
				retreatAccess = await performanceOptimizationService.getCachedRetreatAccess(userId as string, retreatId as string);
				retreatPermissions = await performanceOptimizationService.getCachedPermissions(userId as string, retreatId as string);
			}

			res.json({
				userId,
				retreatId,
				userPermissionsResult,
				userRetreats,
				retreatAccess,
				retreatPermissions,
				cacheStats: performanceOptimizationService.getCacheStats(),
				cacheHealth: performanceOptimizationService.getCacheHealth(),
			});
		} catch (error) {
			console.error('Cache debug error:', error);
			res.status(500).json({
				error: 'Failed to debug cache',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	});
}

app.use('/api', mainRouter);
app.use('/api/tables', tableMesaRoutes);

app.use(errorHandler);

AppDataSource.initialize()
	.then(async () => {
		console.log('Data Source has been initialized!');

		// Verify migrations
		const verifier = new MigrationVerifier(AppDataSource, {
			...config.migrations,
			logLevel: (config.migrations.logLevel as any) || 'info',
		});

		const result = await verifier.verify();
		verifier.logResult(result);

		// Stop application if migration verification failed and not in warn-only mode
		if (!result.success && !config.migrations.warnOnly) {
			console.error(
				'❌ Migration verification failed. Please run migrations manually or fix the issues.',
			);
			process.exit(1);
		}

		// Start role cleanup service
		roleCleanupService.startScheduledTasks();
		console.log('🧹 Role cleanup service started');

		// Initialize performance optimization
		await performanceOptimizationService.optimizeHeavyQueries();
		console.log('⚡ Performance optimization initialized');

		app.listen(port, () => {
			console.log(`Server is running on http://localhost:${port}`);
		});
	})
	.catch((err) => {
		console.error('Error during Data Source initialization:', err);
	});
