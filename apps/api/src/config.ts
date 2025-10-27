import 'dotenv/config';
import crypto from 'crypto';

// Debug environment loading
console.log('[CONFIG] NODE_ENV:', process.env.NODE_ENV);
console.log('[CONFIG] FRONTEND_URL from env:', process.env.FRONTEND_URL);

export const config = {
	google: {
		clientId: process.env.GOOGLE_CLIENT_ID || '',
		clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
		callbackUrl: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
	},
	session: {
		secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex'),
	},
	frontend: {
		url: process.env.FRONTEND_URL || 'http://localhost:5173',
	},
	migrations: {
		autoRun: process.env.MIGRATIONS_AUTO_RUN === 'true',
		warnOnly: process.env.MIGRATIONS_WARN_ONLY === 'true',
		dryRun: process.env.MIGRATIONS_DRY_RUN === 'true',
		logLevel: process.env.MIGRATIONS_LOG_LEVEL || 'info',
		maxPendingMigrations: parseInt(process.env.MIGRATIONS_MAX_PENDING || '10'),
		ignoreMissingMigrationsTable: process.env.MIGRATIONS_IGNORE_MISSING_TABLE === 'true',
		seed: {
			autoRun: process.env.SEED_AUTO_RUN === 'true',
			dryRun: process.env.SEED_DRY_RUN === 'true',
			force: process.env.SEED_FORCE === 'true',
			masterUserEmail: process.env.SEED_MASTER_USER_EMAIL || 'admin@example.com',
			masterUserName: process.env.SEED_MASTER_USER_NAME || 'Administrator',
			masterUserPassword: process.env.SEED_MASTER_USER_PASSWORD || 'password',
			},
	},
};
