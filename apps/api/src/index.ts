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
import { PerformanceMiddleware } from './middleware/performanceMiddleware';
import { performanceOptimizationService } from './services/performanceOptimizationService';
import { csrfMiddleware } from './middleware/csrfAlternative';

// Extend express-session
declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
  }
}

async function main() {
  console.log('[INIT] Starting application...');
  const app = express();
  app.set('trust proxy', 1);
  const port = process.env.PORT || 3001;

  // --- 1. Initialize Database Connection ---
  console.log('[INIT] Step 1: Initializing Data Source...');
  await AppDataSource.initialize();
  console.log('[INIT] Step 1: Data Source has been initialized!');

  // --- 2. Basic Middleware ---
  console.log('[INIT] Step 2: Configuring basic middleware (CORS, Helmet, JSON)...');
  app.use(
    cors({
      origin: config.frontend.url,
      credentials: true,
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "https://maps.googleapis.com", "'unsafe-eval'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          fontSrc: ["'self'", 'https:'],
          connectSrc: ["'self'", "https://*.googleapis.com", "https://*.gstatic.com", "https://emaus.cc"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  console.log('[INIT] Step 2: Basic middleware configured.');

  // --- 3. Session and Auth Middleware (AFTER DB connection) ---
  console.log('[INIT] Step 3: Configuring session and auth middleware...');
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
  console.log('[INIT] Step 3: Session and auth middleware configured.');

  // --- 4. Performance, CSRF, and API Routes ---
  console.log('[INIT] Step 4: Configuring performance, CSRF, and API routes...');
  app.use(PerformanceMiddleware.trackPerformance);
  app.use(PerformanceMiddleware.optimizePermissionCheck);
  app.use(PerformanceMiddleware.optimizeRetreatUserQuery);
  app.use(PerformanceMiddleware.invalidateCacheOnChanges);
  app.use(PerformanceMiddleware.monitorMemory);
  app.use(PerformanceMiddleware.optimizeDatabaseQueries);
  app.use(csrfMiddleware.generateToken);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'emaus-api' });
  });
  app.get('/api/csrf-token', (req, res) => {
    res.json({ csrfToken: req.session.csrfToken });
  });
  app.use('/api', mainRouter);
  app.use('/api/tables', tableMesaRoutes);
  console.log('[INIT] Step 4: Routes configured.');

  // --- 5. Static File Serving for Frontend ---
  console.log('[INIT] Step 5: Configuring static file serving...');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const webAppPath = path.resolve(__dirname, '..', '..', '..', 'apps', 'web', 'dist');
  app.use(express.static(webAppPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(webAppPath, 'index.html'));
  });
  console.log('[INIT] Step 5: Static file serving configured.');

  // --- 6. Error Handler (must be last) ---
  console.log('[INIT] Step 6: Configuring error handler...');
  app.use(errorHandler);
  console.log('[INIT] Step 6: Error handler configured.');

  // --- 7. Post-Init Services ---
  console.log('[INIT] Step 7: Running post-initialization services...');
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
  console.log('🧹 Role cleanup service started');

  await performanceOptimizationService.optimizeHeavyQueries();
  console.log('⚡ Performance optimization initialized');
  console.log('[INIT] Step 7: Post-initialization services complete.');

  // --- 8. Start Server ---
  console.log('[INIT] Step 8: Starting server...');
  app.listen(port, () => {
    console.log(`✅ Server is running on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error('💥 CRITICAL ERROR during application startup:', err);
  process.exit(1);
});