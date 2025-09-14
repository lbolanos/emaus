import 'reflect-metadata';
import express from 'express';
import 'express-async-errors';
import cors from 'cors';
import session from 'express-session';
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

const app = express();
const port = process.env.PORT || 3001;

app.use(
	cors({
		origin: config.frontend.url,
		credentials: true,
	}),
);
app.use(express.json());

app.use(
	session({
		secret: config.session.secret,
		resave: false,
		saveUninitialized: false,
		cookie: {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
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
