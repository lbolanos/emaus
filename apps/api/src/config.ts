import 'dotenv/config';
import crypto from 'crypto';

// Fail fast if SESSION_SECRET is missing in production
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
	throw new Error('SESSION_SECRET environment variable is required in production');
}

export const config = {
	env: process.env.NODE_ENV || 'development',
	google: {
		clientId: process.env.GOOGLE_CLIENT_ID || '',
		clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
		callbackUrl: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
	},
	session: {
		secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex'),
		cookieDomain: process.env.COOKIE_DOMAIN,
	},
	frontend: {
		url: process.env.FRONTEND_URL || 'http://localhost:5173',
	},
	ai: {
		provider: process.env.AI_PROVIDER || 'google',
		model: process.env.AI_MODEL || 'gemini-2.0-flash',
		// Vision model
		visionProvider: process.env.AI_VISION_PROVIDER || 'google',
		visionModel: process.env.AI_VISION_MODEL || 'gemini-2.0-flash',
		maxTokens: parseInt(process.env.AI_CHAT_MAX_TOKENS || '1024'),
		// Provider API keys (set the one matching AI_PROVIDER)
		googleApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
		anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
		anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || '',
		openaiApiKey: process.env.OPENAI_API_KEY || '',
		openaiBaseUrl: process.env.OPENAI_BASE_URL || '',
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
