import path from 'node:path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../config';

/**
 * Logger de auditoría a ARCHIVO (NDJSON, una línea JSON por evento) para análisis
 * posterior con jq/scripts/ELK. Es el segundo sink del `domainAuditService` (el primero
 * es la tabla `domain_audit_log`).
 *
 * - Formato: JSON (NDJSON) con timestamp.
 * - Rotación diaria + retención y tamaño configurables (winston-daily-rotate-file).
 * - Dir: dev → apps/api/logs, prod → /var/log/emaus (coincide con pm2). Configurable
 *   vía AUDIT_LOG_DIR.
 * - En tests (`NODE_ENV==='test'`) se queda en `silent` para no abrir file handles ni
 *   timers (Jest corre con --detectOpenHandles --forceExit).
 */
const dir = path.isAbsolute(config.audit.logDir)
	? config.audit.logDir
	: path.resolve(process.cwd(), config.audit.logDir);

export const auditLogger = winston.createLogger({
	level: 'info',
	format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
	transports: [
		new DailyRotateFile({
			dirname: dir,
			filename: 'audit-%DATE%.ndjson',
			datePattern: 'YYYY-MM-DD',
			maxFiles: config.audit.retentionDays,
			maxSize: config.audit.maxSize,
			zippedArchive: true,
			auditFile: path.join(dir, '.audit-rotate-state.json'),
		}),
	],
	// No tumbar el proceso si falla la escritura del log.
	exitOnError: false,
});

if (config.env === 'test' || !config.audit.fileEnabled) {
	auditLogger.silent = true;
}
