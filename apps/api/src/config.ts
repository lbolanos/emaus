import 'dotenv/config';
import crypto from 'crypto';

// Fail fast if SESSION_SECRET is missing in production
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
	throw new Error('SESSION_SECRET environment variable is required in production');
}

/**
 * Parsea un ENV de "días" con fallback y clamp. Un valor inválido (NaN, vacío,
 * "30d"), cero o negativo NO debe degradar silenciosamente la expiración de la
 * sesión: cae al default. Se acota a `max` para evitar sesiones absurdamente
 * largas por un typo.
 */
export function parseDaysEnv(raw: string | undefined, fallback: number, max = 365): number {
	const parsed = parseInt(raw ?? '', 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, max);
}

/**
 * Parsea AUDIT_LOG_RETENTION_DAYS a un número de días para la purga de las
 * tablas de auditoría. winston-daily-rotate-file (config.audit.retentionDays)
 * consume el valor crudo con sus propios sufijos; la purga de la DB necesita
 * días numéricos y antes usaba `parseInt`, que lee '1y' como 1 DÍA (89 menos
 * que el NDJSON). Acepta los sufijos de winston que representan >= un día —
 * 'd'/'D' días, 'w'/'W' semanas, 'M' meses (30d), 'y'/'Y' años (365d) — y
 * número pelado = días. Cualquier otra cosa (vacío, 'm' de minutos, texto)
 * cae al default: la retención nunca debe degradar a 0/NaN.
 */
export function parseRetentionDaysEnv(raw: string | undefined, fallback = 90): number {
	const match = /^(\d+)\s*([dDwWyY]|M)?$/.exec((raw ?? '').trim());
	if (!match) return fallback;
	const value = parseInt(match[1], 10);
	if (!Number.isFinite(value) || value <= 0) return fallback;
	const multipliers: Record<string, number> = { d: 1, w: 7, M: 30, y: 365 };
	// 'M' mayúscula es meses en winston; el resto se normaliza a minúsculas
	// ('D'/'W'/'Y' son días/semanas/años, no meses).
	const unit = match[2] === 'M' ? 'M' : (match[2] ?? 'd').toLowerCase();
	return value * (multipliers[unit] ?? 1);
}

// Fail fast if seeding is enabled in production without explicit master-user credentials
if (
	process.env.NODE_ENV === 'production' &&
	process.env.SEED_AUTO_RUN === 'true' &&
	(!process.env.SEED_MASTER_USER_EMAIL || !process.env.SEED_MASTER_USER_PASSWORD)
) {
	throw new Error(
		'SEED_MASTER_USER_EMAIL and SEED_MASTER_USER_PASSWORD are required when SEED_AUTO_RUN=true in production',
	);
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
		// Ventana de inactividad en días (rolling): la sesión expira si no hay
		// actividad en este lapso. Se renueva en cada request. Configurable.
		maxAgeDays: parseDaysEnv(process.env.SESSION_MAX_AGE_DAYS, 30, 365),
		// Techo absoluto en días desde el LOGIN, sin importar la actividad. Acota
		// el valor de una cookie robada (con rolling una sesión activa nunca
		// caducaría). Default 90 días.
		absoluteMaxAgeDays: parseDaysEnv(process.env.SESSION_ABSOLUTE_MAX_AGE_DAYS, 90, 365),
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
		// 4096 default — suficiente para respuestas largas del chat. Los modelos
		// "thinking" (gemini-3-pro-preview, gemini-3.5-flash) consumen muchos tokens
		// en razonamiento interno; si el stream se corta con finishReason=length
		// sube AI_CHAT_MAX_TOKENS a 8192 o 16384.
		maxTokens: parseInt(process.env.AI_CHAT_MAX_TOKENS || '4096', 10),
		// Provider API keys (set the one matching AI_PROVIDER)
		googleApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
		anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
		anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || '',
		openaiApiKey: process.env.OPENAI_API_KEY || '',
		openaiBaseUrl: process.env.OPENAI_BASE_URL || '',
	},
	audit: {
		// Sinks de la auditoría de dominio. Ambos activos por defecto; se pueden
		// apagar con AUDIT_DB_ENABLED=false / AUDIT_FILE_ENABLED=false.
		dbEnabled: process.env.AUDIT_DB_ENABLED !== 'false',
		fileEnabled: process.env.AUDIT_FILE_ENABLED !== 'false',
		// Directorio de los NDJSON. Default: prod → /var/log/emaus, dev → apps/api/logs.
		logDir:
			process.env.AUDIT_LOG_DIR ||
			(process.env.NODE_ENV === 'production' ? '/var/log/emaus' : 'logs'),
		// Retención y tamaño de rotación (winston-daily-rotate-file).
		retentionDays: process.env.AUDIT_LOG_RETENTION_DAYS || '90d',
		maxSize: process.env.AUDIT_LOG_MAX_SIZE || '20m',
		// Retención numérica (días) de las tablas de auditoría en la DB
		// (audit_logs, domain_audit_log, community_audit_log) — antes crecían
		// sin límite. Mismo default que el NDJSON de arriba, mismo env var.
		// OJO: el valor crudo ('90d', '1y'...) lo consume winston arriba tal
		// cual; aquí se parsea con los mismos sufijos a días — ver
		// parseRetentionDaysEnv.
		dbRetentionDays: parseRetentionDaysEnv(process.env.AUDIT_LOG_RETENTION_DAYS, 90),
	},
	migrations: {
		autoRun: process.env.MIGRATIONS_AUTO_RUN === 'true',
		warnOnly: process.env.MIGRATIONS_WARN_ONLY === 'true',
		dryRun: process.env.MIGRATIONS_DRY_RUN === 'true',
		logLevel: process.env.MIGRATIONS_LOG_LEVEL || 'info',
		maxPendingMigrations: parseInt(process.env.MIGRATIONS_MAX_PENDING || '10', 10),
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
