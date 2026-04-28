import 'reflect-metadata';
import express from 'express';
import 'express-async-errors';
import cors from 'cors';
import session from 'express-session';
import helmet from 'helmet';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { TypeormStore } from 'connect-typeorm';

import { initRealtime, emitScheduleUpcoming } from './realtime';
import { retreatScheduleService } from './services/retreatScheduleService';
import { createDefaultScheduleTemplate } from './data/scheduleTemplateSeeder';
import { seedResponsabilityAttachmentsFromDescriptions } from './data/responsabilityAttachmentSeeder';

import { AppDataSource } from './data-source';
import { Session } from './entities/session.entity';
import mainRouter from './routes';
import { passport } from './services/authService';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { MigrationVerifier } from './database/migration-verifier';
import { roleCleanupService } from './services/roleCleanupService';
import { passwordResetCleanupService } from './services/passwordResetCleanupService';
import { PerformanceMiddleware, PerformanceRequest } from './middleware/performanceMiddleware';
import { performanceOptimizationService } from './services/performanceOptimizationService';
import { csrfMiddleware } from './middleware/csrfAlternative';
import { apiLimiter } from './middleware/rateLimiting';

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
			origin: (origin, callback) => {
				// In production, block requests with no Origin header to prevent
				// server-side scripts from making cross-origin requests with cookies.
				// In development, allow for curl/Postman convenience.
				if (!origin) {
					if (isDevelopment) return callback(null, true);
					return callback(null, false);
				}
				// Allow configured frontend URL and localhost
				const allowed = [frontendUrl, 'http://localhost:5173', 'http://localhost:3001'];
				if (allowed.includes(origin)) {
					return callback(null, origin);
				}
				// Allow ngrok tunnels in development only
				if (isDevelopment && (origin.endsWith('.ngrok-free.dev') || origin.endsWith('.ngrok.io'))) {
					return callback(null, origin);
				}
				// Allow SSH tunnel in development only (emaus.cc domain)
				if (isDevelopment && origin.startsWith('http://emaus.cc:')) {
					return callback(null, origin);
				}
				console.warn(`[CORS] Blocked origin: ${origin}`);
				callback(new Error('Not allowed by CORS'));
			},
			credentials: true,
		}),
	);
	app.use(
		helmet({
			contentSecurityPolicy: {
				directives: {
					defaultSrc: ["'self'"],
					styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
					scriptSrc: [
						"'self'",
						'https://maps.googleapis.com',
						'https://www.google.com', // reCAPTCHA
						'https://www.gstatic.com', // reCAPTCHA
						// REMOVED: "'unsafe-eval'" - not needed for modern Google Maps
					],
					imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
					fontSrc: ["'self'", 'https:', 'data:'],
					connectSrc,
					objectSrc: ["'none'"],
					frameSrc: ['https://www.google.com'], // reCAPTCHA
				},
			},
			crossOriginEmbedderPolicy: false,
			referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
		}),
	);
	app.use(express.json({ limit: '2mb' }));

	// --- 3. Session and Auth Middleware (AFTER DB connection) ---
	const sessionRepository = AppDataSource.getRepository(Session);
	const sessionMiddleware = session({
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
			secure: config.env === 'production', // Always secure in production
			sameSite: 'strict', // Strongest CSRF protection
			maxAge: 24 * 60 * 60 * 1000, // 24 hours
			domain: config.env === 'production' ? config.session.cookieDomain : undefined,
			path: '/',
		},
		name: 'emaus.sid', // Custom session name
		proxy: config.env === 'production', // Trust proxy in production
	});
	app.use(sessionMiddleware);
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

	// Apply global API rate limiter (covers csrf-token and all /api routes)
	app.use('/api', apiLimiter);

	app.get('/api/csrf-token', (req, res) => {
		res.json({ csrfToken: req.session.csrfToken });
	});

	app.use('/api', mainRouter);

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
	passwordResetCleanupService.startScheduledTasks();
	await performanceOptimizationService.optimizeHeavyQueries();

	// Ensure minuto-a-minuto default templates exist (idempotent by name).
	try {
		await createDefaultScheduleTemplate();
	} catch (err) {
		console.warn('[scheduleTemplateSeeder] bootstrap error', err);
	}

	// Importa los guiones de las charlas/roles (description → markdown attachment).
	// Idempotente: solo crea si no existe ya un attachment para ese nombre.
	try {
		const r = await seedResponsabilityAttachmentsFromDescriptions();
		if (r.created > 0) {
			console.log(
				`[responsabilityAttachmentSeeder] ${r.created} guion(es) importados, ${r.skipped} ya existentes`,
			);
		}
	} catch (err) {
		console.warn('[responsabilityAttachmentSeeder] bootstrap error', err);
	}

	// --- 8. Start Server ---
	const httpServer = http.createServer(app);
	initRealtime(httpServer, sessionMiddleware);
	httpServer.listen(port, () => {
		console.log(`✅ Server is running on http://localhost:${port}`);
	});

	// Minuto-a-minuto "upcoming" broadcaster: every 60s, look for items
	// scheduled to start within the next 10 minutes and notify responsables.
	const ONE_MINUTE = 60_000;
	const alreadyNotified = new Map<string, Set<number>>();
	const upcomingTimer = setInterval(async () => {
		try {
			const upcoming = await retreatScheduleService.listUpcoming(10);
			for (const item of upcoming) {
				const minutesUntil = Math.max(
					0,
					Math.round((item.startTime.getTime() - Date.now()) / 60000),
				);
				// Fire once per threshold (10, 5, 0) per item
				const threshold =
					minutesUntil <= 0 ? 0 : minutesUntil <= 5 ? 5 : minutesUntil <= 10 ? 10 : null;
				if (threshold === null) continue;
				const seen = alreadyNotified.get(item.id) ?? new Set<number>();
				if (seen.has(threshold)) continue;
				seen.add(threshold);
				alreadyNotified.set(item.id, seen);
				emitScheduleUpcoming({
					retreatId: item.retreatId,
					itemId: item.id,
					name: item.name,
					startTime: item.startTime.toISOString(),
					minutesUntil,
					targetParticipantIds: item.targetParticipantIds,
				});
			}
			// Evict entries older than 30 minutes to keep the map bounded
			if (alreadyNotified.size > 5000) alreadyNotified.clear();
		} catch (err) {
			console.warn('[schedule:upcoming] tick error', err);
		}
	}, ONE_MINUTE);

	// Graceful shutdown: close :3001 before exiting so PM2's next child can
	// bind it. Without this, PM2 SIGINT-then-SIGKILLs the old process while
	// httpServer keeps the port LISTEN; the next child crashes with EADDRINUSE
	// in a loop until manual intervention. See LIGHTSAIL_MIGRATION_NOTES.md §17.
	let shuttingDown = false;
	const gracefulShutdown = (signal: string) => {
		if (shuttingDown) return;
		shuttingDown = true;
		console.log(`📥 ${signal} received — shutting down`);
		clearInterval(upcomingTimer);

		// Watchdog: if close() hangs (eg. open WS connections), force-exit so
		// PM2 can rebind. 8s leaves headroom under PM2's kill_timeout=10000.
		const forceExit = setTimeout(() => {
			console.warn('⚠ shutdown timed out (8s), forcing exit');
			process.exit(1);
		}, 8000);
		forceExit.unref();

		httpServer.close((err) => {
			if (err) console.error('httpServer.close error:', err);
			AppDataSource.destroy()
				.catch((e) => console.error('AppDataSource.destroy error:', e))
				.finally(() => {
					console.log('✓ Shutdown complete');
					process.exit(0);
				});
		});
	};
	process.on('SIGINT', () => gracefulShutdown('SIGINT'));
	process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

main().catch((err) => {
	console.error('💥 CRITICAL ERROR during application startup:', err);
	process.exit(1);
});
