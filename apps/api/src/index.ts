import 'reflect-metadata';
import express from 'express';
import 'express-async-errors';
import cors from 'cors';
import session from 'express-session';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { TypeormStore } from 'connect-typeorm';

import { AppDataSource } from './data-source';
import { Session } from './entities/session.entity';
import mainRouter from './routes';
import { passport } from './services/authService';
import tableMesaRoutes from './routes/tableMesaRoutes';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { MigrationVerifier } from './database/migration-verifier';
import { roleCleanupService } from './services/roleCleanupService';
import { PerformanceMiddleware, PerformanceRequest } from './middleware/performanceMiddleware';
import { performanceOptimizationService } from './services/performanceOptimizationService';
import { csrfMiddleware } from './middleware/csrfAlternative';

// Extend express-session
declare module 'express-session' {
	interface SessionData {
		csrfToken?: string;
	}
}

async function main() {
	const app = express();
	app.set('trust proxy', 1);
	const port = process.env.PORT || 3001;

	// --- 1. Initialize Database Connection ---
	await AppDataSource.initialize();

	// --- 2. Basic Middleware ---

	// Dynamic CSP based on environment - get frontend URL from .env
	const frontendUrl = config.frontend.url;
	const isDevelopment = frontendUrl.includes('localhost');

	// Build connect-src array dynamically
	const connectSrc = [
		"'self'",
		'https://*.googleapis.com',
		'https://*.gstatic.com',
		// Always include the frontend URL from environment
		frontendUrl,
	];

	// Add localhost URLs for development
	if (isDevelopment) {
		connectSrc.push('http://localhost:5173', 'http://localhost:3001');
	}

	app.use(
		cors({
			origin: frontendUrl,
			credentials: true,
		}),
	);
	app.use(
		helmet({
			contentSecurityPolicy: {
				directives: {
					defaultSrc: ["'self'"],
					styleSrc: ["'self'", "'unsafe-inline'"],
					scriptSrc: ["'self'", 'https://maps.googleapis.com', "'unsafe-eval'"],
					imgSrc: ["'self'", 'data:', 'https:'],
					fontSrc: ["'self'", 'https:'],
					connectSrc,
				},
			},
			crossOriginEmbedderPolicy: false,
		}),
	);
	app.use(express.json({ limit: '2mb' }));

	// --- 3. Session and Auth Middleware (AFTER DB connection) ---
	const sessionRepository = AppDataSource.getRepository(Session);
	app.use(
		session({
			store: new TypeormStore({
				cleanupLimit: 2,
				limitSubquery: false,
				ttl: 86400, // 1 day
			}).connect(sessionRepository),
			secret: config.session.secret,
			resave: false,
			saveUninitialized: false,
			cookie: {
				httpOnly: true,
				secure: process.env.SECURE_COOKIE === 'true',
				sameSite: process.env.SECURE_COOKIE === 'true' ? 'none' : 'lax',
				maxAge: 24 * 60 * 60 * 1000, // 24 hours
			},
		}),
	);
	app.use(passport.initialize());
	app.use(passport.session());

	// --- 4. Performance, CSRF, and API Routes ---
	app.use((req, res, next) =>
		PerformanceMiddleware.trackPerformance(req as PerformanceRequest, res, next),
	);
	app.use((req, res, next) =>
		PerformanceMiddleware.optimizePermissionCheck(req as PerformanceRequest, res, next),
	);
	app.use((req, res, next) =>
		PerformanceMiddleware.optimizeRetreatUserQuery(req as PerformanceRequest, res, next),
	);
	app.use((req, res, next) =>
		PerformanceMiddleware.invalidateCacheOnChanges(req as PerformanceRequest, res, next),
	);
	app.use((req, res, next) =>
		PerformanceMiddleware.monitorMemory(req as PerformanceRequest, res, next),
	);
	app.use((req, res, next) =>
		PerformanceMiddleware.optimizeDatabaseQueries(req as PerformanceRequest, res, next),
	);
	app.use((req, res, next) => csrfMiddleware.generateToken(req as PerformanceRequest, res, next));

	app.get('/health', (_req, res) => {
		res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'emaus-api' });
	});
	app.get('/api/csrf-token', (req, res) => {
		res.json({ csrfToken: req.session.csrfToken });
	});
	app.use('/api', mainRouter);
	app.use('/api/tables', tableMesaRoutes);

	// --- 5. Static File Serving for Frontend ---
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	const webAppPath = path.resolve(__dirname, '..', '..', '..', 'apps', 'web', 'dist');
	app.use(express.static(webAppPath));
	app.get('*', (_req, res) => {
		res.sendFile(path.join(webAppPath, 'index.html'));
	});

	// --- 6. Error Handler (must be last) ---
	app.use(errorHandler);

	// --- 7. Post-Init Services ---
	const verifier = new MigrationVerifier(AppDataSource, {
		...config.migrations,
		logLevel: (config.migrations.logLevel as any) || 'info',
	});
	const result = await verifier.verify();
	verifier.logResult(result);

	if (!result.success && !config.migrations.warnOnly) {
		console.error('❌ Migration verification failed. Shutting down.');
		process.exit(1);
	}

	roleCleanupService.startScheduledTasks();
	await performanceOptimizationService.optimizeHeavyQueries();

	// --- 8. Start Server ---
	app.listen(port, () => {
		console.log(`✅ Server is running on http://localhost:${port}`);
	});
}

main().catch((err) => {
	console.error('💥 CRITICAL ERROR during application startup:', err);
	process.exit(1);
});
