/**
 * Test App Helper
 *
 * Creates an Express app configured for testing without starting a server.
 * Tests use supertest to make HTTP requests to this app.
 */

import express from 'express';
import { TypeormStore } from 'connect-typeorm';
import session from 'express-session';
import cors from 'cors';
import passport from 'passport';

import { AppDataSource } from '../../data-source';
import { Session } from '../../entities/session.entity';
import mainRouter from '../../routes';
import tableMesaRoutes from '../../routes/tableMesaRoutes';
import { passport as passportConfig } from '../../services/authService';
import { csrfMiddleware } from '../../middleware/csrfAlternative';
import { errorHandler } from '../../middleware/errorHandler';
import { PerformanceMiddleware, PerformanceRequest } from '../../middleware/performanceMiddleware';
import { performanceOptimizationService } from '../../services/performanceOptimizationService';

export async function createTestApp(): Promise<express.Application> {
	const app = express();

	// Basic middleware
	app.use(
		cors({
			origin: '*',
			credentials: true,
		}),
	);
	app.use(express.json({ limit: '2mb' }));

	// Session middleware
	if (AppDataSource.isInitialized) {
		const sessionRepository = AppDataSource.getRepository(Session);
		app.use(
			session({
				store: new TypeormStore({
					cleanupLimit: 2,
					limitSubquery: false,
					ttl: 86400,
				}).connect(sessionRepository),
				secret: 'test-session-secret',
				resave: false,
				saveUninitialized: false,
				cookie: {
					httpOnly: true,
					secure: false,
					sameSite: 'lax',
					maxAge: 24 * 60 * 60 * 1000,
				},
			}),
		);
		app.use(passport.initialize());
		app.use(passport.session());
	}

	// CSRF middleware (disabled for tests - tokens will be mocked)
	app.use((req: any, res: any, next) => {
		(req.session ??= {}).csrfToken = 'test-csrf-token';
		next();
	});

	// Performance middleware (simplified for tests)
	app.use((req: any, res: any, next) =>
		PerformanceMiddleware.trackPerformance(req as PerformanceRequest, res, next),
	);

	// Routes
	app.use('/api', mainRouter);
	app.use('/api/tables', tableMesaRoutes);

	// Health check for tests
	app.get('/health', (_req, res) => {
		res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'emaus-api-test' });
	});

	// Error handler
	app.use(errorHandler);

	return app;
}

/**
 * Cleanup test app resources
 */
export async function cleanupTestApp(): Promise<void> {
	try {
		performanceOptimizationService.cleanup();
	} catch (error) {
		// Ignore cleanup errors
	}
}
